// U-14 #21 接线（CONTRACT #21 / PLAN v2 U-14）：dsh 就绪后按 recipes 逐个
// p2temp/preset.ensure（SDK 实现，main 内部经 dsh rpc 触达，不自写注册），
// 全部 settle（每个 30s 超时按失败，allSettled）后才放行 ready 闸门 —— 先 restore
// 后 ready；失败配方进 failed set 不阻断（§8-1），并经 ready 载荷供 UI 显示。
import type { ReadyGate } from '../ready'
import type { DshLike } from './orchestrate'
import { restoreRecipes, type RestoreOutcome, type RestoreOptions } from './restore'
import type { BotsMetaStore } from './store'

export interface EnsureDeps {
  dsh: DshLike
  store: BotsMetaStore
  /** registerM3Meta 持有的同一实例：M3 get 的 live 计算并入。 */
  failed: Set<string>
  ready: ReadyGate
  /** 单个 ensure 超时（默认 RESTORE_ENSURE_TIMEOUT_MS；测试注入小值）。 */
  timeoutMs?: number
  log?: (message: string) => void
}

/** main 侧观察面（electronApp.evaluate 读出，U-12 __pbotsM2 同款模式，不新开 IPC）。 */
export interface RestoreProbe {
  outcomes: RestoreOutcome[]
  failed: string[]
  restoreSettledAt: number | null
  gateOpenedAt: number | null
}

/**
 * 启动恢复编排：restoreRecipes（全部 settle 或读盘失败）→ ready.setRestoreSettled。
 * 任何异常（如坏 bots.json）都不毒化启动 —— 照常放行，失败面留给 M3 get 报 pbots/storage。
 */
export async function ensureThenReady(deps: EnsureDeps): Promise<RestoreOutcome[]> {
  const probe: RestoreProbe = { outcomes: [], failed: [...deps.failed], restoreSettledAt: null, gateOpenedAt: null }
  const g = globalThis as { __pbotsRestore?: RestoreProbe }
  g.__pbotsRestore = probe
  void deps.ready.wait().then(() => { probe.gateOpenedAt = Date.now() })
  const opts: RestoreOptions = { failed: deps.failed }
  if (deps.timeoutMs !== undefined) opts.timeoutMs = deps.timeoutMs
  try {
    probe.outcomes = await restoreRecipes(deps.dsh, deps.store, opts)
  } catch (error) {
    ;(deps.log ?? ((m: string) => console.warn(m)))(`[m3] restore skipped: ${String(error)}`)
  }
  probe.failed = [...deps.failed]
  probe.restoreSettledAt = Date.now()
  deps.ready.setRestoreSettled([...deps.failed])
  return probe.outcomes
}

/**
 * M1/M2 入口包装（CONTRACT #21「全部 settle 前 M1/M2 不就绪」）：#21 恢复 settle 前
 * 挂起，settle 后原样透传。只挂 restore 条件而非整个 gate：dsh 连不上时 M1/M2 不能被
 * 挂死（M2 自带 10s 端口超时兜底，U-12 语义）；dsh 未配置时 restore 为 null，行为与
 * U-00 一致。
 */
export function restoreGated<A extends unknown[]>(
  ready: ReadyGate,
  fn: (...args: A) => unknown,
): (...args: A) => Promise<unknown> {
  return async (...args: A) => {
    await ready.waitRestore()
    return fn(...args)
  }
}
