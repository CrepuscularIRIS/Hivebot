// P6-24 main 侧（PLAN p6-orchestration P6-24 + 决策 36 + Q-024 答复 A + panels/
// D3-r1.md 必须回应 5 条转验收）：worker 继承发起者工作区。createWorkerBot 的 cwd
// 从 mint <dataDir>/workspaces/<botId> 改为主 bot 的 session header cwd（main 侧
// 经 session/list 解析，renderer 不可传——P5-25 拒绝面不变）；可选 subdir（⑤ 通道
// 的模型参数，单段路径）新开子目录；主 bot cwd 不在 workspaces/<mainId> 下 →
// fail closed 不派（D-3 ②）；删 worker 后主 bot 目录文件清单不变（D-3 ④）。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { BOTS_JSON, BotsMetaStore, type BotsMeta } from '../../../main/m3-meta/store'
import { createWorkerBot, type DshLike } from '../../../main/m3-meta/orchestrate'

interface MockCall { method: string; args: unknown; at: number }

/** mock dsh（与 p610.test.ts 同构）：handlers[method](args) → ConnectionRpcResult。 */
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

/** session/list 应答：主 bot session-main 落在 <dataDir>/workspaces/session-main。 */
const listWithMainCwd = (cwd: string | undefined) => () => ({
  ok: true as const,
  value: { items: [{ sessionId: 'session-main', ...(cwd === undefined ? {} : { cwd }) }, { sessionId: 'session-plain', cwd: '/elsewhere/plain' }] },
})

const createOk = (args: unknown) => ({ ok: true as const, value: { sessionId: (args as { request: { sessionId: string } }).request.sessionId } })
const renameOk = () => ({ ok: true as const, value: { title: 'w' } })

async function newMainStore(): Promise<{ store: BotsMetaStore; dataDir: string }> {
  const dataDir = tmkdir('bot-p624-store-')
  const store = new BotsMetaStore(dataDir)
  await store.init()
  await store.patchMainBotId('session-main')
  return { store, dataDir }
}

const REQ = (over: Record<string, unknown> = {}) =>
  ({ kind: 'create-bot', name: 'w', prompt: 'p', mainBotId: 'session-main', ...over }) as Parameters<typeof createWorkerBot>[2]

