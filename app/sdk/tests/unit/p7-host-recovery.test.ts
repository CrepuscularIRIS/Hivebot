import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Reporter } from '../../src/orchestration/report.mjs'
import { Delivery } from '../../src/orchestration/delivery.mjs'
import { HostRecovery, recoverAssignments, waitForRecovery } from '../../src/admin/host.mjs'
import { foldAssignments } from '../../src/orchestration/assignment.mjs'
import { projectEvent } from '../../src/orchestration/delivery.mjs'
import { childEnv, resolveConfig } from '../../src/start'

const deferred = <T = void>() => Promise.withResolvers<T>()
const sleep = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(predicate: () => boolean) {
  for (let n = 0; n < 200; n++) {
    if (predicate()) return
    await sleep(5)
  }
  throw new Error('controlled checkpoint not reached')
}
const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close() })

function permit() {
  const ready = deferred()
  const controller = new AbortController()
  return { ready: ready.promise, signal: controller.signal, open: false, resolve() { this.open = true; ready.resolve() }, abort() { controller.abort() } }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-'))
  writeFileSync(join(root, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'main', bots: { worker: { createdBy: 'main' } } }))
  const logs: Record<string, any[]> = {
    main: [],
    worker: [
      { type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'pbots-assign:old', kind: 'pbots-main' }] },
      { type: 'turn/start', turn: 1 },
      { type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 1, inserted: [] },
      { type: 'user/message', id: 'pbots-assign:old', sourceKind: 'pbots-main' },
      { type: 'turn/end', turn: 1, reason: 'completed' },
    ],
  }
  const followup = vi.fn()
  const remove = vi.fn()
  const agents = new Map(['main', 'worker'].map((id) => [id, { id, status: 'idle', inbox: { nextTurn: [], nextStep: [], remove }, followup }]))
  const read = vi.fn(async (id: string) => logs[id])
  const ctx = { agents: { get: (id: string) => agents.get(id) }, on: vi.fn(() => () => {}), sessionPersistence: { flush: vi.fn(async () => {}), open: vi.fn() } }
  const recovery = permit()
  const orch: any = { ctx, recovery, config: { dataDir: root }, agentOf: vi.fn(async (id: string) => agents.get(id)), delivery: { readLog: read, send: vi.fn(async () => {}), wake: vi.fn() } }
  const reporter = new Reporter(orch, { batchWindowMs: 5 })
  cleanups.push(() => { recovery.resolve(); recovery.abort(); reporter.stop(); rmSync(root, { recursive: true, force: true }) })
  return { root, logs, followup, remove, agents, ctx, orch, reporter, recovery }
}

