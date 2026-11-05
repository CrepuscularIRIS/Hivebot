// P6-14 worker 安全信封（PLAN p6-orchestration P6-14 + P6-14.f1/.f2；BRIEF
// D9③④⑤、§4-5 HIGH#5/6）。两层：f1 起 worker 会话（bots.json bots[id].createdBy
// 经 resolveWorkerStatus 三态判定，f2）在建立点经 per-agent restrict 收窄模型
// 可见工具表（RESTRICT_TOOLS，见文件尾）；pre-execute 执行层守卫拒三类入口并
// 保留 restrict 覆盖不了的字面串拒 / 顺序差分：
//   ① 协调者工具 create_bot / send_to_bot / stop_bot（D9③；按名拒绝不依赖
//      注册时序，P6-13（944afa0）合并前名单已预置 stop_bot）
//   ② 再委派 subagent / subagent_fork / list_subagent_models / send_message /
//      interrupt_agent / list_agents / workflow（D9④，新增子会话 0）——深度 1 与
//      并发 ≤3 对 worker 全失效，执行层一刀切（BRIEF §4-5）
//   ③ 后台作业（D9⑤）：job_output / job_list / job_kill + schedule_create/
//      list/view/edit + bash/pwsh 的 run_in_background（turn/end = 任务终态，
//      不遗留跨回合工作）
// 入口名单按已装 dsh（0.2.2-alpha.2）standard preset 的 delegation 组与 jobs/
// schedule 包源码逐一登记（ENTRY_ANNOTATIONS 锚点），enumerateInstalledEntries
// 对运行时注册表取交集 = 「清单从已装 dsh 注册表枚举」的机械证明（未装的入口
// 不枚举；判定本身按名走，后注册的入口同样被拒）。
// 挂 tools/pre-execute 且 cordis prepend（P5-05 同层；LEARNINGS P5-04.f1）——
// deny 先于 shell-ask 出卡（顺序差分格：worker 的 run_in_background bash 在
// 出卡前被拒、asked===0；普通 bash 仍走 shell-ask）。
// 已知上限（ponytail:）：subagent / workflow 的 toolName 可被 preset 改名，名单
// 跟 standard preset 缺省名（approval.yml:139-160）。f2（REVIEW-P6-14-C C-2）后
// 改名不再是绕过：worker 的直接子代理在创建点（session/created 谱系拒绝，见
// registerWorkerRestriction）整体拒绝，执行层对 worker 子代同样按信封拦——名单
// 只影响「工具表隐藏哪些名字」。
// 主 bot 不受信封约束（委派与后台作业照常）。
// P6-24（panels/D3-r1.md 必须回应 ①）：worker 的 write/edit 拒写 agent-instructions
// 指令文件（AGENTS.md / CLAUDE.md 及 .local 变体 = 上游 dsh-agent-instructions
// config.ts:12-13 的候选全集）。这些文件会被当作指令以 user-role 消息注入
// （state.ts:85-90，来源 kind='agent-instructions' 不在污染白名单——turn-origin
// 只认 pbots-worker），worker 写它们 = 绕过决策 29 给主 bot 下指令。P6-24 起
// worker 与主 bot 共用工作区（决策 36），该面从理论变为可达，故在信封层一刀拒。
// 按解析后（realpath）basename 判定，防「写 link.md（软链→AGENTS.md）」逃逸；
// bash 写同名文件的残余风险堵不死（ponytail: bash 是通用解释器，文件名级拦截
// 在 bash 侧无接缝；已写进 Q-024 给用户的告知），升级路径是 fs 层 veto。
// f2 C-1（REVIEW-P6-14-C major ①）：身份不可判定（bots.json 缺失 / 损坏 /
// version 不符）≠ 确认非 worker——fail closed 按 worker 处理（宁可误伤）。f3 起
// 「合法 v1 文档省略 bots 键」是零 worker 的确认非 worker（CONTRACT v1.5 §3.1
// 决策 31），不再算损坏；文件恢复健康后已挂的 restrict 由 registerWorkerRestriction
// 的恢复 sweep 撤销（见内）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { orchDataDir, BOTS_JSON } from './identity.mjs'

