// #4 编排（U-13，CONTRACT §3.1）：校验 → 缺省 agentPreset 显式解析（§8-2，main 唯一）
// → presetIdOf → 写 recipe（先于 session 落盘，C:96）→ 调 dsh #4 → ⑦ env 门控屏障。
// presetIdOf 直接 import app/sdk/src/p2temp/preset-id.mjs（REUSE v1.1，不复制第二份）。
// P5-25（Q-015 C2-②，R4 §4）：#3/#4 的 cwd 由 main 强制为 $PBOTS_DATA_DIR/workspaces/<botId>
// （目录建好），renderer 传入即拒——缺省 cwd 继承 SDK runtime 启动目录会让初始工作区
// 覆盖仓库/SDK 目录（R4 §4 纠偏）；header.cwd 不可变，事后无法缩小。
// P6-24（决策 36 / Q-024 A + 任务自适应）：worker 是该规则的唯一例外——createWorkerBot
// 的 cwd 改为发起主 bot 的 session header cwd（main 侧经 session/list 解析，renderer
// 不可传），可选 subdir 新开子目录；主 bot cwd 不在 workspaces/<mainId> 下 → fail
// closed 不派（panels/D3-r1.md 必须回应 ②）。
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { normalizedConnectors, presetIdOf } from './preset-id'
import { invalidBundleNameReason } from '../m1-api'
import type { BotsMeta, BotsMetaStore } from './store'

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

/** C §3.1 Bot 的推导行（D10d：runtime 恒 'dsh'；P6-10 起 createdBy 透传）。 */
export interface BotRow {
  id: string
  preset: string | null
  connectors: string[]
  readOnly: boolean
  mainBot: boolean
  runtime: 'dsh'
  running: boolean
  updatedAt: number
  /** P6-10：建该 worker 时的主 bot sessionId；普通 bot 为 null（决策 31）。 */
  createdBy: string | null
}

export interface BotsMetaViewLike {
  mainBotId: string | null
  recipes: Record<string, { agentPreset: string; connectors: string[]; live: boolean }>
  /** P6-10：可选 worker 身份（无 worker 时无键，字节与 P6 前一致）。 */
  bots?: Record<string, { createdBy: string }>
}

/** bot 列表以 session 为准（孤儿 recipe 不产生行，D10b/D7）。P6-10：creator 已不
 * 存在的 worker（崩溃窗口 / 主 bot 被删）防御性跳过——不给不存在的 creator 建组，
 * 每行记 1 条日志（验收 ⑫ / GU 观察项）。P6-10.f1 ③：bots.json 里 worker session
 * 本身不存在（createdBy 先落盘、#3 失败或 session 被删的崩溃窗口，store.ts 注）
 * 同样跳过并记 1 行日志——此前静默不显示。 */
export function deriveBots(
  sessions: BotSessionLike[],
  view: BotsMetaViewLike,
  log: (message: string) => void = () => {},
): BotRow[] {
  const known = new Set(sessions.map((session) => session.sessionId))
  // P6-10.f1 ③：无 session 的 createdBy 条目不产生行（⑫ 正对象），逐条记日志。
  for (const [id, { createdBy }] of Object.entries(view.bots ?? {})) {
    if (!known.has(id)) log(`[m3] worker ${id} skipped: session ${id} is not in the session list (createdBy ${createdBy})`)
  }
  const rows: BotRow[] = []
  for (const session of sessions) {
    const createdBy = view.bots?.[session.sessionId]?.createdBy ?? null
    if (createdBy !== null && !known.has(createdBy)) {
      log(`[m3] worker ${session.sessionId} skipped: creator ${createdBy} is not in the session list`)
      continue
    }
    const header = session.agentPreset ?? null
    const recipe = header !== null ? view.recipes[header] : undefined
    const isTemp = header !== null && header.startsWith('p2temp-')
    rows.push({
      id: session.sessionId,
      preset: isTemp ? (recipe?.agentPreset ?? null) : header,
      connectors: recipe?.connectors ?? [],
      readOnly: isTemp && (recipe === undefined || recipe.live === false),
      mainBot: session.sessionId === view.mainBotId,
      runtime: 'dsh',
      running: session.running,
      updatedAt: session.updatedAt,
      createdBy,
    })
  }
  return rows
}

/** ⑤ 通道的 create 请求体（CONTRACT §2.4：SDK 只发 {name, prompt}；kind /
 * requestId 为通道信封标记）。P6-24 增可选 subdir：模型在 create_bot 里指定的工作
 * 区子目录名（单段路径，Q-024「按任务自适应」），经 ⑤ 通道直达 main——renderer 面
 * 不扩大（M1/M3 均不可传）。 */
