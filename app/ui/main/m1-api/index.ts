// M1 `pbots:api` 白名单透传桥（U-11 正式版；U-00 交付空 register 占位）。
// 依据：work/p3-contract/CONTRACT.md §2/§2.2 v1.3 + 勘误行、work/p4-ui/BRIEF.md D9（永久判据）、
// work/p4-ui/PLAN.md U-11、work/p4-ui/SPIKE.md §5-2（typert wire `{request:…}` 壳、参数约束按壳内字段）。
// 设计参照 spike 桥（feat/U-00@8998435:spike/U-00/bridge.mjs，自写，无整段搬运）；本文件为 W1 重做。
import type { ConnectionRpcResult, DshConnection } from '../dsh/connect'
import { EventsLedger, invalidQuestionAnswersReason } from '../dsh/ledger'

export interface M1Request { method: string; args?: unknown }
export type M1Result = ConnectionRpcResult

/** C §2 业务表的 16 个 M1 方法（Q-spike 结论：无增行；增行须过契约问题）。 */
export const M1_ALLOW: ReadonlySet<string> = new Set([
  'agentPresets/list',
  'session/modelCatalog',
  'session/create',
  'p2temp/session.createWithConnectors',
  'session/selectModel',
  'session/rename',
  'session/prompt',
  'session/list',
  'session/cancel',
  'session/events',
  'pluginMarket/listIndexes',
  'pluginMarket/search',
  'pluginMarket/readEntryDetail',
  'pluginMarket/setIndexes',
  'pluginManager/installBundle',
  'pluginManager/listBundles',
  // T73b：连接器 standing-grants 窄门——remember 只认 SDK 侧活卡（无待答 refused），
  // clear 只清不读（回 {clearedCount}，不回显存储内容）。checkArgs 同形状校验。
  'p2sdk/connector_grants_remember',
  'p2sdk/connector_grants_clear',
  '$events/result',
  // T49（Q-047「这个直接抄DSH的配置」2026-11-11）：DSH 配置口窄门。credentials 三法
  // 只写不读（回包字段白名单过滤）；settings 写口只开 mutate（探针实测 update 在
  // llm-pi-ai 上因 patch !!js 节点恒炸，DSH Models 页官方写法即 mutate——T49 探针回执）。
  'credentials/describe',
  'credentials/set',
  'credentials/unset',
  'settings/describe',
  'settings/mutate',
])

/**
 * D9 永久硬拒层（BRIEF v1.2 D9）：独立于白名单存在——即使日后白名单扩行，
 * 凭证/account、`/permission`、configForms 也无条件拒绝；放宽须引用用户原话另开安全红线问题。
 */
export function d9DeniedReason(method: string, args: unknown): string | undefined {
  // T49 放宽依据：Q-047 用户原话「这个直接抄DSH的配置」（2026-11-11）——仅放行
  // credentials/describe|set|unset 三法（下方 T49 守卫再收引用名）；其余 credentials/*
  // （list/export/…）照 D9 永拒。原判据「凭证不进 bot」不变：set 只写不读、回包过滤。
  if (/^credentials/i.test(method) && !/^credentials\/(describe|set|unset)$/.test(method)) {
    return 'credentials methods are permanently denied (BRIEF D9; T49 opens describe/set/unset only)'
  }
  if (/^account/i.test(method)) return 'account methods are permanently denied (BRIEF D9)'
  if (method.startsWith('/permission')) return '/permission methods are permanently denied (BRIEF D9)'
  if (method === 'commands/execute' && permissionCommandLine(args) !== undefined) {
    return 'commands/execute lines starting with /permission are permanently denied (BRIEF D9)'
  }
  if (/^configForms(\/|$)/.test(method)) return 'configForms operations are permanently denied (BRIEF D9)'
  return undefined
}

