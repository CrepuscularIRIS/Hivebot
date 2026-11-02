// 恢复编排（U-13 内建 U-14 语义；U-14 再接 ready.ts 闸门）：启动时按 recipes 逐个
// preset.ensure（CONTRACT #21，main 内部渠道 = dsh rpc，不进 M1 白名单），每个套
// 超时（默认 30s，超时按失败），Promise.allSettled；失败标 live=false（内存 failed
// set，不写盘、不删 recipe——§8-1 单配方失败不阻断其他 bot）。
import type { DshLike } from './orchestrate'
import type { BotsMetaStore } from './store'

/** 单个 preset.ensure 的默认超时（U-14 接 ready 闸门时引用同一常量）。 */
export const RESTORE_ENSURE_TIMEOUT_MS = 30_000

export interface RestoreOutcome {
  presetId: string
  ok: boolean
}

export interface RestoreOptions {
  /** 单个 ensure 的超时（默认 RESTORE_ENSURE_TIMEOUT_MS；测试注入小值）。 */
  timeoutMs?: number
  /** 失败集合（registerM3Meta 持有的同一实例：get 的 live 计算并入）。 */
  failed?: Set<string>
}

/** 按 store 里的 recipes 逐个幂等 ensure；全部 settle 后返回逐条结果。 */
export async function restoreRecipes(
  dsh: DshLike,
  store: BotsMetaStore,
  opts: RestoreOptions = {},
): Promise<RestoreOutcome[]> {
  const timeoutMs = opts.timeoutMs ?? RESTORE_ENSURE_TIMEOUT_MS
  const entries = Object.entries(store.read().recipes)
  const settled = await Promise.allSettled(
    entries.map(async ([presetId, recipe]) => {
      const result = await Promise.race([
        dsh.rpc('p2temp/preset.ensure', { agentPreset: recipe.agentPreset, connectors: recipe.connectors }),
        new Promise<{ ok: false; error: { code: string; message: string } }>((resolve) => {
          setTimeout(() => {
            resolve({ ok: false, error: { code: 'pbots/timeout', message: `preset.ensure timed out after ${timeoutMs}ms` } })
          }, timeoutMs)
        }),
      ])
      if (!result.ok) throw new Error(`${presetId}: ${result.error.code} ${result.error.message}`)
      if (result.value.presetId !== presetId) {
        throw new Error(`${presetId}: preset.ensure returned ${JSON.stringify(result.value.presetId)}`)
      }
    }),
  )
  return settled.map((outcome, index) => {
    const presetId = entries[index][0]
    const ok = outcome.status === 'fulfilled'
    if (!ok) opts.failed?.add(presetId)
    return { presetId, ok }
  })
}
