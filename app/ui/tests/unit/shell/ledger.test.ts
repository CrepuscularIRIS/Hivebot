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

  it('ready + 未决 eventId + 合法 outcome → ok（成功即消费：同一 eventId 二次作答 → 拒）', () => {
    const l = new EventsLedger()
    l.record(ready)
    l.record(waterfall)
    expect(l.validateResult('cli-1', 'ev-1', 'allowed-once')).toEqual({ ok: true })
    expect(l.validateResult('cli-1', 'ev-1', 'rejected')).toEqual({ ok: false, reason: 'eventId not pending' })
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