/** commands/execute 的命令行（Grok dune-rpc 的斜杠命令行，形状未知，兼容 command/request.command/首元素）。 */
function permissionCommandLine(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const direct = (args as { command?: unknown }).command
  if (typeof direct === 'string' && direct.startsWith('/permission')) return direct
  const wrapped = (args as { request?: { command?: unknown } }).request?.command
  if (typeof wrapped === 'string' && wrapped.startsWith('/permission')) return wrapped
  if (Array.isArray(args) && typeof args[0] === 'string' && args[0].startsWith('/permission')) return args[0]
  return undefined
}

const forbidden = (message: string): M1Result => ({ ok: false, error: { code: 'pbots/forbidden', message, details: {} } })
const invalid = (message: string): M1Result => ({ ok: false, error: { code: 'pbots/invalid-args', message, details: {} } })

/** typert wire 壳内字段（SPIKE §5-2）：args = {request:…}。 */
function requestOf(args: unknown): Record<string, unknown> {
  const request = (args as { request?: unknown } | undefined)?.request
  return typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {}
}

/**
 * R1 合法 bundle 名（renderer 边界第一道）：scoped `@scope/name` 或裸 npm 名（npm 小写
 * 字符集，段不以 '.' 开头）。拒绝 ../、@scope/..、绝对路径、多斜杠、反斜杠——SDK 侧
 * readConnectorRows 用它们做 join(profileDir,'node_modules',name) 路径拼接。
 * 与 app/sdk/src/p2temp/index.mjs 的 BUNDLE_NAME_RE 是同一规则（跨包各持一份）。
 */
export const BUNDLE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** R1：逐名检查；返回首个非法名的拒绝消息或 undefined（全通过）。 */
export function invalidBundleNameReason(names: readonly unknown[]): string | undefined {
  for (const name of names) {
    if (typeof name !== 'string' || !BUNDLE_NAME_RE.test(name)) {
      return `connector bundle name is not a valid npm package name: ${JSON.stringify(name)} (no path segments)`
    }
  }
  return undefined
}

/** §2.2 参数约束；返回拒绝结果或 undefined（通过）。 */
const REF_NAME_RE = /^[A-Z][A-Z0-9_]*$/
/** T49b：派生函数与 DSH Models 页同源（client.js:1358 deriveKeyRef）——mutate 守卫与
 * set/unset 守卫共用一条规则，「能存路由就能存 key」成为结构保证（Sol M1）。 */
export function deriveKeyRef(route: string): string {
  return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}
/** T49：set/unset 合法引用名 = 我们默认路由的 apiKeyEnv（T49a 种子 litellm）
 * 或 deriveKeyRef 派生形态（允许中间下划线——my-route → MY_ROUTE_API_KEY）。
 * DSH_* 前缀排除（非 llm 命名域）；GITHUB_TOKEN 等不以 _API_KEY 结尾的天然不匹配。 */