describe('P7-F3 existing Reporter lifecycle recovery barrier', () => {
  it('boot and worker turn/end consume nothing until recovery, then report the stable key once', async () => {
    const f = fixture()
    f.reporter.start()
    f.reporter.handleEvent({ id: 'worker' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    await sleep()
    expect(f.orch.delivery.wake).not.toHaveBeenCalled()
    expect(f.orch.delivery.send).not.toHaveBeenCalled()
    expect(f.followup).not.toHaveBeenCalled()
    f.recovery.resolve()
    await until(() => f.orch.delivery.send.mock.calls.length === 1)
    expect(f.orch.delivery.send.mock.calls[0][1].source.items[0].key).toBe('old:end')
  })

  it('new recovery completion survives an old flush blocked past the default two-second window', async () => {
    const f = fixture()
    f.reporter.stop()
    const host = new HostRecovery(async () => ({ issues: [] }))
    const reporter = new Reporter(f.orch)
    cleanups.push(() => { reporter.stop(); host.stop() })
    Object.defineProperty(f.orch, 'recovery', { get: () => host.current })
    const peer = {}, first = host.attach(peer)
    await host.prepare(peer, first.challenge)
    host.complete(peer, first.challenge)
    const entered = deferred(), release = deferred()
    f.orch.delivery.readLog.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return f.logs.main
    })
    // Model persisted delivery so a manual positive control cannot duplicate it.
    f.orch.delivery.send.mockImplementation(async (_agent: unknown, message: any, lease: any) => {
      lease.signal.throwIfAborted()
      expect(lease.open).toBe(true)
      f.logs.main.push({ type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 0,
        inserted: [{ id: message.id, kind: 'pbots-worker', items: message.source.items }] })
    })
    const old = reporter.flush('boot')
    await entered.promise
    const second = host.attach(peer)
    await host.prepare(peer, second.challenge)
    host.complete(peer, second.challenge)
    reporter.scheduleFlush()
    expect(reporter.batchWindowMs).toBe(2_000)
    await sleep(2_100)
    expect(reporter.timer).toBeNull()
    expect(f.orch.delivery.send).not.toHaveBeenCalled()
    release.resolve()
    await old
    await sleep(50)
    const automatic = f.orch.delivery.send.mock.calls.length
    // Runs even on RED: proves the valid current lease and persisted due report work.
    await reporter.flush('manual-control')
    expect(f.orch.delivery.send).toHaveBeenCalledTimes(1)
    expect(f.orch.delivery.send.mock.calls[0][2].signal.aborted).toBe(false)
    expect(f.orch.delivery.send.mock.calls[0][1].source.items[0].key).toBe('old:end')
    expect(automatic).toBe(1)
  })

  it('a pending new-generation reconcile never replays an unconfirmed old delivery', async () => {
    const f = fixture()
    f.recovery.resolve()
    const entered = deferred(), release = deferred()
    f.orch.delivery.send.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      throw Object.assign(new Error('followup occurred but persistence is unknown'), { unconfirmedStart: true })
    })
    const old = f.reporter.flush('boot').catch((error: unknown) => error)
    await entered.promise
    f.recovery.abort()
    f.orch.recovery = permit()
    f.orch.recovery.resolve()
    f.reporter.scheduleFlush()
    await sleep(20)
    expect(f.reporter.timer).toBeNull()
    release.resolve()
    expect(await old).toMatchObject({ unconfirmedStart: true })
    await sleep(20)
    expect(f.orch.delivery.send).toHaveBeenCalledTimes(1)
  })

  it.each([0, 2_100])('unknown delivery resolved after %i ms never replays through the default recovery window', async (delay) => {
    const f = fixture()
    f.reporter.stop()
    const host = new HostRecovery(async () => ({ issues: [] }))
    const reporter = new Reporter(f.orch)
    cleanups.push(() => { reporter.stop(); host.stop() })
    Object.defineProperty(f.orch, 'recovery', { get: () => host.current })
    const peer = {}, first = host.attach(peer)
    await host.prepare(peer, first.challenge)
    host.complete(peer, first.challenge)
    const entered = deferred(), release = deferred()
    f.ctx.sessionPersistence.flush.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      throw new Error('unknown post-followup disk confirmation')
    })
    const delivery = new Delivery(f.ctx, () => host.current)
    vi.spyOn(delivery, 'readLog').mockImplementation(async (id: string) => f.logs[id])
    f.orch.delivery = delivery
    const old = reporter.flush('boot').catch((error: unknown) => error)
    await entered.promise
    expect(f.followup).toHaveBeenCalledTimes(1)
    const second = host.attach(peer)
    await host.prepare(peer, second.challenge)
    host.complete(peer, second.challenge)
    reporter.scheduleFlush()
    expect(reporter.batchWindowMs).toBe(2_000)
    if (delay) await sleep(delay)
    expect(f.followup).toHaveBeenCalledTimes(1)
    release.resolve()
    expect(await old).toMatchObject({ unconfirmedStart: true })
    await sleep(2_150)
    expect(f.followup).toHaveBeenCalledTimes(1)
  })

  it('a later legitimate report must not rebatch an unknown old key even when no recovery timer was pending', async () => {
    const f = fixture()
    f.recovery.resolve()
    const delivery = new Delivery(f.ctx, () => f.orch.recovery)
    vi.spyOn(delivery, 'readLog').mockImplementation(async (id: string) => f.logs[id])
    f.orch.delivery = delivery
    f.ctx.sessionPersistence.flush.mockRejectedValueOnce(new Error('unknown post-followup disk confirmation'))
    await expect(f.reporter.flush('boot')).rejects.toMatchObject({ unconfirmedStart: true })
    expect(f.followup).toHaveBeenCalledTimes(1)
    expect(f.reporter.timer).toBeNull()
    f.recovery.abort()
    f.orch.recovery = permit()
    f.orch.recovery.resolve()
    f.logs.worker.push(
      { type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'pbots-assign:fresh', kind: 'pbots-main' }] },
      { type: 'turn/start', turn: 2 },
      { type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 1, inserted: [] },
      { type: 'user/message', id: 'pbots-assign:fresh', sourceKind: 'pbots-main' },
      { type: 'turn/end', turn: 2, reason: 'completed' },
    )
    f.reporter.handleEvent({ id: 'worker' }, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
    await until(() => f.followup.mock.calls.length === 2)
    const messages = f.followup.mock.calls.map(([message]) => message)
    // Distinct key sets also change the batch id: retaining only the old id cannot guard this boundary.
    expect(messages[1].id).not.toBe(messages[0].id)
    const keys = messages.flatMap((message) => message.source.items.map((item: any) => item.key))
    expect(keys.filter((key: string) => key === 'fresh:end')).toHaveLength(1)
    expect(keys.filter((key: string) => key === 'old:end')).toHaveLength(1)
  })

  it('withdraw checks the captured lease for every remove and stop cancels retry timers', async () => {
    const f = fixture()
    f.recovery.resolve()
    f.agents.get('main')!.inbox.nextTurn.push({ id: 'pbots-report:a' } as never, { id: 'pbots-report:b' } as never)
    f.remove.mockImplementationOnce(() => f.recovery.abort())
    f.reporter.withdrawPendingReports('main')
    expect(f.remove).toHaveBeenCalledTimes(1)
    f.orch.recovery = permit(); f.orch.recovery.resolve()
    f.remove.mockImplementation(() => { throw new Error('append publication window') })
    f.reporter.withdrawWithRetry('main')
    expect(f.reporter.withdrawTimers.size).toBe(1)
    const before = f.remove.mock.calls.length
    f.reporter.stop()
    await sleep(60)
    expect(f.reporter.withdrawTimers.size).toBe(0)
    expect(f.remove).toHaveBeenCalledTimes(before)
  })

  it('start then stop cancels the queued boot pass', async () => {
    const f = fixture()
    f.recovery.resolve()
    f.reporter.start()
    f.reporter.stop()
    await sleep()
    expect(f.orch.delivery.readLog).not.toHaveBeenCalled()
    expect(f.orch.delivery.send).not.toHaveBeenCalled()
  })

  it('real Delivery: stop after holds enters readLog prevents followup after the await', async () => {
    const f = fixture()
    f.recovery.resolve()
    const entered = deferred()
    const release = deferred()
    f.ctx.sessionPersistence.open.mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return { read: async () => ({ events: [] }), close: async () => {} }
    })
    const delivery = new Delivery(f.ctx)
    const originalRead = f.orch.delivery.readLog
    f.orch.delivery = delivery
    // Reporter uses projected persisted logs; real Delivery.holds still reads the fake persistence.
    let reads = 0
    vi.spyOn(delivery, 'readLog').mockImplementation(async (id: string) => {
      if (++reads <= 2) return originalRead(id)
      return Delivery.prototype.readLog.call(delivery, id)
    })
    const running = f.reporter.flush('boot')
    await entered.promise
    f.reporter.stop()
    release.resolve()
    await running
    expect(f.followup).not.toHaveBeenCalled()
  })

  it('changing generation during agentOf cannot wake an old pending report', async () => {
    const f = fixture()
    f.recovery.resolve()
    f.logs.main = [{ type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'pbots-report:old', kind: 'pbots-worker', items: [{ key: 'old:end' }] }] }]
    const entered = deferred()
    const release = deferred()
    let calls = 0
    f.orch.agentOf.mockImplementation(async (id: string) => {
      if (++calls === 2) { entered.resolve(); await release.promise }
      return f.agents.get(id)
    })
    const running = f.reporter.flush('boot')
    await entered.promise
    f.recovery.abort()
    f.orch.recovery = permit()
    release.resolve()
    await running
    expect(f.orch.delivery.wake).not.toHaveBeenCalled()
  })
})


