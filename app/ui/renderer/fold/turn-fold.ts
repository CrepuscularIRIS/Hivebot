// P6-01 · 三段式位置折叠纯函数（p6-orchestration BRIEF §2.2 规则表 + G1-r2 A-H1 三件套 + 兜底 (a)–(g)）。
// 输入 = reduce.ts 归约结果（SessionView.items + hasMore/running），只 import 不改（PLAN 决策 2）；
// 输出 = 0.18 transcript entry 序列（message / thinking / tool-call / notice）+ 折叠标注，供 P5-51 shim / D3 计分用。
// 三件套：①只折正文 text 块——reasoning（reduce 产 thinking 条目，id 带 -r）永不升气泡、不参与
// ack/result/兜底判定，输出用 from 字段区分两种 thinking 行；②建在 reduce 之上，不另写帧解析；
// ③终止原因 aborted|interrupted|cancelled 都归兜底 (e)——(b)(e) 的 notice 直接用 reduce endNotice
// 已产出的条目（source:'reduce'），折叠只新增 (d) 一种 notice（source:'fold'），不重复显示。

import type { ReportItem, TimelineItem, ToolStatus } from '../session/reduce'

export type FoldEntry = (
  | { kind: 'user'; id: string; text: string; rpcId?: string }
  | { kind: 'message'; id: string; text: string; role: 'ack' | 'result' }
  | { kind: 'thinking'; id: string; text: string; from: 'text' | 'reasoning' }
  | { kind: 'tool-call'; id: string; callId: string; name: string; args: string; status: ToolStatus; result: string | null; awaiting: boolean; decision: string | null }
  | { kind: 'notice'; id: string; tone: 'muted' | 'danger'; text: string; source: 'reduce' | 'fold' }
  // P6-16 决策 25：编排来源条目（回报 / 任务）原样透传，由 shim entries 渲染
  | { kind: 'peer'; id: string; peer: { kind: 'report'; items: ReportItem[] } | { kind: 'task'; text: string; fromId: string | null } }
) & { at?: number }

export interface FoldInput { hasMore: boolean; running: boolean }
export interface FoldOutput { entries: FoldEntry[]; streamingAs: 'message' | 'thinking' }

/** (d) 的 notice 文案（B §2.2）；(b)(e) 用 reduce 已产出的那条，不另加。 */
export const EMPTY_RESULT_NOTICE = '已完成，没有文字结果' // T23：主聊天无过程可展开（T22），入口在侧栏「Show full conversation」——文案不指名

// 回合切分 = 以 user 条目为界 + assistant/thinking 的 `t<turn>-` 前缀变化（PLAN 决策 6）。
// P6-16 决策 25 闭合：回报（report）与任务（task）条目是确定的回合起点，与 user 同级切段——
// 回报唤醒、首条目是工具的回合不再把工具并进上一段。

interface Segment { items: TimelineItem[]; turn: number | null; byUser: boolean; fragment: boolean }

const turnOf = (id: string): number | null => {
  const m = /^t(\d+)-/.exec(id)
  return m === null ? null : Number(m[1])
}

function segment(items: readonly TimelineItem[], hasMore: boolean): Segment[] {
  const segs: Segment[] = []
  let cur: Segment | null = null
  const open = (byUser: boolean): Segment => {
    cur = { items: [], turn: null, byUser, fragment: false }
    segs.push(cur)
    return cur
  }
  for (const item of items) {
    if (item.kind === 'user' || item.kind === 'report' || item.kind === 'task') { open(true).items.push(item); continue }
    if (cur === null) open(false)
    if (item.kind === 'assistant' || item.kind === 'thinking') {
      const t = turnOf(item.id)
      if (t !== null && cur.turn !== null && t !== cur.turn) open(false) // 决策 6：turn 前缀变化也切段
      if (t !== null && cur.turn === null) cur.turn = t
    }
    cur.items.push(item)
  }
  // §2.2 页首片段：窗口外还有更早历史且首段不以 user 开头 → 无回合起点（D2 (g)）
  if (segs.length > 0) segs[0]!.fragment = hasMore && !segs[0]!.byUser
  return segs
}

type TurnState = 'completed' | 'error' | 'stopped' | 'running'

const atOf = (item: TimelineItem): { at?: number } => (item.at === undefined ? {} : { at: item.at })
/** user 条目身份（source.rpcId）透传——shim 回执绑定按它命中（L-7 R4/O2 f2）。 */
const rpcIdOf = (item: Extract<TimelineItem, { kind: 'user' }>): { rpcId?: string } =>
  item.rpcId === undefined ? {} : { rpcId: item.rpcId }

