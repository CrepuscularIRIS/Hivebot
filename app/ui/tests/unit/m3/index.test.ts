// registerM3Meta handler：get（live 计算 = 未过滤 #1 含该 id，C:92，不写盘）与
// patch（只接受 mainBotId 且须在 #9 列表，其余 invalid-args；D10e 队列复用 store）。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BOTS_JSON, BotsMetaStore, type Recipe } from '../../../main/m3-meta/store'
import { registerM3Meta } from '../../../main/m3-meta'

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'bot-p4-U-13-m3-'))

async function seededStore(dir: string, recipes: Record<string, Recipe> = {}): Promise<BotsMetaStore> {
  const store = new BotsMetaStore(dir)
  await store.init()
  for (const [id, recipe] of Object.entries(recipes)) await store.putRecipe(id, recipe)
  return store
}

function mockDsh(handlers: Record<string, (args: unknown) => unknown>): { rpc: never; calls: { method: string; args: unknown }[] } {
  const calls: { method: string; args: unknown }[] = []
  return {
    calls,
    async rpc(method: string, args: unknown) {
      calls.push({ method, args })
      const handler = handlers[method]
      if (handler === undefined) return { ok: false, error: { code: 'gateway/internal', message: `no mock for ${method}`, details: {} } }
      return handler(args)
    },
  } as never
}

const roster = (ids: string[]) => ({
  ok: true as const,
  value: { presets: ids.map((id, i) => ({ id, isDefault: i === 0 })) },
})
const sessions = (ids: string[]) => ({ ok: true as const, value: { items: ids.map((sessionId) => ({ sessionId, running: false, updatedAt: 1 })) } })