describe('P7-F3 peer-bound process recovery', () => {
  it('launcher explicitly enables host recovery without changing standalone P6 defaults', () => {
    const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-launch-'))
    const env = { HOME: root, P2SDK_HOME: join(root, 'runtime'), P2SDK_HANDOFF: join(root, 'handoff'), P2SDK_PROVIDER: 'mock' }
    const config = resolveConfig(env)
    expect(childEnv(config, env).DSH_PBOTS_HOST_RECOVERY).toBeUndefined()
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    const child = childEnv(config, { ...env, P2SDK_HOST_RECOVERY: '1' })
    expect(child.DSH_PBOTS_HOST_RECOVERY).toBe('1')
    expect(child.P2SDK_HOST_RECOVERY).toBeUndefined()
  })
  it('old resolve cannot open a new lease; reconnect keeps process identity; valid new handoff opens once', async () => {
    const work = deferred<any>()
    const host = new HostRecovery(() => work.promise)
    cleanups.push(() => host.stop())
    const a = {}, b = {}
    const first = host.attach(a)
    const oldPermit = host.current
    const old = host.prepare(a, first.challenge).catch((e: Error) => e)
    const second = host.attach(b)
    expect(second.processId).toBe(first.processId)
    expect(second.challenge).not.toBe(first.challenge)
    expect(oldPermit.signal.aborted).toBe(true)
    expect(() => host.complete(b, second.challenge)).toThrow('assignments not restored')
    expect(() => host.complete(a, first.challenge)).toThrow()
    work.resolve({ interrupted: [], held: [], issues: [] })
    expect(await old).toBeInstanceOf(Error)
    expect(host.current.open).toBe(false)
    await host.prepare(b, second.challenge)
    host.complete(b, second.challenge)
    await waitForRecovery(host.current)
    expect(host.current.open).toBe(true)
    host.detach(a)
    expect(host.current.signal.aborted).toBe(false)
    host.detach(b)
    expect(host.current.signal.aborted).toBe(true)
  })

  it('rejects self-reported generations and foreign peers; stopped wait settles without resolving readiness', async () => {
    const host = new HostRecovery(async () => ({}))
    const peer = {}
    const handoff = host.attach(peer)
    expect(() => host.complete({}, handoff.challenge)).toThrow()
    expect(() => host.complete(peer, '123')).toThrow()
    const waiting = waitForRecovery(host.current).catch((error: Error) => error)
    host.stop()
    expect(await waiting).toBeInstanceOf(Error)
    await expect(host.prepare(peer, handoff.challenge)).rejects.toThrow()
    expect(() => host.attach({})).toThrow()
  })

  it('an untrusted relationship summary cannot be acknowledged as repaired by the peer', async () => {
    const host = new HostRecovery(async () => ({ interrupted: [], held: [], issues: [{ sessionId: 'orphan', reason: 'unmatched-main' }] }))
    const peer = {}, handoff = host.attach(peer)
    await host.prepare(peer, handoff.challenge)
    expect(() => host.complete(peer, handoff.challenge)).toThrow('assignments not restored')
    host.stop()
  })

  it('failed native repair never opens the management lease', async () => {
    const host = new HostRecovery(async () => { throw new Error('disk failure') })
    const peer = {}, handoff = host.attach(peer)
    await expect(host.prepare(peer, handoff.challenge)).rejects.toThrow('disk failure')
    expect(() => host.complete(peer, handoff.challenge)).toThrow('assignments not restored')
    expect(host.current.open).toBe(false)
    host.stop()
  })
})