const SETTABLE_REF_RE = /^(P2SDK_LLM_API_KEY|[A-Z][A-Z0-9_]*_API_KEY)$/
function t49DeniedReason(method: string, args: unknown): string | { code: 'pbots/forbidden'; message: string } | undefined {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>
  if (method === 'credentials/describe') {
    const refs = a.refs
    if (!Array.isArray(refs) || refs.length === 0 || refs.length > 64) return 'describe requires {refs: string[]} of at most 64 names'
    if (refs.some((r) => typeof r !== 'string' || !REF_NAME_RE.test(r))) return 'each credential ref must match ^[A-Z][A-Z0-9_]*$'
    return undefined
  }
  if (method === 'credentials/set' || method === 'credentials/unset') {
    // 引用名不在放行域 = 越权写他人凭证 → forbidden（工单②语义）；value 形状 = invalid-args
    const ref = a.ref
    if (typeof ref !== 'string' || !SETTABLE_REF_RE.test(ref) || ref.startsWith('DSH_')) {
      return { code: 'pbots/forbidden', message: 'credential ref must be the default route key (P2SDK_LLM_API_KEY) or a derived <ROUTE>_API_KEY name' } as const
    }
    if (method === 'credentials/set' && (typeof a.value !== 'string' || (a.value as string).length === 0)) return 'set requires a non-empty string value'
    return undefined
  }
  if (method === 'settings/mutate') {
    if (a.ns !== 'llm-pi-ai') return { code: 'pbots/forbidden', message: 'settings writes are only allowed for the llm-pi-ai namespace' } as const
    const ops = a.ops
    if (!Array.isArray(ops) || ops.length === 0) return 'mutate requires {ops: SettingsPathOp[]}'
    // DSH Models 页实际只用 set/unset 两种 op（client.js:1736-1962 pathOps），都限 providers.<route>
    for (const op of ops) {
      const o = (typeof op === 'object' && op !== null ? op : {}) as { op?: unknown; path?: unknown; value?: unknown }
      // T49b：route 字母开头（数字开头派生 1ABC_API_KEY 不是合法 POSIX env 名——DSH 上游
      // client.js:1668 注释自认该缺陷会在 credential seam 失败，这里收紧在源头拒绝）
      if (o.op !== 'set' && o.op !== 'unset') return { code: 'pbots/forbidden', message: 'mutate ops must be set/unset' } as const
      if (!Array.isArray(o.path) || o.path.length !== 2 || o.path[0] !== 'providers' || typeof o.path[1] !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(o.path[1] as string)) {
        return { code: 'pbots/forbidden', message: 'mutate ops must address providers.<route>' } as const
      }
      if (o.op === 'unset') continue
      const v = o.value
      if (typeof v !== 'object' || v === null) return 'each providers.<route> value must be an object'
      try { JSON.stringify(v) } catch { return 'providers.<route> value must be plain JSON' }
      // 经理守卫（防凭证外泄）：mutate 能写 baseURL+apiKeyEnv——不锁 apiKeyEnv，界面就能把
      // 宿主任意环境变量（GITHUB_TOKEN 等，credentials 层 source:env 可解析）当 key 发到任意
      // baseURL。锁死：apiKeyEnv 只能是本 route 的派生名（deriveKeyRef 形态 client.js:1358），
      // litellm 额外放行默认 P2SDK_LLM_API_KEY。
      const route = o.path[1] as string
      const derived = deriveKeyRef(route)
      const env = (v as { apiKeyEnv?: unknown }).apiKeyEnv
      const envOk = env === undefined || env === derived || (route === 'litellm' && env === 'P2SDK_LLM_API_KEY')
      if (!envOk) {
        return { code: 'pbots/forbidden', message: `apiKeyEnv must be ${derived}${route === 'litellm' ? ' or P2SDK_LLM_API_KEY' : ''}` } as const
      }
    }
    return undefined
  }
  return undefined
}

/** T49 ④：credentials/describe 回包逐条目字段白名单（configured/source/writable）——
 * 上游若加宽回包（多出 value 等）在 main 丢弃；set/unset 回值一律不透传（undefined）。 */
const CREDENTIAL_INFO_FIELDS = new Set(['configured', 'source', 'writable'])
function filterCredentialDescribe(result: M1Result): M1Result {
  if (!result.ok) return result
  const value = result.value as Record<string, unknown> | null
  if (typeof value !== 'object' || value === null) return result
  const kept: Record<string, unknown> = {}
  for (const [ref, info] of Object.entries(value)) {
    if (typeof info === 'object' && info !== null) {
      const row: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(info as Record<string, unknown>)) if (CREDENTIAL_INFO_FIELDS.has(k)) row[k] = v
      kept[ref] = row
    }
  }
  return { ok: true, value: kept }
}

