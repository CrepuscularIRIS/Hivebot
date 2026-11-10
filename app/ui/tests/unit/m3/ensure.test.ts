// U-14 ①②③：ensure 接通 + ready 闸门。真调用 = 直接 import app/sdk/src/p2temp/index.mjs
// 的 P2TempService，用最小 fake ctx 驱动真 presetEnsure（生产渠道是 main 内部经 dsh rpc
// 触达同一实现，CONTRACT #21；单测此处按「直接 import」驱动同一代码路径）。
// fake ctx / fixture profile 来源: app/sdk/tests/unit/p2temp.proc.mjs:19-27,39-93,96-107
// （改动：TS 化 + hangRegisterFor 注入「注册永不返回」）。
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { BotsMetaStore } from '../../../main/m3-meta/store'
import { ensureThenReady, restoreGated } from '../../../main/m3-meta/ensure'
import { createReadyGate } from '../../../main/ready'
import { presetIdOf } from '../../../main/m3-meta/preset-id'
import type { DshLike } from '../../../main/m3-meta/orchestrate'

const SDK_P2TEMP = fileURLToPath(new URL('../../../../sdk/src/p2temp/index.mjs', import.meta.url))
// 真 entryListProblem（同 p2temp/index.mjs 的 createRequire 锚点）：手写替身曾与真实激活
// 规则漂移过（REVIEW-P2最终收尾 R4），一律用真实现。
const registryRequire = createRequire(
  realpathSync(fileURLToPath(new URL('../../../../sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url))),
)
const { default: P2TempService } = (await import(pathToFileURL(SDK_P2TEMP).href)) as {
  default: new (ctx: unknown, config: unknown) => { presetEnsure(request: unknown): Promise<{ presetId: string }> }
}
const { entryListProblem } = (await import(
  pathToFileURL(registryRequire.resolve('@deepseek-ai/dsh-agent-preset-registry'))
)) as { entryListProblem(rows: Array<{ id?: string; name?: string }>): string | undefined }

/** 最小 cordis stand-in（p2temp.proc.mjs:39-93）；hangRegisterFor 命中的注册永不返回。 */
function fakeCtx(profileDir: string, opts: { hangRegisterFor?: string } = {}) {
  const definitions = new Map<string, unknown>([['standard', { config: { plugins: [{ id: 'persona', name: 'persona-pkg' }] } }]])
  const ctx = {
    reflect: { provide() {} },
    get: (key: string) => (key === 'profileContext' ? { dir: profileDir } : undefined),
    agentPresets: {
      definitions,
      register: async (preset: { id: string; plugins: unknown[] }) => {
        if (preset.id === opts.hangRegisterFor) return new Promise(() => {})
        const record: { config: unknown; ready: Promise<void>; broken?: string } = { config: preset, ready: Promise.resolve() }
        definitions.set(preset.id, record)
        const problem = entryListProblem(preset.plugins as [])
        if (problem !== undefined) record.broken = problem
        return async () => { definitions.delete(preset.id) }
      },
    },
    sessionController: { create: async () => ({ sessionId: 'sid' }) },
  }
  return { ctx, definitions }
}

/** rpc → 真 presetEnsure 适配器（#21 在生产经 dsh rpc 到达同一方法；此处剥掉
 * typert wire 的 {request} 壳 —— 与 gateway 剥壳同构，restoreRecipes 的调用带壳）。 */
function serviceDsh(ctx: unknown): DshLike {
  const service = new P2TempService(ctx, {})
  return {
    async rpc(method: string, args: unknown) {
      if (method !== 'p2temp/preset.ensure') {
        return { ok: false, error: { code: 'gateway/internal', message: `no route for ${method}` } }
      }
      try {
        return { ok: true, value: await service.presetEnsure((args as { request?: unknown }).request) }
      } catch (error) {
        const e = error as { code?: string; message?: string }
        return { ok: false, error: { code: e.code ?? 'p2temp/failed', message: e.message ?? String(error) } }
      }
    },
  }
}

/** 已安装连接器 fixture（p2temp.proc.mjs:96-107 同构：package.json + JSON patch）。 */
function fixtureProfile(bundles: string[]): string {
  const profile = tmkdir('bot-U-14-profile-')
  for (const bundle of bundles) {
    const dir = join(profile, 'node_modules', bundle)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: bundle, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: `u14-${bundle}`, name: `${bundle}-pkg` }] }]))
  }
  return profile
}

const delay = (ms: number): Promise<'shut'> => new Promise((r) => setTimeout(() => r('shut'), ms))
const race = <T>(p: Promise<T>, ms: number): Promise<T | 'shut'> => Promise.race([p, delay(ms)])

