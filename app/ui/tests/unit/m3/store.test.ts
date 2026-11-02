// BotsMetaStore：原子写、单一 Promise 队列（D10e）、盘上形状（D10d）、坏文件处理。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BOTS_JSON, BotsMetaStore } from '../../../main/m3-meta/store'

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'bot-p4-U-13-store-'))

describe('BotsMetaStore · D10d 盘上形状', () => {
  it('v1 不含 bots 字段；recipes 按 presetId 存 {agentPreset, connectors}', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.putRecipe('p2temp-aaaa1111', { agentPreset: 'p2-alpha', connectors: ['a', 'b'] })
    await store.patchMainBotId('s-1')
    const onDisk = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
    expect(Object.keys(onDisk).sort()).toEqual(['mainBotId', 'recipes', 'version'])
    expect(onDisk).toEqual({
      version: 1,
      mainBotId: 's-1',
      recipes: { 'p2temp-aaaa1111': { agentPreset: 'p2-alpha', connectors: ['a', 'b'] } },
    })
  })

  it('重启（新实例 init）读回同样的 recipes 与 mainBotId', async () => {
    const dir = tmpHome()
    const first = new BotsMetaStore(dir)
    await first.init()
    await first.putRecipe('p2temp-bbbb2222', { agentPreset: 'p2-beta', connectors: ['x'] })
    const second = new BotsMetaStore(dir)
    await second.init()
    expect(second.read()).toEqual({
      version: 1,
      mainBotId: null,
      recipes: { 'p2temp-bbbb2222': { agentPreset: 'p2-beta', connectors: ['x'] } },
    })
  })
})

describe('BotsMetaStore · D10e 单一 Promise 队列', () => {
  it('50 个并发 recipe 写与 patch 全部落盘、无丢更新', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const jobs: Promise<void>[] = []
    for (let i = 0; i < 30; i += 1) {
      jobs.push(store.putRecipe(`p2temp-id${String(i).padStart(2, '0')}`, { agentPreset: 'p2-alpha', connectors: [`c${i}`] }))
    }
    for (let i = 0; i < 20; i += 1) {
      jobs.push(store.patchMainBotId(`s-${i}`))
    }
    await Promise.all(jobs)
    const onDisk = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
    expect(Object.keys(onDisk.recipes).sort()).toEqual(
      Array.from({ length: 30 }, (_, i) => `p2temp-id${String(i).padStart(2, '0')}`).sort(),
    )
    // 队列按入队序串行：最后一个 patch 是 s-19
    expect(onDisk.mainBotId).toBe('s-19')
  })

  it('原子写：写入完成后无残留 tmp 文件', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.putRecipe('p2temp-x', { agentPreset: 'p2-alpha', connectors: ['a'] })
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(JSON.stringify(store.read()))
    let tmpLeft = false
    try {
      readFileSync(join(dir, `${BOTS_JSON}.tmp`))
      tmpLeft = true
    } catch {
      // 期望：tmp 已被 rename 消费
    }
    expect(tmpLeft).toBe(false)
  })

  it('同 key 同值重复写幂等；不同值覆盖为最后一次（队列序）', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await Promise.all([
      store.putRecipe('p2temp-same', { agentPreset: 'p2-alpha', connectors: ['a'] }),
      store.putRecipe('p2temp-same', { agentPreset: 'p2-alpha', connectors: ['a'] }),
      store.putRecipe('p2temp-same', { agentPreset: 'p2-beta', connectors: ['a'] }),
    ])
    expect(store.read().recipes['p2temp-same']).toEqual({ agentPreset: 'p2-beta', connectors: ['a'] })
  })
})

describe('BotsMetaStore · 坏文件', () => {
  it('坏 JSON：init 不抛，read() 抛错（不静默重置丢数据）', async () => {
    const dir = tmpHome()
    writeFileSync(join(dir, BOTS_JSON), '{oops', 'utf8')
    const store = new BotsMetaStore(dir)
    await store.init()
    expect(() => store.read()).toThrow()
  })

  it('version 2 的文件同样被拒', async () => {
    const dir = tmpHome()
    writeFileSync(join(dir, BOTS_JSON), JSON.stringify({ version: 2, mainBotId: null, recipes: {} }), 'utf8')
    const store = new BotsMetaStore(dir)
    await store.init()
    expect(() => store.read()).toThrow()
  })
})
