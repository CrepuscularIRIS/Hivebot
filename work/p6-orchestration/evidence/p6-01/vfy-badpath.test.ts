// P6-01 验收员坏路径探针：空输入 / 无 user 的工具开头段（决策 6 上限）
import { describe, expect, it } from 'vitest'
import { foldTurns } from './renderer/fold/turn-fold'
import type { TimelineItem } from './renderer/plugins/session/reduce'

const t = (callId: string): TimelineItem => ({ kind: 'tool', id: `tool-${callId}`, callId, name: 'bash', args: '{}', status: 'running', result: null, awaiting: false, decision: null })

describe('vfy · 坏路径', () => {
  it('空 items 不崩，输出空、streamingAs=message', () => {
    const out = foldTurns([], { hasMore: false, running: false })
    expect(out.entries).toEqual([])
    expect(out.streamingAs).toBe('message')
  })
  it('空 items + hasMore（纯片段空页）不崩', () => {
    const out = foldTurns([], { hasMore: true, running: false })
    expect(out.entries).toEqual([])
  })
  it('通知唤醒：工具开头无 user、hasMore=true → 决策 6 上限（工具归片段段，无 (d) notice，不崩）', () => {
    const out = foldTurns([t('k1'), t('k2')], { hasMore: true, running: false })
    expect(out.entries.filter((e) => e.kind === 'tool-call')).toHaveLength(2)
    expect(out.entries.filter((e) => e.kind === 'notice')).toHaveLength(0) // 片段段不出 (d)——上限行为，P6-12 闭合
  })
})
