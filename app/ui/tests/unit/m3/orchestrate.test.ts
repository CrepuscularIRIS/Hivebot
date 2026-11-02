// #4 编排（D8/D10a/D10b/D7/⑦ 屏障）与 deriveBots（D10d）。
// presetIdOf 直接 import app/sdk/src/p2temp/preset-id.mjs（REUSE v1.1 决策行，不复制第二份）。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BOTS_JSON, BotsMetaStore, type BotsMeta } from '../../../main/m3-meta/store'
import {
  GATE_4_ENV,
  createBotWithConnectors,
  deriveBots,
  type DshLike,
} from '../../../main/m3-meta/orchestrate'
import { presetIdOf } from '../../../main/m3-meta/preset-id'

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'bot-p4-U-13-orch-'))
/** 拒绝路径不写盘：文件可能根本不存在。 */
const readMetaOrMissing = (dir: string): BotsMeta | null => {
  try {
    return JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta
  } catch {
    return null
  }
}
const INVALID = (message: string) => ({
  ok: false as const,
  error: { code: 'pbots/invalid-args', message, details: {} },
})

interface MockCall { method: string; args: unknown; at: number }

/** mock dsh：handlers[method](args) 返回 ConnectionRpcResult；全部调用记入 calls。 */
function mockDsh(handlers: Record<string, (args: unknown, call: MockCall) => unknown> = {}): DshLike & { calls: MockCall[] } {
  const calls: MockCall[] = []
  let seq = 0
  return {
    calls,
    async rpc(method: string, args: unknown) {
      const call = { method, args, at: (seq += 1) }
      calls.push(call)
      const handler = handlers[method]
      if (handler === undefined) {
        return { ok: false, error: { code: 'gateway/internal', message: `no mock for ${method}`, details: {} } }
      }
      return handler(args, call) as ReturnType<DshLike['rpc']> extends Promise<infer T> ? T : never
    },
  }
}

const rosterOk = {
  ok: true as const,
  value: {
    presets: [
      { id: 'p2-alpha', isDefault: true },
      { id: 'p2-beta', isDefault: false },
      { id: 'p2temp-zzz', isDefault: false },
    ],
  },
}

const create4Ok = (sessionId: string) => ({ ok: true as const, value: { sessionId } })

describe('presetIdOf 共用模块（D8 后半：缺省输入抛错）', () => {
  it('agentPreset 缺省/空白 → throw；换序 connectors 同 id', () => {
    expect(() => presetIdOf(undefined as unknown as string, ['a'])).toThrow()
    expect(() => presetIdOf('  ', ['a'])).toThrow()
    expect(presetIdOf('p2-alpha', ['b', 'a'])).toBe(presetIdOf('p2-alpha', ['a', 'b']))
    expect(presetIdOf('p2-alpha', ['a'])).not.toBe(presetIdOf('p2-beta', ['a']))
  })
})

describe('createBotWithConnectors · 校验（拒绝时 dsh 计数 === 0）', () => {
  it.each([
    ['connectors 缺失', { agentPreset: 'p2-alpha' }],
    ['connectors 空数组', { agentPreset: 'p2-alpha', connectors: [] }],
    ['connectors 非字符串元素', { agentPreset: 'p2-alpha', connectors: ['a', 1] }],
    ['connectors 空白字符串', { agentPreset: 'p2-alpha', connectors: [' '] }],
    ['R1 connectors 含 ../.. 逃逸名', { agentPreset: 'p2-alpha', connectors: ['a', '../..'] }],
    ['R1 connectors 含 @scope/.. 逃逸名', { agentPreset: 'p2-alpha', connectors: ['@scope/..'] }],
    ['R1 connectors 含绝对路径名', { agentPreset: 'p2-alpha', connectors: ['/abs/x'] }],
    ['R1 connectors 含反斜杠逃逸名（Windows 形态）', { agentPreset: 'p2-alpha', connectors: ['..\\..\\x'] }],
    ['agentPreset 是 p2temp-*（#1 过滤掉的 preset）', { agentPreset: 'p2temp-xxx', connectors: ['a'] }],
    ['args 非对象', null],
  ])('%s → invalid-args', async (_name, args) => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh()
    const result = await createBotWithConnectors(dsh, store, args as never)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('pbots/invalid-args')
    expect(dsh.calls.length).toBe(0)
    expect(readMetaOrMissing(dir)?.recipes ?? {}).toEqual({})
  })
})

