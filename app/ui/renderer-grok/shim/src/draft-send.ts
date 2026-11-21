// B2.1 草稿发送失败状态机（RE-DRAFT-SEND-1.1.0.md 规格）。
// 1.1.0 锚：entry.draftSendState ∈ {sending, unconfirmed} + draftSendRefused + draftSendRetry
// + draftSendInFlightUntilMs + draft-send-retry-tick（intervalMs:1000，unconfirmed 超时判定）。
// HiveBot 落地：per-agent map（不进 view entries——本地 UI 态）；timed-out 为我们超时终态名
// （1.1.0 文案锚 Unconfirmed [s2j1h7] / Timed out [01Zgfk] / Didn't go through [cCCVzA]）。
export type DraftSendState = { state: 'unconfirmed'; nonce: string; inFlightUntilMs: number; text: string; timer?: ReturnType<typeof setTimeout> }
  | { state: 'refused'; nonce: string; error: string; text: string }
  | { state: 'timed-out'; nonce: string; text: string }

export interface DraftSendHandle {
  /** B2.2 桥接口：生产 sendPrompt 失败/成功时外部登记（sendDraft 直发路径内部已维护，勿双调）。 */
  markRefused(agentId: string, nonce: string, error: string, text: string): void
  markUnconfirmed(agentId: string, nonce: string, text: string): void
  /** 发送：ok=false → refused 落态；ok=true → unconfirmed 起 tick。 */
  send(agentId: string, text: string, opts?: { inFlightUntilMs?: number }): Promise<{ ok: boolean; nonce?: string; error?: string }>
  /** refused/timed-out 后重发：成功清态，失败保持 refused。 */
  retry(agentId: string): Promise<{ ok: boolean; error?: string }>
  /** 丢弃：清态（含清 tick）。 */
  discard(agentId: string): void
  /** 只读态（无 → undefined）。 */
  stateOf(agentId: string): DraftSendState | undefined
  /** follow 帧到达（rpcId 命中 nonce）→ 确认清态。data.ts onFollowItem 接线调用。 */
  confirmFromRpcId(rpcId: string): void
  /** 全清（teardown 用——tick 不泄漏）。 */
  dispose(): void
}

export function createDraftSend(
  api: (method: string, args?: unknown) => Promise<{ ok: boolean; error?: { message?: string }; value?: unknown }>,
  opts: { timeoutMs?: number } = {},
): DraftSendHandle {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const states = new Map<string, DraftSendState>()
  const nonceToAgent = new Map<string, string>()

  const clearTimer = (s: DraftSendState): void => { if ('timer' in s && s.timer !== undefined) clearTimeout(s.timer) }

  const finish = (agentId: string): void => {
    const s = states.get(agentId)
    if (s === undefined) return
    clearTimer(s)
    nonceToAgent.delete(s.nonce)
    states.delete(agentId)
  }

  const armTick = (agentId: string, nonce: string, inFlightUntilMs: number): void => {
    const delay = Math.max(0, inFlightUntilMs - Date.now())
    const timer = setTimeout(() => {
      const s = states.get(agentId)
      // 只在仍属同一轮 nonce 时转 timed-out（旧 tick 不误杀新发送）
      if (s !== undefined && s.state === 'unconfirmed' && s.nonce === nonce) {
        states.set(agentId, { state: 'timed-out', nonce, text: s.text })
        nonceToAgent.delete(nonce)
      }
    }, delay)
    const s = states.get(agentId)
    if (s !== undefined && s.state === 'unconfirmed') s.timer = timer
  }

  const doSend = async (agentId: string, text: string, inFlightUntilMs?: number) => {
    finish(agentId) // 上一轮清掉再开新轮
    const nonce = crypto.randomUUID()
    const res = await api('session/prompt', { request: { requestId: nonce, sessionId: agentId, mode: 'queue', content: [{ type: 'text', text }] } })
    if (!res.ok) {
      states.set(agentId, { state: 'refused', nonce, error: res.error?.message ?? 'failed', text })
      return { ok: false, nonce, error: res.error?.message ?? 'failed' }
    }
    const until = inFlightUntilMs ?? (Date.now() + timeoutMs)
    states.set(agentId, { state: 'unconfirmed', nonce, inFlightUntilMs: until, text })
    nonceToAgent.set(nonce, agentId)
    armTick(agentId, nonce, until)
    return { ok: true, nonce }
  }

  const markRefused = (agentId: string, nonce: string, error: string, text: string): void => {
    const s = states.get(agentId)
    if (s !== undefined && s.nonce === nonce) return // 同 nonce 已记——桥接与直发去重
    states.set(agentId, { state: 'refused', nonce, error, text })
  }
  const markUnconfirmed = (agentId: string, nonce: string, text: string): void => {
    const s = states.get(agentId)
    if (s !== undefined && s.nonce === nonce) return
    finish(agentId)
    const until = Date.now() + timeoutMs
    states.set(agentId, { state: 'unconfirmed', nonce, inFlightUntilMs: until, text })
    nonceToAgent.set(nonce, agentId)
    armTick(agentId, nonce, until)
  }

  return {
    markRefused,
    markUnconfirmed,
    send: (agentId, text, o) => doSend(agentId, text, o?.inFlightUntilMs),
    retry: async (agentId) => {
      const s = states.get(agentId)
      if (s === undefined) return { ok: true } // 无 pending 态=无事可重
      if (s.state === 'unconfirmed') return { ok: true }
      const res = await doSend(agentId, s.text, undefined)
      return res.ok ? { ok: true, nonce: res.nonce } : { ok: false, error: res.error }
    },
    discard: (agentId) => finish(agentId),
    stateOf: (agentId) => {
      const s = states.get(agentId)
      if (s === undefined) return undefined
      const { timer: _t, ...rest } = s as DraftSendState & { timer?: unknown }
      return rest as DraftSendState
    },
    confirmFromRpcId: (rpcId) => {
      const agentId = nonceToAgent.get(rpcId)
      if (agentId !== undefined) finish(agentId)
    },
    dispose: () => { for (const s of states.values()) clearTimer(s); states.clear(); nonceToAgent.clear() },
  }
}
