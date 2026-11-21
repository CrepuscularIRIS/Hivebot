// P6-01 验收员独立不变量探针（②）：与 builder 用例不同的混合输入，亲调 foldTurns。
import { describe, expect, it } from 'vitest'
import { foldTurns } from './renderer/fold/turn-fold'
import type { TimelineItem } from './renderer/plugins/session/reduce'

const u = (id: string, text = id): TimelineItem => ({ kind: 'user', id, text })
const a = (turn: number, step: number, text: string): TimelineItem => ({ kind: 'assistant', id: `t${turn}-s${step}`, text })
const r = (turn: number, step: number, text: string): TimelineItem => ({ kind: 'thinking', id: `t${turn}-s${step}-r`, text })
const t = (callId: string, status = 'running'): TimelineItem => ({ kind: 'tool', id: `tool-${callId}`, callId, name: 'bash', args: '{}', status: status as never, result: null, awaiting: false, decision: null })

// 混合输入：3 个回合，reasoning 与正文交错、工具穿插、含全程无正文的回合
const MIX: TimelineItem[] = [
  u('u1'),
  r(1, 0, '先想想'), a(1, 0, '收到，我来查'),
  t('k1', 'done'),
  r(1, 1, '中间推理'), a(1, 1, '查到一半的结论'),
  t('k2', 'done'),
  a(1, 2, '最终结果出来啦'), // 尾正文 → completed 升 result
  u('u2'),
  r(2, 0, '只有推理'),
  t('k3', 'done'), t('k4', 'running'), // 全程无正文 → (d)
  u('u3'),
  r(3, 0, '回合三推理'), a(3, 0, 'ack 三'),
  t('k5', 'done'),
  a(3, 1, '中间正文三'), // 无尾正文 → (c) 升最后一段中间正文
  t('k6', 'done'),
]

describe('vfy · P6-01 不变量抽验（混合输入亲调）', () => {
  const out = foldTurns(MIX, { hasMore: false, running: true }) // 末回合进行中

  it('每个输入条目 id 在输出里恰出现 1 次（移动不复制）', () => {
    for (const item of MIX) {
      expect(out.entries.filter((e) => e.id === item.id), item.id).toHaveLength(1)
    }
  })

  it('reasoning（id -r 结尾）输出恒为 thinking 行，永不成气泡', () => {
    const reasoning = MIX.filter((i) => i.kind === 'thinking')
    expect(reasoning.length).toBeGreaterThanOrEqual(3)
    for (const item of reasoning) {
      const e = out.entries.find((x) => x.id === item.id)
      expect(e?.kind, item.id).toBe('thinking')
      if (e?.kind === 'thinking') expect(e.from, item.id).toBe('reasoning')
    }
  })

  it('回合 1：尾正文升 result 气泡，中间正文降 thinking(from:text)，ack 是气泡', () => {
    const e = (id: string) => out.entries.find((x) => x.id === id)
    expect(e('t1-s0')).toMatchObject({ kind: 'message', role: 'ack' })
    expect(e('t1-s1')).toMatchObject({ kind: 'thinking', from: 'text' })
    expect(e('t1-s2')).toMatchObject({ kind: 'message', role: 'result' })
  })

  it('回合 2（全程无正文）→ (d) fold notice；reasoning 行保留', () => {
    const e = (id: string) => out.entries.find((x) => x.id === id)
    expect(e('t2-s0-r')).toMatchObject({ kind: 'thinking', from: 'reasoning' })
    const foldNotice = out.entries.filter((x) => x.kind === 'notice' && x.source === 'fold')
    expect(foldNotice).toHaveLength(1)
    expect(foldNotice[0]).toMatchObject({ tone: 'muted' })
  })

  it('回合 3（无尾正文）→ (c) 升的是中间正文而非 reasoning（turn/end 后重算，running:false）', () => {
    const done = foldTurns(MIX, { hasMore: false, running: false }) // 回合三已结束
    const e = (id: string) => done.entries.find((x) => x.id === id)
    expect(e('t3-s1')).toMatchObject({ kind: 'message', role: 'result' })
    expect(e('t3-s0-r')).toMatchObject({ kind: 'thinking', from: 'reasoning' })
  })

  it('streamingAs：末回合已有工具 → thinking', () => {
    expect(out.streamingAs).toBe('thinking')
  })
})