function checkArgs(method: string, args: unknown, ledger: EventsLedger): M1Result | undefined {
  const t49 = t49DeniedReason(method, args)
  if (t49 !== undefined) return typeof t49 === 'string' ? invalid(t49) : forbidden(t49.message)
  if (method === 'pluginManager/installBundle') {
    // wire 形状：typert 命名参数 {spec, options}（U-15 联调实测：位置数组被 gateway 拒
    // 'Remote payload must contain exactly one plain-object args field'）；数组分支保留兼容旧口径
    const opts = Array.isArray(args)
      ? args[1]
      : (typeof args === 'object' && args !== null ? (args as { options?: unknown }).options : undefined)
    if (typeof opts !== 'object' || opts === null || (opts as { enabled?: unknown }).enabled !== false) {
      return invalid('installBundle requires an options object with enabled === false')
    }
    return undefined
  }
  if (method === 'p2sdk/connector_grants_remember') {
    // T73c 边界 5（T73b 遗留 wire 修正）：gateway 要 {request:{botId,serverName}}（单参方法
    // args 字段=形参名，workspace_ensure 同先例）。只收 request 单键——裸形到 gateway 必失败
    // 不兼容；多余键拒绝（防「校验一份、转发另一份」歧义）。形状同 SDK 侧正则，越界 M1 先拒。
    const keys = typeof args === 'object' && args !== null ? Object.keys(args as object) : []
    const inner = keys.length === 1 && keys[0] === 'request' ? (args as { request?: unknown }).request : undefined
    const { botId, serverName } = (typeof inner === 'object' && inner !== null ? inner : {}) as { botId?: unknown; serverName?: unknown }
    if (typeof botId !== 'string' || !/^[\w-]{1,64}$/.test(botId) || typeof serverName !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) {
      return invalid('connector_grants_remember requires exactly {request:{botId, serverName}} of word-dash shapes (bot ≤64, server ≤32)')
    }
    return undefined
  }
  if (method === 'p2sdk/connector_grants_clear') {
    if (args !== undefined && args !== null && Object.keys(args as object).length > 0) {
      return invalid('connector_grants_clear takes no arguments')
    }
    return undefined
  }
  if (method === 'pluginMarket/setIndexes') {
    // T51：目录源由界面管理（DSH Discover 同款）。wire 形状 {urls: string[]}（U-15 同因：
    // 位置数组被 gateway 拒）。上限先于上游校验拒——URL 规范化交给 plugin-market。
    const urls = (typeof args === 'object' && args !== null ? (args as { urls?: unknown }).urls : undefined)
    if (!Array.isArray(urls)) return invalid('setIndexes requires {urls: string[]}')
    if (urls.length > 20) return invalid('setIndexes accepts at most 20 index sources')
    // T51c R5: find 与「未找到」同值（元素 undefined 被当作没找到）——some 才是真判断
    if (urls.some((u) => typeof u !== 'string' || u.length === 0 || u.length > 2048)) {
      return invalid('each index source must be a non-empty string of at most 2048 chars')
    }
    return undefined
  }
  if (method === '$events/result') {
    const { clientId, eventId, outcome } = (typeof args === 'object' && args !== null ? args : {}) as {
      clientId?: unknown; eventId?: unknown; outcome?: { kind?: unknown; value?: unknown }
    }
    // P5-28：提问事件走结构化作答分支——严格 {answers:[{id,selected,custom?}]}，id 集合恰等于
    // 该批问题 id 集合（含 P5-07 的「提问事件不接受审批字符串」，二者互斥在分支里自然成立）
    const questionIds = ledger.questionIds(eventId)
    if (questionIds !== undefined) {
      const bad = invalidQuestionAnswersReason(outcome, questionIds)
      if (bad !== undefined) return invalid(`$events/result invalid answers: ${bad}`)
      const eligibility = ledger.validateQuestionResult(clientId)
      if (!eligibility.ok) return forbidden(`$events/result rejected: ${eligibility.reason}`)
      return undefined
    }
    // 审批（及未入账 eventId）：outcome 壳/值非法 = 参数问题（invalid-args）；
    // clientId/eventId 资格问题 = forbidden（U-15 ③ 联调口径）
    if (typeof outcome !== 'object' || outcome === null || outcome.kind !== 'result'
      || (outcome.value !== 'allowed-once' && outcome.value !== 'rejected')) {
      return invalid(`outcome must be {kind:'result', value:'allowed-once'|'rejected'} (structured answers are only valid for user-questions events)`)
    }
    const check = ledger.validateResult(clientId, eventId, outcome.value)
    if (!check.ok) return forbidden(`$events/result rejected: ${check.reason}`)
    return undefined
  }
  if (method === 'session/create' || method === 'p2temp/session.createWithConnectors') {
    const request = requestOf(args)
    if (typeof request.agentPreset === 'string' && request.agentPreset.startsWith('p2temp-')) {
      return invalid('agentPreset must not be a p2temp-* id (denied by CONTRACT §2 table 1 filter)')
    }
    if (method === 'p2temp/session.createWithConnectors') {
      const connectors = request.connectors
      if (!Array.isArray(connectors) || connectors.length === 0 || !connectors.every((c) => typeof c === 'string')) {
        return invalid('connectors must be a non-empty array of strings')
      }
      // R1：名字形状校验（renderer 边界第一道；SDK readConnectorRows 兜底第二道）
      const badName = invalidBundleNameReason(connectors)
      if (badName !== undefined) return invalid(badName)
    }
    return undefined
  }
  return undefined
}

