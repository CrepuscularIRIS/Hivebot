// U-15 三桥接线单测：#4 方法路由进 M3 编排（写 recipe 先于 dsh #4）、共享 ledger 单例
// （HANDOFF-MED：m1 默认 m1Ledger 与 registerM2Mux({ledger}) 必须同一实例）。
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  }
  return stub
}

describe('wrapM1WithOrchestration（#4 路由，CONTRACT §3.1）', () => {
  it('#4 → M3 编排：recipe 落盘、dsh 收到 #4，base 不被调用', async () => {
    const store = new BotsMetaStore(mkdtempSync(join(tmpdir(), 'bot-u15-wire-')))
    await store.init()
    const roster = dshStub({ 'agentPresets/list': { presets: [{ id: 'p2-alpha', isDefault: true }] }, 'p2temp/session.createWithConnectors': { sessionId: 's-orch' } })
    const baseCalls: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { baseCalls.push(req); return { ok: true, value: {} } }
    const wired = wrapM1WithOrchestration(base, roster as unknown as Parameters<typeof wrapM1WithOrchestration>[1], store)

    const res = await wired({
      method: 'p2temp/session.createWithConnectors',
      args: { request: { connectors: ['fake-bundle'] } }, // 缺省 agentPreset → main 解析 defaultId（§8-2）
    })
    expect(res).toEqual({ ok: true, value: { sessionId: 's-orch' } })
    expect(baseCalls).toEqual([]) // #4 不透传基座
    const recipeKey = Object.keys(store.read().recipes)[0]
    expect(store.read().recipes[recipeKey]).toEqual({ agentPreset: 'p2-alpha', connectors: ['fake-bundle'] })
    expect(roster.calls[1]).toEqual({
      method: 'p2temp/session.createWithConnectors',
      args: { request: { connectors: ['fake-bundle'], agentPreset: 'p2-alpha' } }, // typert wire {request:…} 壳（U-15 联调修正）
    })
    expect(roster.calls.map((c) => c.method)).toEqual(['agentPresets/list', 'p2temp/session.createWithConnectors'])
  })

  it('#4 编排校验拒绝时 dsh #4 不被调用（connectors 空）', async () => {
    const store = new BotsMetaStore(mkdtempSync(join(tmpdir(), 'bot-u15-wire-')))
    await store.init()
    const dsh = dshStub({})
    const wired = wrapM1WithOrchestration(async () => ({ ok: true, value: {} }), dsh as unknown as Parameters<typeof wrapM1WithOrchestration>[1], store)
    const res = await wired({ method: 'p2temp/session.createWithConnectors', args: { request: { connectors: [] } } })
    expect(res).toEqual({
      ok: false,
      error: { code: 'pbots/invalid-args', message: 'connectors must be a non-empty array of bundle names', details: {} },
    })
    expect(dsh.calls).toEqual([])
  })

  it('非 #4 方法原样走 base', async () => {
    const store = new BotsMetaStore(mkdtempSync(join(tmpdir(), 'bot-u15-wire-')))
    await store.init()
    const seen: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { seen.push(req); return { ok: true, value: { via: 'base' } } }
    const wired = wrapM1WithOrchestration(base, undefined, store)
    const res = await wired({ method: 'session/list', args: { request: {} } })
    expect(res).toEqual({ ok: true, value: { via: 'base' } })
    expect(seen).toEqual([{ method: 'session/list', args: { request: {} } }])
  })

  it('dsh 未配置时 #4 也走 base（forbidden not configured 由基座承担）', async () => {
    const store = new BotsMetaStore(mkdtempSync(join(tmpdir(), 'bot-u15-wire-')))
    await store.init()
    const seen: M1Request[] = []
    const base = async (req: M1Request): Promise<ConnectionRpcResult> => { seen.push(req); return { ok: false, error: { code: 'pbots/forbidden', message: 'dsh connection not configured', details: {} } } }
    const wired = wrapM1WithOrchestration(base, undefined, store)
    const res = await wired({ method: 'p2temp/session.createWithConnectors', args: { request: { connectors: ['x'] } } })
    expect(res.ok).toBe(false)
    expect(seen.length).toBe(1)
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
