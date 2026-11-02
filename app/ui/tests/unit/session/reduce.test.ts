// P-B 会话归约单测（renderer/plugins/session/reduce.ts）：帧形状取自 U-21 真 runtime wire 探针
// （tool/call → approval/asked → approval/decided → tool/result；取消后 turn/end.reason.kind === 'aborted'）。
import { describe, expect, it } from 'vitest'
import { initView, reduceFollow, toolSummary, toolTitle, type SessionView } from '../../../renderer/plugins/session/reduce'

const ev = (type: string, data: unknown): unknown => ({ type: 'event', event: { type, data } })
const text = (t: string): unknown[] => [{ type: 'text', text: t }]
const run = (frames: unknown[], v: SessionView = initView('s')): SessionView => frames.reduce<SessionView>((acc, f) => reduceFollow(acc, f), v)

describe('session reduce（时间线）', () => {
  it('tool 行：call → asked（awaiting）→ decided rejected → result isError → failed', () => {
    const v = run([
      ev('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"touch x"}' }),
      ev('approval/asked', { id: 'a1', toolName: 'bash', callId: 'c1' }),
    ])
    expect(v.items).toEqual([{ kind: 'tool', id: 'tool-c1', callId: 'c1', name: 'bash', args: '{"command":"touch x"}', status: 'running', result: null, awaiting: true, decision: null }])
    const done = run([
      ev('approval/decided', { id: 'a1', outcome: 'rejected' }),
      ev('tool/result', { message: { role: 'tool', toolCallId: 'c1', content: text('Error: the user rejected tool "bash"'), isError: true } }),
    ], v)
    expect(done.items[0]).toMatchObject({ status: 'failed', awaiting: false, decision: 'rejected', result: 'Error: the user rejected tool "bash"' })
  })

  it('流式：chunk 原位累加，assistant/message 定稿替换；只显示 source.kind=user 的用户消息', () => {
    const v = run([
      ev('user/message', { id: 'u1', content: text('嗨'), source: { kind: 'user' } }),
      ev('user/message', { id: 'u2', content: text('runtime ctx'), source: { kind: 'runtime-context' } }),
      ev('turn/start', { turn: 1 }),
      { type: 'assistant-stream', frame: { type: 'start' } },
      { type: 'assistant-stream', frame: { type: 'chunk', chunk: { type: 'text-delta', text: '一' } } },
      { type: 'assistant-stream', frame: { type: 'chunk', chunk: { type: 'text-delta', text: '二' } } },
    ])
    expect(v.streaming).toEqual({ text: '一二' })
    expect(v.chunkCount).toBe(2)
    expect(v.running).toBe(true)
    const fin = run([ev('assistant/message', { turn: 1, step: 1, message: { content: text('一二三') } }), ev('turn/end', { turn: 1, reason: { kind: 'completed' } })], v)
    expect(fin.streaming).toBeNull()
    expect(fin.items).toEqual([{ kind: 'user', id: 'u1', text: '嗨' }, { kind: 'assistant', id: 't1-s1', text: '一二三' }])
    expect(fin.endReason).toBe('completed')
  })

  it('打断：turn/end aborted → 「已停止」；其它失败 → danger 回复失败', () => {
    expect(run([ev('turn/end', { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } })]).items)
      .toEqual([{ kind: 'notice', id: 'end-2', tone: 'muted', text: '已停止' }])
    expect(run([ev('turn/end', { turn: 3, reason: { kind: 'error', message: 'boom' } })]).items)
      .toEqual([{ kind: 'notice', id: 'end-3', tone: 'danger', text: '回复失败：boom' }])
  })

  it('snapshot：重建视图（header preset/cwd、title 投影、records、进行中 attempt 基线）', () => {
    const v = run([{
      type: 'snapshot', header: { agentPreset: 'p2-alpha', cwd: '/w' }, projections: { values: { title: '研究助手' } },
      records: [{ type: 'event', event: { type: 'user/message', data: { id: 'u1', content: text('早'), source: { kind: 'user' } } } }],
      assistantStream: { activeAttempt: { stream: [{ type: 'text-delta', text: '半' }, { type: 'text-delta', text: '截' }] } },
    }], { ...initView('s'), items: [{ kind: 'notice', id: 'stale', tone: 'muted', text: '旧' }] })
    expect(v).toMatchObject({ preset: 'p2-alpha', cwd: '/w', title: '研究助手', loaded: true, streaming: { text: '半截' } } as Partial<SessionView>)
    expect(v.items).toEqual([{ kind: 'user', id: 'u1', text: '早' }])
  })

  it('U-26 ③（#11 分页）：snapshot 带 hasMore / 首条 seq；缺省 hasMore=false', () => {
    const snap = (hasMore: boolean | undefined, seq: number | undefined): unknown => ({
      type: 'snapshot', header: {}, hasMore,
      records: [seq === undefined
        ? { type: 'event', event: { type: 'user/message', data: { id: 'u1', content: text('早'), source: { kind: 'user' } } } }
        : { type: 'event', event: { type: 'user/message', seq, data: { id: 'u1', content: text('早'), source: { kind: 'user' } } } }],
    })
    expect(run([snap(true, 7)])).toMatchObject({ hasMore: true, firstSeq: 7 } as Partial<SessionView>)
    expect(run([snap(undefined, 9)])).toMatchObject({ hasMore: false, firstSeq: 9 } as Partial<SessionView>) // follow wire 缺省视为无更早
    expect(run([snap(true, undefined)])).toMatchObject({ hasMore: true, firstSeq: null } as Partial<SessionView>) // 无 seq（异常帧）也可加载更早，beforeSeq 缺省
  })

  it('tool 行文案：Title Case + 常见参数摘要', () => {
    expect(toolTitle('web_search')).toBe('Web Search')
    expect(toolSummary('{"command":"ls -la","description":"x"}')).toBe('ls -la')
    expect(toolSummary('not json')).toBe('not json')
  })
  it('快照 modelSelection 投影：pending 优先于 lastUsed；缺省为 null（U-23 P-D）', () => {
    const snap = (values: unknown): unknown => ({ type: 'snapshot', header: {}, records: [], projections: { values } })
    expect(run([snap({ modelSelection: { lastUsed: { provider: 'p', model: 'old' }, pending: { provider: 'p', model: 'new' } } })]).model).toBe('p/new')
    expect(run([snap({ modelSelection: { lastUsed: { provider: 'p', model: 'old' }, pending: null } })]).model).toBe('p/old')
    expect(run([snap({})]).model).toBeNull()
  })
})
