// T21：「Full conversation」侧板数据映射（RE-FULL-0.79.3 题 1(e) 差距 #4）。
// view.items（renderer/session/reduce.ts 的 TimelineItem）→ ConversationOutlineItem
// （provider :11-22 的形状——user / assistant-text / thinking / send-message / tool-call，
// status 只有 pending|failed|done）。供给两处：coordinator.getConversationOutline({id})
// 拉取 + data.ts 与 pushTranscript 同时机推 outline 快照。
// 形状按运行时实证（e2e probe）：assistant 不分首答/中间轮/尾答（0.79.3 outline 里正文
// 一律 assistant-text）；thinking 即 reasoning（无 from 字段）；tool 三态 running|done|failed。
// ponytail: 只覆盖当前已载入窗口（view.items），更早分页不进 outline——需要全量时按
// outline agent 单独取（升级路径：复用 view.items 的 hasMore 游标翻页）。
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

/** view.items 条目的最小面（TimelineItem 子集——结构推导，不引 renderer/ 类型依赖）。 */
export interface ViewLikeItem {
  readonly kind: string
  readonly id: string
  readonly text?: string
  readonly name?: string
  readonly status?: string
  readonly args?: string
  readonly result?: string | null
}

export interface ViewLikeOutput { readonly items: readonly ViewLikeItem[]; readonly streaming: { text: string; reasoning?: string } | null | undefined }

const toolStatusOf = (s: string | undefined): OutlineToolStatus['status'] =>
  s === 'done' ? 'done' : s === 'failed' || s === 'error' || s === 'aborted' ? 'failed' : 'pending'

/**
 * TimelineItem → outline item。notice / report / task 不进（0.79.3 outline kind 无此三类）。
 * 流式尾：reasoning 流 → thinking(live-reasoning)；正文流 → assistant-text(live-stream)。
 */
export function toOutlineItems(out: ViewLikeOutput): OutlineItem[] {
  const items: OutlineItem[] = []
  for (const e of out.items) {
    switch (e.kind) {
      case 'user':
        items.push({ kind: 'user', id: e.id, text: e.text ?? '' })
        break
      case 'assistant':
        items.push({ kind: 'assistant-text', id: e.id, text: e.text ?? '' })
        break
      case 'thinking':
        items.push({ kind: 'thinking', id: e.id, text: e.text ?? '' })
        break
      case 'tool':
        items.push({ kind: 'tool-call', id: e.id, name: e.name ?? '', status: toolStatusOf(e.status), summary: toolSummary(e.name ?? '', e.args ?? '', e.result ?? null) })
        break
      default:
        break // notice / report / task 不进 outline
    }
  }
  const st = out.streaming ?? null
  if (st != null) {
    if (typeof st.reasoning === 'string' && st.reasoning.length > 0) items.push({ kind: 'thinking', id: 'live-reasoning', text: st.reasoning })
    if (typeof st.text === 'string' && st.text.length > 0) items.push({ kind: 'assistant-text', id: 'live-stream', text: st.text })
  }
  return items
}
