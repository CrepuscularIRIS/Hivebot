import { describe, expect, it, vi, afterEach } from 'vitest'
import { EventsLedger, invalidQuestionAnswersReason } from '/tmp/bot-wt/P5-28f1-verify/app/ui/main/dsh/ledger.ts'
import { registerM1Api } from '/tmp/bot-wt/P5-28f1-verify/app/ui/main/m1-api/index.ts'
import { rpcRaw } from '/tmp/bot-wt/P5-28f1-verify/app/ui/main/dsh/connect.ts'
vi.mock('electron', () => ({ MessageChannelMain: class {} }))
import { registerM2Mux } from '/tmp/bot-wt/P5-28f1-verify/app/ui/main/m2-mux/index.ts'

const good = [{ id: 'q1', selected: ['/a'] }, { id: 'q2', selected: [], custom: 'note' }]
const outcome = (answers: unknown) => ({ kind: 'result', value: { answers } })
const request = (answers: unknown = good, clientId = 'c', eventId = 'q') => ({ method: '$events/result', args: { clientId, eventId, outcome: outcome(answers) } })
function setup(rpc?: (method: string, args: unknown) => Promise<any>, ready = true) {
  const ledger = new EventsLedger({ warn() {} })
  if (ready) ledger.record({ type: 'ready', clientId: 'c' })
  ledger.record({ type: 'waterfall', event: 'approval/request', eventId: 'a', agentId: 's', request: { toolName: 'bash' } })
  ledger.record({ type: 'waterfall', event: 'user-questions/request', eventId: 'q', agentId: 's', request: { questions: [{ id: 'q1' }, { id: 'q2' }] } })
  const dsh = { rpc: vi.fn(rpc ?? (async () => ({ ok: true, value: null }))) }
  return { ledger, dsh, api: registerM1Api({ ledger, dsh, log() {} }) }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('P5-28 independent correctness probes', () => {
  it('same-batch ids: reorder passes without reordering payload; cross-batch overlap, omission, excess and duplicate fail before dsh', async () => {
    const s = setup(); const reversed = [...good].reverse()
    expect(await s.api(request(reversed))).toEqual({ ok: true, value: null })
    expect(s.dsh.rpc.mock.calls[0][1]).toEqual(request(reversed).args)
    for (const answers of [[good[0]], [...good, { id: 'q3', selected: [] }], [good[0], good[0]], [good[0], { id: 'q3', selected: [] }]]) {
      const t = setup(); expect((await t.api(request(answers))).ok).toBe(false)
      expect(t.dsh.rpc).not.toHaveBeenCalled(); expect(t.ledger.pendingEvents()).toHaveLength(2)
    }
  })
  const invalid = [null, undefined, {}, 'x', [null, good[1]], [undefined, good[1]], new Array(2),
    [{ id: 'q1', selected: [null] }, good[1]], [{ id: 'q1', selected: [undefined] }, good[1]],
    [{ id: 'q1', selected: [{}] }, good[1]], [{ id: 'q1', selected: [['x']] }, good[1]],
    [{ id: { nested: 'q1' }, selected: [] }, good[1]], [{ id: 'q1', selected: [], custom: {} }, good[1]],
    [{ id: 'q1', selected: [], extra: 1 }, good[1]], [...good, ...Array.from({ length: 10000 }, () => good[0])]]
  it.each(invalid.map((answers, i) => [i, answers]))('invalid shape #%s leaves both entries and dsh count zero', async (_i, answers) => {
    const s = setup(); const req = request(); req.args.outcome = outcome(answers); const r = await s.api(req)
    expect(r.ok).toBe(false); expect((r as any).error.code).toBe('pbots/invalid-args')
    expect(s.dsh.rpc).not.toHaveBeenCalled(); expect(s.ledger.pendingEvents()).toHaveLength(2)
  })
  it('selected length is independent of answers length, including 10000 strings: schema has no maxItems', async () => {
    const s = setup(); expect((await s.api(request([{ id: 'q1', selected: Array(10000).fill('x') }, good[1]]))).ok).toBe(true)
  })
  it('CONFIRMED sparse selected survives structuredClone, passes M1 and becomes null on real rpcRaw JSON wire; event consumed', async () => {
    let wire: any
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      wire = JSON.parse(init.body)
      return { ok: true, json: async () => ({ type: 'server-response', rpcId: wire.rpcId, result: { ok: true, value: null } }) }
    }))
    const s = setup((method, args) => rpcRaw('http://127.0.0.1:1', '', method, args))
    const sparse = structuredClone(new Array(1))
    expect(0 in sparse).toBe(false)
    const answers = [{ id: 'q1', selected: sparse }, good[1]]
    expect(invalidQuestionAnswersReason(outcome(answers), new Set(['q1', 'q2']))).toBeUndefined()
    expect((await s.api(request(answers))).ok).toBe(true)
    expect(s.dsh.rpc).toHaveBeenCalledTimes(1)
    expect(wire.payload.args.outcome.value.answers[0].selected).toEqual([null])
    expect(s.ledger.questionIds('q')).toBeUndefined()
    expect(s.ledger.pendingEventKind('a')).toBe('approval/request')
  })
  it('failure/throw retain pending; retry success consumes; reload ready and sequential second answer reject locally', async () => {
    for (const mode of ['fail', 'throw']) {
      let attempts = 0
      const s = setup(async () => { if (++attempts > 1) return { ok: true, value: null }; if (mode === 'throw') throw Error('offline'); return { ok: false, error: { code: 'offline', message: 'offline' } } })
      expect((await s.api(request())).ok).toBe(false); expect(s.ledger.questionIds('q')).toBeDefined()
      expect((await s.api(request())).ok).toBe(true); expect(s.ledger.questionIds('q')).toBeUndefined()
      s.ledger.record({ type: 'ready', clientId: 'new' })
      expect((await s.api(request(good, 'new'))).ok).toBe(false); expect(s.dsh.rpc).toHaveBeenCalledTimes(2)
      expect(s.ledger.pendingEventKind('a')).toBe('approval/request')
    }
  })
  it('CONFIRMED concurrent same-event answers both enter dsh before settlement and both report success', async () => {
    const resolvers: Array<(x: any) => void> = []
    const s = setup(async () => new Promise(resolve => resolvers.push(resolve)))
    const first = s.api(request()); const second = s.api(request([{ id: 'q1', selected: ['/b'] }, good[1]]))
    expect(s.dsh.rpc).toHaveBeenCalledTimes(2); expect(s.ledger.questionIds('q')).toBeDefined()
    resolvers[0]({ ok: true, value: null }); resolvers[1]({ ok: true, value: null })
    expect((await Promise.all([first, second])).map(r => r.ok)).toEqual([true, true])
    expect(s.ledger.pendingEventKind('a')).toBe('approval/request')
  })
  it('wrong client, no ready, no dsh, cancelled, unknown and approval answer mismatch never forward or consume approval', async () => {
    for (const kind of ['client', 'ready', 'dsh', 'cancelled', 'unknown', 'approval', 'approval-string']) {
      const s = setup(undefined, kind !== 'ready')
      if (kind === 'cancelled') s.ledger.record({ type: 'cancel', eventId: 'q' })
      const api = kind === 'dsh' ? registerM1Api({ ledger: s.ledger, log() {} }) : s.api
      const req = request(good, kind === 'client' ? 'other' : 'c', kind === 'unknown' ? 'unknown' : kind === 'approval' ? 'a' : 'q')
      if (kind === 'approval-string') (req.args.outcome as any).value = 'allowed-once'
      expect((await api(req)).ok).toBe(false); expect(s.dsh.rpc).not.toHaveBeenCalled()
      expect(s.ledger.pendingEventKind('a')).toBe('approval/request')
    }
  })
  it('m2 test hook preserves exact old string wire args as well as new structured value and no-dsh behavior', async () => {
    vi.useFakeTimers()
    const dsh = { ready: () => new Promise(() => {}), rpc: vi.fn(async () => ({ ok: true, value: null })) }
    const h = registerM2Mux({ dsh: dsh as any })
    for (const value of ['allowed-once', 'rejected', { answers: good }]) {
      await h.testAnswerEvent('c', 'q', value as any)
      expect(dsh.rpc).toHaveBeenLastCalledWith('$events/result', { clientId: 'c', eventId: 'q', outcome: { kind: 'result', value } })
    }
    expect(await registerM2Mux().testAnswerEvent('c', 'q', 'rejected')).toBeUndefined()
    vi.clearAllTimers()
  })
})