export interface WorkerCreateRequest {
  kind?: string
  requestId?: string
  name: string
  prompt: string
  mainBotId: string
  subdir?: string
}

/** P6-24：subdir 只认单段路径（无分隔符、非 "."/".."、≤128 字符），拒绝一切拼路径。 */
function subdirProblem(subdir: unknown): string | undefined {
  if (subdir === undefined) return undefined
  if (typeof subdir !== 'string') return 'subdir must be a string (a single path segment under the main bot workspace)'
  const value = subdir.trim()
  if (value === '' || value === '.' || value === '..') {
    return 'subdir must be a non-empty single path segment (not "." or "..")'
  }
  if (value.length > 128) return 'subdir is too long (max 128 characters)'
  if (/[\\/]/.test(value)) return 'subdir must be a single path segment (no path separators)'
  if (/[\0\u0001-\u001f]/.test(value)) return 'subdir must not contain control characters'
  return undefined
}

/**
 * P6-24（决策 36，Q-024 A + 任务自适应）：从 session/list 解析发起主 bot 的
 * session header cwd，并核对它在 <dataDir>/workspaces/<mainBotId> 之下（P5-25 布
 * 局）。主 bot cwd 不可解析（不在列表 / 无 cwd / RPC 失败）或指向区外（P5-25 之前
 * 的旧 bot，cwd 可能是仓库或 SDK 目录——正是 C2-② 要防的）→ fail closed 拒派，
 * 绝不回退到 mint 独立工作区（panels/D3-r1.md 必须回应 ②；PLAN P6-24 验收 ③）。
 * 布局核对按词面路径（session/create 收到的就是 main 拼好的绝对路径）；dataDir
 * 自身被换成软链的部署不在核对面内（ponytail: 需要时升级 realpath 对照）。
 */
async function resolveMainWorkspace(
  dsh: DshLike,
  dataDir: string,
  mainBotId: string,
): Promise<{ ok: true; cwd: string } | { ok: false; error: { code: 'pbots/orchestration-failed'; message: string; details: {} } }> {
  const failed = (message: string): { ok: false; error: { code: 'pbots/orchestration-failed'; message: string; details: {} } } => ({
    ok: false,
    error: { code: 'pbots/orchestration-failed', message: `${message} — refusing to create a worker (fail closed, D-3-2)`, details: {} },
  })
  const list = await dsh.rpc('session/list', { _request: {} })
  if (!list.ok) {
    return failed(`session/list failed: ${list.error.code} ${list.error.message}`)
  }
  const items = (list.value as { items?: Array<{ sessionId?: string; cwd?: string }> }).items ?? []
  const main = items.find((item) => item.sessionId === mainBotId)
  if (main === undefined) return failed(`main bot ${JSON.stringify(mainBotId)} is not in session/list`)
  if (typeof main.cwd !== 'string' || main.cwd === '') {
    return failed('main bot session records no workspace cwd')
  }
  const expected = resolve(dataDir, 'workspaces', mainBotId)
  const actual = resolve(main.cwd)
  if (actual !== expected && !actual.startsWith(`${expected}${sep}`)) {
    return failed('main bot cwd is outside $PBOTS_DATA_DIR/workspaces/<mainBotId> (pre-P5-25 layout)')
  }
  return { ok: true, cwd: actual }
}

/**
 * ⑤ 建 bot 的 main 编排（P6-10，CONTRACT §2.4 / §3.1，决策 8/32；P6-24 改工作区来源）：
 * 校验（D9①：越权参数拒；mainBotId 纵深防御）→ 解析主 bot cwd（fail closed，见
 * resolveMainWorkspace）→ **createdBy 先落盘**（失败 → 0 次 dsh 会话调用）→ #3
 * （cwd = 主 bot cwd[/<subdir>]，默认 preset、无连接器）→ #6 rename（决策 32：失败
 * → 成功 + warn，不诱发重复 create）。
 * P6-24：不再 mint 独立工作区——worker 与发起主 bot 共用目录（Q-024 A）；subdir
 * 时只建子目录。#3 失败不回滚 createdBy（作废 ≠ 回滚，崩溃窗口由 deriveBots 过滤）；
 * worker 生命周期不触碰共享目录的删除（D-3-④ 硬门槛：删 worker 只动 bots.json）。
 */
