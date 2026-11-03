// EventsLedger：ready/waterfall/cancel 记录与 §2.2 校验（D9 拒绝测试的数据面）。
import { describe, expect, it } from 'vitest'
import { EventsLedger, invalidQuestionAnswersReason } from '../../../main/dsh/ledger'

const ready = { type: 'ready', clientId: 'cli-1' } as const
const waterfall = {
  type: 'waterfall', event: 'approval/request', eventId: 'ev-1', agentId: 's-1',
  request: { toolName: 'bash', callId: 'call-1', reason: 'r' },
} as const

describe('EventsLedger', () => {
  it('无 ready 时校验一律拒', () => {
    const l = new EventsLedger()
    l.record(waterfall)
    expect(l.validateResult('cli-1', 'ev-1', 'rejected')).toEqual({ ok: false, reason: 'no $events client ready' })
  })

  it('R10：ready + 未决 eventId + 合法 outcome → ok（validate 只判资格不消费；consumeResult 才下账）', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(waterfall)
    expect(l.validateResult('cli-1', 'ev-1', 'allowed-once')).toEqual({ ok: true })
    // 发送失败保留 pending（可重试）：validate 之后条目仍在
    expect(l.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(true)
    expect(l.consumeResult('ev-1')).toBe(true)
    expect(l.validateResult('cli-1', 'ev-1', 'rejected')).toEqual({ ok: false, reason: 'eventId not pending' })
    expect(l.consumeResult('ev-1')).toBe(false)
    l.record({ type: 'cancel', eventId: 'ev-1' })
    expect(l.validateResult('cli-1', 'ev-1', 'rejected')).toEqual({ ok: false, reason: 'eventId not pending' })
  })

  it('clientId 不匹配 → 拒', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(waterfall)
    expect(l.validateResult('cli-other', 'ev-1', 'rejected')).toEqual({ ok: false, reason: 'clientId mismatch' })
  })

  it("value 为 'allowed-always'（或任意非法值）→ 拒", () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(waterfall)
    expect(l.validateResult('cli-1', 'ev-1', 'allowed-always')).toEqual({ ok: false, reason: `outcome value must be 'allowed-once' or 'rejected', got "allowed-always"` })
  })

  it('eventId 未下发 → 拒；pendingEvents 列出未决项', () => {
    const l = new EventsLedger()
    l.record(ready)
    expect(l.validateResult('cli-1', 'ev-nope', 'rejected')).toEqual({ ok: false, reason: 'eventId not pending' })
    l.record(waterfall)
    expect(l.pendingEvents().map((e) => e.eventId)).toEqual(['ev-1'])
    expect(l.pendingEvents()[0]!.toolName).toBe('bash')
  })
})

// P5-07 ①：ledger 按事件类别判别（PLAN p5-parity P5-07；R7 ③「ledger 对任何 waterfall 读
// request.toolName」的修正）。提问事件 request 无 toolName；其他 waterfall 不入账只记 warn。
describe('P5-07 按事件类别判别', () => {
  const questionWaterfall = {
    type: 'waterfall', event: 'user-questions/request', eventId: 'ev-q', agentId: 's-1',
    // 上游投影后的问题 request（stream-protocol.ts:146-171：questions/wait 保留，agent/signal 移除）
    request: { questions: [{ id: 'q1', question: '路径?', header: '选择', options: ['/a', '/b'] }] },
  } as const

  it('提问 waterfall → 入账 event === "user-questions/request"，无 toolName 字段；审批条目 event 标注不变', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(waterfall)
    l.record(questionWaterfall)
    const entries = l.pendingEvents()
    expect(entries.map((e) => [e.event, e.eventId])).toEqual([['approval/request', 'ev-1'], ['user-questions/request', 'ev-q']])
    const approval = entries[0]!
    expect(approval.event).toBe('approval/request')
    expect(approval.toolName).toBe('bash')
    const question = entries[1]!
    expect(question.event).toBe('user-questions/request')
    expect('toolName' in question).toBe(false)
    expect('callId' in question).toBe(false)
  })

  it('未知 event 名的 waterfall → 不入账，warn 恰 1 次（含事件名）', () => {
    const warns: string[] = []
    const l = new EventsLedger({ warn: (m) => warns.push(m) })
    l.record(ready)
    l.record({ type: 'waterfall', event: 'api-session/error', eventId: 'ev-x', agentId: 's-1', request: { x: 1 } })
    expect(l.pendingEvents()).toEqual([])
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('api-session/error')
    expect(warns[0]).toContain('ev-x')
    // cancel 对未入账 eventId 幂等
    l.record({ type: 'cancel', eventId: 'ev-x' })
    expect(l.pendingEvents()).toEqual([])
  })

  it('提问 eventId 用审批字符串作答（allowed-once / rejected）→ validateResult 拒', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(questionWaterfall)
    expect(l.validateResult('cli-1', 'ev-q', 'allowed-once').ok).toBe(false)
    expect(l.validateResult('cli-1', 'ev-q', 'rejected').ok).toBe(false)
    // 审批条目原行为不变
    l.record(waterfall)
    expect(l.validateResult('cli-1', 'ev-1', 'allowed-once')).toEqual({ ok: true })
  })
})