describe('createBotWithConnectors · D8 agentPreset 单点解析', () => {
  it('省略与显式 defaultId 两次得同一 id，同一值贯穿 recipe 与 dsh 请求', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({ 'agentPresets/list': () => rosterOk, 'p2temp/session.createWithConnectors': () => create4Ok('s-1') })
    const omitted = await createBotWithConnectors(dsh, store, { connectors: ['b', 'a'] })
    expect(omitted).toEqual(create4Ok('s-1'))
    const explicit = await createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a', 'b'] })
    expect(explicit).toEqual(create4Ok('s-1'))

    const expectedId = presetIdOf('p2-alpha', ['a', 'b'])
    const meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta
    expect(Object.keys(meta.recipes)).toEqual([expectedId])
    expect(meta.recipes[expectedId]).toEqual({ agentPreset: 'p2-alpha', connectors: ['a', 'b'] })
    const createCalls = dsh.calls.filter((c) => c.method === 'p2temp/session.createWithConnectors')
    expect(createCalls.map((c) => c.args)).toEqual([
      { request: { connectors: ['a', 'b'], agentPreset: 'p2-alpha' } }, // typert wire {request:…} 壳（U-15 联调修正）
      { request: { connectors: ['a', 'b'], agentPreset: 'p2-alpha' } },
    ])
    // 缺省解析恰好调一次未过滤 #1；显式传入不调
    expect(dsh.calls.filter((c) => c.method === 'agentPresets/list').length).toBe(1)
  })

  it('缺省解析时 #1 失败 → pbots/unavailable，不写 recipe', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({
      'agentPresets/list': () => ({ ok: false, error: { code: 'gateway/internal', message: 'boom', details: {} } }),
    })
    const result = await createBotWithConnectors(dsh, store, { connectors: ['a'] })
    expect(result).toEqual({ ok: false, error: { code: 'pbots/unavailable', message: 'agentPresets/list failed: gateway/internal boom', details: {} } })
    expect(readMetaOrMissing(dir)?.recipes ?? {}).toEqual({})
  })
})

describe('createBotWithConnectors · D10b 编排顺序（recipe 先于 #4）', () => {
  it('#4 被调时 recipe 已在盘上（mock #4 内同步读文件断言）', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    let recipeOnDiskAtCall: unknown = 'not-checked'
    const dsh = mockDsh({
      'p2temp/session.createWithConnectors': () => {
        recipeOnDiskAtCall = (JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta).recipes
        return create4Ok('s-9')
      },
    })
    await createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] })
    const ids = Object.keys(recipeOnDiskAtCall as Record<string, unknown>)
    expect(ids).toEqual([presetIdOf('p2-alpha', ['a'])])
  })

  it('#4 挂起不返回时 recipe 已落盘（直接读盘断言）', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({
      'p2temp/session.createWithConnectors': () => new Promise(() => {}) as never,
    })
    const pending = createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] })
    await new Promise((r) => setTimeout(r, 50))
    const meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta
    expect(Object.keys(meta.recipes)).toEqual([presetIdOf('p2-alpha', ['a'])])
    void pending
  })

  it('#4 返回 !ok → 原样透传（含 details），孤儿 recipe 留在盘上不删', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({
      'p2temp/session.createWithConnectors': () => ({
        ok: false,
        error: { code: 'p2temp/connector-unavailable', message: 'p2temp: connector "nope" is not installed', details: { connector: 'nope' } },
      }),
    })
    const result = await createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['nope'] })
    expect(result).toEqual({
      ok: false,
      error: { code: 'p2temp/connector-unavailable', message: 'p2temp: connector "nope" is not installed', details: { connector: 'nope' } },
    })
    const meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta
    expect(Object.keys(meta.recipes)).toEqual([presetIdOf('p2-alpha', ['nope'])])
  })
})

describe('createBotWithConnectors · D10a 并发同 id', () => {
  it('并发两次同 id 的 #4 都成功、recipe 恰一条（register 单飞在 SDK 侧 in-flight 表）', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({
      'p2temp/session.createWithConnectors': () => create4Ok('s-x'),
    })
    const [a, b] = await Promise.all([
      createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] }),
      createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] }),
    ])
    expect(a).toEqual(create4Ok('s-x'))
    expect(b).toEqual(create4Ok('s-x'))
    expect(dsh.calls.filter((c) => c.method === 'p2temp/session.createWithConnectors').length).toBe(2)
    const meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta
    expect(Object.keys(meta.recipes)).toEqual([presetIdOf('p2-alpha', ['a'])])
  })
})