/** 协调者工具（本仓注册；worker 工具表已由 when 隐藏，这里兜 direct execute）。 */
export const COORDINATOR_TOOLS = ['create_bot', 'send_to_bot', 'stop_bot']

/** 再委派入口（standard preset delegation 组；锚点见 ENTRY_ANNOTATIONS）。 */
export const DELEGATION_TOOLS = [
  'subagent', 'subagent_fork', 'list_subagent_models',
  'send_message', 'interrupt_agent', 'list_agents',
  'workflow',
]

/** 后台作业入口（工具族；schedule 名单按已装 0.2.2-alpha.2 核对为
 *  create/list/update/delete——repos HEAD 的 view/edit 是后起改名，未装不拦）。 */
export const JOB_TOOLS = [
  'job_output', 'job_list', 'job_kill',
  'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete',
]

/** 后台作业入口（参数级）：run_in_background === true 才拒（前台同名工具照常）。 */
const BACKGROUND_PARAM_TOOLS = new Set(['bash', 'pwsh'])

/** 入口 → 已装 dsh 源码锚点（报告「入口全集及锚点」数据源；repos/deepseek-harness@ce7073d）。 */
export const ENTRY_ANNOTATIONS = {
  create_bot: '本仓 src/orchestration/create.mjs（P6-10）',
  send_to_bot: '本仓 src/orchestration/send.mjs（P6-11）',
  stop_bot: '本仓 src/orchestration/stop.mjs（P6-13，944afa0 起在默认注册链内）',
  subagent: 'packages/subagent/tool-subagent/src/index.ts:70-80（toolName 缺省）+ bundle/web-app/presets/standard.patch.yml:98-101',
  subagent_fork: 'standard.patch.yml:102-104（toolName: subagent_fork）',
  list_subagent_models: 'packages/subagent/tool-subagent/src/list-models.ts:110（modelDiscovery）',
  send_message: 'packages/subagent/tool-subagent-control/src/index.ts:30',
  interrupt_agent: 'packages/subagent/tool-subagent-control/src/index.ts:76',
  list_agents: 'packages/subagent/tool-subagent-control/src/list-agents.ts:82',
  workflow: 'packages/workflow/tool-workflow/src/index.ts:60,332（toolName 缺省）',
  job_output: 'packages/jobs/tool-jobs/src/index.ts:433',
  job_list: 'packages/jobs/tool-jobs/src/index.ts:541',
  job_kill: 'packages/jobs/tool-jobs/src/index.ts:561',
  schedule_create: 'packages/schedule/tool-schedule/src/index.ts:372（已装 0.2.2-alpha.2 同名）',
  schedule_list: 'packages/schedule/tool-schedule/src/index.ts:394（已装 0.2.2-alpha.2 同名）',
  schedule_update: '已装 0.2.2-alpha.2 lib/index.js:603 注册（repos HEAD ce7073d 改名前为 schedule_edit :431）',
  schedule_delete: '已装 0.2.2-alpha.2 lib/index.js:569 注册（repos HEAD ce7073d 改名前为 schedule_view :417）',
  bash: 'packages/shell/tool-bash/src/index.ts:67,106-109（run_in_background 参数入口）',
  pwsh: 'packages/shell/tool-pwsh/src/index.ts:85（run_in_background 参数入口）',
}

const coordinatorSet = new Set(COORDINATOR_TOOLS)
const delegationSet = new Set(DELEGATION_TOOLS)
const jobSet = new Set(JOB_TOOLS)

/**
 * 三态身份判定（f2 C-1 fail closed 的核心，f3 收窄 unknown 面）：一个 session id
 * 是 worker / 确认非 worker / 身份不可判定。与 slots.readWorkerIds 分道：容量收养
 * 仍按「读不到就没有可收养的 worker」（功能语义），安全判定把读取失败与确认非
 * worker 区分开——unknown 一律按 worker 处理。f3（VERIFY-P6-14.f2 阻塞项，
 * CONTRACT v1.5 §3.1 决策 31）：文件有效（version 1）且省略 bots 键 = 合法的
 * 零 worker 状态（生产 BotsMetaStore 无 worker 时正是此形状）= 确认非 worker；
 * unknown 仅剩文件缺失 / 损坏（含 version 不符、bots 键在但非对象）。
 * @param {string} id session id。
 * @param {string} [dir] data dir (default orchDataDir()).
 * @returns {'worker' | 'main' | 'unknown'}
 */
