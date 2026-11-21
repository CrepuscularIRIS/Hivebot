// P5-54 · U6（P5-12 B14 迁新 renderer）：renderer-grok 覆盖层的时间分隔 / 未读线生成器（overrides/modules/markers.ts）。
// 阈值与判定 = 0.78.1 原版（index.eager-app-iGTgHP_Q.js @1734517 emt=9e5、@1739294 vmt、@1738914 UR、@1741826 Emt）；
// runtime 真时钟造不出 15 分钟差，阈值 / 跨日 / 文案只在这里测（e2e 测首条 1 条 + 阈值内 0 条 + 未读线）。
import { describe, expect, it } from 'vitest'
import {
  SEP_GAP_MS, UNREAD_SCROLL_INSET, createUnreadTracker, firstUnreadId, latestAt, timeLabel, unreadScrollTop, withMarkers, type MarkerEntry,
} from '../../../renderer-grok/overrides/modules/markers'

const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0): number => new Date(y, mo - 1, d, h, mi, s).getTime()
const u = (id: string, t?: number): MarkerEntry => ({ kind: 'message', role: 'user', id, ...(t !== undefined ? { timestampMs: t } : {}) })
const a = (id: string, t?: number): MarkerEntry => ({ kind: 'message', role: 'assistant', id, ...(t !== undefined ? { timestampMs: t } : {}) })
const kinds = (rows: Array<{ kind: string; id: string }>): string[] => rows.map((r) => (r.kind === 'message' ? r.id : r.kind))
const NOW = at(2026, 11, 3, 18, 0)
const T0 = at(2026, 11, 3, 10, 0)

describe('时间分隔（0.78.1 vmt）', () => {
  it('阈值 = 900000ms', () => { expect(SEP_GAP_MS).toBe(900_000) })

  it('首条上方恒有 1 条；Δ=899999 两条之间 0 条；Δ=900000 出 1 条（含等号）', () => {
    expect(kinds(withMarkers([u('m1', T0), a('m2', T0 + 899_999)], NOW, null))).toEqual(['time-separator', 'm1', 'm2'])
    expect(kinds(withMarkers([u('m1', T0), a('m2', T0 + 900_000)], NOW, null))).toEqual(['time-separator', 'm1', 'time-separator', 'm2'])
  })

  it('跨本地自然日：Δ=60s 跨 0 点也出', () => {
    const rows = withMarkers([u('m1', at(2026, 11, 2, 23, 59, 30)), a('m2', at(2026, 11, 3, 0, 0, 30))], NOW, null)
    expect(kinds(rows)).toEqual(['time-separator', 'm1', 'time-separator', 'm2'])
  })

  it('无时间的条目、审批卡（dock 渲染）不触发分隔也不更新 prev', () => {
    const perm: MarkerEntry = { kind: 'local-tool-permission', id: 'p', timestampMs: T0 + 950_000 }
    expect(kinds(withMarkers([u('m1', T0), a('m2'), perm, u('m3', T0 + 900_000)], NOW, null)))
      .toEqual(['time-separator', 'm1', 'm2', 'local-tool-permission', 'time-separator', 'm3'])
  })

  it('thinking 与其消息同一时间：分隔只落在 thinking 前；分隔 id 稳定', () => {
    const rows = withMarkers([{ kind: 'thinking', id: 't1', timestampMs: T0 }, a('m1', T0)], NOW, null)
    expect(rows.map((r) => r.kind)).toEqual(['time-separator', 'thinking', 'message'])
    expect(rows[0]!.id).toBe('t1:timestamp')
  })

  it('文案（en-US，原版 UR）：Today / Yesterday / 同年 / 跨年', () => {
    expect(timeLabel(at(2026, 11, 3, 14, 5), NOW)).toBe('Today 2:05 PM')
    expect(timeLabel(at(2026, 11, 2, 9, 7), NOW)).toBe('Yesterday 9:07 AM')
    expect(timeLabel(at(2026, 10, 27, 14, 5), NOW)).toBe('Tue, Oct 27 2:05 PM')
    expect(timeLabel(at(2025, 11, 3, 14, 5), NOW)).toBe('Nov 3, 2025 2:05 PM')
  })
})