// P5-28 ①②③：提问作答——ledger 提供问题 id 集（作答 id 集合校验源）+ 严格 answers 纯校验。
// 形状依据：tool-ask-user 输出 schema（additionalProperties:false，id/selected/custom，
// repos/deepseek-harness/packages/interaction/tool-ask-user/src/index.ts:60-83）。
describe('P5-28 提问作答（questionIds / validateQuestionResult / invalidQuestionAnswersReason）', () => {
  const twoQuestionWaterfall = {
    type: 'waterfall', event: 'user-questions/request', eventId: 'ev-q2', agentId: 's-1',
    request: { questions: [
      { id: 'q1', question: '路径?', options: [{ label: '/a' }, { label: '/b' }] },
      { id: 'q2', question: '备注?' },
    ] },
  } as const
  const expectedIds = new Set(['q1', 'q2'])

  it('questionIds：未决提问 → 该批 id 集；审批 eventId / 未知 eventId / 已消费 → undefined', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(twoQuestionWaterfall)
    l.record(waterfall) // 审批 ev-1
    expect(l.questionIds('ev-q2')).toEqual(expectedIds)
    expect(l.questionIds('ev-1')).toBeUndefined()      // 审批事件
    expect(l.questionIds('ev-nope')).toBeUndefined()   // 未下发
    expect(l.questionIds(42)).toBeUndefined()          // 非字符串
    expect(l.consumeResult('ev-q2')).toBe(true)        // 作答成功下账后
    expect(l.questionIds('ev-q2')).toBeUndefined()
  })

  it('提问 request 的 questions 缺失/非数组/空/id 非字符串/空串 → 不入账 + warn 恰 1 次（fail-closed，交 deadline 协议级拒绝）', () => {
    const bad: Array<{ name: string; request: Record<string, unknown> }> = [
      { name: 'questions 缺失', request: { wait: {} } },
      { name: 'questions 非数组', request: { questions: 'x' } },
      { name: 'questions 空数组', request: { questions: [] } },
      { name: 'item 非对象', request: { questions: ['x'] } },
      { name: 'id 非字符串', request: { questions: [{ id: 42, question: 'a?' }] } },
      { name: 'id 空串', request: { questions: [{ id: '', question: 'a?' }] } },
    ]
    for (const { name, request } of bad) {
      const warns: string[] = []
      const l = new EventsLedger({ warn: (m) => warns.push(m) })
      l.record(ready)
      l.record({ type: 'waterfall', event: 'user-questions/request', eventId: 'ev-bad', agentId: 's-1', request })
      expect(l.pendingEvents(), name).toEqual([])
      expect(warns, name).toHaveLength(1)
      expect(warns[0], name).toContain('ev-bad')
    }
  })

  it('validateQuestionResult：clientId 匹配 ok；不匹配 / 未 ready → 拒（与审批同口径的资格判定）', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(twoQuestionWaterfall)
    expect(l.validateQuestionResult('cli-1')).toEqual({ ok: true })
    expect(l.validateQuestionResult('cli-other')).toEqual({ ok: false, reason: 'clientId mismatch' })
    const bare = new EventsLedger()
    bare.record(twoQuestionWaterfall)
    expect(bare.validateQuestionResult('cli-1')).toEqual({ ok: false, reason: 'no $events client ready' })
  })

  describe('invalidQuestionAnswersReason（纯函数矩阵）', () => {
    const valid = { kind: 'result', value: { answers: [
      { id: 'q1', selected: ['/a'] },
      { id: 'q2', selected: [], custom: 'note-42' },
    ] } }

    it('合法（含 custom、selected 空数组、answers 顺序与问题顺序无关）→ undefined', () => {
      expect(invalidQuestionAnswersReason(valid, expectedIds)).toBeUndefined()
      const reversed = { kind: 'result', value: { answers: [...valid.value.answers].reverse() } }
      expect(invalidQuestionAnswersReason(reversed, expectedIds)).toBeUndefined()
    })

    it.each([
      ['outcome 壳缺 kind:result', { kind: 'rejected', value: { answers: [] } }],
      ['value 非 answers 对象', { kind: 'result', value: 'allowed-once' }],
      ['answers 非数组', { kind: 'result', value: { answers: 'x' } }],
      ['id 缺（漏答 q2）', { kind: 'result', value: { answers: [{ id: 'q1', selected: [] }] } }],
      ['id 多（未知 q3）', { kind: 'result', value: { answers: [...valid.value.answers, { id: 'q3', selected: [] }] } }],
      ['id 类型错', { kind: 'result', value: { answers: [{ id: 42, selected: [] }, { id: 'q2', selected: [] }] } }],
      ['selected 缺', { kind: 'result', value: { answers: [{ id: 'q1' }, { id: 'q2', selected: [] }] } }],
      ['selected 非数组', { kind: 'result', value: { answers: [{ id: 'q1', selected: '/a' }, { id: 'q2', selected: [] }] } }],
      ['selected 含非字符串', { kind: 'result', value: { answers: [{ id: 'q1', selected: [1] }, { id: 'q2', selected: [] }] } }],
      ['custom 非字符串', { kind: 'result', value: { answers: [{ id: 'q1', selected: [], custom: 7 }, { id: 'q2', selected: [] }] } }],
      ['answer item 带额外字段', { kind: 'result', value: { answers: [{ id: 'q1', selected: [], extra: 'x' }, { id: 'q2', selected: [] }] } }],
      ['value 带额外字段', { kind: 'result', value: { answers: valid.value.answers, note: 'x' } }],
      ['answers 重复 id', { kind: 'result', value: { answers: [{ id: 'q1', selected: [] }, { id: 'q1', selected: [] }, { id: 'q2', selected: [] }] } }],
    ])('%s → 返回原因', (_name, outcome) => {
      expect(invalidQuestionAnswersReason(outcome, expectedIds)).toEqual(expect.any(String))
    })
  })
})