describe('⑦ env 门控的 #4 编排屏障', () => {
  it('未设 env：屏障路径不触发（waitGate 未被调用）', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({ 'p2temp/session.createWithConnectors': () => create4Ok('s-1') })
    const waitGate = async () => { throw new Error('gate must not fire when env unset') }
    delete process.env[GATE_4_ENV]
    const result = await createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] }, { waitGate })
    expect(result).toEqual(create4Ok('s-1'))
  })

  it('设 env：停在 recipe 已落盘、#4 已返回（session 已建）、调用方未收到返回；touch 后放行', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    let createReturned = false
    const dsh = mockDsh({
      'p2temp/session.createWithConnectors': () => {
        createReturned = true
        return create4Ok('s-2')
      },
    })
    let release: (() => void) | undefined
    const waitGate = async () => { await new Promise<void>((r) => { release = r }) }
    process.env[GATE_4_ENV] = '/tmp/bot-p4-U-13-gate-file'
    try {
      const pending = createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] }, { waitGate })
      const winner = await Promise.race([pending.then(() => 'resolved'), new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 100))])
      expect(winner).toBe('timeout')
      // 屏障停点：#4 已返回（session 已建）且 recipe 已落盘，调用方未收到返回
      expect(createReturned).toBe(true)
      const meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')) as BotsMeta
      expect(Object.keys(meta.recipes)).toEqual([presetIdOf('p2-alpha', ['a'])])
      release!()
      expect(await pending).toEqual(create4Ok('s-2'))
    } finally {
      delete process.env[GATE_4_ENV]
    }
  })

  it('默认 waitGate：轮询 env 指定的 gate 文件出现后放行（真实 fs）', async () => {
    const dir = tmpHome()
    const gateFile = join(tmpHome(), 'gate-4')
    const store = new BotsMetaStore(dir)
    await store.init()
    const dsh = mockDsh({ 'p2temp/session.createWithConnectors': () => create4Ok('s-3') })
    process.env[GATE_4_ENV] = gateFile
    try {
      const pending = createBotWithConnectors(dsh, store, { agentPreset: 'p2-alpha', connectors: ['a'] })
      await new Promise((r) => setTimeout(r, 80))
      const { writeFileSync: wf } = await import('node:fs')
      wf(gateFile, '')
      expect(await pending).toEqual(create4Ok('s-3'))
    } finally {
      delete process.env[GATE_4_ENV]
    }
  })
})

describe('deriveBots（D10d runtime 恒 dsh；孤儿不产生行）', () => {
  const view = (recipes: Record<string, { agentPreset: string; connectors: string[]; live: boolean }>, mainBotId: string | null = null) =>
    ({ version: 1 as const, mainBotId, recipes })
  const sessions = [
    { sessionId: 's-plain', running: true, updatedAt: 1, agentPreset: 'p2-alpha' },
    { sessionId: 's-conn', running: false, updatedAt: 2, agentPreset: 'p2temp-abc' },
    { sessionId: 's-stale', running: false, updatedAt: 3, agentPreset: 'p2temp-xyz' },
  ]

  it('按 session 产生行；孤儿 recipe（无 session）不出现', () => {
    const rows = deriveBots(sessions, view({ 'p2temp-abc': { agentPreset: 'p2-alpha', connectors: ['a'], live: true }, 'p2temp-orphan': { agentPreset: 'p2-beta', connectors: ['b'], live: true } }, 's-conn'))
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r.id)).toEqual(['s-plain', 's-conn', 's-stale'])
    expect(rows.every((r) => r.runtime === 'dsh')).toBe(true)
  })

  it('connectors/readOnly/mainBot/preset 按 C §3.1 推导', () => {
    const rows = deriveBots(sessions, view({ 'p2temp-abc': { agentPreset: 'p2-alpha', connectors: ['a'], live: true } }, 's-conn'))
    expect(rows[0]).toEqual({ id: 's-plain', preset: 'p2-alpha', connectors: [], readOnly: false, mainBot: false, runtime: 'dsh', running: true, updatedAt: 1 })
    expect(rows[1]).toEqual({ id: 's-conn', preset: 'p2-alpha', connectors: ['a'], readOnly: false, mainBot: true, runtime: 'dsh', running: false, updatedAt: 2 })
    // p2temp-* 且无 recipe → 只读
    expect(rows[2]).toEqual({ id: 's-stale', preset: null, connectors: [], readOnly: true, mainBot: false, runtime: 'dsh', running: false, updatedAt: 3 })
  })

  it('recipe.live=false → 该 bot 只读；普通 preset 的 bot 不因此只读', () => {
    const rows = deriveBots(sessions, view({ 'p2temp-abc': { agentPreset: 'p2-alpha', connectors: ['a'], live: false } }))
    expect(rows[1].readOnly).toBe(true)
    expect(rows[0].readOnly).toBe(false)
  })

  it('header.agentPreset 缺失（SessionSummary 无 header 时）→ preset null', () => {
    const rows = deriveBots([{ sessionId: 's-1', running: false, updatedAt: 0 }], view({}))
    expect(rows[0]).toEqual({ id: 's-1', preset: null, connectors: [], readOnly: false, mainBot: false, runtime: 'dsh', running: false, updatedAt: 0 })
  })
})
