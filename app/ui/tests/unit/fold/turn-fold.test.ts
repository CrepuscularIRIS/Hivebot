// P6-01 · 三段式折叠纯函数单测（p6 BRIEF §2.2 规则表 + D2 七格 + 不变量）。
// 输入 fixtures 模拟 reduce.ts 归约结果（items + hasMore/running），只 import 类型不跑归约。
import { describe, expect, it } from 'vitest'
import { foldTurns } from '../../../renderer/fold/turn-fold'
import type { TimelineItem } from '../../../renderer/plugins/session/reduce'

// ---- fixtures：与 reduce.ts 产出形状一致（reduce.ts:110-161）----
const u = (id: string, text = id): TimelineItem => ({ kind: 'user', id, text })
const a = (turn: number, step: number, text: string): TimelineItem => ({ kind: 'assistant', id: `t${turn}-s${step}`, text })
const r = (turn: number, step: number, text: string): TimelineItem => ({ kind: 'thinking', id: `t${turn}-s${step}-r`, text })
const t = (callId: string): TimelineItem => ({ kind: 'tool', id: `tool-${callId}`, callId, name: 'bash', args: '{}', status: 'running', result: null, awaiting: false, decision: null })
// reduce.ts endNotice（:95-102）：aborted|interrupted|cancelled → muted「已停止」；其余非 completed → danger
const n = (turn: number, tone: 'muted' | 'danger', text: string): TimelineItem => ({ kind: 'notice', id: `end-${turn}`, tone, text })

const msgs = (out: ReturnType<typeof foldTurns>) => out.entries.filter((e) => e.kind === 'message')
const thinks = (out: ReturnType<typeof foldTurns>) => out.entries.filter((e) => e.kind === 'thinking')
const notices = (out: ReturnType<typeof foldTurns>) => out.entries.filter((e) => e.kind === 'notice')
const tools = (out: ReturnType<typeof foldTurns>) => out.entries.filter((e) => e.kind === 'tool-call')
const entryOf = (out: ReturnType<typeof foldTurns>, id: string) => out.entries.find((e) => e.id === id)

// ---- D1 函数层 ----
describe('foldTurns · D1 规则表', () => {
  it('A→t1→B→t2→C→t3→E completed → 恰 2 气泡（A ack / E result），B、C 降级 thinking，3 个 tool，E 只出现一次', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'B'), t('c2'), a(1, 2, 'C'), t('c3'), a(1, 3, 'E')], { hasMore: false, running: false })
    expect(msgs(out).map((m) => [m.text, m.role])).toEqual([['A', 'ack'], ['E', 'result']])
    expect(thinks(out).map((x) => [x.id, x.from])).toEqual([['t1-s1', 'text'], ['t1-s2', 'text']])
    expect(tools(out)).toHaveLength(3)
    expect(out.entries.filter((e) => 'text' in e && e.text === 'E')).toHaveLength(1)
  })

  it('无工具问答 → 恰 1 气泡（整条回答）', () => {
    const out = foldTurns([u('u1'), a(1, 0, '答案')], { hasMore: false, running: false })
    expect(msgs(out).map((m) => [m.text, m.role])).toEqual([['答案', 'ack']])
    expect(thinks(out)).toHaveLength(0)
  })

  it('回合进行中：气泡 ≤1，首工具后 streamingAs=thinking，首工具前= message', () => {
    const mid = foldTurns([u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'B'), t('c2')], { hasMore: false, running: true })
    expect(msgs(mid)).toHaveLength(1) // 只有 ack
    expect(thinks(mid).map((x) => x.from)).toEqual(['text']) // B 落 thinking（回合结束才可能升）
    expect(mid.streamingAs).toBe('thinking')
    const pre = foldTurns([u('u1'), a(1, 0, 'A')], { hasMore: false, running: true })
    expect(msgs(pre)).toHaveLength(1)
    expect(pre.streamingAs).toBe('message')
  })
})

