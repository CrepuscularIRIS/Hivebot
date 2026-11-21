// B32 Task 3（plan Task 3）：local Source 触发器——主 bot 用户消息 → work item Trigger。
import { describe, expect, it } from 'vitest'
import { localTrigger, LOCAL_SOURCE } from '../src/sources/local-trigger.js'

describe('B32 local trigger', () => {
  it('thread = 会话，人发起的直接请求，id 由会话+消息稳定派生', () => {
    const t = localTrigger({ sessionId: 'main-1', messageId: 'm7', text: '  看一下 PR  ', at: '2026-11-18T17:20:00.000Z' })
    expect(t).toMatchObject({
      id: 'local:main-1:m7', source: LOCAL_SOURCE, human: true, addressed: 'direct',
      threads: [{ source: LOCAL_SOURCE, id: 'main-1' }],
      actor: { source: LOCAL_SOURCE, id: 'person' }, at: '2026-11-18T17:20:00.000Z', text: '看一下 PR',
    })
    expect(t.channel).toEqual({ source: LOCAL_SOURCE, thread: 'local:main-1', address: { session: 'main-1' } })
  })
  it('重试同一消息 → 同一 id（Intake 去重，不开第二张单）', () => {
    const a = localTrigger({ sessionId: 'main-1', messageId: 'm7', text: 'x', at: '2026-11-18T17:20:00Z' })
    const b = localTrigger({ sessionId: 'main-1', messageId: 'm7', text: 'x', at: '2026-11-18T17:21:00Z' })
    expect(a.id).toBe(b.id)
  })
  it('空文本不产生 work item', () => {
    expect(() => localTrigger({ sessionId: 'main-1', messageId: 'm8', text: '   ', at: '2026-11-18T17:20:00Z' })).toThrow(/empty/)
  })
})
