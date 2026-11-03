// EventsLedger：ready/waterfall/cancel 记录与 §2.2 校验（D9 拒绝测试的数据面）。
import { describe, expect, it } from 'vitest'
import { EventsLedger } from '../../../main/dsh/ledger'

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