function rawOrphan() {
  return [
    { seq: 0, time: 1, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'pbots-assign:orphan', source: { kind: 'pbots-main' } }] } },
    { seq: 1, time: 1, type: 'turn/start', data: { turn: 1 } },
    { seq: 2, time: 1, type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
    { seq: 3, time: 1, type: 'step/start', data: { turn: 1, step: 1 } },
    { seq: 4, time: 1, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'tool-call', id: 'external', name: 'bash' }] } } },
    { seq: 5, time: 1, type: 'tool/call', data: { turn: 1, step: 1, callId: 'external', name: 'bash' } },
  ]
}
function persistenceFixture() {
  const f = fixture()
  let raw: any[] = rawOrphan()
  const close = vi.fn(async () => {})
  const append = vi.fn(async (events: any[]) => { raw = [...raw, ...events] })
  f.ctx.sessionPersistence.open.mockImplementation(async () => ({ read: async () => ({ events: raw }), append, close }))
  f.ctx.agents.get = vi.fn(() => undefined)
  f.orch.delivery.readLog.mockImplementation(async () => raw.map(projectEvent))
  return { ...f, append, close, raw: () => raw }
}

describe('P7-F3 durable native interrupted termination', () => {
  it('accepts native fresh M3 metadata with null main and optional bots, but never trusts malformed relationships', async () => {
    const f = fixture(), signal = new AbortController().signal
    writeFileSync(join(f.root, 'bots.json'), JSON.stringify({ version: 1, mainBotId: null, recipes: {} }))
    expect(await recoverAssignments(f.orch, signal)).toMatchObject({ interrupted: [], held: [], issues: [] })
    writeFileSync(join(f.root, 'bots.json'), JSON.stringify({ version: 1, mainBotId: null, bots: [] }))
    await expect(recoverAssignments(f.orch, signal)).rejects.toThrow('untrusted')
  })
  it('closes claimed/open Assignment with native unknown tool result and stable stopped report, without resuming', async () => {
    const f = persistenceFixture()
    const result = await recoverAssignments(f.orch, new AbortController().signal)
    expect(result.interrupted).toEqual([{ sessionId: 'worker', assignmentId: 'orphan' }])
    expect(result.note).toMatch(/host restarted/)
    expect(result.note).toMatch(/Inspect.*worktree.*operation records/)
    expect(result.note).toMatch(/not.*replayed automatically/)
    expect(foldAssignments(f.raw().map(projectEvent)).assignments.get('orphan')?.ended).toBe('interrupted')
    expect(f.raw().find((e) => e.type === 'tool/result').data.error.code).toBe('TOOL_OUTCOME_UNKNOWN')
    expect(f.close).toHaveBeenCalledTimes(1)
    expect(f.followup).not.toHaveBeenCalled()
    expect(f.orch.agentOf).not.toHaveBeenCalled()
    await recoverAssignments(f.orch, new AbortController().signal)
    expect(f.append).toHaveBeenCalledTimes(1)
  })

  it('held unconsumed Assignment stays pending and is not resumed', async () => {
    const f = fixture()
    f.logs.worker = [{ type: 'agent/inbox/spliced', target: 'next-turn', start: 0, removedCount: 0, inserted: [{ id: 'pbots-assign:paused', kind: 'pbots-main' }] }]
    const result = await recoverAssignments(f.orch, new AbortController().signal)
    expect(result.held).toEqual([{ sessionId: 'worker', assignmentId: 'paused' }])
    f.recovery.resolve()
    await f.reporter.flush('boot')
    expect(f.orch.delivery.wake).not.toHaveBeenCalled()
    expect(f.followup).not.toHaveBeenCalled()
  })

  it('bad relationship is returned for the main audit, not accepted or resumed', async () => {
    const f = fixture()
    writeFileSync(join(f.root, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'main', bots: { intruder: { createdBy: 'other' } } }))
    const result = await recoverAssignments(f.orch, new AbortController().signal)
    expect(result.issues).toEqual([{ sessionId: 'intruder', reason: 'unmatched-main' }])
    expect(f.orch.delivery.readLog).not.toHaveBeenCalled()
  })

  it('corrupt identity, live open turn, append failure and non-durable termination all fail closed', async () => {
    const f = persistenceFixture()
    const signal = new AbortController().signal
    f.ctx.agents.get = vi.fn(() => ({ status: 'running' })) as any
    await expect(recoverAssignments(f.orch, signal)).rejects.toThrow('live unclosed')
    f.ctx.agents.get = vi.fn(() => undefined)
    f.append.mockRejectedValueOnce(new Error('append failure'))
    await expect(recoverAssignments(f.orch, signal)).rejects.toThrow('append failure')
    expect(f.close).toHaveBeenCalled()
    f.append.mockImplementationOnce(async () => {})
    await expect(recoverAssignments(f.orch, signal)).rejects.toThrow('not durable')
    writeFileSync(join(f.root, 'bots.json'), JSON.stringify({ version: 99 }))
    await expect(recoverAssignments(f.orch, signal)).rejects.toThrow('untrusted')
  })
})