describe('未读线', () => {
  const items = [u('m1', T0), a('m2', T0 + 1000), u('m3', T0 + 2000), a('m4', T0 + 3000), a('m5', T0 + 4000)]

  it('起点 = 首条晚于 readMark 且非用户消息；无 readMark / 无新内容 → null', () => {
    expect(firstUnreadId(items, T0 + 1000)).toBe('m4')
    expect(firstUnreadId(items, undefined)).toBeNull()
    expect(firstUnreadId(items, T0 + 4000)).toBeNull()
  })

  it('恰 1 条，顺序 未读线 → 时间分隔 → 条目；计数 = 其后的 bot 消息；指向不存在的 id → 0 条', () => {
    const rows = withMarkers([u('m1', T0), a('m2', T0 + 900_000)], NOW, 'm2')
    expect(kinds(rows)).toEqual(['time-separator', 'm1', 'unread-divider', 'time-separator', 'm2'])
    const one = withMarkers(items, NOW, 'm4').filter((r) => r.kind === 'unread-divider')
    expect(one).toEqual([{ kind: 'unread-divider', id: 'unread-divider', newMessageCount: 2 }])
    expect(withMarkers(items, NOW, 'gone').filter((r) => r.kind === 'unread-divider')).toHaveLength(0)
  })

  it('send-message + text 是 agent 发来的消息（0.18 判 assistant 侧，P5-55）：可作未读起点；用户消息 = message + role user', () => {
    const sent: MarkerEntry = { kind: 'send-message', id: 's1', timestampMs: T0 + 10, message: { type: 'text' } }
    expect(firstUnreadId([u('m1', T0), sent, a('m2', T0 + 20)], T0)).toBe('s1')
  })

  it('latestAt：取最大时间；无带时间的条目 → null', () => {
    expect(latestAt(items)).toBe(T0 + 4000)
    expect(latestAt([u('x')])).toBeNull()
  })

  it('tracker：首访无线；离开记已读边界；回来冻结起点（停留期新到不移动）；再进 0 条', () => {
    const t = createUnreadTracker()
    const A1 = [u('m1', T0), a('m2', T0 + 1000)]
    expect(t.visit('A', A1)).toBeNull()
    expect(t.visit('B', [a('b1', T0)])).toBeNull() // 离开 A：边界 = T0+1000
    const A2 = [...A1, a('m3', T0 + 5000)]
    expect(t.visit('A', A2)).toBe('m3')
    expect(t.visit('A', [...A2, a('m4', T0 + 6000)])).toBe('m3') // 停留期不动
    expect(t.visit('B', [a('b1', T0)])).toBeNull()
    expect(t.visit('A', [...A2, a('m4', T0 + 6000)])).toBeNull() // 已读完 → 0 条
  })

  it('tracker：切过去的瞬间 tail 未到（空快照）不冻结，首个非空快照再定', () => {
    const t = createUnreadTracker()
    t.visit('A', [a('m1', T0)])
    t.visit('B', [])
    expect(t.visit('A', [])).toBeNull()
    expect(t.visit('A', [a('m1', T0), a('m2', T0 + 10)])).toBe('m2')
  })
})

// P5-55（P5-12 final #12 迁新 renderer）：进入时线以下内容超一屏 → 线滚到视口顶下 28px；不超一屏 → 不动（null）
describe('unreadScrollTop · 未读线进入滚动', () => {
  it('线以下超一屏：scrollTop = 线 offsetTop − 28', () => {
    expect(UNREAD_SCROLL_INSET).toBe(28)
    expect(unreadScrollTop(1000, 3000, 800)).toBe(972)
  })
  it('线以下不超一屏：null（保持上游跟底）', () => {
    expect(unreadScrollTop(2400, 3000, 800)).toBeNull()
    expect(unreadScrollTop(2200, 3000, 800)).toBeNull() // 恰好一屏
  })
  it('线在顶部附近：不滚成负数', () => {
    expect(unreadScrollTop(10, 3000, 800)).toBe(0)
  })
})

