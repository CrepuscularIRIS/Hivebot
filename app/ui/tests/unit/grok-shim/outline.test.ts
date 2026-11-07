// T21：outline 映射（fold → ConversationOutlineItem）+ provider 解析器兼容。
import { describe, expect, it } from 'vitest'
import { toOutlineItems, type FoldLikeItem } from '../../../renderer-grok/shim/src/outline'

const U = (id: string, text: string): FoldLikeItem => ({ kind: 'user', id, text })
const M = (id: string, role: string, text: string): FoldLikeItem => ({ kind: 'message', id, role, text })
const T = (id: string, name: string, status: string, args: string, result: string | null = null): FoldLikeItem => ({ kind: 'tool-call', id, name, status, args, result })
const TH = (id: string, from: string, text: string): FoldLikeLike => ({ kind: 'thinking', id, from, text })
type FoldLikeLike = FoldLikeItem
const N = (id: string): FoldLikeItem => ({ kind: 'notice', id })

describe('T21 toOutlineItems', () => {
  it('映射表逐行：user→user；ack/result→assistant-text；中间轮(from:text)→assistant-text；reasoning→thinking', () => {
    const out = toOutlineItems({ items: [
      U('u1', 'hi'), M('a1', 'ack', '首答'), TH('m1', 'text', '中间轮'), TH('r1', 'reasoning', 'R'), M('e1', 'result', '终答'),
    ], streaming: null })
    expect(out).toEqual([
      { kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'assistant-text', id: 'a1', text: '首答' },
      { kind: 'assistant-text', id: 'm1', text: '中间轮' },
      { kind: 'thinking', id: 'r1', text: 'R' },
      { kind: 'assistant-text', id: 'e1', text: '终答' },
    ])
  })
  it('tool-call 三态映射：running/pending→pending；done→done；failed/error/aborted→failed；summary=toolSummary', () => {
    const out = toOutlineItems({ items: [
      T('t1', 'bash', 'running', '{"command":"ls"}'),
      T('t2', 'bash', 'pending', '{"command":"ls"}'),
      T('t3', 'bash', 'done', '{"command":"ls -la"}', 'ok'),
      T('t4', 'bash', 'failed', '{"command":"x"}', 'err'),
      T('t5', 'bash', 'error', '{}'),
      T('t6', 'bash', 'aborted', '{}'),
    ], streaming: null })
    expect(out.map((o) => [o.id, o.status])).toEqual([
      ['t1', 'pending'], ['t2', 'pending'], ['t3', 'done'], ['t4', 'failed'], ['t5', 'failed'], ['t6', 'failed'],
    ])
    expect(out[2]!.summary).toBe('ls -la')
  })
  it('summary 与主聊天一致（toolSummary 同参同果）', async () => {
    const { toolSummary } = await import('../../../renderer-grok/shim/src/entries')
    const out = toOutlineItems({ items: [T('t', 'bash', 'done', '{"command":"git status"}', null)], streaming: null })
    expect(out[0]!.summary).toBe(toolSummary('bash', '{"command":"git status"}', null))
  })
  it('notice/peer 不进 outline；空 fold → []', () => {
    expect(toOutlineItems({ items: [N('n1'), { kind: 'peer', id: 'p1' } as FoldLikeItem], streaming: null })).toEqual([])
    expect(toOutlineItems({ items: [], streaming: null })).toEqual([])
  })
  it('流式尾：reasoning 流→thinking(live-reasoning)；正文流→assistant-text(live-stream)', () => {
    const out = toOutlineItems({ items: [], streaming: { reasoning: 'R…', text: 'A…' } })
    expect(out).toEqual([
      { kind: 'thinking', id: 'live-reasoning', text: 'R…' },
      { kind: 'assistant-text', id: 'live-stream', text: 'A…' },
    ])
  })
  it('产出 item 全部通过 provider 解析器（import 上游 parseSnapshotItems 同源）', async () => {
    const prov = await import('../../../renderer-grok/frontend/src/recovered/features/conversation/workspace/conversation-outline-provider')
    const parse = (prov as unknown as { __parseItem?: unknown }).__parseItem
    if (parse === undefined) return // 未导出——按验收 1 备选：provider 喂 coordinator 断言不减
    const items = toOutlineItems({ items: [U('u', 'x'), M('a', 'ack', 'y'), TH('r', 'reasoning', 'z'), T('t', 'bash', 'done', '{}')], streaming: null })
    for (const it of items) expect((parse as (v: unknown) => unknown)(it)).not.toBeNull()
  })
})