export function resolveWorkerStatus(id, dir = orchDataDir()) {
  let meta
  try {
    meta = JSON.parse(readFileSync(join(dir, BOTS_JSON), 'utf8'))
  } catch {
    return 'unknown'
  }
  if (meta?.version !== 1) return 'unknown'
  const bots = meta.bots
  if (bots === undefined) return 'main' // 合法零 worker：省略键即「无 worker」（决策 31）
  if (bots === null || typeof bots !== 'object' || Array.isArray(bots)) return 'unknown'
  const record = bots[String(id)]
  return typeof record?.createdBy === 'string' && record.createdBy !== '' ? 'worker' : 'main'
}

/**
 * 一个 live agent 是否按 worker 信封处理（f2）：worker 本尊、身份不可判定的
 * 会话（fail closed）、或 worker 的直接子代理（session header origin=subagent
 * 且 parentSession 非 main——C-2 改名委派的执行层谱系拦）。
 * ponytail: 只看直接父——worker 后代在创建点即被拒（registerWorkerRestriction
 * 的谱系拒绝），能活到执行层的孙代要求其父先绕过创建点（即 envelope 未加载的
 * 窗口），那时本层同样不在；需要全谱系时沿 parentSession 递归查 header。
 * @param {{ id?: unknown, session?: { header?: { origin?: string, parentSession?: unknown } } }} agent live agent（exec.agent / agent/created payload）。
 * @param {string} [dir] data dir.
 * @returns {boolean}
 */
export function isEnveloped(agent, dir = orchDataDir()) {
  const id = String(agent?.id ?? '')
  if (resolveWorkerStatus(id, dir) !== 'main') return true
  const header = agent?.session?.header
  if (header?.origin === 'subagent') {
    return resolveWorkerStatus(String(header.parentSession ?? ''), dir) !== 'main'
  }
  return false
}

/**
 * 纯判定：worker 会话内一次工具调用是否被信封拒绝。
 * @param {string} name 工具名（exec.name）。
 * @param {unknown} rawArgs 调用参数（exec.arguments，可能为 null/非对象）。
 * @returns {{ kind: 'deny', reason: string } | null} deny 的 reason 以
 *   `pbots/forbidden:` 开头（错误码进文本，与 orchError 同口径）。
 */
export function judgeWorkerCall(name, rawArgs) {
  if (coordinatorSet.has(name)) {
    return { kind: 'deny', reason: `pbots/forbidden: worker sessions cannot use coordinator tools (tool "${name}" is main-bot only)` }
  }
  if (delegationSet.has(name)) {
    return { kind: 'deny', reason: `pbots/forbidden: worker sessions cannot delegate further (tool "${name}" denied; run the task yourself)` }
  }
  if (jobSet.has(name)) {
    return { kind: 'deny', reason: `pbots/forbidden: worker sessions cannot start or manage background work (tool "${name}" denied; a worker turn ends when its task ends)` }
  }
  if (BACKGROUND_PARAM_TOOLS.has(name)
    && rawArgs !== null && typeof rawArgs === 'object'
    && rawArgs.run_in_background === true) {
    return { kind: 'deny', reason: `pbots/forbidden: worker sessions cannot start or manage background work (run_in_background on "${name}" denied; a worker turn ends when its task ends)` }
  }
  return null
}

/** P6-24 D-3-①：会被 agent-instructions 当指令加载的文件名（basename 级）。 */
export const INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md'])

/**
 * P6-24 D-3-① 纯判定：write/edit 的目标是否为指令文件。优先用解析后（realpath）
 * 的 basename（防软链逃逸：raw 名无害、resolve 后指向 AGENTS.md 也拒）；解析不可
 * 用时退回 raw basename（fail closed 方向——同名即拒）。
 * @param {unknown} rawPath 工具参数 file_path（write/edit）。
 * @param {string | undefined} resolvedPath ctx.fs.resolve 后的 targetKey（可缺省）。
 * @returns {{ kind: 'deny', reason: string } | null}
 */
