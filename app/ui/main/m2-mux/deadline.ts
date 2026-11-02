// U-16 D4③ 无人应答 deadline：main 代答 'rejected'（PLAN U-16；spike S5 实测上游 300s 零终态、
// 重开 $events 同 eventId 补发 → 方案 A = main 代答）。
// gateway 依据（dsh-api-gateway@0.2.2-alpha.2 lib/index.js:991-1013,1146-1159）：
//  - $events/result 的 clientId 必须指向 active 的 $events client，且与作答调用同 Peer；
//  - 作答 client 必须是被 deliver 过该 eventId 的 client；
//  - settle 只向其余被 deliver 的 client 推 {type:'cancel',eventId}（作答方已先移除）。
// 因此 renderer 的 clientId 在其端口关闭（流被 cancel）后不可用作答——main 常驻自持一条
// $events 订阅（m2-mux/index.ts 随每代 socket 重开），代答用它自己的 clientId 经自己的连接发。
import type { ConnectionRpcResult, DshConnection } from '../dsh/connect'
import type { EventsLedger } from '../dsh/ledger'

/** 默认观察窗口 = 2×10s（BRIEF D4③：2×已知超时；10s = M2 转交超时 PORT_TRANSFER_TIMEOUT_MS）。 */
export const APPROVAL_DEADLINE_DEFAULT_MS = 20_000

export interface ApprovalDeadlineDeps {
  /** main 自己的 mux 连接（同 Peer 作答，LEARNINGS 2026-11-02 U-12 条③）。 */
  dsh: Pick<DshConnection, 'rpc'>
  ledger: EventsLedger
  /** renderer 的 $events 端口是否挂载（挂载 = 用户在场可能应答，不代答）。 */
  isPortMounted(): boolean
  /** main 常驻 $events 订阅的 clientId；未 ready 时 undefined（不发）。 */
  mainClientId(): string | undefined
  deadlineMs?: number
  /** 轮询间隔；给定时自起 timer，测试省略后手动 review()。 */
  tickMs?: number
  now?(): number
  log?(message: string): void
}

export interface ApprovalDeadlineStats {
  answers: number
  answeredEvents: string[]
}

export interface ApprovalDeadline {
  /** 单轮巡检（幂等）：可由 timer 或测试手动驱动。 */
  review(): void
  stop(): void
  readonly stats: ApprovalDeadlineStats
}

/** PBOTS_APPROVAL_DEADLINE_MS 覆盖默认窗口（E2E 用短值）。 */
export function approvalDeadlineMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.PBOTS_APPROVAL_DEADLINE_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : APPROVAL_DEADLINE_DEFAULT_MS
}

/**
 * 未决审批的 fail-closed 监督：pending 且无 renderer $events 端口挂载连续满 deadline，
 * 才经 main 连接以 main 常驻订阅的 clientId 代答 value 'rejected'（只此一种 outcome）。
 * 挂载即清零观察窗口（宽限：重连/在场的 renderer 可接手）。
 */
export function createApprovalDeadline(deps: ApprovalDeadlineDeps, stats?: ApprovalDeadlineStats): ApprovalDeadline {
  const deadlineMs = deps.deadlineMs ?? APPROVAL_DEADLINE_DEFAULT_MS
  const log = deps.log ?? ((message: string) => { console.log(`[m2-deadline] ${message}`) })
  const live: ApprovalDeadlineStats = stats ?? { answers: 0, answeredEvents: [] }
  /** eventId → 本轮「未决且未挂载」起点（挂载即清；窗口按重新失联时点起算）。 */
  const since = new Map<string, number>()
  /** 已成功代答（恰好一次）；rpc 失败不进，允许后续轮重试。 */
  const answered = new Set<string>()
  const inFlight = new Set<string>()

  async function answer(eventId: string): Promise<void> {
    const clientId = deps.mainClientId()
    if (clientId === undefined) return // main 订阅未 ready：留待下一轮（窗口继续累计）
    inFlight.add(eventId)
    try {
      const result: ConnectionRpcResult = await deps.dsh.rpc('$events/result', {
        clientId,
        eventId,
        outcome: { kind: 'result', value: 'rejected' },
      })
      if (result.ok) {
        answered.add(eventId)
        since.delete(eventId)
        live.answers += 1
        live.answeredEvents.push(eventId)
        // settle 已成立（ok = 消费成功或对已 settle 事件的幂等 no-op）：作答方收不到自己的
        // cancel 帧（gateway 只推给其余被 deliver 方），本地下账与等价的 gateway cancel 帧
        // 同义——renderer 作答路径的 cancel 帧到达时 record 幂等。
        deps.ledger.record({ type: 'cancel', eventId })
        log(`answered ${eventId} 'rejected' after ${deadlineMs}ms unanswered (client ${clientId})`)
      } else {
        // gateway 幂等 no-op 或瞬断：事件仍未决，下一轮重试（clientId 可能已换代）
        log(`answer rpc for ${eventId} failed: ${result.error.message}; will retry`)
      }
    } finally {
      inFlight.delete(eventId)
    }
  }

  function review(): void {
    const now = (deps.now ?? Date.now)()
    const pending = new Set(deps.ledger.pendingEvents().map((e) => e.eventId))
    for (const eventId of [...since.keys()]) {
      if (!pending.has(eventId)) since.delete(eventId) // 已下账（gateway cancel / renderer 作答）
    }
    if (deps.isPortMounted()) {
      since.clear() // 宽限：renderer 在场
      return
    }
    for (const eventId of pending) {
      if (answered.has(eventId) || inFlight.has(eventId)) continue
      const start = since.get(eventId) ?? now
      since.set(eventId, start)
      if (now - start >= deadlineMs) void answer(eventId)
    }
  }

  let timer: NodeJS.Timeout | undefined
  if (deps.tickMs !== undefined && deps.tickMs > 0) {
    timer = setInterval(review, deps.tickMs)
    timer.unref?.() // main 常驻，但不阻止进程退出
  }

  return {
    review,
    stop(): void {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    },
    stats: live,
  }
}
