// U-15 dev-min follow 归约单测：snapshot（header.agentPreset + 历史 records）、
// assistant-stream chunk 增量、user/message、assistant/message 定稿替换、turn/start|end。
// 帧形状依据 CONTRACT §3.3（T-06 实测：user/message 平铺、assistant/message 嵌套）。
import { describe, expect, it } from 'vitest'
import { initBot, reduceItem, type BotView } from '../../../renderer/dev-min/reduce'

const ev = (type: string, data: unknown): { type: 'event'; event: { type: string; data: unknown } } =>
  ({ type: 'event', event: { type, data } })

const text = (t: string): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: t }]

function reduceAll(bot: BotView, values: unknown[]): BotView {
  return values.reduce((acc, value) => reduceItem(acc, value), bot)
}

describe('dev-min reduce（D1 视图模型）', () => {
  it('snapshot：header.agentPreset 进 preset，records 历史逐条归约为 final 气泡', () => {
    const bot = initBot('s-1')
    const out = reduceItem(bot, {
      type: 'snapshot',
      header: { version: 1, id: 's-1', createdAt: 0, isSeeded: false, agentPreset: 'p2-alpha' },
      cursor: 2,
      records: [
        { type: 'event', event: { type: 'user/message', data: { id: 'u1', role: 'user', content: text('早'), source: { kind: 'user' } } } },
        { type: 'event', event: { type: 'assistant/message', data: { turn: 1, step: 0, message: { role: 'assistant', content: text('晚') } } } },
      ],
      hasMore: false,
      projections: {},
    })
    expect(out.preset).toBe('p2-alpha')
    expect(out.bubbles).toEqual([
      { id: 'u1', role: 'user', text: '早', final: true },
      { id: 't1-s0', role: 'assistant', text: '晚', final: true },
    ])
  })

  it('runtime-context 注入的 user/message（source.kind 非 user）不产生气泡', () => {
    const out = reduceItem(initBot('s'), ev('user/message', { id: 'x', role: 'user', content: text('ctx'), source: { kind: 'runtime' } }))
    expect(out.bubbles).toEqual([])
  })

  it('流式：start→chunk 追加不落盘，chunkCount 计数；两个 chunk 后仍无 final 气泡（D1 挂起态）', () => {
    let bot = reduceItem(initBot('s'), { type: 'assistant-stream', frame: { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 0 } })
    bot = reduceItem(bot, { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', revision: 1, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: '第一段 ' } } })
    bot = reduceItem(bot, { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', revision: 1, index: 1, time: 2, chunk: { type: 'text-delta', index: 0, text: '第二段' } } })
    expect(bot.streaming).toEqual({ attemptId: 'a1', text: '第一段 第二段' })
    expect(bot.chunkCount).toBe(2)
    expect(bot.bubbles).toEqual([])
    expect(bot.bubbles.some((b) => b.final && b.role === 'assistant')).toBe(false)
  })

  it('assistant/message 定稿替换流式气泡（D1：被定稿替换）', () => {
    let bot = reduceItem(initBot('s'), { type: 'assistant-stream', frame: { type: 'start', attemptId: 'a1', revision: 1, turn: 1, step: 0 } })
    bot = reduceItem(bot, { type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', revision: 1, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: '半截' } } })
    bot = reduceItem(bot, ev('assistant/message', { turn: 1, step: 0, message: { role: 'assistant', content: text('半截+定稿全文') } }))
    expect(bot.streaming).toBe(null)
    expect(bot.bubbles).toEqual([{ id: 't1-s0', role: 'assistant', text: '半截+定稿全文', final: true }])
  })

  it('turn/start → running；turn/end → 不再 running、turnEnded、endReason', () => {
    let bot = reduceItem(initBot('s'), ev('turn/start', { turn: 3 }))
    expect(bot.running).toBe(true)
    bot = reduceItem(bot, ev('turn/end', { turn: 3, reason: { kind: 'completed' } }))
    expect(bot.running).toBe(false)
    expect(bot.turnEnded).toBe(true)
    expect(bot.endReason).toBe('completed')
  })

  it('不可变：归约返回新对象，入参 bot 不被改写', () => {
    const bot = initBot('s')
    const out = reduceItem(bot, ev('turn/start', { turn: 1 }))
    expect(bot.running).toBe(false)
    expect(out).not.toBe(bot)
  })

  it('snapshot.assistantStream 基线不归约（ponytail：D1 无中途恢复场景）', () => {
    const out = reduceItem(initBot('s'), {
      type: 'snapshot', header: { version: 1, id: 's', createdAt: 0, isSeeded: false }, cursor: 0,
      records: [], hasMore: false, projections: {},
      assistantStream: { activeAttempt: { stream: [{ type: 'text-delta', index: 0, text: '基线' }] } },
    })
    expect(out.chunkCount).toBe(0)
    expect(out.streaming).toBe(null)
  })
})
