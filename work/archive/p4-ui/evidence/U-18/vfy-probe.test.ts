// U-18 验收坏路径探针（verifier 自建，不属交付）：
// ① 真 fs 无 mock：目录只读 → putRecipe 真实 EACCES → 回滚 + 磁盘原样 + 队列不毒化
// ② 锁 key 用 resolve()：同目录不同写法（尾斜杠 / 相对路径）也要锁得住
import { describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { BOTS_JSON, BotsMetaStore } from '../../../main/m3-meta/store'

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'bot-p4-U-18-vfy-'))

describe('vfy 探针 · 真 fs flush 失败（无 mock）', () => {
  it('目录只读 → putRecipe 真实 EACCES：内存回滚、磁盘原样、无 tmp、后续可恢复', async () => {
    const dir = tmpHome()
    const store = new BotsMetaStore(dir)
    await store.init()
    await store.putRecipe('good', { agentPreset: 'p2-alpha', connectors: ['a'] })
    const goodOnDisk = readFileSync(join(dir, BOTS_JSON), 'utf8')

    chmodSync(dir, 0o555) // 去掉写位：writeFile(tmp) 真实失败
    let err: unknown
    try {
      await store.putRecipe('bad', { agentPreset: 'p2-beta', connectors: ['b'] })
    } catch (e) { err = e }
    chmodSync(dir, 0o755)

    expect((err as NodeJS.ErrnoException).code).toBe('EACCES')
    expect(store.read().recipes).toEqual({ good: { agentPreset: 'p2-alpha', connectors: ['a'] } })
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(goodOnDisk)
    expect(existsSync(join(dir, `${BOTS_JSON}.tmp`))).toBe(false)

    // 权限恢复后同一实例继续提交成功（队列未毒化，失败操作没混进去）
    await store.putRecipe('after', { agentPreset: 'p2-gamma', connectors: ['c'] })
    const onDisk = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
    expect(Object.keys(onDisk.recipes).sort()).toEqual(['after', 'good'])
    store.close()
  })
})

describe('vfy 探针 · 锁 key 归一化', () => {
  it('同目录不同写法（尾斜杠、相对路径）也触发 PBOTS_STORE_LOCKED', () => {
    const dir = tmpHome()
    const first = new BotsMetaStore(dir)
    try {
      expect(() => new BotsMetaStore(`${dir}/`)).toThrowError(
        expect.objectContaining({ code: 'PBOTS_STORE_LOCKED' }),
      )
      expect(() => new BotsMetaStore(join('.', relative(process.cwd(), dir)))).toThrowError(
        expect.objectContaining({ code: 'PBOTS_STORE_LOCKED' }),
      )
    } finally {
      first.close()
    }
    // 释放后同目录可重建
    const second = new BotsMetaStore(`${dir}/`)
    second.close()
  })
})
