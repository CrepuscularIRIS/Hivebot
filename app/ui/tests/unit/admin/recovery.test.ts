import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationsLedger } from '../../../main/admin/operations'
import { wireAdminRecovery } from '../../../main/admin/recovery'
import { restartSdk } from '../../../main/admin/restart'
import { createReadyGate } from '../../../main/ready'

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, ipcMain: {}, protocol: {}, MessageChannelMain: {} }))
import { wireRestoreOnReconnect } from '../../../main/index'
import { BotsMetaStore } from '../../../main/m3-meta/store'
import { DshConnection } from '../../../main/dsh/connect'

const deferred = () => Promise.withResolvers<void>()
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
function fixture(options: { corrupt?: boolean; restoreError?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-ui-'))
  if (options.corrupt) writeFileSync(join(root, 'admin-operations.jsonl'), '{"version":99}\n')
  const ledger = new OperationsLedger(root)
  const restore = deferred()
  const listeners: Array<(generation: number) => void> = []
  const frames: Array<(frame: any) => void> = []
  const dead: Array<() => void> = []
  const rpc = vi.fn(async (method: string, args: any) => method.endsWith('Prepare')
    ? { ok: true, value: { processId: 'process-one', interrupted: [], held: [], issues: [], note: 'host restarted; inspect first; do not replay' } }
    : { ok: true, value: { processId: 'process-one', ready: true } })
  const dsh = {
    onConnected(fn: (generation: number) => void) { listeners.push(fn) },
    onDisconnected(fn: () => void) { dead.push(fn) },
    async ready() { return { openStream(_endpoint: string, _args: unknown, cb: (frame: any) => void) { frames.push(cb); return { cancel: vi.fn() } } } },
    rpc,
  }
  const controller = wireAdminRecovery({ dsh, ledger, restore: async () => { await restore.promise; if (options.restoreError) throw new Error('M3 ensure failed') }, log: vi.fn() })
  cleanup.push(() => { restore.resolve(); controller.close(); ledger.close(); rmSync(root, { recursive: true, force: true }) })
  return { ledger, rpc, restore, listeners, frames, dead, controller }
}

describe('P7-F3 main recovery gate', () => {
  it('actual M3 reconnect hook exposes success, not merely settled, and fences old completions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-m3-'))
    const store = new BotsMetaStore(root)
    cleanup.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
    const init = store.init()
    await init
    await store.putRecipe('recipe', { agentPreset: 'p2-alpha', connectors: ['a'] })
    let connected: (generation: number) => void = () => {}
    const calls: Array<ReturnType<typeof Promise.withResolvers<any>>> = []
    const dsh = { onConnected(fn: typeof connected) { connected = fn }, rpc: vi.fn(() => { const call = Promise.withResolvers<any>(); calls.push(call); return call.promise }) }
    const ready = createReadyGate({ dshConfigured: true })
    const restored = wireRestoreOnReconnect(dsh, { store, init, failed: new Set() } as any, ready, vi.fn())
    connected(1)
    await tick()
    connected(2)
    calls[0].resolve({ ok: false, error: { code: 'failed', message: 'failed' } })
    await tick()
    expect(ready.status().restore).toBe(false)
    await expect(restored(1)).rejects.toThrow()
    calls[1].resolve({ ok: true, value: { presetId: 'recipe' } })
    await expect(restored(2)).resolves.toBeUndefined()
    expect(ready.status().restore).toBe(true)
  })
  it('reads F1/M3 and SDK Assignment state before complete; unknown operation is not replayed or promoted', async () => {
    const f = fixture()
    await f.controller.initialized
    const operation = await f.ledger.beginOperation({ action: 'install', actor: 'user', turnCategory: 'user', generation: 1 })
    expect(f.controller.isReady()).toBe(false)
    await tick()
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'challenge-one' } })
    await tick()
    expect(f.rpc).not.toHaveBeenCalled()
    f.restore.resolve()
    await tick(); await tick()
    expect(f.rpc.mock.calls.map(([method]) => method)).toEqual(['pbots/orchestration.recoveryPrepare', 'pbots/orchestration.recoveryComplete'])
    expect(f.controller.isReady()).toBe(true)
    expect(f.ledger.readOperations().inProgress[0].operationId).toBe(operation.operationId)
    expect(f.ledger.readOperations().completed).toEqual([])
  })

  it('disconnect closes immediately; old restore resolution cannot complete or open the new generation', async () => {
    const f = fixture()
    await tick()
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'old' } })
    await tick()
    f.dead[0]()
    f.listeners[0](2)
    await tick()
    f.restore.resolve()
    await tick()
    expect(f.controller.isReady()).toBe(false)
    expect(f.rpc).not.toHaveBeenCalled()
    f.frames[1]({ type: 'item', value: { processId: 'process-one', challenge: 'new' } })
    await tick(); await tick()
    expect(f.controller.isReady()).toBe(true)
    expect(f.rpc.mock.calls.filter(([method]) => method.endsWith('Complete'))).toHaveLength(1)
    expect(f.rpc.mock.calls.at(-1)?.[1]).toEqual({ request: { challenge: 'new' } })
  })

  it('failed restore and mismatched process response keep the gate shut', async () => {
    const f = fixture()
    f.rpc.mockResolvedValue({ ok: true, value: { processId: 'wrong-process', ready: true } } as any)
    await tick()
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'one' } })
    f.restore.resolve()
    await tick(); await tick()
    expect(f.controller.isReady()).toBe(false)
    expect(f.rpc).toHaveBeenCalledTimes(1)
  })

  it('bad Assignment relationship leaves a failed operation audit; it never invokes a manager action', async () => {
    const f = fixture()
    f.rpc.mockResolvedValueOnce({ ok: true, value: { processId: 'process-one', interrupted: [], held: [], issues: [{ sessionId: 'orphan', reason: 'unmatched-main' }] } } as any)
    await tick()
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'one' } })
    f.restore.resolve()
    await tick(); await tick()
    expect(f.controller.isReady()).toBe(false)
    expect(f.ledger.readOperations().failed[0]).toMatchObject({ action: 'recovery', error: 'unmatched-main', target: 'orphan' })
  })

  it('bad F1 or failed M3 recovery never invokes SDK repair or opens management', async () => {
    for (const options of [{ corrupt: true }, { restoreError: true }]) {
      const f = fixture(options)
      await tick()
      f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'one' } })
      f.restore.resolve()
      await tick(); await tick()
      expect(f.controller.isReady()).toBe(false)
      expect(f.rpc).not.toHaveBeenCalled()
    }
  })

  it('a socket reconnect is not a new SDK process; stale receipts fail and no-owner restart is unavailable', async () => {
    const f = fixture()
    await tick()
    f.restore.resolve()
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'old' } })
    await tick(); await tick()
    const generation = f.controller.generation()
    f.dead[0]()
    expect(f.controller.generation()).toBeUndefined()
    f.listeners[0](99)
    await tick()
    f.frames[1]({ type: 'item', value: { processId: 'process-one', challenge: 'new' } })
    await tick(); await tick()
    expect(f.controller.generation()).toBe(generation)
    expect(f.ledger.readOperations().completed).toEqual([])
    expect(await restartSdk()).toMatchObject({ ok: false, error: { code: 'pbots/unavailable' } })
  })

  it('recovery cannot receipt an unknown restart; duplicate/terminal frames close the gate', async () => {
    const f = fixture()
    await f.controller.initialized
    const op = await f.ledger.beginOperation({ action: 'restart', actor: 'user', turnCategory: 'user', generation: 3, before: { hostProcessId: 'process-old' } })
    await tick()
    f.restore.resolve()
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'one' } })
    await tick(); await tick()
    expect(f.controller.generation()).toBe(4)
    expect(f.ledger.readOperations().inProgress[0]).toMatchObject({ operationId: op.operationId })
    expect(f.ledger.readOperations().inProgress[0].receipt).toBeUndefined()
    expect(await restartSdk()).toMatchObject({ ok: false, error: { code: 'pbots/unavailable' } })
    f.frames[0]({ type: 'item', value: { processId: 'process-one', challenge: 'duplicate' } })
    expect(f.controller.isReady()).toBe(false)
    f.listeners[0](2)
    await tick()
    f.frames[1]({ type: 'error' })
    expect(f.controller.isReady()).toBe(false)
  })

  it('actual connection invalidates listeners on socket death and stop even when an earlier listener throws', async () => {
    let dead = () => {}
    const socket = { openPromise: Promise.resolve(), onDead(fn: () => void) { dead = fn }, close: vi.fn() }
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 302, headers: { getSetCookie: () => ['session=synthetic'] } })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const connection = new DshConnection({ baseUrl: 'http://localhost.invalid', token: 'synthetic', interactions: 'answer', makeSocket: () => socket as any })
    const invalidated = vi.fn()
    try {
      connection.onDisconnected(() => { throw new Error('injected listener failure') })
      connection.onDisconnected(invalidated)
      await connection.start()
      dead()
      expect(invalidated).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('onDisconnected listener failed'))
      connection.stop()
      expect(invalidated).toHaveBeenCalledTimes(2)
    } finally {
      connection.stop()
      warn.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('old generation restore-settled cannot release the newest ready gate; timeout settled is not management success', async () => {
    const ready = createReadyGate({ dshConfigured: true })
    ready.setDshReady(1)
    ready.setRestoreSettled([], 1)
    ready.setDshReady(2)
    ready.setRestoreSettled([], 1)
    expect(ready.status().restore).toBe(false)
    ready.setRestoreSettled([])
    expect(ready.status().restore).toBe(false)
    ready.setRestoreSettled([], 2)
    expect(ready.status().restore).toBe(true)
  })

  it('main entry wires real F1 and recovery to M3 and disposes the control stream before quit without a desktop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bot-P7-F3-main-'))
    const handoff = join(root, 'handoff')
    mkdirSync(handoff)
    writeFileSync(join(handoff, 'base-url'), 'http://localhost.invalid')
    writeFileSync(join(handoff, 'launch-token'), 'synthetic-test-only')
    const beforeQuit: Array<() => void> = [], connected: Array<(g: number) => void> = []
    const frames: Array<(frame: unknown) => void> = []
    const cancel = vi.fn(), loadURL = vi.fn(async () => {})
    const dsh = {
      start: vi.fn(async () => 1), stop: vi.fn(),
      onConnected(fn: (g: number) => void) { connected.push(fn) }, onDisconnected: vi.fn(),
      async ready() { return { openStream(_method: string, _args: unknown, cb: (frame: unknown) => void) { frames.push(cb); return { cancel } } } },
      rpc: vi.fn(async (method: string) => ({ ok: true, value: method.endsWith('Prepare')
        ? { processId: 'entry-process', interrupted: [], held: [], issues: [] }
        : { processId: 'entry-process', ready: true } })),
    }
    const descriptor = Object.getOwnPropertyDescriptor(process, 'type')
    let m3: any
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { requestSingleInstanceLock: () => true, on: vi.fn(), once: (_event: string, fn: () => void) => beforeQuit.push(fn), whenReady: async () => {}, getPath: () => root, exit: vi.fn(), quit: vi.fn() },
      BrowserWindow: { getAllWindows: () => [] }, ipcMain: { on: vi.fn(), handle: vi.fn() },
      protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() }, MessageChannelMain: {},
    }))
    vi.doMock('../../../main/window', () => ({ restoreThemeSource: vi.fn(), applyThemeSource: vi.fn(), createMainWindow: () => ({ once: vi.fn(), loadURL, webContents: { send: vi.fn() } }) }))
    vi.doMock('../../../main/dsh/connect', () => ({ DshConnection: class { constructor() { return dsh } } }))
    vi.doMock('../../../main/m1-api', () => ({ m1Ledger: {}, registerM1Api: () => vi.fn() }))
    vi.doMock('../../../main/m2-mux', () => ({ registerM2Mux: () => vi.fn() }))
    vi.doMock('../../../main/m3-meta/orch-channel', () => ({ wireOrchChannel: vi.fn() }))
    vi.doMock('../../../main/notify/worker-notify', () => ({ wireWorkerNotify: vi.fn() }))
    vi.doMock('../../../main/m3-meta', async (original) => {
      const actual = await original<any>()
      return { ...actual, registerM3Meta: (deps: unknown) => (m3 = actual.registerM3Meta(deps)) }
    })
    vi.stubEnv('PBOTS_DSH_HANDOFF', handoff)
    vi.stubEnv('PBOTS_DATA_DIR', root)
    vi.stubEnv('PBOTS_SPIKE_BRIDGE', '')
    Object.defineProperty(process, 'type', { configurable: true, value: 'browser' })
    try {
      await import('../../../main/index')
      for (let n = 0; n < 100 && !loadURL.mock.calls.length; n++) await tick()
      expect(loadURL).toHaveBeenCalledTimes(1)
      expect(beforeQuit).toHaveLength(1)
      connected.forEach((fn) => fn(1))
      await tick()
      frames.at(-1)!({ type: 'item', value: { processId: 'entry-process', challenge: 'entry-challenge' } })
      for (let n = 0; n < 100 && dsh.rpc.mock.calls.length < 2; n++) await tick()
      expect(dsh.rpc.mock.calls.map(([method]) => method)).toEqual(['pbots/orchestration.recoveryPrepare', 'pbots/orchestration.recoveryComplete'])
      const { OperationsLedger: CurrentLedger } = await import('../../../main/admin/operations')
      expect(() => new CurrentLedger(root)).toThrow('single-writer')
      const priorCancels = cancel.mock.calls.length
      beforeQuit[0]()
      const successor = new CurrentLedger(root)
      successor.close()
      expect(dsh.stop).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledTimes(priorCancels + 1)
      const count = dsh.rpc.mock.calls.length
      frames.at(-1)!({ type: 'item', value: { processId: 'entry-process', challenge: 'late' } })
      await tick()
      expect(dsh.rpc).toHaveBeenCalledTimes(count)
    } finally {
      beforeQuit.forEach((fn) => fn())
      m3?.store.close()
      if (descriptor) Object.defineProperty(process, 'type', descriptor)
      else Reflect.deleteProperty(process, 'type')
      vi.unstubAllEnvs()
      for (const path of ['electron', '../../../main/window', '../../../main/dsh/connect', '../../../main/m1-api', '../../../main/m2-mux', '../../../main/m3-meta/orch-channel', '../../../main/notify/worker-notify', '../../../main/m3-meta']) vi.doUnmock(path)
      vi.resetModules()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
