// T45a：petStateOf 六态判定+去重（工单 ①–⑥）
import { describe, expect, it } from 'vitest'
import { petStateOf, PET_STATES, type PetViewInfo } from '../../../renderer-grok/shim/src/pet'
import type { WorkerFacts } from '../../../renderer-grok/shim/src/workers'

const facts = (over: Partial<WorkerFacts> = {}): WorkerFacts => ({
  id: 'x', blockedReason: null, running: false, unread: false, end: null,
  updatedAt: 0, started: false, toolCount: 0, ...over,
} as WorkerFacts)

describe('T45a petStateOf', () => {
  it('① rank0 等待优先于 rank1 → waiting + botId=rank0 者', () => {
    const out = petStateOf([
      { id: 'b1', facts: facts({ blockedReason: 'approve?' }) },   // rank 0（blocked）
      { id: 'b2', facts: facts({ running: true }) },                // rank 1
    ])
    expect(out).toEqual({ state: 'waiting', botId: 'b1' })
  })
  it('② rank1：视图有在跑工具→working；已加载无→thinking；未加载→working', () => {
    const runningTool: PetViewInfo = { loaded: true, runningTool: true }
    const noTool: PetViewInfo = { loaded: true, runningTool: false }
    expect(petStateOf([{ id: 'a', facts: facts({ running: true }), view: runningTool }])).toEqual({ state: 'working', botId: 'a' })
    expect(petStateOf([{ id: 'a', facts: facts({ running: true }), view: noTool }])).toEqual({ state: 'thinking', botId: 'a' })
    expect(petStateOf([{ id: 'a', facts: facts({ running: true }) }])).toEqual({ state: 'working', botId: 'a' })
  })
  it('③ rank2（unread+failed）→error；unread+stopped→idle', () => {
    expect(petStateOf([{ id: 'a', facts: facts({ unread: true, end: 'failed' }) }])).toEqual({ state: 'error', botId: 'a' })
    expect(petStateOf([{ id: 'a', facts: facts({ unread: true, end: 'stopped' }) }])).toEqual({ state: 'idle', botId: null })
  })
  it('④ rank3 ok→success', () => {
    expect(petStateOf([{ id: 'a', facts: facts({ unread: true, end: 'ok' }) }])).toEqual({ state: 'success', botId: 'a' })
  })
  it('⑤ roster 空 / 全 rank4 → idle null', () => {
    expect(petStateOf([])).toEqual({ state: 'idle', botId: null })
    expect(petStateOf([{ id: 'a', facts: facts({ end: 'ok' }) }])).toEqual({ state: 'idle', botId: null }) // 已读完成=rank4
  })
  it('⑥ 去重由调用方承载：state+botId 同则不重发（此处钉形状稳定性）+ PET_STATES 枚举完备', () => {
    const a = petStateOf([{ id: 'a', facts: facts({ running: true }) }])
    const b = petStateOf([{ id: 'a', facts: facts({ running: true }) }])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)) // 同输入同输出——去重靠比较
    expect(PET_STATES).toEqual(['idle', 'waiting', 'working', 'thinking', 'error', 'success'])
  })
})