describe('get', () => {
  it('live = 未过滤 #1 是否含该 presetId；registry 无此 id → live===false；get 不写盘', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir, {
      'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'] },
      'p2temp-dead5678': { agentPreset: 'p2-beta', connectors: ['b'] },
    })
    const dsh = mockDsh({ 'agentPresets/list': () => roster(['p2-alpha', 'p2temp-live1234']) })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    const before = readFileSync(join(dir, BOTS_JSON), 'utf8')
    const result = await m3.handler({ op: 'get' })
    expect(result).toEqual({
      ok: true,
      value: {
        version: 1,
        mainBotId: null,
        recipes: {
          'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'], live: true },
          'p2temp-dead5678': { agentPreset: 'p2-beta', connectors: ['b'], live: false },
        },
      },
    })
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(before)
  })

  it('#1 失败 → pbots/unavailable（不静默全 false）', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir)
    const dsh = mockDsh({ 'agentPresets/list': () => ({ ok: false, error: { code: 'gateway/internal', message: 'x', details: {} } }) })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    expect(await m3.handler({ op: 'get' })).toEqual({
      ok: false,
      error: { code: 'pbots/unavailable', message: 'agentPresets/list failed: gateway/internal x', details: {} },
    })
  })

  it('dsh 未配置 → pbots/unavailable', async () => {
    const store = await seededStore(tmpHome())
    const m3 = registerM3Meta({ store })
    const result = await m3.handler({ op: 'get' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('pbots/unavailable')
  })

  it('restore 标记失败的 recipe：即使 #1 含该 id 也 live===false', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir, { 'p2temp-broken': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    const failed = new Set(['p2temp-broken'])
    const dsh = mockDsh({ 'agentPresets/list': () => roster(['p2-alpha', 'p2temp-broken']) })
    const m3 = registerM3Meta({ dsh: dsh as never, store, failed })
    const result = await m3.handler({ op: 'get' })
    expect(result.ok && result.value.recipes['p2temp-broken'].live).toBe(false)
  })

  it('坏 bots.json → pbots/storage', async () => {
    const dir = tmpHome()
    writeFileSync(join(dir, BOTS_JSON), '{oops', 'utf8')
    const dsh = mockDsh({ 'agentPresets/list': () => roster(['p2-alpha']) })
    const m3 = registerM3Meta({ dsh: dsh as never, dataDir: dir })
    const result = await m3.handler({ op: 'get' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('pbots/storage')
  })
})

describe('patch · 形状（renderer 只写 mainBotId）', () => {
  it.each([
    ['op 未知', { op: 'dump' }],
    ['patch 缺 mainBotId', { op: 'patch' }],
    ['mainBotId 非 string', { op: 'patch', mainBotId: 42 }],
    ['多余字段', { op: 'patch', mainBotId: 's-1', recipes: {} }],
    ['非对象请求', 'get'],
  ])('%s → invalid-args，dsh 计数 === 0', async (_name, req) => {
    const dsh = mockDsh({})
    const store = await seededStore(tmpHome())
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    const result = await m3.handler(req as never)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('pbots/invalid-args')
    expect(dsh.calls.length).toBe(0)
  })
})

// U-28 R2：rpcRaw 的 fetch/JSON 网络层异常（rpc reject）不得逸出 handler —— renderer 的
// botsMeta 是裸 await（store.ts loadRoster/refreshMeta/setMainBot），rejection 会卡死 boot
// （U-22 GU-1 同款根因，M1 路径已有兜底，M3 补齐）。
// U-29 R7 rebase：内联 try/catch 统一为 safeRpc（同一覆盖），消息格式 `<method> rpc failed: <error.message>`。
describe('get/patch · rpc 抛错（U-28 R2 / U-29 R7）', () => {
  it('get 的 agentPresets/list reject → 结构化 pbots/unavailable，handler 不 reject', async () => {
    const store = await seededStore(tmpHome(), { 'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    const dsh = mockDsh({
      'agentPresets/list': () => { throw new TypeError('fetch failed') },
    })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    await expect(m3.handler({ op: 'get' })).resolves.toEqual({
      ok: false,
      error: { code: 'pbots/unavailable', message: 'agentPresets/list failed: pbots/unavailable rpc failed: fetch failed', details: {} },
    })
  })

  it('patch 的 session/list reject → 同样结构化 pbots/unavailable，不落盘', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir)
    const dsh = mockDsh({
      'session/list': () => { throw new Error('socket hang up') },
      'agentPresets/list': () => roster(['p2-alpha']),
    })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    await expect(m3.handler({ op: 'patch', mainBotId: 's-1' })).resolves.toEqual({
      ok: false,
      error: { code: 'pbots/unavailable', message: 'session/list failed: pbots/unavailable rpc failed: socket hang up', details: {} },
    })
    // 未落盘：空 store 从未 putRecipe，文件不存在
    expect(() => readFileSync(join(dir, BOTS_JSON), 'utf8')).toThrow()
  })
})

