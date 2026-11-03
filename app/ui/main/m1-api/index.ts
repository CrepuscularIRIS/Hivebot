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
  'pluginManager/installBundle',
  'pluginManager/listBundles',
  '$events/result',
])

/**
 * D9 永久硬拒层（BRIEF v1.2 D9）：独立于白名单存在——即使日后白名单扩行，
 * 凭证/account、`/permission`、configForms 也无条件拒绝；放宽须引用用户原话另开安全红线问题。
 */
export function d9DeniedReason(method: string, args: unknown): string | undefined {
  if (/^credentials/i.test(method)) return 'credentials methods are permanently denied (BRIEF D9)'
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
function checkArgs(method: string, args: unknown, ledger: EventsLedger): M1Result | undefined {
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
    let result: M1Result
    try {
      result = await deps.dsh.rpc(method, req.args)
    } catch (error) {
      // U-22 [GU-1]（A-HIGH）：rpcRaw 裸抛（断链 fetch 失败 / 非 200 / 坏 JSON）会 reject
      // ipcMain.handle → renderer invoke 全线抛错（loadRoster/start 卡封面、create 卡创建中）。
      // 全路径兜底成结构化 unavailable；R10 不变量保持：$events/result 抛错时 pending 保留。
      const message = error instanceof Error ? error.message : String(error)
      log(`rpc error (${method}): ${message}`)
      return { ok: false, error: { code: 'pbots/unavailable', message: `dsh rpc failed: ${message}`, details: {} } }
    }
    // R10：审批作答先发送后消费——rpc ok 才下账；失败（ok:false 或 throw）pending 保留可重试。
    // consume 为 false = 并发路径已消费（gateway 同样只会收下一份作答），仅记日志。
    if (method === '$events/result' && result.ok) {
      const eventId = (req.args as { eventId?: unknown } | undefined)?.eventId
      if (!ledger.consumeResult(eventId)) {
        log(`$events/result consume skipped (eventId no longer pending after rpc): ${JSON.stringify(eventId)}`)
      }
    }
    return method === 'agentPresets/list' ? filterP2tempPresets(result) : result
  }
}
