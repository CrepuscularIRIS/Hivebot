// #4 编排（U-13，CONTRACT §3.1）：校验 → 缺省 agentPreset 显式解析（§8-2，main 唯一）
// → presetIdOf → 写 recipe（先于 session 落盘，C:96）→ 调 dsh #4 → ⑦ env 门控屏障。
// presetIdOf 直接 import app/sdk/src/p2temp/preset-id.mjs（REUSE v1.1，不复制第二份）。
import { existsSync } from 'node:fs'
import { normalizedConnectors, presetIdOf } from './preset-id'
import type { BotsMetaStore } from './store'

export type ConnectionRpcResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

/** main 侧 dsh 依赖的最小面（DshConnection 满足；#21 渠道 = main 内部，不走 M1 白名单）。 */
export interface DshLike {
  rpc(method: string, args: unknown): Promise<ConnectionRpcResult>
}

/** ⑦ 屏障 env：值为 gate 文件绝对路径；机制复用 app/sdk/tests/support/runtime.ts:4
 * 的 gates 文件通道（文件出现即放行，不开端口）。供 U-23 ⑥ E2E。 */
export const GATE_4_ENV = 'PBOTS_TEST_GATE_4'
/** 屏障兜底超时：忘 touch 也不能永久挂死（测试钩子，fail-open 放行）。 */
export const GATE_4_TIMEOUT_MS = 120_000

export interface CreateBotArgs {
  connectors: string[]
  agentPreset?: string
  cwd?: string
}

export interface GateOptions {
  /** 注入点：单测断言「未设 env 时屏障路径不触发」。 */
  waitGate?: (file: string) => Promise<void>
}

const invalid = (message: string): ConnectionRpcResult<never> => ({
  ok: false,
  error: { code: 'pbots/invalid-args', message, details: {} },
})

const stepFailed = (step: string, error: { code: string; message: string }): ConnectionRpcResult<never> => ({
  ok: false,
  error: { code: 'pbots/unavailable', message: `${step} failed: ${error.code} ${error.message}`, details: {} },
})

/** 默认屏障等待：轮询 gate 文件出现。 */
export async function defaultGate4Wait(file: string, timeoutMs = GATE_4_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!existsSync(file)) {
    if (Date.now() >= deadline) return
    await new Promise((r) => setTimeout(r, 25))
  }
}

/**
 * p2temp/session.createWithConnectors 的 main 编排（renderer 只发一次 M1 #4，CONTRACT §3.1）。
 * 编排顺序 = 校验 → presetIdOf → 写 recipe → 调 dsh #4；#4 失败时孤儿 recipe 留在盘上
 * （§8-1：不删共享 recipe，恢复时隔离），不毒化恢复屏障。
 */
export async function createBotWithConnectors(
  dsh: DshLike,
  store: BotsMetaStore,
  args: CreateBotArgs,
  opts: GateOptions = {},
): Promise<ConnectionRpcResult<{ sessionId: string }>> {
  // 1 校验（拒绝时 dsh 计数必须为 0）
  if (typeof args !== 'object' || args === null) return invalid('create expects an object with connectors, agentPreset?, cwd?')
  const { connectors, agentPreset, cwd } = args as CreateBotArgs
  if (
    !Array.isArray(connectors) ||
    connectors.length === 0 ||
    connectors.some((name) => typeof name !== 'string' || name.trim() === '')
  ) {
    return invalid('connectors must be a non-empty array of bundle names')
  }
  if (agentPreset !== undefined && (typeof agentPreset !== 'string' || agentPreset.trim() === '')) {
    return invalid('agentPreset must be a non-empty preset id')
  }
  if (agentPreset !== undefined && agentPreset.startsWith('p2temp-')) {
    return invalid('agentPreset must not be a p2temp-* preset (CONTRACT §2.2)')
  }
  if (cwd !== undefined && typeof cwd !== 'string') return invalid('cwd must be a string')

  // 2 缺省 agentPreset 唯一显式解析（§8-2）：未过滤 #1 的 defaultId；同一值贯穿
  //   presetIdOf / recipe / dsh 请求
  let resolved = agentPreset
  if (resolved === undefined) {
    const roster = await dsh.rpc('agentPresets/list', {})
    if (!roster.ok) return stepFailed('agentPresets/list', roster.error)
    const def: { id: string } | undefined = roster.value.presets.find((p: { isDefault?: boolean }) => p.isDefault)
    if (def === undefined) {
      return { ok: false, error: { code: 'pbots/unavailable', message: 'agentPresets/list returned no default preset', details: {} } }
    }
    resolved = def.id
  }

  // 3 presetIdOf（SDK 共用模块）+ 4 recipe 先于 session 落盘（C:96）
  const names = normalizedConnectors(connectors)
  const presetId = presetIdOf(resolved, names)
  try {
    await store.putRecipe(presetId, { agentPreset: resolved, connectors: names })
  } catch (error) {
    return { ok: false, error: { code: 'pbots/storage', message: `bots.json write failed: ${String(error)}`, details: {} } }
  }

  // 5 调 dsh #4；!ok 原样透传（含 details）
  const result = await dsh.rpc('p2temp/session.createWithConnectors', {
    connectors: names,
    agentPreset: resolved,
    ...(cwd !== undefined ? { cwd } : {}),
  })
  if (!result.ok) return result

  // 6 ⑦ env 门控屏障：停在 recipe 已落盘、session 已建、#4 响应未交付调用方
  const gateFile = process.env[GATE_4_ENV]
  if (gateFile !== undefined && gateFile !== '') {
    await (opts.waitGate ?? defaultGate4Wait)(gateFile)
  }
  return result
}

/** #9 条目在 main 侧需要的最小面（SessionSummary 不含 agentPreset——它在 follow header）。 */
export interface BotSessionLike {
  sessionId: string
  running: boolean
  updatedAt: number
  /** follow header.agentPreset（renderer 从快照带过来；未知为 null）。 */
  agentPreset?: string
}

/** C §3.1 Bot 的推导行（D10d：runtime 恒 'dsh'；v1 不含 bots 字段）。 */
export interface BotRow {
  id: string
  preset: string | null
  connectors: string[]
  readOnly: boolean
  mainBot: boolean
  runtime: 'dsh'
  running: boolean
  updatedAt: number
}

export interface BotsMetaViewLike {
  mainBotId: string | null
  recipes: Record<string, { agentPreset: string; connectors: string[]; live: boolean }>
}

/** bot 列表以 session 为准（孤儿 recipe 不产生行，D10b/D7）。 */
export function deriveBots(sessions: BotSessionLike[], view: BotsMetaViewLike): BotRow[] {
  return sessions.map((session) => {
    const header = session.agentPreset ?? null
    const recipe = header !== null ? view.recipes[header] : undefined
    const isTemp = header !== null && header.startsWith('p2temp-')
    return {
      id: session.sessionId,
      preset: isTemp ? (recipe?.agentPreset ?? null) : header,
      connectors: recipe?.connectors ?? [],
      readOnly: isTemp && (recipe === undefined || recipe.live === false),
      mainBot: session.sessionId === view.mainBotId,
      runtime: 'dsh',
      running: session.running,
      updatedAt: session.updatedAt,
    }
  })
}
