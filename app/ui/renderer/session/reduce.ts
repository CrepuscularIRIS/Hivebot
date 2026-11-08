// P-B 会话视图归约（U-21/PAB）：session/follow 下行 item → 时间线。
// 帧形状 = CONTRACT §3.3 + U-21 wire 实测（work/p4-ui/ui/PAB-final.md R19：取消后 turn/end.reason.kind
// === 'aborted'）。纯函数、不可变；renderer-grok shim（data.ts / entries.ts / agents.ts）与单测共用。
// P5-54：旧 renderer 退役后从 plugins/session/ 移到这里；时间分隔 / 未读线随 UI 迁到 renderer-grok/overrides/modules/markers.ts。
// P6-16：user/message 的 pbots-worker / pbots-main 来源各出一种 item（report / task），其余非 user 来源仍丢弃。
// 审批卡不在这里：活跃卡只来自 $events waterfall（席 C：approval/asked 历史不生成可点按钮），
// 这里只记审计态（asked → tool.awaiting，decided → tool.decision）。

export type ToolStatus = 'running' | 'done' | 'failed'

/** `at` = 事件信封 event.time（session-format types.ts:32）；无 time 的事件不带（P5-12 B14 分隔 / 未读线）。 */
export type TimelineItem = (
  // rpcId = user/message 的 source.rpcId（session/prompt.requestId，session-controller index.ts:484
  // 「Client-minted prompt identity used to reconcile optimistic and durable messages」）：
  // 发送回执按它绑定（L-7 R4/O2 f2：文本匹配证明不了发送身份）。
  | { kind: 'user'; id: string; text: string; rpcId?: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tool'; id: string; callId: string; name: string; args: string; status: ToolStatus; result: string | null; awaiting: boolean; decision: string | null }
  | { kind: 'notice'; id: string; tone: 'muted' | 'danger'; text: string }
  // P6-16 决策 25：两种编排来源各一种 item（其余非 user 来源仍丢弃）。字段全部按不可信数据清洗成字符串。
  | { kind: 'report'; id: string; items: ReportItem[] }
  | { kind: 'task'; id: string; text: string; fromId: string | null; assignmentId: string | null }
) & { at?: number }

/** 决策 28 回报项（source.items[] 原样转交，只留字符串字段）。 */
export interface ReportItem {
  key: string
  kind: 'end' | 'ask'
  workerId: string | null
  name: string | null
  assignmentId: string | null
  outcome: 'completed' | 'error' | 'stopped' | null
  awaiting: 'approval' | 'question' | null
  eventId: string | null
  result: string | null
}

/** 决策 17：result ≤4000 字（SDK 侧已截断，这里只做兜底上限）。 */
const RESULT_MAX = 4000

function reportItemOf(value: unknown): ReportItem | null {
  const v = rec(value)
  const kind = v.kind === 'end' || v.kind === 'ask' ? v.kind : null
  if (kind === null) return null
  const outcome = v.outcome === 'completed' || v.outcome === 'error' || v.outcome === 'stopped' ? v.outcome : null
  const awaiting = v.awaiting === 'approval' || v.awaiting === 'question' ? v.awaiting : null
  const result = str(v.result)
  return {
    key: str(v.key) ?? '', kind, workerId: str(v.workerId), name: str(v.name), assignmentId: str(v.assignmentId),
    outcome, awaiting, eventId: str(v.eventId), result: result === null ? null : result.slice(0, RESULT_MAX),
  }
}

export interface SessionView {
  sessionId: string
  /** follow snapshot header.agentPreset（D1 断言点；未知为 null）。 */
  preset: string | null
  cwd: string | null
  title: string | null
  /** 快照 projections.values.modelSelection（pending ?? lastUsed）→ `provider/model`；未知为 null（U-23 P-D）。 */
  model: string | null
  running: boolean
  turnEnded: boolean
  endReason: string | null
  items: TimelineItem[]
  /** 流式中正文（assistant/message 到达前）；null = 无进行中的流。reasoning = reasoning-delta 累加（P5-12 B7 live 行）。 */
  streaming: { text: string; reasoning?: string } | null
  /** assistant-stream text chunk 计数（E2E 断言）。 */
  chunkCount: number
  /** approval/asked id → callId（decided 只带 id）。 */
  asked: Record<string, string>
  /** 快照已到（区分「加载中」与「空」）。 */
  loaded: boolean
  /** 快照代号：每次 follow snapshot 重建 +1（O1：#11 分页响应绑定发起时的代号，换代即作废——
   * 断链重连的新快照重建窗口后，迟到的旧分页不得拼进新窗口 / 回退游标）。 */
  gen: number
  /** 窗口外还有更早历史（follow snapshot hasMore / #11 session/events 分页，U-26 ③）。 */
  hasMore: boolean
  /** 窗口内最早 event 的 seq（#11 beforeSeq 游标；null = 无 seq 可翻）。 */
  firstSeq: number | null
  /** 「加载更早」状态（席 C PAB-proposal-C:104：顶部局部指示、失败只重试该页）。 */
  older: OlderPhase
}

export interface OlderPhase { phase: 'idle' | 'loading' | 'error' }

export function initView(sessionId: string): SessionView {
  return {
    sessionId, preset: null, cwd: null, title: null, model: null, running: false, turnEnded: false, endReason: null,
    items: [], streaming: null, chunkCount: 0, asked: {}, loaded: false,
    hasMore: false, firstSeq: null, older: { phase: 'idle' }, gen: 0,
  }
}

/** 一组 follow/#11 history records 里最早 event 的 seq（无 seq → null）。 */
export function firstSeqOf(records: readonly unknown[]): number | null {
  for (const record of records) {
    const seq = rec(rec(record).event).seq
    if (typeof seq === 'number') return seq
  }
  return null
}

/** 归约一页更早的 history records（{type:'event',event}[]，正序）为时间线 items（不带运行态）。 */
export function olderItemsOf(records: readonly unknown[]): TimelineItem[] {
  let out = initView('older')
  for (const record of records) {
    const wrapped = rec(record)
    if (wrapped.type === 'event') out = reduceEvent(out, rec(wrapped.event))
  }
  return out.items
}

type AnyRecord = Record<string, unknown>
const rec = (value: unknown): AnyRecord => (typeof value === 'object' && value !== null ? value as AnyRecord : {})
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

export function contentText(content: unknown, type = 'text', sep = ''): string {
  if (!Array.isArray(content)) return ''
  return content.flatMap((block) => {
    const b = rec(block)
    return b.type === type && typeof b.text === 'string' && b.text !== '' ? [b.text] : []
  }).join(sep)
}

const updateTool = (view: SessionView, callId: string, patch: Partial<Extract<TimelineItem, { kind: 'tool' }>>): SessionView => ({
  ...view,
  items: view.items.map((item) => (item.kind === 'tool' && item.callId === callId ? { ...item, ...patch } : item)),
})

/** T12a：ssh 断连专用文案（真帧：reason.error.message='SSH connection is closed'，
 * tool/result 另有 'outcome is unknown'——见 receipts/T12a.md 第 1 步实测）。 */
export const SSH_LOST_NOTICE = '电脑连接已断开。上一步可能已执行，也可能没执行——先看看结果再决定要不要重试。重新打开 Hivebot 即可重新连接。'

function endNotice(turn: unknown, reason: AnyRecord): TimelineItem | null {
  const kind = str(reason.kind) ?? 'unknown'
  if (kind === 'completed') return null
  const id = `end-${String(turn)}`
  if (kind === 'aborted' || kind === 'interrupted' || kind === 'cancelled') return { kind: 'notice', id, tone: 'muted', text: '已停止' }
  // ponytail: 整体 stringify 找串而非取字段——串是上游固定的（dsh-ssh lib/index.js:243），
  // 字段位置上游可能变。上限：用户自己的报错文本里恰好含这两串会误判（概率低，可接受）。
  const raw = JSON.stringify(reason)
  if (raw.includes('SSH connection is closed') || raw.includes('outcome is unknown')) {
    return { kind: 'notice', id, tone: 'danger', text: SSH_LOST_NOTICE }
  }
  const message = str(reason.message) ?? str(rec(reason.error).message) ?? kind
  return { kind: 'notice', id, tone: 'danger', text: `回复失败：${message}` }
}

function reduceEvent(view: SessionView, event: AnyRecord): SessionView {
  const data = rec(event.data)
  const at = typeof event.time === 'number' ? { at: event.time } : {}
  switch (event.type) {
    case 'user/message': {
      const source = rec(data.source)
      const id = str(data.id) ?? `u-${view.items.length}`
      if (source.kind === 'pbots-worker') { // 主 bot 侧：worker 回报（决策 27 / 28）
        const items = (Array.isArray(source.items) ? source.items : []).map(reportItemOf).filter((i): i is ReportItem => i !== null)
        return { ...view, items: [...view.items, { kind: 'report', id, items, ...at }] }
      }
      if (source.kind === 'pbots-main') { // worker 侧：来自主 bot 的任务（D7）
        return { ...view, items: [...view.items, { kind: 'task', id, text: contentText(data.content, 'text', '\n'), fromId: str(source.mainBotId), assignmentId: str(source.assignmentId), ...at }] }
      }
      if (source.kind !== 'user') return view // 只显示用户本人消息（runtime-context 等注入不显示）
      const rpcId = str(source.rpcId)
      return { ...view, items: [...view.items, { kind: 'user', id, text: contentText(data.content), ...(rpcId === null ? {} : { rpcId }), ...at }] }
    }
    case 'assistant/message': {
      const content = rec(data.message).content
      const text = contentText(content)
      // B7：reasoning 块（llm types.ts:75-78 {type:'reasoning',text}）→ 气泡前独立 thinking 行；空 / redacted 不出行
      const reasoning = contentText(content, 'reasoning', '\n\n')
      const id = `t${String(data.turn)}-s${String(data.step)}`
      const items: TimelineItem[] = [
        ...view.items,
        ...(reasoning === '' ? [] : [{ kind: 'thinking' as const, id: `${id}-r`, text: reasoning, ...at }]),
        ...(text === '' ? [] : [{ kind: 'assistant' as const, id, text, ...at }]),
      ]
      return { ...view, items, streaming: null } // 定稿替换流式气泡（D1）
    }
    case 'tool/call': {
      const callId = str(data.callId) ?? `call-${view.items.length}`
      if (view.items.some((i) => i.kind === 'tool' && i.callId === callId)) return view
      const tool: TimelineItem = {
        kind: 'tool', id: `tool-${callId}`, callId, name: str(data.name) ?? 'tool', args: typeof data.arguments === 'string' ? data.arguments : '',
        status: 'running', result: null, awaiting: false, decision: null, ...at,
      }
      return { ...view, items: [...view.items, tool] }
    }
    case 'approval/asked': {
      const id = str(data.id)
      const callId = str(data.callId)
      if (id === null || callId === null) return view
      return updateTool({ ...view, asked: { ...view.asked, [id]: callId } }, callId, { awaiting: true })
    }
    case 'approval/decided': {
      const callId = view.asked[str(data.id) ?? '']
      if (callId === undefined) return view
      return updateTool(view, callId, { awaiting: false, decision: str(data.outcome) })
    }
    case 'tool/result': {
      const message = rec(data.message)
      const callId = str(message.toolCallId) ?? str(rec(message.source).callId)
      if (callId === null) return view
      return updateTool(view, callId, { status: message.isError === true ? 'failed' : 'done', result: contentText(message.content) })
    }
    case 'turn/start':
      return { ...view, running: true, turnEnded: false }
    case 'turn/end': {
      const reason = rec(data.reason)
      const ended = endNotice(data.turn, reason)
      const notice = ended === null ? null : { ...ended, ...at }
      return {
        ...view, running: false, turnEnded: true, endReason: str(reason.kind) ?? 'unknown', streaming: null,
        items: notice === null ? view.items : [...view.items, notice],
      }
    }
    default:
      return view
  }
}

function applyChunk(view: SessionView, chunk: AnyRecord): SessionView {
  const current = view.streaming ?? { text: '' }
  const piece = typeof chunk.text === 'string' ? chunk.text : ''
  // B7：reasoning-delta 不计 chunkCount（chunkCount 是正文 text chunk 的 E2E 口径）
  if (chunk.type === 'reasoning-delta') return { ...view, streaming: { ...current, reasoning: (current.reasoning ?? '') + piece } }
  if (chunk.type !== 'text-delta') return view
  return { ...view, streaming: { ...current, text: current.text + piece }, chunkCount: view.chunkCount + 1 }
}

function modelOf(projection: unknown): string | null {
  const p = rec(projection)
  const sel = rec(p.pending ?? p.lastUsed)
  return typeof sel.provider === 'string' && typeof sel.model === 'string' ? `${sel.provider}/${sel.model}` : null
}

/** 归约一个 follow 下行 item；不可变（返回新视图）。 */
export function reduceFollow(view: SessionView, value: unknown): SessionView {
  const frame = rec(value)
  if (frame.type === 'snapshot') {
    const header = rec(frame.header)
    const records = Array.isArray(frame.records) ? frame.records : []
    let out: SessionView = {
      ...initView(view.sessionId), preset: str(header.agentPreset), cwd: str(header.cwd),
      title: str(rec(rec(frame.projections).values).title), model: modelOf(rec(rec(frame.projections).values).modelSelection), loaded: true,
      // U-26 ③：snapshot 自带 hasMore（follow wire，dsh client/transport.ts:200 同源）；首条 seq = #11 游标
      hasMore: frame.hasMore === true, firstSeq: firstSeqOf(records),
      // O1：重建即换代（gen +1）——窗口外的在途 #11 分页据此作废
      gen: view.gen + 1,
    }
    for (const record of records) {
      const wrapped = rec(record)
      if (wrapped.type === 'event') out = reduceEvent(out, rec(wrapped.event))
    }
    // 进行中的回合：快照基线带当前 attempt 已到的 chunk（examples/lib/client.mjs snapshotFrames 同口径）
    const baseline = rec(rec(frame.assistantStream).activeAttempt).stream
    if (Array.isArray(baseline) && baseline.length > 0) {
      out = { ...out, streaming: out.streaming ?? { text: '' } }
      for (const chunk of baseline) out = applyChunk(out, rec(chunk))
    }
    return out
  }
  if (frame.type === 'event') return reduceEvent(view, rec(frame.event))
  if (frame.type === 'assistant-stream') {
    const sf = rec(frame.frame)
    if (sf.type === 'start') return { ...view, streaming: { text: '' } }
    if (sf.type === 'chunk') return applyChunk(view, rec(sf.chunk))
    return view // end：等 assistant/message 定稿替换
  }
  return view
}