export function instructionFileDenial(rawPath, resolvedPath) {
  const candidate = typeof resolvedPath === 'string' && resolvedPath !== '' ? resolvedPath : rawPath
  if (typeof candidate !== 'string' || candidate === '') return null
  const base = candidate.split('/').pop() ?? ''
  if (!INSTRUCTION_FILES.has(base)) return null
  return {
    kind: 'deny',
    reason: `pbots/forbidden: worker sessions cannot write instruction files ("${base}"); agent-instructions would load it into the main bot as instructions, bypassing the worker-report taint guard (D-3-1)`,
  }
}

/**
 * 入口清单 ∩ 已装注册表（「清单从已装 dsh 注册表枚举」；测试传入运行时
 * ctx.tools.definitions() 的名字集，报告与 P6-20 计分可复用）。
 * @param {Iterable<string>} registeredNames 当前注册表可见工具名。
 * @returns {{ coordinator: string[], delegation: string[], jobs: string[] }} 各族
 *   已装成员（排序稳定）。
 */
export function enumerateInstalledEntries(registeredNames) {
  const registered = registeredNames instanceof Set ? registeredNames : new Set(registeredNames)
  const pick = (list) => list.filter((name) => registered.has(name))
  return {
    coordinator: pick(COORDINATOR_TOOLS),
    delegation: pick(DELEGATION_TOOLS),
    jobs: pick(JOB_TOOLS),
  }
}

/**
 * 把信封挂到宿主 pre-execute waterfall（cordis prepend 钉最外层）。
 * 信封归属（isEnveloped：worker / 身份不可判定 fail closed / worker 直接子代）
 * 每次 execute 重读 bots.json（slots.mjs 同款 ponytail：无缓存窗口，worker 落盘
 * 后立即生效；文件极小、开销可忽略）。回调内不调宿主可重入 API。
 * @param {{ on(name: string, fn: (...args: any[]) => any, prepend?: boolean): () => void }} ctx dsh plugin context.
 * @param {{ config?: { dataDir?: string } }} orch the owning OrchestrationPlugin。
 * @returns {() => void} disposer。
 */
export function registerEnvelope(ctx, orch) {
  return ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.agent !== undefined && exec.agent !== null) {
      if (isEnveloped(exec.agent, orch.config?.dataDir ?? orchDataDir())) {
        const verdict = judgeWorkerCall(exec.name, exec.arguments)
        if (verdict !== null) return verdict
        // P6-24 D-3-①：write/edit 拒写指令文件（解析后判定，防软链逃逸）
        if (exec.name === 'write' || exec.name === 'edit') {
          const raw = (exec.arguments ?? {})?.file_path
          if (typeof raw === 'string' && raw !== '') {
            let resolved
            const fs = typeof ctx.get === 'function' ? ctx.get('fs') : null
            if (fs !== null && typeof fs === 'object' && typeof fs.resolve === 'function') {
              try {
                resolved = (await fs.resolve(raw, { signal: exec.signal }))?.targetKey
              } catch {
                resolved = undefined // 解析失败 → 退回 raw basename 判定（fail closed 方向）
              }
            }
            const denial = instructionFileDenial(raw, resolved)
            if (denial !== null) return denial
          }
        }
      }
    }
    return next()
  }, true)
}

