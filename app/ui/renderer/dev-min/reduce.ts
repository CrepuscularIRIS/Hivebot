// U-15 dev-min：session/follow 下行 item（SessionFollowFrame，CONTRACT §3.3）→ 视图模型的纯归约。
// 临时页面（U-22 done 时随目录删除）；产品侧由 ui-session/ui-chat 承担。
// 帧形状依据 T-06 实测：user/message 平铺（data.content/id/role/source）、
// assistant/message 嵌套（data.message.content）、assistant-stream 在 value.frame。

export interface Bubble {
  id: string
  role: 'user' | 'assistant'
  text: string
  final: boolean
}

export interface BotView {
  sessionId: string
  /** follow snapshot 的 header.agentPreset（D1 断言点；未知为 null）。 */
  preset: string | null
  running: boolean
  /** 最近一次 turn/end 已到达（E2E 断言）。 */
  turnEnded: boolean
  endReason: string | null
  bubbles: Bubble[]
  /** 流式中气泡（assistant/message 到达前）；null = 无进行中的流。 */
  streaming: { attemptId: string | null; text: string } | null
  /** assistant-stream chunk 帧计数（E2E ≥2 断言）。 */
  chunkCount: number
}

export function initBot(sessionId: string): BotView {
  return {
    sessionId, preset: null, running: false, turnEnded: false, endReason: null,
    bubbles: [], streaming: null, chunkCount: 0,
  }
}

type AnyRecord = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: string; text?: string } =>
      typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text')
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
}

/** 历史与实时同构：records 里的 {type:'event', event} 与 live 的 event item 走同一条归约。 */
function reduceEvent(bot: BotView, event: { type?: unknown; data?: unknown }): BotView {
  if (typeof event.type !== 'string') return bot
  const data = (typeof event.data === 'object' && event.data !== null ? event.data : {}) as AnyRecord
  switch (event.type) {
    case 'user/message': {
      // 只把 source.kind==='user' 显示为用户气泡（runtime-context 注入不显示）
      const source = data.source as { kind?: unknown } | undefined
      if (source?.kind !== 'user') return bot
      const bubble: Bubble = {
        id: str(data.id) ?? `u-${bot.bubbles.length}`,
        role: 'user', text: contentText(data.content), final: true,
      }
      return { ...bot, bubbles: [...bot.bubbles, bubble] }
    }
    case 'assistant/message': {
      const message = data.message as { content?: unknown } | undefined
      const turn = typeof data.turn === 'number' ? data.turn : bot.bubbles.length
      const step = typeof data.step === 'number' ? data.step : 0
      const bubble: Bubble = {
        id: `t${turn}-s${step}`,
        role: 'assistant', text: contentText(message?.content), final: true,
      }
      // 定稿替换流式气泡（D1）
      return { ...bot, bubbles: [...bot.bubbles, bubble], streaming: null }
    }
    case 'turn/start':
      return { ...bot, running: true }
    case 'turn/end': {
      const reason = data.reason as { kind?: unknown } | undefined
      return { ...bot, running: false, turnEnded: true, endReason: str(reason?.kind) ?? 'unknown' }
    }
    default:
      return bot // tool-call / approval 等事件族不在 D1 范围（U-22 产品页承接）
  }
}

/** 归约一个 follow 下行 item 的 value；不可变（返回新 BotView）。 */
export function reduceItem(bot: BotView, value: unknown): BotView {
  if (typeof value !== 'object' || value === null) return bot
  const frame = value as AnyRecord
  if (frame.type === 'snapshot') {
    const header = (typeof frame.header === 'object' && frame.header !== null ? frame.header : {}) as AnyRecord
    let out: BotView = { ...bot, preset: str(header.agentPreset) }
    for (const record of Array.isArray(frame.records) ? frame.records : []) {
      const wrapped = (typeof record === 'object' && record !== null ? record : {}) as AnyRecord
      if (wrapped.type === 'event') out = reduceEvent(out, wrapped.event as { type?: unknown; data?: unknown })
    }
    // ponytail: snapshot.assistantStream 基线不归约——D1 无中途挂起恢复场景，U-22 再做
    return out
  }
  if (frame.type === 'event') {
    return reduceEvent(bot, frame.event as { type?: unknown; data?: unknown })
  }
  if (frame.type === 'assistant-stream') {
    const streamFrame = (typeof frame.frame === 'object' && frame.frame !== null ? frame.frame : {}) as AnyRecord
    if (streamFrame.type === 'start') {
      return { ...bot, streaming: { attemptId: str(streamFrame.attemptId), text: '' } }
    }
    if (streamFrame.type === 'chunk') {
      const chunk = (typeof streamFrame.chunk === 'object' && streamFrame.chunk !== null ? streamFrame.chunk : {}) as AnyRecord
      if (chunk.type !== 'text-delta') return bot
      const delta = typeof chunk.text === 'string' ? chunk.text : ''
      const current = bot.streaming ?? { attemptId: null, text: '' } // 快照之外的裸 chunk：补一个流式气泡
      return { ...bot, streaming: { attemptId: current.attemptId, text: current.text + delta }, chunkCount: bot.chunkCount + 1 }
    }
    return bot // end：等 assistant/message 定稿替换（abandoned 时保留半截文本）
  }
  return bot
}
