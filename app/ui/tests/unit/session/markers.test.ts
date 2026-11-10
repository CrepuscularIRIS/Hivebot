// P5-12 B7 thinking 归约（renderer/session/reduce.ts）。B14 时间分隔 / 未读线 P5-54 起随 UI 迁到
// renderer-grok/overrides/modules/markers.ts，单测见 tests/unit/grok-shim/markers.test.ts。
import { describe, expect, it } from 'vitest'
import { initView, reduceFollow, type SessionView } from '../../../renderer/session/reduce'

const T0 = new Date(2026, 10, 3, 10, 0).getTime()

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
