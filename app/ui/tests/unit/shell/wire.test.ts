// U-15 三桥接线单测：#4 方法路由进 M3 编排（写 recipe 先于 dsh #4）、共享 ledger 单例
// （HANDOFF-MED：m1 默认 m1Ledger 与 registerM2Mux({ledger}) 必须同一实例）。
import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: {},
  ipcMain: { handle: () => {}, on: () => {} },
  MessageChannelMain: class {},
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
}))

import { wrapM1WithOrchestration } from '../../../main/index'
import { registerM1Api, m1Ledger, type M1Request } from '../../../main/m1-api'
import { registerM2Mux } from '../../../main/m2-mux'
import { makeChannelPair } from '../m2/support'
import { BotsMetaStore } from '../../../main/m3-meta/store'
import type { ConnectionRpcResult } from '../../../main/dsh/connect'

interface DshStub {
  calls: Array<{ method: string; args: unknown }>
  apiCount: number
  rpc(method: string, args: unknown): Promise<ConnectionRpcResult>
  /** U-16 常驻 $events 循环会 await ready()；桩永不就绪（本文件不测 socket 层）。 */
  ready(): Promise<never>
}

function dshStub(handlers: Record<string, unknown> = {}): DshStub {
  const stub: DshStub = {
    calls: [],
    apiCount: 0,
    async rpc(method: string, args: unknown): Promise<ConnectionRpcResult> {
      stub.calls.push({ method, args })
      stub.apiCount += 1
      const hit = handlers[method]
      if (hit instanceof Error) return { ok: false, error: { code: 'gateway/internal', message: String(hit), details: {} } }
      return { ok: true, value: hit ?? {} }
    },
    ready: () => new Promise<never>(() => {}),
  }
  return stub
}