describe('P7-F3 real Loader control stream', () => {
  it('standalone P6 exposes no recovery control without launcher opt-in', { timeout: 120_000 }, async () => {
    const { launchRuntime } = await import('../support/runtime')
    const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-standalone-'))
    const data = join(root, 'data')
    mkdirSync(data)
    writeFileSync(join(data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: null, recipes: {} }))
    const rt = await launchRuntime({ env: { HOME: root, P2SDK_HOME: join(root, 'runtime'), PBOTS_DATA_DIR: data, P2SDK_ORCH_DATA_DIR: data, P2SDK_PATCH: join(new URL('../../', import.meta.url).pathname, 'profile/patches/orchestration.yml') } })
    try {
      await expect(rt.client.call('pbots/orchestration.recoveryPrepare', { request: {} })).rejects.toThrow('not enabled')
      await expect(rt.client.call('pbots/orchestration.recoveryComplete', { request: {} })).rejects.toThrow('not enabled')
      const stream = await rt.client.socket.open('pbots/orchestration.recovery', {})
      await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('not enabled')
      stream.cancel()
    } finally {
      await rt.stop()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('binds native stream and unary RPC to the same Peer; reconnect is not process restart', { timeout: 120_000 }, async () => {
    const { launchRuntime } = await import('../support/runtime')
    const { connect } = await import('../../examples/lib/client.mjs')
    const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-loader-'))
    const data = join(root, 'data')
    mkdirSync(data)
    writeFileSync(join(data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: null, recipes: {} }))
    const rt = await launchRuntime({ env: { HOME: root, P2SDK_HOME: join(root, 'runtime'), PBOTS_DATA_DIR: data, P2SDK_ORCH_DATA_DIR: data, P2SDK_HOST_RECOVERY: '1', P2SDK_PATCH: join(new URL('../../', import.meta.url).pathname, 'profile/patches/orchestration.yml') } })
    let other: any
    try {
      const stream = await rt.client.socket.open('pbots/orchestration.recovery', {})
      const { value: first } = await stream[Symbol.asyncIterator]().next()
      expect(first.processId).toBeTypeOf('string')
      await expect(rt.client.call('pbots/orchestration.recoveryComplete', { request: { challenge: first.challenge } })).rejects.toThrow()
      other = await connect({ baseUrl: rt.baseUrl, token: rt.token })
      const duplicate = await other.socket.open('pbots/orchestration.recovery', {})
      await expect(duplicate[Symbol.asyncIterator]().next()).rejects.toThrow()
      duplicate.cancel()
      await expect(other.call('pbots/orchestration.recoveryPrepare', { request: { challenge: first.challenge } })).rejects.toThrow()
      expect(await rt.client.call('pbots/orchestration.recoveryPrepare', { request: { challenge: first.challenge } })).toMatchObject({ processId: first.processId, interrupted: [], issues: [] })
      expect(await rt.client.call('pbots/orchestration.recoveryComplete', { request: { challenge: first.challenge } })).toMatchObject({ ready: true })
      stream.cancel()
      await sleep(100)
      const next = await other.socket.open('pbots/orchestration.recovery', {})
      const { value: second } = await next[Symbol.asyncIterator]().next()
      expect(second.processId).toBe(first.processId)
      expect(second.challenge).not.toBe(first.challenge)
      await expect(other.call('pbots/orchestration.recoveryComplete', { request: { challenge: first.challenge } })).rejects.toThrow()
      await other.call('pbots/orchestration.recoveryPrepare', { request: { challenge: second.challenge } })
      expect(await other.call('pbots/orchestration.recoveryComplete', { request: { challenge: second.challenge } })).toMatchObject({ ready: true })
      next.cancel()
    } finally {
      other?.close()
      await rt.stop()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('P7-F3 post-followup outcome and wake permission', () => {
  it('cancellation after followup is unconfirmed, and concurrent waiters never replay', async () => {
    const f = fixture(), lease = permit()
    lease.resolve()
    const flushed = deferred()
    const entered = deferred()
    let count = 0
    f.ctx.sessionPersistence.flush.mockImplementation(async () => { if (++count === 2) { entered.resolve(); await flushed.promise } })
    f.ctx.sessionPersistence.open.mockResolvedValue({ read: async () => ({ events: [] }), close: async () => {} })
    const delivery = new Delivery(f.ctx)
    const message = { id: 'pbots-report:one', source: { kind: 'pbots-worker' } }
    const a = delivery.send(f.agents.get('main'), message, lease).catch((error: Error) => error)
    await entered.promise
    const b = delivery.send(f.agents.get('main'), message, lease).catch((error: Error) => error)
    lease.abort(); flushed.resolve()
    expect(await a).toMatchObject({ unconfirmedStart: true })
    expect(await b).toBeInstanceOf(Error)
    expect(f.followup).toHaveBeenCalledTimes(1)
  })

  it('same captured lease is checked immediately before wake remove, and after synchronous remove events', () => {
    const f = fixture(), lease = permit()
    const delivery = new Delivery(f.ctx)
    const agent = f.agents.get('main')!
    agent.inbox.nextTurn.push({ id: 'pending', source: { kind: 'pbots-worker' } } as never)
    expect(delivery.wake(agent, 'pending', lease)).toBe(false)
    lease.resolve()
    f.remove.mockImplementation(() => lease.abort())
    expect(() => delivery.wake(agent, 'pending', lease)).toThrow()
    expect(f.remove).toHaveBeenCalledTimes(1)
    expect(f.followup).not.toHaveBeenCalled()
  })
})
