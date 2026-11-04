// P6-14 worker 安全信封（PLAN p6-orchestration P6-14 + P6-14.f1；BRIEF D9③④⑤、
// §4-5 HIGH#5/6）。两层：f1 起 worker 会话（bots.json bots[id].createdBy，
// slots.readWorkerIds 同一判定）在建立点经 per-agent restrict 收窄模型可见工具
// 表（RESTRICT_TOOLS，见文件尾）；pre-execute 执行层守卫拒三类入口并保留
// restrict 覆盖不了的字面串拒 / 顺序差分：
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
// 跟 standard preset 缺省名（approval.yml:139-160）——部署侧改名的入口拦不住，
// 需要时把新名加进 DELEGATION_TOOLS。bots.json 不可读 → readWorkerIds 返回 []
// 不按 worker 拦（与 slots 收养同口径；P5 guard 链与协调者工具自身的 main 校验
// 仍在）。主 bot 不受信封约束（委派与后台作业照常）。
import { orchDataDir } from './identity.mjs'
import { readWorkerIds } from './slots.mjs'

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
 * worker 判定每次 execute 重读 bots.json（slots.mjs 同款 ponytail：无缓存窗口，
 * worker 落盘后立即生效；文件极小、开销可忽略）。回调内不调宿主可重入 API。
 * @param {{ on(name: string, fn: (...args: any[]) => any, prepend?: boolean): () => void }} ctx dsh plugin context.
 * @param {{ config?: { dataDir?: string } }} orch the owning OrchestrationPlugin。
 * @returns {() => void} disposer。
 */
export function registerEnvelope(ctx, orch) {
  return ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.agent !== undefined && exec.agent !== null) {
      const agentId = String(exec.agent.id)
      if (readWorkerIds(orch.config?.dataDir ?? orchDataDir()).includes(agentId)) {
        const verdict = judgeWorkerCall(exec.name, exec.arguments)
        if (verdict !== null) return verdict
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
// 后恢复；bots.json 不可读 → 不挂（与守卫同口径）。
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
 * worker 会话建立点挂 per-agent restrict（P6-14.f1 主接线）：agent/created
 * （含 SDK 重启后 resume 的冷 worker 唤醒）+ 构造时已 live 的引导扫描，照
 * upstream tool-agent-team 的生命周期模式（agent/created / agent/disposed +
 * agents.list() bootstrap，experimental/tool-agent-team/src/index.ts:422-431）。
 * agent/created 是 serial dispatch（listener 抛错会 fail 会话创建）——本函数
 * 任何分支不外抛；挂不上只损失工具表收窄，执行期守卫照拒（fail open 到
 * 更强的兜底，不是放行）。
 * @param {{ agents: { list(): Array<{ id: unknown }> }, tools: { definitions(scope?: unknown): Array<{ name: string }> }, logger?: { warn?(message: string): void }, on(name: string, fn: (payload: any) => void): () => void }} ctx dsh plugin context.
 * @param {{ config?: { dataDir?: string } }} orch the owning OrchestrationPlugin。
 * @returns {() => void} disposer：摘监听并撤销全部已挂 restriction。
 */
export function registerWorkerRestriction(ctx, orch) {
  /** @type {Map<string, () => void>} */
  const applied = new Map()
  const maybeRestrict = (agent) => {
    const id = String(agent?.id ?? '')
    if (applied.has(id)) return
    if (!readWorkerIds(orch.config?.dataDir ?? orchDataDir()).includes(id)) return
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
  for (const agent of ctx.agents.list()) maybeRestrict(agent)
  const offCreated = ctx.on('agent/created', ({ agent }) => { maybeRestrict(agent) })
  const offDisposed = ctx.on('agent/disposed', ({ agent }) => { lift(String(agent?.id ?? '')) })
  return () => {
    offCreated()
    offDisposed()
    for (const id of [...applied.keys()]) lift(id)
  }
}
