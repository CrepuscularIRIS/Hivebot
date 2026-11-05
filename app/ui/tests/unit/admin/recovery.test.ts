import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
})