// P6-14.f1 per-agent restrict（VERIFY-P6-14 [FIX]；快捷列第 1 级）：profile 插件
// 经 agent.ctx.tools.restrict() 把 worker 会话的模型可见工具表收窄——协调者 /
// 再委派 / 后台作业入口对 worker 彻底消失（D9③④⑤ 的工具表层），主 bot 不受
// 影响（restrict 只挂 worker 的 scoped ctx）。pre-execute 守卫保留：pipeline 的
// tools/pre-execute 先于工具名解析（dsh-tools pipeline.js prepare→waterfall，
// dispatchToolBody 才 resolveExecution），故字面串拒 / 顺序差分格
// （run_in_background 先于 shell-ask 出卡）不变，restrict 覆盖不了的（参数级
// 后台、后续注册/改名）与 restrict 未及挂上的会话（见下）仍由守卫兜底。
// API 形状对照 repos/deepseek-harness@ce7073d packages/core/tools/src/index.ts:160-190
// （与已装 0.2.2-alpha.2 lib/index.js:453-467 语义一致）：需 scoped ctx、拒未知
// 全局名、返回幂等 disposer——哨兵测试锁这三条（orchestration-envelope.test.ts）。
// 已知上限（ponytail:）：agent 先于 createdBy 落盘变 live（生产不会——main 在
// session/create 前写 bots.json，orchestrate.ts createWorkerBot 第 3/4 步；仅
// 手改 bots.json 的既有会话）→ 该实例不挂 restrict，执行期守卫照拒，会话重建
// 后恢复；f2 起 bots.json 不可读 → fail closed 全挂（不再与旧守卫的放行口径
// 一致，C-1）。
/** per-agent restrict 的拒绝面（三族并集；bash/pwsh 不进——参数级由守卫判）。 */
export const RESTRICT_TOOLS = [...COORDINATOR_TOOLS, ...DELEGATION_TOOLS, ...JOB_TOOLS]

/**
 * deny = RESTRICT_TOOLS ∩ 已装注册表。restrict 拒绝未知名（0.2.2-alpha.2 与
 * ce7073d 同一抛错），交集后再交；未装的入口本就 UNKNOWN_TOOL，不需要 restrict。
 * 注意注册表必须取 **agent 自己的可见面**（`tools.definitions(agent)`）：standard
 * preset 的再委派 / 后台作业工具不在插件 ctx 的全局注册表里（实测 agent/created
 * 时全局仅 5 件），而在 agent 的继承链层——对 agent 可见、可 restrict，但用全局
 * 视图取交集会把它们全部漏掉。
 * @param {Iterable<string>} registeredNames agent 可见面里的工具名。
 * @returns {string[]} 可安全交给 restrict 的 deny 名单。
 */
export function workerRestrictDeny(registeredNames) {
  const registered = registeredNames instanceof Set ? registeredNames : new Set(registeredNames)
  return RESTRICT_TOOLS.filter((name) => registered.has(name))
}

/**
 * 对一个 worker agent 挂 per-agent restrict（调用方先判 worker 身份）。
 * @param {{ id: unknown, ctx: { tools: { restrict(filter: { deny: string[] }): () => void } } }} agent worker 的 live agent。
 * @param {{ definitions(scope?: unknown): Array<{ name: string }> }} tools tools 服务（用 agent 视图取交集）。
 * @returns {(() => void) | null} restrict 的原样 disposer；deny 为空 → null（不挂）。
 */
export function applyWorkerRestriction(agent, tools) {
  const deny = workerRestrictDeny(tools.definitions(agent).map((tool) => tool.name))
  if (deny.length === 0) return null
  return agent.ctx.tools.restrict({ deny })
}

/**
 * worker 会话建立点挂 per-agent restrict（P6-14.f1 主接线）+ 创建点谱系拒绝
 * （f2 C-2）：agent/created（含 SDK 重启后 resume 的冷 worker 唤醒）+ 构造时已
 * live 的引导扫描，照 upstream tool-agent-team 的生命周期模式（agent/created /
 * agent/disposed + agents.list() bootstrap，experimental/tool-agent-team/src/
 * index.ts:422-431）。
 * agent/created 是 serial dispatch（listener 抛错会 fail 会话创建）——f2 的
 * 创建点谱系拒绝更早挂在 session/created（同步抛错 veto session 发布，见内）；
 * agent/created 只做 restrict 挂载，任何分支不外抛：挂不上只损失工具表收窄，
 * 执行期守卫照拒（fail open 到更强的兜底，不是放行）。
 * @param {{ agents: { list(): Array<{ id: unknown }> }, tools: { definitions(scope?: unknown): Array<{ name: string }> }, logger?: { warn?(message: string): void }, on(name: string, fn: (payload: any) => void): () => void }} ctx dsh plugin context.
 * @param {{ config?: { dataDir?: string } }} orch the owning OrchestrationPlugin。
 * @returns {() => void} disposer：摘监听并撤销全部已挂 restriction。
 */
