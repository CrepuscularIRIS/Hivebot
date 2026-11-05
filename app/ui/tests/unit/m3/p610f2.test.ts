// P6-10.f2 B-3（REVIEW-P6-10）：createWorkerBot 不得以未提交的换主内存态作
// 身份决策。BotsMetaStore 的写队列只串行写者、不隔离读者——patchMainBotId
// 失败回滚前的窗口里 store.read() 看到的是脏值。用 rename 注入门控复现窗口，
// 验收修复：putBotIfMain 在同一队列位重验，回滚后不再为失权主写入 / 建 session。
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { BotsMetaStore } from '../../../main/m3-meta/store'
import { createWorkerBot } from '../../../main/m3-meta/orchestrate'

const gates = vi.hoisted(() => ({ rename: undefined as undefined | ((...args: unknown[]) => Promise<void>) }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: async (...args: unknown[]) => {
      if (gates.rename) await gates.rename(...args)
      return (actual.rename as (...a: unknown[]) => Promise<void>)(...args)
    },
  }
})

const tick = () => new Promise((r) => setImmediate(r))
const defer = () => Promise.withResolvers<void>()

async function rig() {
  const dir = tmkdir('bot-p610f2-b3-')
  mkdirSync(join(dir, 'workspaces', 'A'), { recursive: true })
  mkdirSync(join(dir, 'workspaces', 'B'), { recursive: true })
  const store = new BotsMetaStore(dir)
  await store.init()
  await store.patchMainBotId('A')
  return { dir, store }
}
const req = (mainBotId = 'A') => ({ requestId: 'stable-request', kind: 'create-bot', name: 'worker', prompt: 'task', mainBotId })
const fakeDsh = (dir: string) => {
  const calls: Array<{ method: string, args: any }> = []
  return {
    calls,
    rpc: async (method: string, args: any) => {
      calls.push({ method, args })
      // P6-24：workspace 解析先到；A/B 都给合法布局 cwd（本测试焦点是 putBotIfMain 竞态）
      if (method === 'session/list') {
        const ids = ['A', 'B'].map((id) => ({ sessionId: id, cwd: join(dir, 'workspaces', id) }))
        return { ok: true, value: { items: ids } }
      }
      return { ok: true, value: { sessionId: args.request.sessionId } }
    },
  }
}

describe('createWorkerBot commit-time identity (P6-10.f2 B-3)', () => {
  it('a failed main patch read before commit no longer creates a worker for the rolled-back identity', async () => {
    const { dir, store } = await rig()
    await store.patchMainBotId('B')
    const delayedRequest = req('B')
    await store.patchMainBotId('A')
    const arrived = defer()
    const release = defer()
    let first = true
    gates.rename = async () => {
      if (first) {
        first = false
        arrived.resolve()
        await release.promise
        throw new Error('injected rename failure')
      }
    }
    const patch = store.patchMainBotId('B').catch((e) => e)
    await arrived.promise
    // 未提交窗口：内存 B、盘上 A（store 写队列不隔离读者）
    expect(store.read().mainBotId).toBe('B')
    expect(JSON.parse(await readFile(store.file, 'utf8')).mainBotId).toBe('A')
    const dsh = fakeDsh(dir)
    const creation = createWorkerBot(dsh as never, store, delayedRequest as never, { dataDir: dir })
    await tick()
    await new Promise((r) => setTimeout(r, 10)) // 让 mintWorkspace 完成、putBot 入队（队列序已由先入队保证）
    release.resolve()
    await patch
    const result = await creation
    gates.rename = undefined
    expect(result.ok).toBe(false)
    expect(dsh.calls.filter((x) => x.method === 'session/create')).toHaveLength(0) // 修复前 1
    const meta = store.read()
    expect(meta.mainBotId).toBe('A')
    expect(meta.bots).toBeUndefined() // 修复前：createdBy=B 的 worker 落盘
    store.close()
  })
})

describe('BotsMetaStore.putBotIfMain (P6-10.f2 B-3)', () => {
  it('writes when the queue-committed main matches and refuses (without writing) otherwise', async () => {
    const { store } = await rig()
    await store.patchMainBotId('A')
    expect(await store.putBotIfMain('session-w1', 'A')).toBe(true)
    expect(store.read().bots).toEqual({ 'session-w1': { createdBy: 'A' } })
    expect(await store.putBotIfMain('session-w2', 'X')).toBe(false)
    expect(store.read().bots).toEqual({ 'session-w1': { createdBy: 'A' } })
    expect(JSON.parse(await readFile(store.file, 'utf8')).bots).toEqual({ 'session-w1': { createdBy: 'A' } })
    store.close()
  })
})