export function foldTurns(items: readonly TimelineItem[], input: FoldInput): FoldOutput {
  const segs = segment(items, input.hasMore)
  const entries: FoldEntry[] = []
  segs.forEach((seg, si) => {
    // 回合终态：段内 `end-<turn>` notice（reduce 产出；tone danger=error、muted=stopped，三枚举同归 (e)）；
    // 无 notice 且是最后一段 + running → 进行中；否则视为 completed（非 completed 必有 notice，reduce.ts:95）。
    const endN = seg.items.find((i): i is Extract<TimelineItem, { kind: 'notice' }> => i.kind === 'notice' && /^end-\d+$/.test(i.id))
    const state: TurnState = endN !== undefined ? (endN.tone === 'danger' ? 'error' : 'stopped')
      : si === segs.length - 1 && input.running ? 'running' : 'completed'

    const firstTool = seg.items.findIndex((i) => i.kind === 'tool')
    const lastTool = seg.items.reduce((acc, i, idx) => (i.kind === 'tool' ? idx : acc), -1)
    const textIdx = seg.items.map((item, idx) => (item.kind === 'assistant' ? idx : -1)).filter((idx) => idx >= 0)
    const hasTail = lastTool >= 0 && textIdx.some((idx) => idx > lastTool)
    const mids = lastTool >= 0 ? textIdx.filter((idx) => idx > firstTool && idx < lastTool) : []
    // 兜底（B §2.2 HIGH #4：按「缺成功 result」触发，只有 completed 回合做 result 升级）：
    // (c) 把最后一段中间正文移出 thinking 升为气泡（移动不复制）；(d) 全程无正文（有工具）→ fold notice。
    // ack-only（有 ack、无中间/尾正文）不触发——ack 已是可见气泡。
    const promoteMid = !seg.fragment && state === 'completed' && lastTool >= 0 && !hasTail && mids.length > 0
      ? mids[mids.length - 1]! : -1
    const emptyNotice = !seg.fragment && state === 'completed' && lastTool >= 0 && !hasTail && mids.length === 0 && textIdx.length === 0

    seg.items.forEach((item, idx) => {
      switch (item.kind) {
        case 'user':
          entries.push({ kind: 'user', id: item.id, text: item.text, ...rpcIdOf(item), ...atOf(item) }); break
        case 'tool':
          entries.push({ kind: 'tool-call', id: item.id, callId: item.callId, name: item.name, args: item.args, status: item.status, result: item.result, awaiting: item.awaiting, decision: item.decision, ...atOf(item) }); break
        case 'thinking': // reasoning 块：永不升气泡（三件套 ①）
          entries.push({ kind: 'thinking', id: item.id, text: item.text, from: 'reasoning', ...atOf(item) }); break
        case 'report':
          entries.push({ kind: 'peer', id: item.id, peer: { kind: 'report', items: item.items }, ...atOf(item) }); break
        case 'task':
          entries.push({ kind: 'peer', id: item.id, peer: { kind: 'task', text: item.text, fromId: item.fromId }, ...atOf(item) }); break
        case 'notice': // (b)(e)：reduce endNotice 原样透传
          entries.push({ kind: 'notice', id: item.id, tone: item.tone, text: item.text, source: 'reduce', ...atOf(item) }); break
        case 'assistant': {
          if (idx === promoteMid) { entries.push({ kind: 'message', id: item.id, text: item.text, role: 'result', ...atOf(item) }); break } // (c)
          if (seg.fragment) { entries.push({ kind: 'thinking', id: item.id, text: item.text, from: 'text', ...atOf(item) }); break } // (g)：无回合起点，一律按中间文本
          if (firstTool < 0 || idx < firstTool) { entries.push({ kind: 'message', id: item.id, text: item.text, role: 'ack', ...atOf(item) }); break } // 首工具前 = ack；无工具 = 整条回答
          if (idx > lastTool && state === 'completed') { entries.push({ kind: 'message', id: item.id, text: item.text, role: 'result', ...atOf(item) }); break } // 尾段 turn/end 时升 result（一次位移）
          entries.push({ kind: 'thinking', id: item.id, text: item.text, from: 'text', ...atOf(item) }); break // 工具之间 / 进行中或非 completed 的尾段
        }
      }
    })
    if (emptyNotice) entries.push({ kind: 'notice', id: `fold-empty-${seg.turn ?? `seg${si}`}`, tone: 'muted', text: EMPTY_RESULT_NOTICE, source: 'fold' })
  })
  // 流式落点：当前段还没有工具 → message（ack 候选），否则 thinking（中间/尾段，回合结束才升）；
  // 片段段无回合起点，流式正文按中间文本（§2.2 页首片段）。
  const last = segs[segs.length - 1]
  const streamingAs: FoldOutput['streamingAs'] = last === undefined || (!last.fragment && !last.items.some((i) => i.kind === 'tool')) ? 'message' : 'thinking'
  return { entries, streamingAs }
}
