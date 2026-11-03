// #4 编排（U-13，CONTRACT §3.1）：校验 → 缺省 agentPreset 显式解析（§8-2，main 唯一）
// → presetIdOf → 写 recipe（先于 session 落盘，C:96）→ 调 dsh #4 → ⑦ env 门控屏障。
// presetIdOf 直接 import app/sdk/src/p2temp/preset-id.mjs（REUSE v1.1，不复制第二份）。
// P5-25（Q-015 C2-②，R4 §4）：#3/#4 的 cwd 由 main 强制为 $PBOTS_DATA_DIR/workspaces/<botId>
// （目录建好），renderer 传入即拒——缺省 cwd 继承 SDK runtime 启动目录会让初始工作区
// 覆盖仓库/SDK 目录（R4 §4 纠偏）；header.cwd 不可变，事后无法缩小。
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizedConnectors, presetIdOf } from './preset-id'
import { invalidBundleNameReason } from '../m1-api'
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
  /** P5-25：renderer 不得传 cwd（Q-015 C2-②）——传了即 invalid-args。类型保留用于校验。 */
  cwd?: unknown
}

/** #3 session/create 的 main 侧入参（P5-25：cwd/workspaceId 由 main 强制，renderer 传入即拒）。 */
export interface SessionCreateArgs {
  agentPreset?: string
  cwd?: unknown
  workspaceId?: unknown
}

export interface GateOptions {
  /** 工作区根（P5-25）：cwd = <dataDir>/workspaces/<botId>。缺省回退 env PBOTS_DATA_DIR，
   * 两者皆无 → pbots/unavailable（fail loud，不落不确定 cwd）。生产由 main/index.ts
   * 传入与 m3 store 同源的值。 */
  dataDir?: string
  /** 注入点：单测断言「未设 env 时屏障路径不触发」。 */
  waitGate?: (file: string) => Promise<void>
  /** U-28 R5：恢复失败集合（registerM3Meta 持有的同一实例）。#4 成功注册同 presetId 时
   * 从中清除 —— 否则启动恢复失败过的配方恒 live=false、bot 恒只读（终审 R5）。 */
  failed?: Set<string>
}

const invalid = (message: string): ConnectionRpcResult<never> => ({
  ok: false,
  error: { code: 'pbots/invalid-args', message, details: {} },
})

const stepFailed = (step: string, error: { code: string; message: string }): ConnectionRpcResult<never> => ({
  ok: false,
  error: { code: 'pbots/unavailable', message: `${step} failed: ${error.code} ${error.message}`, details: {} },
})

/** P5-25 统一拒绝语：cwd 由 main 强制，renderer 无权指定。 */
const CWD_DENIED = 'cwd is set by main to $PBOTS_DATA_DIR/workspaces/<botId>; client-provided cwd is not accepted (Q-015 C2-2)'

/** mint 一个 botId：与上游 minted session 同形（session-<uuid>，agent.ts createMinted）。 */
const mintBotId = (): string => `session-${randomUUID()}`

/** 解析工作区根（P5-25）：opts.dataDir → env PBOTS_DATA_DIR → 皆无 fail loud。 */
function resolveDataDir(opts: GateOptions): string | undefined {
  const fromOpts = opts.dataDir
  if (fromOpts !== undefined && fromOpts !== '') return fromOpts
  const fromEnv = process.env.PBOTS_DATA_DIR
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : undefined
}