async function storeWithRecipes(recipes: Record<string, { agentPreset: string; connectors: string[] }>): Promise<BotsMetaStore> {
  const store = new BotsMetaStore(tmkdir('bot-U-14-data-'))
  await store.init()
  for (const [id, recipe] of Object.entries(recipes)) await store.putRecipe(id, recipe)
  return store
}

describe('ensureThenReady（U-14 启动恢复屏障）', () => {
  it('③ 真 presetEnsure 永不返回：超时按失败，gate 超时前不开（M1/M2 挂起）、超时后开；其余 bot 可用', async () => {
    const good = presetIdOf('standard', ['bot-u-14-demo'])
    const hang = presetIdOf('standard', ['bot-u-14-hang'])
    // hang 的连接器也要已安装：挂起点在 register（读 patch 之后），未装会快失败而不是挂起
    const { ctx, definitions } = fakeCtx(fixtureProfile(['bot-u-14-demo', 'bot-u-14-hang']), { hangRegisterFor: hang })
    const dsh = serviceDsh(ctx)
    const store = await storeWithRecipes({
      [good]: { agentPreset: 'standard', connectors: ['bot-u-14-demo'] },
      [hang]: { agentPreset: 'standard', connectors: ['bot-u-14-hang'] },
    })

    const gate = createReadyGate({ dshConfigured: true })
    gate.setWindowReady()
    gate.setDshReady()
    const failed = new Set<string>()
    const gatedList = restoreGated(gate, (x: string) => `ran:${x}`)
    const m1Call = gatedList('a') // restore settle 前发起（M1/M2 不就绪的桥级观察）

    const outcomesP = ensureThenReady({ dsh, store, failed, ready: gate, timeoutMs: 120 })
    expect(await race(gate.wait(), 40), '超时前 gate 不开').toBe('shut')
    expect(await race(m1Call.then(() => 'ran'), 40), '超时前 M1 调用挂起').toBe('shut')

    const outcomes = await outcomesP
    await gate.wait()
    expect(await m1Call, '超时 settle 后 M1 放行').toBe('ran:a')
    expect(outcomes.find((o) => o.presetId === good)?.ok).toBe(true)
    expect(outcomes.find((o) => o.presetId === hang)?.ok).toBe(false)
    expect([...failed]).toEqual([hang])
    expect(gate.status().failedPresets).toEqual([hang])
    expect(definitions.has(good), '真注册：good 的内容定 id 进了 registry（live 数据源）').toBe(true)
    expect(definitions.has(hang), '挂起的不落 registry').toBe(false)
  })

  it('坏 bots.json（读盘失败）：ensureThenReady 不抛、outcomes 为空、gate 照常开（§8-1 不毒化启动）', async () => {
    const dir = tmkdir('bot-U-14-bad-')
    writeFileSync(join(dir, 'bots.json'), '{oops')
    const store = new BotsMetaStore(dir)
    await store.init()
    const gate = createReadyGate({ dshConfigured: true })
    gate.setWindowReady()
    gate.setDshReady()
    const dsh = serviceDsh(fakeCtx(fixtureProfile(['bot-u-14-demo'])).ctx)
    const outcomes = await ensureThenReady({ dsh, store, failed: new Set(), ready: gate })
    expect(outcomes).toEqual([])
    await gate.wait()
  })
})

describe('restoreGated（M1/M2 入口包装）', () => {
  it('restore settle 前挂起、settle 后按序执行；多参透传', async () => {
    const gate = createReadyGate({ dshConfigured: true })
    const calls: string[] = []
    const fn = restoreGated(gate, (a: string, b: number) => { calls.push(`${a}:${b}`); return b * 2 })
    const p = fn('x', 21)
    expect(await race(p, 20)).toBe('shut')
    gate.setRestoreSettled([])
    expect(await p).toBe(42)
    expect(calls).toEqual(['x:21'])
  })

  it('只挂 restore 不挂 dsh：dsh 起不来但 restore 已 settle → 放行（M2 自带 10s 端口超时，U-12 语义不破）', async () => {
    const gate = createReadyGate({ dshConfigured: true })
    gate.setWindowReady()
    gate.setRestoreSettled([]) // dsh start 失败分支也 settle（main/index.ts 接线）
    expect(gate.status().dsh).toBe(false) // 整 gate 未开
    const fn = restoreGated(gate, () => 'ran')
    await expect(fn()).resolves.toBe('ran')
  })

  it('未配置 dsh：restore 为 null，立即放行（U-00 行为）', async () => {
    const gate = createReadyGate({ dshConfigured: false })
    const fn = restoreGated(gate, () => 'ran')
    await expect(fn()).resolves.toBe('ran')
  })
})