export async function createWorkerBot(
  dsh: DshLike,
  store: BotsMetaStore,
  request: WorkerCreateRequest,
  opts: GateOptions = {},
): Promise<ConnectionRpcResult<{ sessionId: string; warn?: string }>> {
  // 1 校验：只认 {kind?, name, prompt, mainBotId, subdir?}；preset / connectors / cwd → 拒
  if (typeof request !== 'object' || request === null) return invalid('create-bot request must be {kind, name, prompt, mainBotId, subdir?}')
  const extra = Object.keys(request).filter((key) => !['kind', 'requestId', 'name', 'prompt', 'mainBotId', 'subdir'].includes(key))
  if (extra.length > 0) {
    return invalid(`create-bot rejects unexpected fields: ${extra.join(', ')} (preset/connectors/cwd are main-owned, D9-1)`)
  }
  const { name, prompt, mainBotId, subdir } = request
  if (typeof name !== 'string' || name.trim() === '') return invalid('name must be a non-empty string')
  if (typeof prompt !== 'string' || prompt.trim() === '') return invalid('prompt must be a non-empty string')
  if (typeof mainBotId !== 'string' || mainBotId === '') return invalid('mainBotId is required')
  const badSubdir = subdirProblem(subdir)
  if (badSubdir !== undefined) return invalid(badSubdir)
  let meta: BotsMeta
  try {
    meta = store.read()
  } catch (error) {
    return { ok: false, error: { code: 'pbots/storage', message: `bots.json unreadable: ${String(error)}`, details: {} } }
  }
  if (meta.mainBotId !== mainBotId) {
    return invalid(`mainBotId mismatch: request says ${JSON.stringify(mainBotId)}, authoritative is ${JSON.stringify(meta.mainBotId)}`)
  }

  // 1.5 P6-24 工作区：数据根 + 主 bot cwd（fail closed；先于 createdBy 落盘与任何
  //     会话创建——布局核对不过时不产生任何副作用）。
  const dataDir = resolveDataDir(opts)
  if (dataDir === undefined) {
    return { ok: false, error: { code: 'pbots/unavailable', message: 'workspace data dir unresolved (no dataDir option and PBOTS_DATA_DIR unset)', details: {} } }
  }
  const mainWs = await resolveMainWorkspace(dsh, dataDir, mainBotId)
  if (!mainWs.ok) return { ok: false, error: { ...mainWs.error } }
  let workspace = mainWs.cwd
  if (subdir !== undefined) {
    workspace = join(mainWs.cwd, (subdir as string).trim())
    try {
      await mkdir(workspace, { recursive: true })
    } catch (error) {
      return { ok: false, error: { code: 'pbots/storage', message: `worker subdir mkdir failed for "${workspace}": ${String(error)}`, details: {} } }
    }
  }

  // 2 P6-24：只 mint botId（与上游 minted session 同形），不建独立工作区
  const botId = mintBotId()

  // 3 createdBy 先于会话落盘（CONTRACT §3.1；验收 ①：写失败 → 0 次 dsh 会话调用）。
  // P6-10.f2 B-3：第 1 步的 read() 可能落在换主 patch 的未提交窗口（写队列不
  // 隔离读者）；putBotIfMain 在写队列位重验 mainBotId，回滚后不再写入失权主。
  let committed: boolean
  try {
    committed = await store.putBotIfMain(botId, mainBotId)
  } catch (error) {
    return { ok: false, error: { code: 'pbots/storage', message: `bots.json write failed: ${String(error)}`, details: {} } }
  }
  if (!committed) {
    return invalid(`mainBotId changed during creation: the authoritative main bot is no longer ${JSON.stringify(mainBotId)}`)
  }

  // 4 #3：默认 preset、无连接器、cwd = 主 bot cwd[/<subdir>]（P6-24；typert {request:…} 壳，
  //   同 createSessionForcedWorkspace）
  const created = await dsh.rpc('session/create', { request: { sessionId: botId, cwd: workspace } })
  if (!created.ok) {
    return {
      ok: false,
      error: {
        code: 'pbots/orchestration-failed',
        message: `session/create failed: ${created.error.code} ${created.error.message}`,
        details: { step: 'session/create', code: created.error.code, details: created.error.details ?? {} },
      },
    }
  }

  // 5 #6 rename（决策 32：失败 → 成功 + warn；改名失败不诱发重复 create）
  let warn: string | undefined
  const renamed = await dsh.rpc('session/rename', { request: { sessionId: botId, title: name } })
  if (!renamed.ok) warn = `rename failed: ${renamed.error.code} ${renamed.error.message}`
  return { ok: true, value: { sessionId: botId, ...(warn !== undefined ? { warn } : {}) } }
}