describe('P6-24 createWorkerBot: worker 继承发起者工作区（决策 36 / Q-024 A）', () => {
  it('① 无 subdir：worker cwd === 主 bot header.cwd；不再 mint workspaces/<workerId>', async () => {
    const { store, dataDir } = await newMainStore()
    const mainCwd = join(dataDir, 'workspaces', 'session-main')
    mkdirSync(mainCwd, { recursive: true })
    const dsh = mockDsh({ 'session/list': listWithMainCwd(mainCwd), 'session/create': createOk, 'session/rename': renameOk })
    const r = await createWorkerBot(dsh, store, REQ(), { dataDir })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const create = dsh.calls.find((c) => c.method === 'session/create')
    expect(create?.args).toMatchObject({ request: { sessionId: r.value.sessionId, cwd: mainCwd } })
    expect((create?.args as { request: Record<string, unknown> }).request).toHaveProperty('cwd', mainCwd)
    // 不 mint 独立工作区（Q-024 A：worker 与主 bot 共用目录）
    expect(existsSync(join(dataDir, 'workspaces', r.value.sessionId))).toBe(false)
    store.close()
  })

  it('①′ 有 subdir：cwd = 主 bot cwd/<subdir>，子目录建好；session/create 恰一次', async () => {
    const { store, dataDir } = await newMainStore()
    const mainCwd = join(dataDir, 'workspaces', 'session-main')
    mkdirSync(mainCwd, { recursive: true })
    const dsh = mockDsh({ 'session/list': listWithMainCwd(mainCwd), 'session/create': createOk, 'session/rename': renameOk })
    const r = await createWorkerBot(dsh, store, REQ({ subdir: ' scrape-out ' }), { dataDir })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sub = join(mainCwd, 'scrape-out')
    expect(existsSync(sub)).toBe(true)
    expect(statSync(sub).isDirectory()).toBe(true)
    const create = dsh.calls.find((c) => c.method === 'session/create')
    expect(create?.args).toMatchObject({ request: { cwd: sub } })
    expect(dsh.calls.filter((c) => c.method === 'session/create').length).toBe(1)
    store.close()
  })

  it('①″ subdir 只认单段路径：含分隔符 / ".." / "." / 非字符串 → invalid-args，0 次 dsh 调用', async () => {
    const { store, dataDir } = await newMainStore()
    const dsh = mockDsh({ 'session/list': listWithMainCwd('/x'), 'session/create': createOk })
    for (const bad of ['a/b', 'a\\b', '..', '.', '', '  ', 5]) {
      const r = await createWorkerBot(dsh, store, REQ({ subdir: bad }), { dataDir })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('pbots/invalid-args')
    }
    expect(dsh.calls.length).toBe(0)
    store.close()
  })

  it('② D-3-② fail closed：主 bot cwd 在 workspaces/<mainId> 之外（旧 bot / 仓库目录）→ orchestration-failed，不建会话不落 createdBy', async () => {
    for (const bad of ['/home/u/repo', '/opt/sdk', '/home/u/.config/pbots-ui']) {
      const { store, dataDir } = await newMainStore()
      const dsh = mockDsh({ 'session/list': listWithMainCwd(bad), 'session/create': createOk, 'session/rename': renameOk })
      const r = await createWorkerBot(dsh, store, REQ(), { dataDir })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.code).toBe('pbots/orchestration-failed')
        expect(r.error.message).toContain('fail closed')
      }
      expect(dsh.calls.some((c) => c.method === 'session/create')).toBe(false)
      expect(dsh.calls.filter((c) => c.method === 'session/list').length).toBe(1)
      const onDisk = JSON.parse(readFileSync(join(dataDir, BOTS_JSON), 'utf8')) as BotsMeta
      expect(onDisk.bots).toBeUndefined()
      store.close()
    }
  })

  it('②′ 主 bot cwd 指向别的 bot 的工作区（workspaces/<other>）→ 同样 fail closed', async () => {
    const { store, dataDir } = await newMainStore()
    const dsh = mockDsh({ 'session/list': listWithMainCwd(join(dataDir, 'workspaces', 'session-plain')), 'session/create': createOk })
    const r = await createWorkerBot(dsh, store, REQ(), { dataDir })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('pbots/orchestration-failed')
    expect(dsh.calls.some((c) => c.method === 'session/create')).toBe(false)
    store.close()
  })

  it('③ 主 bot cwd 不可解析：不在 session/list / cwd 缺失 / session/list 失败 → orchestration-failed（不回退到 mint）', async () => {
    for (const listHandler of [
      () => ({ ok: true as const, value: { items: [{ sessionId: 'session-plain', cwd: '/x' }] } }), // 主 bot 不在列表
      listWithMainCwd(undefined), // cwd 缺失（旧会话）
      () => ({ ok: false as const, error: { code: 'gateway/internal', message: 'boom', details: {} } }), // RPC 失败
    ]) {
      const { store, dataDir } = await newMainStore()
      const dsh = mockDsh({ 'session/list': listHandler, 'session/create': createOk })
      const r = await createWorkerBot(dsh, store, REQ(), { dataDir })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('pbots/orchestration-failed')
      expect(dsh.calls.some((c) => c.method === 'session/create')).toBe(false)
      store.close()
    }
  })

  it('③′ 主 bot cwd 是 workspaces/<mainId> 的子目录 → 放行（布局核对的包含语义）', async () => {
    const { store, dataDir } = await newMainStore()
    const mainCwd = join(dataDir, 'workspaces', 'session-main', 'inner')
    mkdirSync(mainCwd, { recursive: true })
    const dsh = mockDsh({ 'session/list': listWithMainCwd(mainCwd), 'session/create': createOk, 'session/rename': renameOk })
    const r = await createWorkerBot(dsh, store, REQ(), { dataDir })
    expect(r.ok).toBe(true)
    store.close()
  })

  it('④ D-3-④ 删除 worker（bots.json 移除条目）后主 bot 目录文件清单不变；worker 从未拥有独立目录', async () => {
    const { store, dataDir } = await newMainStore()
    const mainCwd = join(dataDir, 'workspaces', 'session-main')
    mkdirSync(mainCwd, { recursive: true })
    writeFileSync(join(mainCwd, 'user-notes.md'), '用户文件')
    const dsh = mockDsh({ 'session/list': listWithMainCwd(mainCwd), 'session/create': createOk, 'session/rename': renameOk })
    const r = await createWorkerBot(dsh, store, REQ(), { dataDir })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const workerId = r.value.sessionId
    // worker 干活：两个文件落进共用目录（bash 与 write 双通道的宿主侧效果）
    writeFileSync(join(mainCwd, 'bash-note.txt'), 'from bash')
    writeFileSync(join(mainCwd, 'write-note.txt'), 'from write')
    const inventory = (dir: string): Array<[string, string]> => {
      const out: Array<[string, string]> = []
      const walk = (d: string, rel: string): void => {
        for (const name of readdirSync(d).sort()) {
          const p = join(d, name)
          const r2 = join(rel, name)
          if (statSync(p).isDirectory()) walk(p, r2)
          else out.push([r2, readFileSync(p, 'utf8')])
        }
      }
      walk(dir, '')
      return out
    }
    const before = inventory(mainCwd)
    // 「删除 worker」：bots.json 去掉条目（本仓无 session 删除面；worker 生命周期不触碰共享目录）
    store.close()
    const meta = JSON.parse(readFileSync(join(dataDir, BOTS_JSON), 'utf8')) as BotsMeta
    delete meta.bots?.[workerId]
    writeFileSync(join(dataDir, BOTS_JSON), JSON.stringify(meta))
    const after = inventory(mainCwd)
    expect(after).toEqual(before)
    expect(existsSync(join(dataDir, 'workspaces', workerId))).toBe(false)
  })
})