/** #1 过滤（M1 唯一改写点，C §2）：滤掉 p2temp-* 行；其余字段原样，不改写上游对象。 */
function filterP2tempPresets(result: M1Result): M1Result {
  if (!result.ok) return result
  const value = result.value as { presets?: unknown } | null
  if (typeof value !== 'object' || value === null || !Array.isArray(value.presets)) return result
  const kept = value.presets.filter((row) => {
    const id = (typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined)
    return !(typeof id === 'string' && id.startsWith('p2temp-'))
  })
  return { ok: true, value: { ...value, presets: kept } }
}

export interface M1Deps {
  /** U-00 的 DshConnection（只消费 rpc / apiCount）。 */
  dsh?: Pick<DshConnection, 'rpc'>
  /** $events 台账（U-12 的原帧 tap 写入；单测注入桩）。 */
  ledger?: EventsLedger
  log?: (message: string) => void
}

/** main 进程共享台账：默认实例，U-12 的 tap 喂它，本桥只读校验。 */
export const m1Ledger = new EventsLedger()

/**
 * U-26 ②（D5「main tap 断言收到的 enabled === false」）：renderer 经本桥透传的
 * installBundle 调用记录（D9 拒绝的不进——记的是将发给 dsh 的调用）。
 * electronApp.evaluate 经 globalThis.__pbotsM1 读出（不新开 IPC，与 __pbotsM2 同约定）。
 */
export const m1Installs: Array<{ spec: unknown; enabled: unknown }> = []

/**
 * 注册 M1 处理器：白名单 → D9 硬拒 → §2.2 参数约束 → dsh.rpc 原样透传（raw-result，含 details）。
 * ipc 来源校验（event.senderFrame 匹配 pbots-app://app/ 主窗口主 frame）由 main/index.ts 的
 * assertPbotsSender 承担（U-00 交付，tests/e2e/shell/origin-gate.spec.ts (e) 已覆盖）。
 */