export function registerWorkerRestriction(ctx, orch) {
  const dir = () => orch.config?.dataDir ?? orchDataDir()
  /** @type {Map<string, () => void>} */
  const applied = new Map()
  /**
   * C-2 创建点拒绝（f2）：挂在 session/created（比 agent/created 更早）——同步
   * 抛错 veto session 发布并回滚 attach（dsh-session/src/index.ts:1297-1312
   * "Synchronous throws intentionally propagate and veto publication"），改名
   * 委派工具的调用以 isError 结束、子代理既无 agent 也无 session。判定按
   * SessionHeader 持久字段（origin/parentSession，child-agent.ts childSessionMeta）。
   */
  const rejectWorkerChildSession = (session) => {
    const header = session?.header
    if (header?.origin !== 'subagent') return
    const parent = String(header.parentSession ?? '')
    if (resolveWorkerStatus(parent, dir()) !== 'main') {
      throw new Error(`pbots/forbidden: worker sessions cannot delegate further (child session of "${parent}" denied at creation; run the task yourself)`)
    }
  }
  const maybeRestrict = (agent) => {
    const id = String(agent?.id ?? '')
    if (applied.has(id)) return
    if (!isEnveloped(agent, dir())) return
    try {
      const undo = applyWorkerRestriction(agent, ctx.tools)
      if (undo !== null) applied.set(id, undo)
    } catch (error) {
      ctx.logger?.warn?.(`pbots orchestration: worker tool restriction not applied to ${id}: ${String(error)} (pre-execute envelope still denies)`)
    }
  }
  const lift = (id) => {
    const undo = applied.get(id)
    if (undo === undefined) return
    applied.delete(id)
    try { undo() } catch { /* 幂等 disposer，重复撤销无害 */ }
  }
  // f3 恢复撤销（VERIFY-P6-14.f2 新问题 1）：unknown 窗口（文件缺失/损坏）挂上
  // 的 restrict，在身份变为确认非 worker 后撤掉（主 bot 工具表恢复）。SDK 观察
  // 不到 main 的写盘，撤销挂在已有事件点：session/created / agent/created（全体
  // sweep）与 tools/pre-execute（只查执行中的 agent）。只撤销、不新挂——新 worker
  // 的 restrict 由创建点负责。ponytail: 无 fs.watch——恢复在下个可见事件生效；
  // 被隐藏工具的首调确会经过 pre-execute（并当场撤销 restrict），但本次工具解析
  // 快照仍按隐藏表报 UNKNOWN_TOOL 一次，重试即恢复；需要零窗口时再加文件监听。
  const sweepAgent = (agent) => {
    const id = String(agent?.id ?? '')
    if (applied.has(id) && !isEnveloped(agent, dir())) lift(id)
  }
  const sweepAll = () => {
    if (applied.size === 0) return
    try {
      for (const agent of ctx.agents.list()) sweepAgent(agent)
    } catch { /* session/created 是 serial veto 点：sweep 不允许外抛 */ }
  }
  for (const agent of ctx.agents.list()) maybeRestrict(agent)
  const offSessionCreated = ctx.on('session/created', (session) => { sweepAll(); rejectWorkerChildSession(session) })
  const offCreated = ctx.on('agent/created', ({ agent }) => { sweepAll(); maybeRestrict(agent) })
  const offDisposed = ctx.on('agent/disposed', ({ agent }) => { lift(String(agent?.id ?? '')) })
  const offPreExecute = ctx.on('tools/pre-execute', async (exec, next) => {
    if (applied.size > 0 && exec.agent !== undefined && exec.agent !== null) sweepAgent(exec.agent)
    return next()
  }, true)
  return () => {
    offSessionCreated()
    offCreated()
    offDisposed()
    offPreExecute()
    for (const id of [...applied.keys()]) lift(id)
  }
}
