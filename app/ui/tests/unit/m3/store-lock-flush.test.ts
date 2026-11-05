// W1 R8+R9：单实例锁（同 dataDir 第二实例构造即抛）与 flush 失败回滚
// （rename 失败时内存态与磁盘一致，不留半写、不丢先前好状态）。
// rename 用 vi.mock 部分替换（默认仍 passthrough 真实现），其余 fs 原样。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rename } from 'node:fs/promises'
import { tmkdir } from '../../support/tmp-sweep.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  // vitest 5.0.5 teardown 会以零参调用本 mock 一次：透传需容忍，否则真 rename 对
  // undefined 抛 TypeError，污染已通过的测试结果（builder 探针实证）。
  const passthrough = (...args: unknown[]) =>
    args.length >= 2 ? (actual.rename as (...a: unknown[]) => Promise<void>)(...args) : Promise.resolve()
  return { ...actual, rename: vi.fn(passthrough) }
})

const { BOTS_JSON, BotsMetaStore } = await import('../../../main/m3-meta/store')

const tmpHome = (): string => tmkdir('bot-p4-U-18-store-')
const mockedRename = vi.mocked(rename)

beforeEach(() => mockedRename.mockClear())

describe('BotsMetaStore · 单实例锁（W1 R8）', () => {
  it('同 dataDir 第二个实例构造即抛结构化错（code=PBOTS_STORE_LOCKED）', () => {
    const dir = tmpHome()
    const first = new BotsMetaStore(dir)
    try {
      expect(() => new BotsMetaStore(dir)).toThrowError(
        expect.objectContaining({ code: 'PBOTS_STORE_LOCKED' }),
      )
    } finally {
      first.close()
    }
  })

  it('close() 释放锁后可重建；不同 dataDir 互不干扰', () => {
    const dirA = tmpHome()
    const first = new BotsMetaStore(dirA)
    first.close()
    expect(() => {
      const second = new BotsMetaStore(dirA)
      second.close()
    }).not.toThrow()
    const other = new BotsMetaStore(tmpHome())
    other.close()
  })
})

describe('BotsMetaStore · flush 失败回滚（W1 R9）', () => {
  it('putRecipe 的 rename 失败：内存回滚、磁盘保留先前好状态、无半写 tmp，后续成功提交不带失败操作', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.putRecipe('p2temp-good', { agentPreset: 'p2-alpha', connectors: ['a'] })
    const goodOnDisk = readFileSync(join(dir, BOTS_JSON), 'utf8')

    mockedRename.mockRejectedValueOnce(Object.assign(new Error('simulated rename failure'), { code: 'EACCES' }))
    await expect(
      store.putRecipe('p2temp-bad', { agentPreset: 'p2-beta', connectors: ['b'] }),
    ).rejects.toThrow('simulated rename failure')

    // 内存态回滚：失败 recipe 不在、先前好 recipe 还在
    expect(store.read().recipes).toEqual({ 'p2temp-good': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    // 磁盘 = 先前好状态，且无半写 tmp 残留
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(goodOnDisk)
    expect(existsSync(join(dir, `${BOTS_JSON}.tmp`))).toBe(false)
    // 后续成功提交序列化整个内存态，不把失败操作落盘
    await store.patchMainBotId('s-1')
    const onDisk = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
    expect(onDisk.recipes).toEqual({ 'p2temp-good': { agentPreset: 'p2-alpha', connectors: ['a'] } })
    expect(onDisk.mainBotId).toBe('s-1')
    store.close()
  })

  it('patchMainBotId 的 rename 失败：mainBotId 回滚到旧值，磁盘不变', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.patchMainBotId('s-old')
    const goodOnDisk = readFileSync(join(dir, BOTS_JSON), 'utf8')

    mockedRename.mockRejectedValueOnce(new Error('simulated rename failure'))
    await expect(store.patchMainBotId('s-new')).rejects.toThrow('simulated rename failure')

    expect(store.read().mainBotId).toBe('s-old')
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(goodOnDisk)
    store.close()
  })

  it('removeBot 的 rename 失败（P6-24.f1）：条目回滚，磁盘保留先前好状态', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.putBot('w1', 'm')
    await store.putBot('w2', 'm')
    const goodOnDisk = readFileSync(join(dir, BOTS_JSON), 'utf8')

    mockedRename.mockRejectedValueOnce(new Error('simulated rename failure'))
    await expect(store.removeBot('w1')).rejects.toThrow('simulated rename failure')

    // 内存回滚：两条 worker 都还在；后续成功提交不带失败的删除
    expect(store.read().bots).toEqual({ w1: { createdBy: 'm' }, w2: { createdBy: 'm' } })
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(goodOnDisk)
    await store.removeBot('w1')
    expect(store.read().bots).toEqual({ w2: { createdBy: 'm' } })
    store.close()
  })
})