// U-28 R6：restore 未 settle 时 get 不得给出误导性 live=false（boot 竞态：renderer
// loadRoster 会缓存首个 meta，restore 成功后也不刷新）。返回结构化 pending 错误让
// renderer 的 500ms 重试循环消化，settle 后自然拿到正确视图；不挂起（不卡 renderer）。
describe('get · restore 未 settle（U-28 R6）', () => {
  it('restoreSettled()=false → pbots/restore-pending，不查 #1（dsh 计数 === 0）', async () => {
    const store = await seededStore(tmpHome(), { 'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    const dsh = mockDsh({ 'agentPresets/list': () => roster(['p2temp-live1234']) })
    const m3 = registerM3Meta({ dsh: dsh as never, store, restoreSettled: () => false })
    await expect(m3.handler({ op: 'get' })).resolves.toEqual({
      ok: false,
      error: { code: 'pbots/restore-pending', message: 'preset restore in progress', details: {} },
    })
    expect(dsh.calls.length).toBe(0)
  })

  it('settle 后同句柄返回正常视图（重试链路终点）；未注入回调时行为不变', async () => {
    const store = await seededStore(tmpHome(), { 'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    const dsh = mockDsh({ 'agentPresets/list': () => roster(['p2-alpha', 'p2temp-live1234']) })
    let settled = false
    const m3 = registerM3Meta({ dsh: dsh as never, store, restoreSettled: () => settled })
    expect((await m3.handler({ op: 'get' })).ok).toBe(false)
    settled = true
    await expect(m3.handler({ op: 'get' })).resolves.toEqual({
      ok: true,
      value: {
        version: 1,
        mainBotId: null,
        recipes: { 'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'], live: true } },
      },
    })
    // 缺省（未注入）→ 不 pending（向后兼容：dsh 未配置等场景）
    const bare = registerM3Meta({ dsh: dsh as never, store: await seededStore(tmpHome()) })
    expect((await bare.handler({ op: 'get' })).ok).toBe(true)
  })
})

describe('patch · wire 壳（W1 R4：session/list 参数名是 _request）', () => {
  it('用 {_request:{}} 壳：fake gateway 只认 _request 形状，不再 arguments-invalid', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir)
    // 模拟上游 gateway 的参数校验：list(_request, signal)（repos/deepseek-harness
    // session-controller/src/index.ts:278；SDK e2e 正确形态见 mock-demo.test.ts:56）。
    const dsh = mockDsh({
      'session/list': (args) => {
        if (typeof args !== 'object' || args === null || !('_request' in args)) {
          return { ok: false, error: { code: 'gateway/arguments-invalid', message: `session/list got ${JSON.stringify(args)}`, details: {} } }
        }
        return sessions(['s-1'])
      },
      'agentPresets/list': () => roster(['p2-alpha']),
    })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    const result = await m3.handler({ op: 'patch', mainBotId: 's-1' })
    // 修复前：{cursor:null} 被 gateway 判 arguments-invalid → pbots/unavailable
    expect(result.ok).toBe(true)
    const call = dsh.calls.find((c) => c.method === 'session/list')
    expect(call?.args).toEqual({ _request: {} })
  })
})

describe('patch · 语义', () => {
  it('mainBotId 不在 #9 列表 → invalid-args；在列表 → 落盘并返回带 live 的 view', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir, { 'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    const dsh = mockDsh({
      'session/list': () => sessions(['s-1', 's-2']),
      'agentPresets/list': () => roster(['p2-alpha', 'p2temp-live1234']),
    })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    const bad = await m3.handler({ op: 'patch', mainBotId: 's-missing' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('pbots/invalid-args')
    expect(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')).mainBotId).toBe(null)

    const good = await m3.handler({ op: 'patch', mainBotId: 's-2' })
    expect(good).toEqual({
      ok: true,
      value: {
        version: 1,
        mainBotId: 's-2',
        recipes: { 'p2temp-live1234': { agentPreset: 'p2-alpha', connectors: ['a'], live: true } },
      },
    })
    expect(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')).mainBotId).toBe('s-2')
  })

  it('#9 失败 → pbots/unavailable，不落盘', async () => {
    const dir = tmpHome()
    const store = await seededStore(dir)
    const dsh = mockDsh({ 'session/list': () => ({ ok: false, error: { code: 'gateway/internal', message: 'x', details: {} } }) })
    const m3 = registerM3Meta({ dsh: dsh as never, store })
    const result = await m3.handler({ op: 'patch', mainBotId: 's-1' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'pbots/unavailable', message: 'session/list failed: gateway/internal x', details: {} },
    })
    // 未写盘（文件不存在）或 mainBotId 仍为 null 都算未落盘；此处从未写过 → 文件不存在
    let onDisk: string | null = null
    try {
      onDisk = readFileSync(join(dir, BOTS_JSON), 'utf8')
    } catch {
      onDisk = null
    }
    expect(onDisk === null || JSON.parse(onDisk).mainBotId === null).toBe(true)
  })
})