export function registerM1Api(deps: M1Deps = {}): (req: M1Request) => Promise<M1Result> {
  const ledger = deps.ledger ?? m1Ledger
  const log = deps.log ?? ((message: string) => { console.log(`[m1] ${message}`) })
  /** P5-28.f1 F1：$events/result 同 eventId 在途集——第一份未 settle 前第二个调用本地拒。 */
  const inflightEvents = new Set<string>()
  ;(globalThis as { __pbotsM1?: unknown }).__pbotsM1 = { installs: m1Installs }
  return async function m1Api(req: M1Request): Promise<M1Result> {
    const method = req?.method
    if (typeof method !== 'string' || method === '') {
      log('denied (bad method): not a non-empty string')
      return forbidden('method must be a non-empty string')
    }
    const d9 = d9DeniedReason(method, req.args)
    if (d9 !== undefined) {
      log(`denied (d9): ${method}`)
      return forbidden(d9)
    }
    if (!M1_ALLOW.has(method)) {
      log(`denied (not in table): ${method}`)
      return forbidden(`method not allowed: ${method}`)
    }
    const rejected = checkArgs(method, req.args, ledger)
    if (rejected !== undefined) {
      log(`denied (args): ${method}: ${rejected.ok === false ? rejected.error.message : ''}`)
      return rejected
    }
    if (deps.dsh === undefined) {
      log(`denied (no dsh): ${method}`)
      return forbidden('dsh connection not configured')
    }
    if (method === 'pluginManager/installBundle') {
      const args = (typeof req.args === 'object' && req.args !== null ? req.args : {}) as { spec?: unknown; options?: { enabled?: unknown } }
      m1Installs.push({ spec: args.spec, enabled: args.options?.enabled })
    }
    // P5-28.f1 F1：per-eventId 在途守卫——第二份并发作答不得上 wire（gateway 对二答静默忽略
    // 却回 ok，调用方拿到假成功）。错误码用 pbots/forbidden：与 clientId/eventId 资格拒绝同族
    // （U-15 ③ 联调口径），不为此新增契约错误码；settle（成功或失败）即解除，失败可重试。
    const eventId = method === '$events/result' ? (req.args as { eventId?: unknown } | undefined)?.eventId : undefined
    if (typeof eventId === 'string') {
      if (inflightEvents.has(eventId)) {
        log(`denied (in-flight): $events/result ${eventId}`)
        return forbidden(`$events/result rejected: an answer for event ${JSON.stringify(eventId)} is already in flight`)
      }
      inflightEvents.add(eventId)
    }
    let result: M1Result
    try {
      try {
        result = await deps.dsh.rpc(method, req.args)
      } finally {
        if (typeof eventId === 'string') inflightEvents.delete(eventId)
      }
    } catch (error) {
      // U-22 [GU-1]（A-HIGH）：rpcRaw 裸抛（断链 fetch 失败 / 非 200 / 坏 JSON）会 reject
      // ipcMain.handle → renderer invoke 全线抛错（loadRoster/start 卡封面、create 卡创建中）。
      // 全路径兜底成结构化 unavailable；R10 不变量保持：$events/result 抛错时 pending 保留。
      const message = error instanceof Error ? error.message : String(error)
      log(`rpc error (${method}): ${message}`)
      return { ok: false, error: { code: 'pbots/unavailable', message: `dsh rpc failed: ${message}`, details: {} } }
    }
    // R10：审批作答先发送后消费——rpc ok 才下账；失败（ok:false 或 throw）pending 保留可重试。
    // consume 为 false = settle 后本地已非 pending（gateway cancel 帧 / deadline 代答先下账），仅记日志。
    if (method === '$events/result' && result.ok) {
      const eventId = (req.args as { eventId?: unknown } | undefined)?.eventId
      if (!ledger.consumeResult(eventId)) {
        log(`$events/result consume skipped (eventId no longer pending after rpc): ${JSON.stringify(eventId)}`)
      }
    }
    if (method === 'credentials/describe') return filterCredentialDescribe(result)
    if (method === 'credentials/set' || method === 'credentials/unset') {
      // 只写不读：上游回值（若有）不进 renderer；错误照透传（T49 ⑧：错误消息不应含 value——上游契约如此）
      return result.ok ? { ok: true, value: undefined } : result
    }
    return method === 'agentPresets/list' ? filterP2tempPresets(result) : result
  }
}