/** mint botId 并建好 <dataDir>/workspaces/<botId>；失败 → pbots/storage（不调 dsh）。 */
async function mintWorkspace(
  dataDir: string,
): Promise<{ ok: true; botId: string; workspace: string } | { ok: false; error: { code: string; message: string } }> {
  const botId = mintBotId()
  const workspace = join(dataDir, 'workspaces', botId)
  try {
    await mkdir(workspace, { recursive: true })
  } catch (error) {
    return { ok: false, error: { code: 'pbots/storage', message: `workspace mkdir failed for "${workspace}": ${String(error)}` } }
  }
  return { ok: true, botId, workspace }
}

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
  // R1：bundle 名形状校验（#4 经 wrapM1WithOrchestration 直达此处，不经 m1-api checkArgs；
  // 规则同 m1-api 的 BUNDLE_NAME_RE，SDK readConnectorRows 兜底第二道）。
  const badBundleName = invalidBundleNameReason(connectors)
  if (badBundleName !== undefined) return invalid(badBundleName)
  if (agentPreset !== undefined && (typeof agentPreset !== 'string' || agentPreset.trim() === '')) {
    return invalid('agentPreset must be a non-empty preset id')
  }
  if (agentPreset !== undefined && agentPreset.startsWith('p2temp-')) {
    return invalid('agentPreset must not be a p2temp-* preset (CONTRACT §2.2)')
  }
  // P5-25（Q-015 C2-②）：cwd 由 main 强制，renderer 传入即拒（任意类型，含字符串）。
  if (cwd !== undefined) return invalid(CWD_DENIED)

  // 1.5 P5-25：解析工作区根并建好 <dataDir>/workspaces/<botId>（先于 #1 解析——
  //     工作区不可解析/不可建时不产生任何 dsh 调用与 recipe 写入）。
  const dataDir = resolveDataDir(opts)
  if (dataDir === undefined) {
    return { ok: false, error: { code: 'pbots/unavailable', message: 'workspace data dir unresolved (no dataDir option and PBOTS_DATA_DIR unset)', details: {} } }
  }
  const ws = await mintWorkspace(dataDir)
  if (!ws.ok) return { ok: false, error: { ...ws.error, details: {} } }

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

  // 5 调 dsh #4；!ok 原样透传（含 details）。typert wire 单参数方法包 {request:…} 壳
  //   （U-15 联调实测：裸对象被 gateway arguments-invalid 拒 'unexpected "connectors"'）
  //   P5-25：sessionId + cwd 由 main 注入（SDK p2temp 透传 sessionId → 上游 sessionController
  //   claim 不存在的 id 即按该 id + cwd 新建，header.cwd 因此 = workspaces/<botId>）。
  const result = await dsh.rpc('p2temp/session.createWithConnectors', {
    request: {
      connectors: names,
      agentPreset: resolved,
      sessionId: ws.botId,
      cwd: ws.workspace,
    },
  })
  if (!result.ok) return result

  // 5.5 U-28 R5：同 presetId 重新创建成功 → 清除启动恢复留下的失败标记（live 回 true）。
  // failed 与 registerM3Meta 持有同一实例（main/index.ts wrapM1WithOrchestration 传入）。
  opts.failed?.delete(presetId)

  // 6 ⑦ env 门控屏障：停在 recipe 已落盘、session 已建、#4 响应未交付调用方
  const gateFile = process.env[GATE_4_ENV]
  if (gateFile !== undefined && gateFile !== '') {
    await (opts.waitGate ?? defaultGate4Wait)(gateFile)
  }
  return result
}

/**
 * session/create 的 main 编排（P5-25，Q-015 C2-②）：cwd 由 main 强制为
 * $PBOTS_DATA_DIR/workspaces/<botId>（目录建好），renderer 传 cwd / workspaceId 即拒。
 * agentPreset 校验沿用 base checkArgs 口径（p2temp-* 拒），其余原样透传。
 */
export async function createSessionForcedWorkspace(
  dsh: DshLike,
  args: SessionCreateArgs,
  opts: GateOptions = {},
): Promise<ConnectionRpcResult<{ sessionId: string }>> {
  if (typeof args !== 'object' || args === null) return invalid('session/create expects an object with agentPreset?')
  const { agentPreset, cwd, workspaceId } = args as SessionCreateArgs
  if (cwd !== undefined) return invalid(CWD_DENIED)
  // workspaceId 与注入 cwd 互斥（上游 create 二选一），提前拒避免歧义错误。
  if (workspaceId !== undefined) return invalid('workspaceId is not accepted; the workspace is derived from the bot id (Q-015 C2-2)')
  if (agentPreset !== undefined && (typeof agentPreset !== 'string' || agentPreset.trim() === '')) {
    return invalid('agentPreset must be a non-empty preset id')
  }
  if (agentPreset !== undefined && agentPreset.startsWith('p2temp-')) {
    return invalid('agentPreset must not be a p2temp-* id (denied by CONTRACT §2 table 1 filter)')
  }
  const dataDir = resolveDataDir(opts)
  if (dataDir === undefined) {
    return { ok: false, error: { code: 'pbots/unavailable', message: 'workspace data dir unresolved (no dataDir option and PBOTS_DATA_DIR unset)', details: {} } }
  }
  const ws = await mintWorkspace(dataDir)
  if (!ws.ok) return { ok: false, error: { ...ws.error, details: {} } }
  // typert wire {request:…} 壳（同 #4，U-15 联调口径）。
  return dsh.rpc('session/create', {
    request: {
      sessionId: ws.botId,
      cwd: ws.workspace,
      ...(agentPreset !== undefined ? { agentPreset } : {}),
    },
  })
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
