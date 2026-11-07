// T21：「Full conversation」侧板数据映射（RE-FULL-0.79.3 题 1(e) 差距 #4）。
// fold 序列化条目 → ConversationOutlineItem（provider :11-22 的形状——
// user / assistant-text / thinking / send-message / tool-call，status 只
// pending|failed|done）。供给两处：coordinator.getConversationOutline({id})
// 拉取 + data.ts 与 pushTranscript 同时机推 outline 快照。
// ponytail: 只覆盖当前已载入窗口（view.items），更早分页不进 outline——
// 需要全量时改按 outline agent 单独取（升级路径：复用 view.items 的
// hasMore 游标翻页）。
import { toolSummary } from './entries'

export interface OutlineToolStatus { readonly status: 'pending' | 'failed' | 'done'; readonly summary?: string }

export interface OutlineItem {
  readonly kind: 'user' | 'assistant-text' | 'thinking' | 'send-message' | 'tool-call'
  readonly id: string
  readonly text?: string
  readonly name?: string
  readonly status?: OutlineToolStatus['status']
  readonly summary?: string
}

/** view.items 的最小面（shim data.ts 的 DevItem 子集——保持结构推导，不引类型依赖）。 */
export interface FoldLikeItem {
  readonly kind: string
  readonly id: string
  readonly text?: string
  readonly role?: string
  readonly from?: string
  readonly name?: string
  readonly status?: string
  readonly args?: string
  readonly result?: string | null
}

export interface FoldLikeOutput { readonly items: readonly FoldLikeItem[]; readonly streaming: unknown }

const toolStatusOf = (s: string | undefined): OutlineToolStatus['status'] =>
  s === 'failed' || s === 'error' || s === 'aborted' ? 'failed' : s === 'done' ? 'done' : 'pending'

/**
 * fold 条目 → outline item。notice/peer 不进（0.79.3 outline kind 无此二者）。
 * message ack/result → assistant-text；thinking from:'text'（中间轮正文）→ assistant-text；
 * thinking from:'reasoning' → thinking。流式尾：reasoning 流 → thinking(live-reasoning)、
 * 正文流 → assistant-text(live-stream)。
 */
export function toOutlineItems(out: FoldLikeOutput): OutlineItem[] {
  const items: OutlineItem[] = []
  for (const e of out.items) {
    switch (e.kind) {
      case 'user':
        items.push({ kind: 'user', id: e.id, text: e.text ?? '' })
        break
      case 'message':
        if (e.role === 'ack' || e.role === 'result') items.push({ kind: 'assistant-text', id: e.id, text: e.text ?? '' })
        break
      case 'thinking':
        items.push(e.from === 'reasoning'
          ? { kind: 'thinking', id: e.id, text: e.text ?? '' }
          : { kind: 'assistant-text', id: e.id, text: e.text ?? '' })
        break
      case 'tool-call':
        items.push({ kind: 'tool-call', id: e.id, name: e.name ?? '', status: toolStatusOf(e.status), summary: toolSummary(e.name ?? '', e.args ?? '', e.result ?? null) })
        break
      default:
        break // notice / peer / 其它不进 outline
    }
  }
  const st = out.streaming as { reasoning?: string; text?: string } | null | undefined
  if (st != null) {
    if (typeof st.reasoning === 'string' && st.reasoning.length > 0) items.push({ kind: 'thinking', id: 'live-reasoning', text: st.reasoning })
    if (typeof st.text === 'string' && st.text.length > 0) items.push({ kind: 'assistant-text', id: 'live-stream', text: st.text })
  }
  return items
}