// ---- D2 兜底七格 ----
describe('foldTurns · D2 七格', () => {
  it('(a) ack→工具→最终文本：最终文本成气泡且不重复', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'result')], { hasMore: false, running: false })
    expect(msgs(out).map((m) => [m.text, m.role])).toEqual([['ack', 'ack'], ['result', 'result']])
    expect(out.entries.filter((e) => 'text' in e && e.text === 'result')).toHaveLength(1)
  })

  it('(b) ack→工具→error：恰 1 条 reduce 出错 notice，尾段不升气泡', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'tail'), n(1, 'danger', '回复失败：boom')], { hasMore: false, running: false })
    expect(msgs(out).map((m) => m.text)).toEqual(['ack'])
    expect(entryOf(out, 't1-s1')?.kind).toBe('thinking')
    expect(notices(out)).toEqual([{ kind: 'notice', id: 'end-1', tone: 'danger', text: '回复失败：boom', source: 'reduce' }])
  })

  it('(c) ack→工具→B→工具→completed 无尾文本：B 移为气泡且从 thinking 行消失', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'B'), t('c2')], { hasMore: false, running: false })
    expect(entryOf(out, 't1-s1')).toMatchObject({ kind: 'message', role: 'result', text: 'B' })
    expect(thinks(out)).toHaveLength(0)
    expect(msgs(out).map((m) => [m.text, m.role])).toEqual([['ack', 'ack'], ['B', 'result']])
  })

  it('(d) 全程无文本 completed → 恰 1 条 fold「没有文字结果」notice', () => {
    const out = foldTurns([u('u1'), t('c1'), t('c2')], { hasMore: false, running: false })
    expect(msgs(out)).toHaveLength(0)
    expect(notices(out)).toHaveLength(1)
    expect(notices(out)[0]).toMatchObject({ tone: 'muted', text: '已完成，没有文字结果 · 展开查看过程', source: 'fold' })
  })

  for (const kind of ['aborted', 'interrupted', 'cancelled'] as const) {
    it(`(e) ${kind} → 恰 1 条「已停止」notice（reduce 产出，三枚举同归 (e)），尾段不升气泡`, () => {
      const out = foldTurns([u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'tail'), n(1, 'muted', '已停止')], { hasMore: false, running: false })
      expect(notices(out)).toHaveLength(1)
      expect(notices(out)[0]).toMatchObject({ tone: 'muted', text: '已停止', source: 'reduce' })
      expect(entryOf(out, 't1-s1')?.kind).toBe('thinking')
      expect(msgs(out).map((m) => m.text)).toEqual(['ack'])
    })
  }

  it('(f) reasoning→工具→completed 无尾正文：reasoning 仍是 thinking、不升气泡；无中间正文走 (d)', () => {
    const out = foldTurns([u('u1'), r(1, 0, '思考'), t('c1')], { hasMore: false, running: false })
    expect(entryOf(out, 't1-s0-r')).toMatchObject({ kind: 'thinking', from: 'reasoning' })
    expect(msgs(out)).toHaveLength(0)
    expect(notices(out)).toHaveLength(1) // (d)
    expect(notices(out)[0]).toMatchObject({ source: 'fold' })
  })

  it('(f) 有中间正文走 (c)：升的是正文不是 reasoning', () => {
    const out = foldTurns([u('u1'), r(1, 0, '思考'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'B'), t('c2')], { hasMore: false, running: false })
    expect(entryOf(out, 't1-s1')).toMatchObject({ kind: 'message', role: 'result', text: 'B' })
    expect(entryOf(out, 't1-s0-r')).toMatchObject({ kind: 'thinking', from: 'reasoning' })
  })

  it('(g) 页首片段 hasMore：0 ack 气泡、正文全进 thinking、无 (d)；拼合更早一页后按完整回合重算', () => {
    const frag = [a(1, 1, 'T1'), t('c1'), a(1, 2, 'T2')]
    const out = foldTurns(frag, { hasMore: true, running: false })
    expect(msgs(out)).toHaveLength(0)
    expect(thinks(out).map((x) => [x.id, x.from])).toEqual([['t1-s1', 'text'], ['t1-s2', 'text']])
    expect(notices(out)).toHaveLength(0)
    const full = foldTurns([u('u0'), a(1, 0, 'ack'), t('c0'), ...frag], { hasMore: false, running: false })
    expect(msgs(full).map((m) => [m.text, m.role])).toEqual([['ack', 'ack'], ['T2', 'result']])
    expect(entryOf(full, 't1-s1')).toMatchObject({ kind: 'thinking', from: 'text' })
  })

  it('(g) running 片段：streamingAs=thinking（无回合起点，流式正文按中间文本）', () => {
    const out = foldTurns([a(1, 1, 'T1'), t('c1')], { hasMore: true, running: true })
    expect(out.streamingAs).toBe('thinking')
  })

  it('边界：ack→工具→completed（无中间/尾正文）→ 不触发兜底，ack 气泡即唯一可见正文', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'A'), t('c1')], { hasMore: false, running: false })
    expect(msgs(out).map((m) => m.text)).toEqual(['A'])
    expect(notices(out)).toHaveLength(0)
    expect(thinks(out)).toHaveLength(0)
  })
})

// ---- ④ 多回合 ----
describe('foldTurns · 多回合', () => {
  it('④ 两回合相邻：前一回合 result 不因后一回合工具降级', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'A'), t('c1'), a(1, 3, 'E'), u('u2'), a(2, 0, 'A2'), t('c2')], { hasMore: false, running: true })
    expect(entryOf(out, 't1-s3')).toMatchObject({ kind: 'message', role: 'result', text: 'E' })
    expect(entryOf(out, 't2-s0')).toMatchObject({ kind: 'message', role: 'ack' })
  })

  it('④ 变体：前一回合 error → 其尾段保持 thinking，不受后一回合影响', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'E'), n(1, 'danger', '回复失败：x'), u('u2'), a(2, 0, 'A2'), t('c2')], { hasMore: false, running: false })
    expect(entryOf(out, 't1-s1')?.kind).toBe('thinking')
    expect(entryOf(out, 't2-s0')).toMatchObject({ kind: 'message', role: 'ack' })
  })

  it('t<turn> 前缀变化也切段（无新 user 的续回合）；工具开头无前缀的回合归上一段（决策 6 上限，P6-12 兜底）', () => {
    const out = foldTurns([u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'E'), a(2, 0, 'W')], { hasMore: false, running: true })
    expect(entryOf(out, 't1-s1')).toMatchObject({ kind: 'message', role: 'result', text: 'E' })
    expect(entryOf(out, 't2-s0')).toMatchObject({ kind: 'message', role: 'ack' })
  })
})

