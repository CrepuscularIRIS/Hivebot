// P-B 会话视图归约（U-21/PAB）：session/follow 下行 item → 时间线。
// 帧形状 = CONTRACT §3.3 + U-21 wire 实测（work/p4-ui/ui/PAB-final.md R19：取消后 turn/end.reason.kind
// === 'aborted'）。纯函数、不可变；产品 store 与单测共用。
// 审批卡不在这里：活跃卡只来自 $events waterfall（席 C：approval/asked 历史不生成可点按钮），
// 这里只记审计态（asked → tool.awaiting，decided → tool.decision）。

export type ToolStatus = 'running' | 'done' | 'failed'

export type TimelineItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; callId: string; name: string; args: string; status: ToolStatus; result: string | null; awaiting: boolean; decision: string | null }
  | { kind: 'notice'; id: string; tone: 'muted' | 'danger'; text: string }

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
  /** 流式中正文（assistant/message 到达前）；null = 无进行中的流。 */
  streaming: { text: string } | null
  /** assistant-stream text chunk 计数（E2E 断言）。 */
  chunkCount: number
  /** approval/asked id → callId（decided 只带 id）。 */
  asked: Record<string, string>
  /** 快照已到（区分「加载中」与「空」）。 */
  loaded: boolean
}

export function initView(sessionId: string): SessionView {
  return {
    sessionId, preset: null, cwd: null, title: null, model: null, running: false, turnEnded: false, endReason: null,
    items: [], streaming: null, chunkCount: 0, asked: {}, loaded: false,
  }
}

type AnyRecord = Record<string, unknown>
const rec = (value: unknown): AnyRecord => (typeof value === 'object' && value !== null ? value as AnyRecord : {})
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

export function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map((block) => {
    const b = rec(block)
    return b.type === 'text' && typeof b.text === 'string' ? b.text : ''
  }).join('')
}

const updateTool = (view: SessionView, callId: string, patch: Partial<Extract<TimelineItem, { kind: 'tool' }>>): SessionView => ({
  ...view,
  items: view.items.map((item) => (item.kind === 'tool' && item.callId === callId ? { ...item, ...patch } : item)),
})

function endNotice(turn: unknown, reason: AnyRecord): TimelineItem | null {
  const kind = str(reason.kind) ?? 'unknown'
  if (kind === 'completed') return null
  const id = `end-${String(turn)}`
  if (kind === 'aborted' || kind === 'interrupted' || kind === 'cancelled') return { kind: 'notice', id, tone: 'muted', text: '已停止' }
  const message = str(reason.message) ?? str(rec(reason.error).message) ?? kind
  return { kind: 'notice', id, tone: 'danger', text: `回复失败：${message}` }
}

function reduceEvent(view: SessionView, event: AnyRecord): SessionView {
  const data = rec(event.data)
  switch (event.type) {
    case 'user/message': {
      if (rec(data.source).kind !== 'user') return view // 只显示用户本人消息（runtime-context 等注入不显示）
      return { ...view, items: [...view.items, { kind: 'user', id: str(data.id) ?? `u-${view.items.length}`, text: contentText(data.content) }] }
    }
    case 'assistant/message': {
      const text = contentText(rec(data.message).content)
      const id = `t${String(data.turn)}-s${String(data.step)}`
      const items = text === '' ? view.items : [...view.items, { kind: 'assistant' as const, id, text }]
      return { ...view, items, streaming: null } // 定稿替换流式气泡（D1）
    }
    case 'tool/call': {
      const callId = str(data.callId) ?? `call-${view.items.length}`
      if (view.items.some((i) => i.kind === 'tool' && i.callId === callId)) return view
      const tool: TimelineItem = {
        kind: 'tool', id: `tool-${callId}`, callId, name: str(data.name) ?? 'tool', args: typeof data.arguments === 'string' ? data.arguments : '',
        status: 'running', result: null, awaiting: false, decision: null,
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
      const notice = endNotice(data.turn, reason)
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
  if (chunk.type !== 'text-delta') return view
  const current = view.streaming ?? { text: '' }
  return { ...view, streaming: { text: current.text + (typeof chunk.text === 'string' ? chunk.text : '') }, chunkCount: view.chunkCount + 1 }
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
    let out: SessionView = {
      ...initView(view.sessionId), preset: str(header.agentPreset), cwd: str(header.cwd),
      title: str(rec(rec(frame.projections).values).title), model: modelOf(rec(rec(frame.projections).values).modelSelection), loaded: true,
    }
    for (const record of Array.isArray(frame.records) ? frame.records : []) {
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

/** 工具名 → Title Case（原版 tool-call 行：name→Title Case + summary，RE-ui-shell §3.2）。 */
export function toolTitle(name: string): string {
  return name.split(/[_\-\s]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ')
}

/** 单行摘要：优先 command / path / query 等常见参数，否则原始 JSON。 */
export function toolSummary(args: string): string {
  try {
    const parsed = rec(JSON.parse(args))
    for (const key of ['command', 'path', 'file_path', 'query', 'url', 'pattern']) {
      const v = str(parsed[key])
      if (v !== null) return v
    }
  } catch { /* 原样显示 */ }
  return args
}