describe('wrapM1WithOrchestration（#4 路由，CONTRACT §3.1）', () => {
  it('#4 → M3 编排：recipe 落盘、dsh 收到 #4，base 不被调用', async () => {
    const dir = tmkdir('bot-u15-wire-')
    const store = new BotsMetaStore(dir)
    await store.init()
    const dataDir = join(dir, 'data')
    const roster = dshStub({ 'agentPresets/list': { presets: [{ id: 'p2-alpha', isDefault: true }] }, 'p2temp/session.createWithConnectors': { sessionId: 's-orch' } })
    const baseCalls: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { baseCalls.push(req); return { ok: true, value: {} } }
    const wired = wrapM1WithOrchestration(base, roster as unknown as Parameters<typeof wrapM1WithOrchestration>[1], store, dataDir)

    const res = await wired({
      method: 'p2temp/session.createWithConnectors',
      args: { request: { connectors: ['fake-bundle'] } }, // 缺省 agentPreset → main 解析 defaultId（§8-2）
    })
    expect(res).toEqual({ ok: true, value: { sessionId: 's-orch' } })
    expect(baseCalls).toEqual([]) // #4 不透传基座
    const recipeKey = Object.keys(store.read().recipes)[0]
    expect(store.read().recipes[recipeKey]).toEqual({ agentPreset: 'p2-alpha', connectors: ['fake-bundle'] })
    const createArgs = (roster.calls[1].args as { request: { sessionId: string; cwd: string } }).request
    expect(createArgs.connectors).toEqual(['fake-bundle'])
    expect(createArgs.agentPreset).toBe('p2-alpha')
    // P5-25：main 注入 sessionId + 强制 cwd（typert wire {request:…} 壳，U-15 联调修正）
    expect(createArgs.cwd).toBe(join(dataDir, 'workspaces', createArgs.sessionId))
    expect(roster.calls.map((c) => c.method)).toEqual(['agentPresets/list', 'p2temp/session.createWithConnectors'])
  })

  it('#4 编排校验拒绝时 dsh #4 不被调用（connectors 空）', async () => {
    const store = new BotsMetaStore(tmkdir('bot-u15-wire-'))
    await store.init()
    const dsh = dshStub({})
    const wired = wrapM1WithOrchestration(async () => ({ ok: true, value: {} }), dsh as unknown as Parameters<typeof wrapM1WithOrchestration>[1], store, 'unused-data-dir')
    const res = await wired({ method: 'p2temp/session.createWithConnectors', args: { request: { connectors: [] } } })
    expect(res).toEqual({
      ok: false,
      error: { code: 'pbots/invalid-args', message: 'connectors must be a non-empty array of bundle names', details: {} },
    })
    expect(dsh.calls).toEqual([])
  })

  it('非 #4 方法原样走 base', async () => {
    const store = new BotsMetaStore(tmkdir('bot-u15-wire-'))
    await store.init()
    const seen: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { seen.push(req); return { ok: true, value: { via: 'base' } } }
    const wired = wrapM1WithOrchestration(base, undefined, store, 'unused-data-dir')
    const res = await wired({ method: 'session/list', args: { request: {} } })
    expect(res).toEqual({ ok: true, value: { via: 'base' } })
    expect(seen).toEqual([{ method: 'session/list', args: { request: {} } }])
  })

  it('dsh 未配置时 #4 也走 base（forbidden not configured 由基座承担）', async () => {
    const store = new BotsMetaStore(tmkdir('bot-u15-wire-'))
    await store.init()
    const seen: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { seen.push(req); return { ok: false, error: { code: 'pbots/forbidden', message: 'dsh connection not configured', details: {} } } }
    const wired = wrapM1WithOrchestration(base, undefined, store, 'unused-data-dir')
    const res = await wired({ method: 'p2temp/session.createWithConnectors', args: { request: { connectors: ['x'] } } })
    expect(res.ok).toBe(false)
    expect(seen.length).toBe(1)
  })

  it('P5-25 #3 session/create → 强制 cwd 编排：注入 sessionId+cwd，不透传基座；传 cwd 即拒', async () => {
    const dir = tmkdir('bot-u15-wire-')
    const store = new BotsMetaStore(dir)
    await store.init()
    const dataDir = join(dir, 'data')
    const dsh = dshStub({ 'session/create': { sessionId: 's-3' } })
    const baseCalls: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { baseCalls.push(req); return { ok: true, value: {} } }
    const wired = wrapM1WithOrchestration(base, dsh as unknown as Parameters<typeof wrapM1WithOrchestration>[1], store, dataDir)

    const ok3 = await wired({ method: 'session/create', args: { request: {} } })
    expect(ok3).toEqual({ ok: true, value: { sessionId: 's-3' } })
    expect(baseCalls).toEqual([]) // #3 不透传基座
    const request = (dsh.calls[0].args as { request: { sessionId: string; cwd: string } }).request
    expect(request.cwd).toBe(join(dataDir, 'workspaces', request.sessionId))

    const denied = await wired({ method: 'session/create', args: { request: { cwd: '/tmp/elsewhere' } } })
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.error.code).toBe('pbots/invalid-args')
    expect(dsh.calls.length).toBe(1) // 拒绝时无第二次 dsh 调用
  })
})

describe('共享 ledger 单例（HANDOFF-MED 落实）', () => {
  it('registerM2Mux({ledger: m1Ledger}) 的台账与 m1 默认实例是同一对象', () => {
    const dsh = dshStub({})
    const m2 = registerM2Mux({ dsh: dsh as unknown as Parameters<typeof registerM2Mux>[0]['dsh'], ledger: m1Ledger, makeChannel: makeChannelPair })
    expect(m2.ledger).toBe(m1Ledger)
    const m1 = registerM1Api({ dsh: dsh as unknown as Parameters<typeof registerM1Api>[0]['dsh'] })
    void m1 // m1 未注入 ledger → 内部用 m1Ledger（m1/api.test.ts 已行为验证）；这里断言 m2 侧拿到同一实例
  })

  it('错 clientId 的 $events/result 被 m1 拒且 dsh 不被调用（U-15 ③ 口径）', async () => {
    m1Ledger.record({ type: 'ready', clientId: 'wire-real-cli' })
    const dsh = dshStub({})
    const m1 = registerM1Api({ dsh: dsh as unknown as Parameters<typeof registerM1Api>[0]['dsh'], log: () => {} })
    const res = await m1({
      method: '$events/result',
      args: { clientId: 'wire-wrong-cli', eventId: 'wire-ev', outcome: { kind: 'result', value: 'rejected' } },
    })
    expect(res).toEqual({
      ok: false,
      error: { code: 'pbots/forbidden', message: expect.stringContaining('clientId mismatch'), details: {} },
    })
    expect(dsh.apiCount).toBe(0)
  })
})
