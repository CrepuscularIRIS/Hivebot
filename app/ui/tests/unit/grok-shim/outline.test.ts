// T21：outline 映射（view.items TimelineItem → ConversationOutlineItem）+ provider 解析器兼容。
// 形状按运行时实证（e2e probe，2026-11-07）：kind ∈ user/assistant/thinking/tool/notice/report/task，
// thinking 无 from 字段（即 reasoning），tool 三态 running|done|failed。
import { describe, expect, it } from 'vitest'
import { toOutlineItems, type ViewLikeItem } from '../../../renderer-grok/shim/src/outline'

const U = (id: string, text: string): ViewLikeItem => ({ kind: 'user', id, text })
const A = (id: string, text: string): ViewLikeItem => ({ kind: 'assistant', id, text })
const TH = (id: string, text: string): ViewLikeItem => ({ kind: 'thinking', id, text })
const T = (id: string, name: string, status: string, args: string, result: string | null = null): ViewLikeItem => ({ kind: 'tool', id, name, status, args, result })
const N = (id: string): ViewLikeItem => ({ kind: 'notice', id })

describe('T21 toOutlineItems', () => {
  it('映射表逐行：user→user；assistant（首答/中间轮/尾答不分）→assistant-text；thinking（reasoning）→thinking', () => {
    const out = toOutlineItems({ items: [
      U('u1', 'hi'), TH('t1-s1-r', 'R'), A('t1-s1', 'A 首答'), T('tool-t1', 'bash', 'done', '{}', 'ok'), A('t1-s1b', 'B 中间轮'), A('t1-s2', 'E 终答'),
    ], streaming: null })
    expect(out).toEqual([
      { kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'thinking', id: 't1-s1-r', text: 'R' },
      { kind: 'assistant-text', id: 't1-s1', text: 'A 首答' },
      { kind: 'tool-call', id: 'tool-t1', name: 'bash', status: 'done', summary: expect.any(String) },
      { kind: 'assistant-text', id: 't1-s1b', text: 'B 中间轮' },
      { kind: 'assistant-text', id: 't1-s2', text: 'E 终答' },
    ])
  })
  it('tool 状态映射：running→pending；done→done；failed→failed（error/aborted 兜底 failed）；summary=toolSummary', () => {
    const out = toOutlineItems({ items: [
      T('t1', 'bash', 'running', '{"command":"ls"}'),
      T('t3', 'bash', 'done', '{"command":"ls -la"}', 'ok'),
      T('t4', 'bash', 'failed', '{"command":"x"}', 'err'),
      T('t5', 'bash', 'error', '{}'),
      T('t6', 'bash', 'aborted', '{}'),
    ], streaming: null })
    expect(out.map((o) => [o.id, o.status])).toEqual([
      ['t1', 'pending'], ['t3', 'done'], ['t4', 'failed'], ['t5', 'failed'], ['t6', 'failed'],
    ])
    expect(out[1]!.summary).toBe('ls -la')
  })
  it('summary 与主聊天一致（toolSummary 同参同果）', async () => {
    const { toolSummary } = await import('../../../renderer-grok/shim/src/entries')
    const out = toOutlineItems({ items: [T('t', 'bash', 'done', '{"command":"git status"}', null)], streaming: null })
    expect(out[0]!.summary).toBe(toolSummary('bash', '{"command":"git status"}', null))
  })
  it('notice/report/task 不进 outline；空 → []', () => {
    expect(toOutlineItems({ items: [N('n1'), { kind: 'report', id: 'r1' } as ViewLikeItem, { kind: 'task', id: 'k1' } as ViewLikeItem], streaming: null })).toEqual([])
    expect(toOutlineItems({ items: [], streaming: null })).toEqual([])
  })
  it('流式尾：reasoning 流→thinking(live-reasoning)；正文流→assistant-text(live-stream)', () => {
    const out = toOutlineItems({ items: [], streaming: { reasoning: 'R…', text: 'A…' } })
    expect(out).toEqual([
      { kind: 'thinking', id: 'live-reasoning', text: 'R…' },
      { kind: 'assistant-text', id: 'live-stream', text: 'A…' },
    ])
  })
  it('产出 item 全部通过上游解析器（createConversationOutlineProvider 喂假 coordinator，丢一个都会少）', async () => {
    const prov = await import('../../../renderer-grok/frontend/src/recovered/features/conversation/workspace/conversation-outline-provider')
    const produced = toOutlineItems({ items: [
      U('u1', 'x'), TH('r1', 'z'), A('a1', 'y'), T('t1', 'bash', 'done', '{"command":"ls"}', 'ok'),
    ], streaming: null })
    const provider = prov.createConversationOutlineProvider({
      coordinator: { getConversationOutline: async () => produced },
      events: { subscribe: () => () => {}, subscribeTransportState: () => () => {} },
    })
    provider.retain('ag1')
    const snap = await provider.refresh('ag1')
    expect(snap.items).toHaveLength(produced.length)
    expect(snap.items.map((i) => i.id)).toEqual(produced.map((i) => i.id))
    provider.reset()
  })
})

describe('T25 kickstart 不进 outline', () => {
  it('kickstart user 不出行；普通 user 出 kind:user 行', async () => {
    const { KICKSTART_PROMPT } = await import('../../../renderer-grok/shim/src/entries')
    const out = toOutlineItems({ items: [
      { kind: 'user', id: 'k1', text: KICKSTART_PROMPT, rpcId: 'kickstart-s1' },
      { kind: 'assistant', id: 'a1', text: '介绍' },
      { kind: 'user', id: 'u2', text: '正常问题' },
    ] as never, streaming: null })
    expect(out.map((o) => o.kind)).toEqual(['assistant-text', 'user'])
    // review M：用户自输同标签（rpcId 非 kickstart-）→ 照常出 user 行
    const selfTag = toOutlineItems({ items: [
      { kind: 'user', id: 'u9', text: '<bot_introduction_request>用户自己输的</bot_introduction_request>', rpcId: 'USER-N' },
    ] as never, streaming: null })
    expect(selfTag.map((o) => o.kind)).toEqual(['user'])
  })
})
