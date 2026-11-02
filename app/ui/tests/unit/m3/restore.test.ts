// 恢复编排（U-14 语义先内建）：逐个 preset.ensure、30s 超时按失败、allSettled、
// 失败标 live=false 不写盘、不删被共用的 recipe（CONTRACT §8-1 / D7 / D10c 语义）。
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BOTS_JSON, BotsMetaStore } from '../../../main/m3-meta/store'
import { RESTORE_ENSURE_TIMEOUT_MS, restoreRecipes, type DshLike } from '../../../main/m3-meta/restore'

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'bot-p4-U-13-restore-'))

function mockDsh(handlers: Record<string, (args: unknown) => unknown>): DshLike & { calls: { method: string; args: unknown }[] } {
  const calls: { method: string; args: unknown }[] = []
  return {
    calls,
    async rpc(method: string, args: unknown) {
      calls.push({ method, args })
      const handler = handlers[method]
      if (handler === undefined) return { ok: false, error: { code: 'gateway/internal', message: `no mock for ${method}`, details: {} } }
      return handler(args) as never
    },
  }
}

const R_GOOD = 'p2temp-good00001'
const R_HANG = 'p2temp-hang00001'

async function storeWith(dir: string, recipes: Record<string, { agentPreset: string; connectors: string[] }>): Promise<BotsMetaStore> {
  const store = new BotsMetaStore(dir)
  await store.init()
  for (const [id, recipe] of Object.entries(recipes)) await store.putRecipe(id, recipe)
  return store
}

describe('restoreRecipes', () => {
  it('常量：默认 ensure 超时 30s（U-14 接 ready 闸门用同一常量）', () => {
    expect(RESTORE_ENSURE_TIMEOUT_MS).toBe(30_000)
  })

  it('逐个 ensure（参数 = recipe 的显式 agentPreset + connectors）；allSettled：一个挂起按超时失败，不抛、不写盘', async () => {
    const dir = tmpHome()
    const store = await storeWith(dir, {
      [R_GOOD]: { agentPreset: 'p2-alpha', connectors: ['a'] },
      [R_HANG]: { agentPreset: 'p2-beta', connectors: ['b'] },
    })
    const before = readFileSync(join(dir, BOTS_JSON), 'utf8')
    const dsh = mockDsh({
      'p2temp/preset.ensure': (args) => {
        const { agentPreset } = (args as { request: { agentPreset: string } }).request
        if (agentPreset === 'p2-beta') return new Promise(() => {}) as never
        return { ok: true, value: { presetId: R_GOOD } }
      },
    })
    const failed = new Set<string>()
    const outcomes = await restoreRecipes(dsh, store, { timeoutMs: 80, failed })
    expect(outcomes.length).toBe(2)
    expect(outcomes.find((o) => o.presetId === R_GOOD)?.ok).toBe(true)
    expect(outcomes.find((o) => o.presetId === R_HANG)?.ok).toBe(false)
    expect([...failed]).toEqual([R_HANG])
    // 不写盘：字节不变（失败不落 live=false，也不删）
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(before)
    expect(dsh.calls.map((c) => c.method)).toEqual(['p2temp/preset.ensure', 'p2temp/preset.ensure'])
    // typert wire 壳（U-14 对真 runtime 实测：无壳被 gateway 拒 arguments-invalid）
    expect(dsh.calls.map((c) => c.args)).toEqual([
      { request: { agentPreset: 'p2-alpha', connectors: ['a'] } }, // typert wire {request:…} 壳（U-14/U-15 各自真链路实测）
      { request: { agentPreset: 'p2-beta', connectors: ['b'] } },
    ])
  })

  it('失败创建留下的孤儿 recipe（#4 曾失败）：ensure !ok → live=false；其他 bot 仍可用（§8-1）', async () => {
    const dir = tmpHome()
    const store = await storeWith(dir, {
      [R_GOOD]: { agentPreset: 'p2-alpha', connectors: ['a'] },
      'p2temp-orphan001': { agentPreset: 'p2-alpha', connectors: ['gone'] },
    })
    const dsh = mockDsh({
      'p2temp/preset.ensure': (args) => {
        const { connectors } = (args as { request: { connectors: string[] } }).request
        if (connectors.includes('gone')) {
          return { ok: false, error: { code: 'p2temp/connector-unavailable', message: 'not installed', details: { connector: 'gone' } } }
        }
        return { ok: true, value: { presetId: R_GOOD } }
      },
    })
    const failed = new Set<string>()
    const outcomes = await restoreRecipes(dsh, store, { failed })
    expect(outcomes.find((o) => o.presetId === R_GOOD)?.ok).toBe(true)
    expect(outcomes.find((o) => o.presetId === 'p2temp-orphan001')?.ok).toBe(false)
    expect([...failed].sort()).toEqual(['p2temp-orphan001'])
  })

  it('ensure 失败不删被两个 session 共用的 recipe（D7）', async () => {
    const dir = tmpHome()
    const store = await storeWith(dir, {
      [R_GOOD]: { agentPreset: 'p2-alpha', connectors: ['shared'] },
    })
    const before = readFileSync(join(dir, BOTS_JSON), 'utf8')
    const dsh = mockDsh({
      'p2temp/preset.ensure': () => ({ ok: false, error: { code: 'p2temp/connector-unavailable', message: 'not installed', details: {} } }),
    })
    await restoreRecipes(dsh, store, { failed: new Set() })
    // 共用（两个 session 的 header 都指向 R_GOOD）与否都一样：失败的 recipe 原样留在盘上
    expect(readFileSync(join(dir, BOTS_JSON), 'utf8')).toBe(before)
  })

  it('默认超时 = RESTORE_ENSURE_TIMEOUT_MS：不传 timeoutMs 时按常量起 race', async () => {
    vi.useFakeTimers()
    try {
      const dir = tmpHome()
      const store = await storeWith(dir, { [R_HANG]: { agentPreset: 'p2-beta', connectors: ['b'] } })
      const dsh = mockDsh({ 'p2temp/preset.ensure': () => new Promise(() => {}) as never })
      const outcomesPromise = restoreRecipes(dsh, store, { failed: new Set() })
      const tick = vi.advanceTimersByTimeAsync(RESTORE_ENSURE_TIMEOUT_MS - 1)
      const raced = await Promise.race([outcomesPromise.then(() => 'settled'), tick.then(() => 'not-yet')])
      expect(raced).toBe('not-yet')
      await vi.advanceTimersByTimeAsync(1)
      const outcomes = await outcomesPromise
      expect(outcomes[0].ok).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
