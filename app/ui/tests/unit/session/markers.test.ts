// P5-12 B7 thinking 行 + B14 时间分隔 / 未读线（renderer/session/reduce.ts）。
// 阈值证据（0.78.1，work/p1-re/evidence/chunks/index.eager-app-iGTgHP_Q.js）：@1734517 常量 `emt=9e5`（900000ms = 15 分钟）；
// @1739705 判定函数 `vmt(e,t)`：上一条无时间 → 出；|Δ| >= 900000（含等号）→ 出；跨本地自然日 → 出。
// 0.18 重建仓只有 time-separator 类型（model.ts:287-297），无生成器——阈值不取 0.18。
// runtime 真时钟造不出 15 分钟差，阈值 / 跨日 / 缺时只在这里测（e2e 测阈值内 0 条 + 样式）。
import { describe, expect, it } from 'vitest'
import {
  SEP_GAP_MS, firstUnreadId, initView, latestAt, reduceFollow, timeLabel, withMarkers, type SessionView, type TimelineItem,
} from '../../../renderer/session/reduce'

const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0): number => new Date(y, mo - 1, d, h, mi, s).getTime()
const u = (id: string, t?: number): TimelineItem => ({ kind: 'user', id, text: id, ...(t !== undefined ? { at: t } : {}) })
const a = (id: string, t?: number): TimelineItem => ({ kind: 'assistant', id, text: id, ...(t !== undefined ? { at: t } : {}) })
const kinds = (rows: Array<{ kind: string; id: string }>): string[] => rows.map((r) => (r.kind === 'user' || r.kind === 'assistant' ? r.id : r.kind))
const NOW = at(2026, 11, 3, 18, 0)
const T0 = at(2026, 11, 3, 10, 0)

describe('B14 时间分隔（0.78.1 vmt）', () => {
  it('阈值 = 900000ms', () => { expect(SEP_GAP_MS).toBe(900_000) })

  it('首条上方恒有 1 条；Δ=899999 两条之间 0 条；Δ=900000 出 1 条（含等号）', () => {
    expect(kinds(withMarkers([u('m1', T0), a('m2', T0 + 899_999)], NOW, null))).toEqual(['time-sep', 'm1', 'm2'])
    expect(kinds(withMarkers([u('m1', T0), a('m2', T0 + 900_000)], NOW, null))).toEqual(['time-sep', 'm1', 'time-sep', 'm2'])
  })

  it('跨本地自然日：Δ=60s 跨 0 点也出', () => {
    const rows = withMarkers([u('m1', at(2026, 11, 2, 23, 59, 30)), a('m2', at(2026, 11, 3, 0, 0, 30))], NOW, null)
    expect(kinds(rows)).toEqual(['time-sep', 'm1', 'time-sep', 'm2'])
  })

  it('缺时（at 缺省）的行不触发分隔、也不更新 prev', () => {
    expect(kinds(withMarkers([u('m1', T0), a('m2'), u('m3', T0 + 900_000)], NOW, null))).toEqual(['time-sep', 'm1', 'm2', 'time-sep', 'm3'])
    expect(kinds(withMarkers([a('x'), u('m1', T0)], NOW, null))).toEqual(['x', 'time-sep', 'm1'])
  })

  it('thinking 行与其气泡同一 at：分隔只落在 thinking 前', () => {
    const items: TimelineItem[] = [{ kind: 'thinking', id: 't1-s1-r', text: 'r', at: T0 }, a('t1-s1', T0)]
    expect(withMarkers(items, NOW, null).map((r) => r.kind)).toEqual(['time-sep', 'thinking', 'assistant'])
  })

  it('文案：今天 / 昨天 / 同年 / 跨年（now 注入）', () => {
    expect(timeLabel(at(2026, 11, 3, 14, 5), NOW)).toBe('今天 14:05')
    expect(timeLabel(at(2026, 11, 2, 9, 7), NOW)).toBe('昨天 09:07')
    expect(timeLabel(at(2026, 10, 27, 14, 5), NOW)).toBe('10月27日周二 14:05')
    expect(timeLabel(at(2025, 11, 3, 14, 5), NOW)).toBe('2025年11月3日 14:05')
  })
})

