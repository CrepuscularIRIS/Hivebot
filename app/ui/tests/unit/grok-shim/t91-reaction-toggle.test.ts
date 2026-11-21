// T91b：reaction toggle 真打 shim（createShimData + dev.testFeedEvent 注入 + deps.reactToMessage 两调）
// 状态经 dev.reactionDebug 只读钩子（先例 dev.state）；乐观链用 production 纯函数钉对象形态。
import { describe, expect, it, vi } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'
import { applyOptimisticReactionUpdate } from '../../../renderer-grok/frontend/src/production/reaction-root'

const okApi = vi.fn(async () => ({ ok: true }))

interface ReactionState { reactions: string[]; myReactions: Set<string> }
describe('T91b reaction toggle（真 shim）', () => {
  it('同一 entry 调两次 reactToMessage：状态 reactions 增→删', async () => {
    const data = createShimData({ authId: 'auth', api: okApi as never, metaApi: okApi as never })
    const react = data.deps.reactToMessage as unknown as (i: { entryId: string; emoji: string; agentId: string }) => Promise<void>
    // 无 follow 流时 entryId 落 summaries 兜底 key——状态仍按 entryId 记（投影合并属 e2e 面）
    const rdOf = (): Array<[string, ReactionState]> | undefined => {
      const rd = (data as unknown as { reactionDebug(): Record<string, Array<[string, ReactionState]>> }).reactionDebug()
      for (const rows of Object.values(rd)) if (rows !== undefined) return rows
      return undefined
    }
    await react({ entryId: 'e-1', emoji: '👍', agentId: 's1' })
    await new Promise((r) => setTimeout(r, 10))
    expect(rdOf()?.find(([k]) => k === 'e-1')?.[1].reactions).toContain('👍')
    await react({ entryId: 'e-1', emoji: '👍', agentId: 's1' })
    await new Promise((r) => setTimeout(r, 10))
    expect(rdOf()?.find(([k]) => k === 'e-1')?.[1].reactions ?? []).toEqual([])
  })
})

describe('T91 乐观 pill（applyOptimisticReactionUpdate）', () => {
  it('同 entry 加 emoji → TranscriptReaction 对象形态；异 entry 不动', () => {
    const entries = [
      { kind: 'message', id: 'e1', text: 'hi', role: 'assistant', timestampMs: 1 },
      { kind: 'message', id: 'e2', text: 'yo', role: 'assistant', timestampMs: 2 },
    ] as unknown as Parameters<typeof applyOptimisticReactionUpdate>[0]
    const next = applyOptimisticReactionUpdate(entries, { entryId: 'e1', emoji: '👍', agentId: 'a' })
    const e1 = next.find((e) => (e as { id: string }).id === 'e1') as unknown as { reactions?: Array<{ emoji: string; by: string }>; myReactions?: Set<string> }
    const e2 = next.find((e) => (e as { id: string }).id === 'e2') as unknown as { reactions?: Array<{ emoji: string; by: string }> }
    expect(e1.reactions).toContainEqual({ emoji: '👍', by: 'me' })
    expect([...(e1.myReactions ?? [])]).toContain('👍')
    expect(e2.reactions ?? []).not.toContainEqual({ emoji: '👍', by: 'me' })
  })
})
