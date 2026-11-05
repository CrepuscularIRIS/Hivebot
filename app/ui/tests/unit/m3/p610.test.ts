// P6-10 main 侧（PLAN P6-10 验收 ①②④⑤⑨⑫ + 决策 31/32）：BotsMeta 可选 bots
// 写入、createWorkerBot ⑤ 编排（校验 → mintWorkspace → createdBy 先落盘 → #3
// → #6 rename）、#20 防提升、deriveBots 防御性过滤。通道接线在 orch-channel.test.ts。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { BOTS_JSON, BotsMetaStore, type BotsMeta } from '../../../main/m3-meta/store'
import { createWorkerBot, deriveBots, type BotSessionLike, type DshLike } from '../../../main/m3-meta/orchestrate'
import { registerM3Meta } from '../../../main/m3-meta'

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
      if (handler === undefined) return { ok: false, error: { code: 'gateway/internal', message: `no mock for ${method}`, details: {} } }
      return handler(args, call) as { ok: true, value: unknown } | { ok: false, error: { code: string, message: string, details?: unknown } }
    },
  }
}

async function newStore(bots?: BotsMeta['bots']): Promise<BotsMetaStore> {
  const dir = tmkdir('bot-p610-store-')
  const store = new BotsMetaStore(dir)
  await store.init()
  if (bots !== undefined) {
    for (const [id, v] of Object.entries(bots)) await store.putBot(id, v.createdBy)
  }
  return store
}

const readJson = (store: BotsMetaStore): BotsMeta => JSON.parse(readFileSync(store.file, 'utf8')) as BotsMeta

// ---- store.putBot（决策 31：可选 bots 键；⑤ 编排唯一写入方） ----

describe('BotsMetaStore.putBot', () => {
  it('writes version 1 + bots[id].createdBy and the file passes the pre-P6 store predicate (验收 ⑤)', async () => {
    const store = await newStore()
    await store.patchMainBotId('session-main')
    await store.putBot('session-w1', 'session-main')
    const onDisk = readJson(store)
    expect(onDisk.version).toBe(1)
    expect(onDisk.bots).toEqual({ 'session-w1': { createdBy: 'session-main' } })
    // 单测内联「旧谓词」（store.ts 合并前 main 分支 :64-65 的校验只看 version/recipes）
    const legacy = (parsed: BotsMeta) => parsed.version !== 1 || typeof parsed.recipes !== 'object' || parsed.recipes === null
    expect(legacy(onDisk)).toBe(false)
  })

  it('no worker → the written file is byte-identical to pre-P6 (no bots key, 验收 ⑤)', async () => {
    const dir = tmkdir('bot-p610-bytes-')
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.patchMainBotId('session-main')
    await store.putRecipe('p2temp-abc', { agentPreset: 'standard', connectors: ['a'] })
    const text = readFileSync(store.file, 'utf8')
    expect(JSON.parse(text).bots).toBeUndefined()
    // 与 P6 前写入器的形状逐键一致（version/mainBotId/recipes，无第四键）
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['mainBotId', 'recipes', 'version'])
  })

  it('an old file without bots loads without losing mainBotId / recipes (验收 ⑤)', async () => {
    const dir = tmkdir('bot-p610-old-')
    writeFileSync(join(dir, BOTS_JSON), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: { 'p2temp-abc': { agentPreset: 'standard', connectors: ['b'] } } }))
    const store = new BotsMetaStore(dir)
    await store.init()
    const meta = store.read()
    expect(meta.mainBotId).toBe('session-main')
    expect(meta.recipes['p2temp-abc'].connectors).toEqual(['b'])
    expect(meta.bots).toBeUndefined()
  })

  it('flush failure rolls the in-memory bots back (W1 R9 口径)', async () => {
    const store = await newStore()
    const original = store.flush.bind(store)
    let failNext = false
    store.flush = async () => { if (failNext) throw new Error('disk full'); return original() }
    failNext = true
    await expect(store.putBot('session-w1', 'session-main')).rejects.toThrow(/disk full/)
    failNext = false
    expect(store.read().bots).toBeUndefined()
    rmSync(store.file, { force: true })
  })
})

// ---- createWorkerBot（⑤ 编排） ----