describe('B14 未读线', () => {
  const items = [u('m1', T0), a('m2', T0 + 1000), u('m3', T0 + 2000), a('m4', T0 + 3000), a('m5', T0 + 4000)]

  it('起点 = 第一个 at > readMark 且非 user 的行；无 readMark / 无新内容 → null', () => {
    expect(firstUnreadId(items, T0 + 1000)).toBe('m4')
    expect(firstUnreadId(items, undefined)).toBeNull()
    expect(firstUnreadId(items, T0 + 4000)).toBeNull()
  })

  it('恰 1 条，顺序 未读线 → 时间分隔 → item（E78 Emt）；指向不存在的 id → 0 条', () => {
    const rows = withMarkers([u('m1', T0), a('m2', T0 + 900_000)], NOW, 'm2')
    expect(kinds(rows)).toEqual(['time-sep', 'm1', 'unread', 'time-sep', 'm2'])
    expect(withMarkers(items, NOW, 'm4').filter((r) => r.kind === 'unread')).toHaveLength(1)
    expect(withMarkers(items, NOW, 'gone').filter((r) => r.kind === 'unread')).toHaveLength(0)
  })

  it('latestAt：取最大 at；无带时间的行 → null', () => {
    expect(latestAt(items)).toBe(T0 + 4000)
    expect(latestAt([u('x')])).toBeNull()
  })
})

describe('B7 thinking 归约', () => {
  const ev = (type: string, data: unknown, time?: number): unknown => ({ type: 'event', event: { type, data, ...(time !== undefined ? { time } : {}) } })
  const chunk = (c: unknown): unknown => ({ type: 'assistant-stream', frame: { type: 'chunk', chunk: c } })
  const run = (frames: unknown[], v: SessionView = initView('s')): SessionView => frames.reduce<SessionView>((acc, f) => reduceFollow(acc, f), v)

  it('reasoning + text → [thinking, assistant]，id 稳定、同一 at', () => {
    const v = run([ev('assistant/message', {
      turn: 2, step: 1, message: { content: [{ type: 'reasoning', text: '想 A' }, { type: 'reasoning', text: '想 B' }, { type: 'text', text: '答' }] },
    }, T0)])
    expect(v.items).toEqual([{ kind: 'thinking', id: 't2-s1-r', text: '想 A\n\n想 B', at: T0 }, { kind: 'assistant', id: 't2-s1', text: '答', at: T0 }])
  })

  it('只有 reasoning（推理后直接调工具）→ 仅 thinking；空 reasoning → 不出行', () => {
    expect(run([ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '想' }, { type: 'tool-call', id: 'c' }] } })]).items.map((i) => i.kind)).toEqual(['thinking'])
    expect(run([ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'reasoning', text: '' }, { type: 'text', text: '答' }] } })]).items.map((i) => i.kind)).toEqual(['assistant'])
  })

  it('reasoning-delta 只进 streaming.reasoning，不计 chunkCount；text-delta 照旧', () => {
    const v = run([
      { type: 'assistant-stream', frame: { type: 'start' } },
      chunk({ type: 'block-start', index: 0, blockType: 'reasoning' }),
      chunk({ type: 'reasoning-delta', index: 0, text: '先' }),
      chunk({ type: 'reasoning-delta', index: 0, text: '想' }),
    ])
    expect(v.streaming).toEqual({ text: '', reasoning: '先想' })
    expect(v.chunkCount).toBe(0)
    const w = run([chunk({ type: 'text-delta', index: 1, text: '答' })], v)
    expect(w.streaming).toEqual({ text: '答', reasoning: '先想' })
    expect(w.chunkCount).toBe(1)
  })

  it('所有行带 event.time；无 time 的事件不带 at（既有 toEqual 口径不变）', () => {
    const v = run([
      ev('user/message', { id: 'u1', content: [{ type: 'text', text: '嗨' }], source: { kind: 'user' } }, T0),
      ev('tool/call', { callId: 'c1', name: 'bash', arguments: '{}' }, T0 + 5),
      ev('tool/result', { message: { toolCallId: 'c1', content: [] } }, T0 + 9),
      ev('turn/end', { turn: 1, reason: { kind: 'aborted' } }),
    ])
    expect(v.items.map((i) => i.at)).toEqual([T0, T0 + 5, undefined])
  })
})
