// BotsMetaStore：原子写、单一 Promise 队列（D10e）、盘上形状（D10d）、坏文件处理。
import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { BOTS_JSON, BotsMetaStore } from '../../../main/m3-meta/store'

const tmpHome = (): string => tmkdir('bot-p4-U-13-store-')

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
    first.close() // W1 R8 单实例锁：模拟重启需先释放旧实例
    const second = new BotsMetaStore(dir)
    await second.init()
    expect(second.read()).toEqual({
      version: 1,
      mainBotId: null,
      recipes: { 'p2temp-bbbb2222': { agentPreset: 'p2-beta', connectors: ['x'] } },
    })
  })

  // P6-14.f3（VERIFY-P6-14.f2 新问题 3）：冷启动顺序——bots.json 必须先于首个
  // session 创建存在（否则 SDK envelope 判 unknown、主 bot 被收窄）。main 的 M1
  // 挂在 restore 闸门后、闸门等 init，故 init() 在 ENOENT 时立即写零 worker 骨架
  // （CONTRACT v1.5 §3.1 决策 31：无 worker 不写 bots 键）即可保证先于首会话。
  it('f3 冷启动：空目录 init() 立即落盘 {version:1,mainBotId:null,recipes:{}}（无 bots 键）；已存在文件不被改写、坏文件不被覆盖', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    const onDisk = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
    expect(onDisk).toEqual({ version: 1, mainBotId: null, recipes: {} })
    expect(Object.keys(onDisk).sort()).toEqual(['mainBotId', 'recipes', 'version'])
    // 已存在的文件：init 只读不写（字节不变）
    store.close()
    writeFileSync(join(dir, BOTS_JSON), JSON.stringify({ version: 1, mainBotId: 's-keep', recipes: {} }))
    const keep = new BotsMetaStore(dir)
    await keep.init()
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(JSON.stringify({ version: 1, mainBotId: 's-keep', recipes: {} }))
    keep.close()
    // 坏文件：init 记错、不覆盖用户数据（fail closed 交给读方，envelope 侧 unknown）
    writeFileSync(join(dir, BOTS_JSON), '{broken')
    const broken = new BotsMetaStore(dir)
    await broken.init()
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe('{broken')
    expect(() => broken.read()).toThrow()
    broken.close()
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

// P6-15（CONTRACT v1.5 §3.1，p6 决策 31）：可选 bots 键读写透传；没有 worker 不写键（上面 D10d 用例即字节不变）。
describe('BotsMetaStore · v1.5 可选 bots（createdBy）透传', () => {
  it('带 bots 的 v1 文件：读回 createdBy；patchMainBotId 写盘不抹掉它；坏项丢弃', async () => {
    const dir = tmpHome()
    writeFileSync(join(dir, BOTS_JSON), JSON.stringify({ version: 1, mainBotId: 'm', recipes: {}, bots: { w1: { createdBy: 'm' }, w2: { createdBy: '' }, w3: 7 } }))
    const store = new BotsMetaStore(dir)
    await store.init()
    expect(store.read().bots).toEqual({ w1: { createdBy: 'm' } })
    await store.patchMainBotId('m')
    expect(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')).bots).toEqual({ w1: { createdBy: 'm' } })
    store.close()
  })
  it('bots 全是坏项 → 视同没有（不写键）', async () => {
    const dir = tmpHome()
    writeFileSync(join(dir, BOTS_JSON), JSON.stringify({ version: 1, mainBotId: null, recipes: {}, bots: { w: { createdBy: 1 } } }))
    const store = new BotsMetaStore(dir)
    await store.init()
    expect('bots' in store.read()).toBe(false)
    await store.patchMainBotId('x')
    expect(Object.keys(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))).sort()).toEqual(['mainBotId', 'recipes', 'version'])
    store.close()
  })
})

describe('BotsMetaStore · removeBot（P6-24.f1 D-3-④：删除 worker 的存储 API）', () => {
  it('与 putBot 共用写队列：先删后加同 id 不丢更新，配方与主 bot 不变', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    try {
      await store.init()
      await store.patchMainBotId('m')
      await store.putRecipe('preset', { agentPreset: 'standard', connectors: ['c'] })
      await store.putBot('w', 'm')
      await Promise.all([store.removeBot('w'), store.putBot('w', 'm2')])
      const expected = { version: 1, mainBotId: 'm', recipes: { preset: { agentPreset: 'standard', connectors: ['c'] } }, bots: { w: { createdBy: 'm2' } } }
      expect(store.read()).toEqual(expected)
      expect(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))).toEqual(expected)
    } finally { store.close() }
  })

  it('删单条：其余条目保留；删到最后一条 → 省略 bots 键（决策 31）；幂等', async () => {
    const dir = tmpHome()
    writeFileSync(join(dir, BOTS_JSON), JSON.stringify({ version: 1, mainBotId: 'm', recipes: {}, bots: { w1: { createdBy: 'm' }, w2: { createdBy: 'm' } } }))
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.removeBot('w1')
    expect(store.read().bots).toEqual({ w2: { createdBy: 'm' } })
    expect(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8')).bots).toEqual({ w2: { createdBy: 'm' } })
    await store.removeBot('w2')
    expect('bots' in store.read()).toBe(false)
    expect(Object.keys(JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))).sort()).toEqual(['mainBotId', 'recipes', 'version'])
    // 幂等：不存在的条目 → 不炸、不写盘（mtime 不变）
    const before = readFileSync(join(dir, BOTS_JSON), 'utf8')
    await expect(store.removeBot('w2')).resolves.toBeUndefined()
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(before)
    store.close()
  })
})