describe('createWorkerBot', () => {
  const opts = (dataDir: string) => ({ dataDir })
  // P6-24：worker cwd 继承主 bot 的 session header cwd（session/list 解析）。
  const mainCwd = (dataDir: string) => join(dataDir, 'workspaces', 'session-main')
  const listMain = (cwd: string) => () => ({
    ok: true as const,
    value: { items: [{ sessionId: 'session-main', cwd }] },
  })

  it('full happy path: createdBy lands before #3; cwd forced; default preset; rename (验收 ②)', async () => {
    const dataDir = tmkdir('bot-p610-create-')
    const store = await newStore()
    await store.patchMainBotId('session-main')
    const wsMain = mainCwd(dataDir)
    mkdirSync(wsMain, { recursive: true })
    const dsh = mockDsh({
      'session/list': listMain(wsMain),
      'session/create': (args) => {
        // createdBy 必须先于 #3 落盘（CONTRACT §3.1）
        const onDisk = readJson(store)
        const minted = (args as { request: { sessionId: string } }).request.sessionId
        const pre = onDisk.bots?.[minted]
        return pre === undefined
          ? { ok: false, error: { code: 'test/ordering', message: 'createdBy not on disk before session/create', details: {} } }
          : { ok: true, value: { sessionId: minted } }
      },
      'session/rename': () => ({ ok: true, value: { title: '调研员' } }),
    })
    const result = await createWorkerBot(dsh, store, { kind: 'create-bot', name: '调研员', prompt: '帮我看下X', mainBotId: 'session-main' }, opts(dataDir))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessionId).toMatch(/^session-/)
    const create = dsh.calls.find((c) => c.method === 'session/create')
    expect(create?.args).toMatchObject({ request: { sessionId: result.value.sessionId, cwd: wsMain } })
    expect((create?.args as { request: { agentPreset?: string } }).request.agentPreset).toBeUndefined()
    expect(Object.keys((create?.args as { request: Record<string, unknown> }).request).sort()).toEqual(['cwd', 'sessionId'])
    expect(dsh.calls.some((c) => c.method === 'p2temp/session.createWithConnectors')).toBe(false)
    const rename = dsh.calls.find((c) => c.method === 'session/rename')
    expect(rename?.args).toMatchObject({ request: { sessionId: result.value.sessionId, title: '调研员' } })
    expect(readJson(store).bots).toEqual({ [result.value.sessionId]: { createdBy: 'session-main' } })
    // P6-24：不再 mint 独立工作区（worker 与主 bot 共用目录，Q-024 A）
    expect(existsSync(join(dataDir, 'workspaces', result.value.sessionId))).toBe(false)
  })

  it('rejects preset / connectors / cwd fields (D9①) with zero dsh calls', async () => {
    const dataDir = tmkdir('bot-p610-rej-')
    const store = await newStore()
    await store.patchMainBotId('session-main')
    const dsh = mockDsh()
    for (const bad of [
      { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main', preset: 'standard' },
      { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main', connectors: [] },
      { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main', cwd: '/tmp' },
    ]) {
      const r = await createWorkerBot(dsh, store, bad, opts(dataDir))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('pbots/invalid-args')
    }
    expect(dsh.calls.length).toBe(0)
  })

  it('createdBy write failure → zero dsh session calls (验收 ①)', async () => {
    const dataDir = tmkdir('bot-p610-wf-')
    const store = await newStore()
    await store.patchMainBotId('session-main')
    store.putBotIfMain = async () => { throw new Error('bots.json write failed') }
    const wsMain = mainCwd(dataDir)
    mkdirSync(wsMain, { recursive: true })
    const dsh = mockDsh({ 'session/list': listMain(wsMain) })
    const r = await createWorkerBot(dsh, store, { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main' }, opts(dataDir))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('pbots/storage')
    // P6-24：workspace 解析先于 createdBy（session/list 1 次），但零会话调用
    expect(dsh.calls.filter((c) => c.method === 'session/create').length).toBe(0)
  })

  it('request mainBotId must match the authoritative one (纵深防御)', async () => {
    const dataDir = tmkdir('bot-p610-mid-')
    const store = await newStore()
    await store.patchMainBotId('session-main')
    const dsh = mockDsh()
    const r = await createWorkerBot(dsh, store, { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-impostor' }, opts(dataDir))
    expect(r).toEqual(INVALID(expect.stringContaining('mainBotId mismatch')))
    expect(dsh.calls.length).toBe(0)
  })

  it('#3 failure → pbots/orchestration-failed with upstream code and details passthrough (验收 ③)', async () => {
    const dataDir = tmkdir('bot-p610-f3-')
    const store = await newStore()
    await store.patchMainBotId('session-main')
    const wsMain = mainCwd(dataDir)
    mkdirSync(wsMain, { recursive: true })
    const dsh = mockDsh({
      'session/list': listMain(wsMain),
      'session/create': () => ({ ok: false, error: { code: 'gateway/internal', message: 'boom', details: { hint: 1 } } }),
    })
    const r = await createWorkerBot(dsh, store, { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main' }, opts(dataDir))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('pbots/orchestration-failed')
      expect(r.error.details).toMatchObject({ step: 'session/create', code: 'gateway/internal' })
      expect((r.error.details as { details?: unknown }).details).toEqual({ hint: 1 })
    }
    // 作废 ≠ 回滚：createdBy 留在盘上（CONTRACT §2.4；崩溃窗口由 deriveBots 过滤）
    expect(Object.keys(readJson(store).bots ?? {}).length).toBe(1)
  })

  it('rename failure → success with warn, exactly one create (决策 32 / 验收 ⑨)', async () => {
    const dataDir = tmkdir('bot-p610-rn-')
    const store = await newStore()
    await store.patchMainBotId('session-main')
    const wsMain = mainCwd(dataDir)
    mkdirSync(wsMain, { recursive: true })
    const dsh = mockDsh({
      'session/list': listMain(wsMain),
      'session/create': (args) => ({ ok: true, value: { sessionId: (args as { request: { sessionId: string } }).request.sessionId } }),
      'session/rename': () => ({ ok: false, error: { code: 'gateway/internal', message: 'rename refused', details: {} } }),
    })
    const r = await createWorkerBot(dsh, store, { kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main' }, opts(dataDir))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(typeof r.value.warn).toBe('string')
    expect((r.value.warn as string)).toContain('rename')
    expect(dsh.calls.filter((c) => c.method === 'session/create').length).toBe(1)
  })
})

// ---- #20 防提升（mainBotId 不得指向带 createdBy 的 bot） ----

describe('M3 patch anti-promotion (验收 ④)', () => {
  it('rejects promoting a worker bot to main', async () => {
    const dir = tmkdir('bot-p610-m3-')
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.patchMainBotId('session-main')
    await store.putBot('session-w1', 'session-main')
    const sessions = { 'session-main': true, 'session-w1': true, 'session-plain': true }
    const dsh = mockDsh({
      'session/list': () => ({ ok: true, value: { items: Object.keys(sessions).map((sessionId) => ({ sessionId })) } }),
      'agentPresets/list': () => ({ ok: true, value: { presets: [] } }),
    })
    const m3 = registerM3Meta({ dsh, store })
    const patch = (mainBotId: string) => m3.handler({ op: 'patch', mainBotId })
    const bad = await patch('session-w1')
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.code).toBe('pbots/invalid-args')
      expect(bad.error.message).toContain('worker')
    }
    const ok = await patch('session-plain')
    expect(ok.ok).toBe(true)
    store.close()
  })
})

// ---- deriveBots 防御性过滤（验收 ⑫ 正对象：worker session 不在列表 → 跳过 + 1 行日志） ----

describe('deriveBots with createdBy (验收 ⑫)', () => {
  const session = (sessionId: string): BotSessionLike => ({ sessionId, running: false, updatedAt: 1 })

  it('a bots.json worker whose session is gone (crash window / deleted) is skipped with exactly one log line', () => {
    const logs: string[] = []
    const rows = deriveBots(
      [session('session-main')],
      { mainBotId: 'session-main', recipes: {}, bots: { 'session-gone': { createdBy: 'session-main' } } },
      (m) => logs.push(m),
    )
    expect(rows.map((r) => r.id)).toEqual(['session-main'])
    expect(logs.filter((m) => m.includes('session-gone')).length).toBe(1)
  })

  it('rows carry createdBy; a worker whose creator is gone is skipped with one log line (defensive, 行为不变)', () => {
    const logs: string[] = []
    const view = {
      mainBotId: 'session-main',
      recipes: {},
      bots: { 'session-w1': { createdBy: 'session-main' }, 'session-w2': { createdBy: 'session-deleted' } },
    }
    const rows = deriveBots([session('session-main'), session('session-w1'), session('session-w2')], view, (m) => logs.push(m))
    expect(rows.map((r) => r.id)).toEqual(['session-main', 'session-w1'])
    expect(rows[1].createdBy).toBe('session-main')
    expect(rows[0].createdBy).toBeNull()
    expect(logs.filter((m) => m.includes('session-w2') && m.includes('session-deleted')).length).toBe(1)
    expect(logs.filter((m) => m.includes('session-w1')).length).toBe(0)
  })

  it('plain bots without bots meta behave exactly as before', () => {
    const rows = deriveBots([session('session-a')], { mainBotId: null, recipes: {} })
    expect(rows).toHaveLength(1)
    expect(rows[0].createdBy).toBeNull()
    expect(rows[0].mainBot).toBe(false)
  })
})