// ---- ③ 不变量：对全部用例断言 ----
describe('foldTurns · 不变量（全部用例）', () => {
  const CASES: Array<{ name: string; items: TimelineItem[]; hasMore: boolean; running: boolean }> = [
    { name: 'D1 A..E completed', items: [u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'B'), t('c2'), a(1, 2, 'C'), t('c3'), a(1, 3, 'E')], hasMore: false, running: false },
    { name: 'D1 无工具', items: [u('u1'), a(1, 0, '答案')], hasMore: false, running: false },
    { name: 'D1 进行中', items: [u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'B'), t('c2')], hasMore: false, running: true },
    { name: 'D2(a)', items: [u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'result')], hasMore: false, running: false },
    { name: 'D2(b)', items: [u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'tail'), n(1, 'danger', '回复失败：boom')], hasMore: false, running: false },
    { name: 'D2(c)', items: [u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'B'), t('c2')], hasMore: false, running: false },
    { name: 'D2(d)', items: [u('u1'), t('c1'), t('c2')], hasMore: false, running: false },
    { name: 'D2(e)', items: [u('u1'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'tail'), n(1, 'muted', '已停止')], hasMore: false, running: false },
    { name: 'D2(f)1', items: [u('u1'), r(1, 0, '思考'), t('c1')], hasMore: false, running: false },
    { name: 'D2(f)2', items: [u('u1'), r(1, 0, '思考'), a(1, 0, 'ack'), t('c1'), a(1, 1, 'B'), t('c2')], hasMore: false, running: false },
    { name: 'D2(g) 片段', items: [a(1, 1, 'T1'), t('c1'), a(1, 2, 'T2')], hasMore: true, running: false },
    { name: 'D2(g) 拼合', items: [u('u0'), a(1, 0, 'ack'), t('c0'), a(1, 1, 'T1'), t('c1'), a(1, 2, 'T2')], hasMore: false, running: false },
    { name: '边界 ack-only', items: [u('u1'), a(1, 0, 'A'), t('c1')], hasMore: false, running: false },
    { name: '④ 多回合', items: [u('u1'), a(1, 0, 'A'), t('c1'), a(1, 3, 'E'), u('u2'), a(2, 0, 'A2'), t('c2')], hasMore: false, running: true },
    { name: '④ 多回合 error', items: [u('u1'), a(1, 0, 'A'), t('c1'), a(1, 1, 'E'), n(1, 'danger', '回复失败：x'), u('u2'), a(2, 0, 'A2'), t('c2')], hasMore: false, running: false },
  ]

  for (const c of CASES) {
    it(`${c.name}：正文恰出现 1 次 / reasoning 永不成气泡 / 已结束回合可见 entry ≥1`, () => {
      const out = foldTurns(c.items, { hasMore: c.hasMore, running: c.running })
      // ① 每个 reduce 条目在输出里恰出现 1 次（移动不复制；(d) 的 fold notice 是新增，不占 item id）
      for (const item of c.items) {
        expect(out.entries.filter((e) => e.id === item.id), `${c.name} · ${item.id}`).toHaveLength(1)
      }
      // ② reasoning（id 带 -r）永不成气泡
      for (const item of c.items) {
        if (item.kind === 'thinking') expect(entryOf(out, item.id)?.kind, `${c.name} · ${item.id}`).toBe('thinking')
      }
      // ③ 已结束、非片段的回合可见 entry ≥1（按 user 切段；片段用例无 user，天然豁免；running 尾段未结束豁免）
      const userIdx = c.items.map((i, k) => (i.kind === 'user' ? k : -1)).filter((k) => k >= 0)
      userIdx.forEach((from, s) => {
        const to = s + 1 < userIdx.length ? userIdx[s + 1]! : c.items.length
        const seg = c.items.slice(from, to)
        const isLast = s === userIdx.length - 1
        if (!seg.some((i) => i.kind === 'tool' || i.kind === 'assistant' || i.kind === 'thinking')) return
        if (isLast && c.running) return
        const ids = new Set(seg.map((i) => i.id))
        const visible = out.entries.filter((e) => ids.has(e.id) && (e.kind === 'message' || e.kind === 'notice' || e.kind === 'tool-call'))
        expect(visible.length, `${c.name} · seg${s}`).toBeGreaterThan(0)
      })
    })
  }
})
