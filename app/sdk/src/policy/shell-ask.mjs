// p2sdk D8 审批策略（T-07）：普通 shell 调用必须先经用户批准。
//
// 为什么存在（evidence/D8-approval.md 红用例）：dsh 现成的权限件——
// user-approval（ask/never）与 permission-presets——表达不了「普通 shell
// 必问」：tool-bash 的现成询问入口只有显式 sandbox_permissions 升权
// （来源: deepseek-harness@ce7073d packages/shell/tool-bash/src/index.ts
// approveBashEscalation），preset 的 ask 不会拦截普通调用。所以在这里挂
// dsh 的 tools/pre-execute 扩展点（packages/core/tools/src/pipeline.ts
// prepare → serviceAsk → ctx.approval.request），把每个未升权的 bash 调用
// 转成 {kind:'ask'}，由内置审批服务走 $events 问用户；拒绝/无应答 =
// fail closed（serviceAsk 映射为 deny），批准只放行一次（allowed-once）。
// 集成路径决策见 work/p2-sdk/reuse/ext-mapping.md:34。
//
// T-12（REVIEW R6/R12）：带 sandbox_permissions 不再整体放行。上游对
// 「重复当前有效模式」的调用两边都不问——validateBashArgs 在
// sandbox_permissions === effectiveMode 时提前 return（tool-bash
// index.ts:83），approveEscalation 对 mode === effectiveMode 直接返回
// （packages/sandbox/sandbox/src/escalation.ts:174）——所以只有「严格宽于
// 当前有效模式」的升权才委托 tool-bash 自己的审批（避免双重弹窗）；
// 同模式重复、更窄、未知值、或解析不到当前模式，一律在这里问（fail
// closed，去重交给用户）。当前有效模式经 ctx.get('sandboxPolicy')
// .resolve({session}) 读取，与 tool-bash resolveSandboxPolicy 同一暴露面
// （必须按方法调用保留 this，拆成裸函数会丢服务实例）。
//
// T-12.f1（增量 L 复审 R2）：显式 approval=never 时整个策略放行。死锁链
// （修复前）：本策略默认挂载后，用户切 danger-full-access preset
// （approval=never），普通 bash 在这里返回 ask，而 user-approval 对 never
// 在派发任何 answerer 之前就确定性 rejected（user-approval index.ts:301
// decide），于是 bash 全灭且永远没人被询问。never 的语义是「该 session
// 明确不走审批」，此时再问不是安全是死锁；精确匹配 'never' 才放行，
// 默认 preset（workspace-write + ask）与一切中间值行为不变。
export const name = 'p2sdk-shell-ask'

/** 严格更宽表，来源: deepseek-harness@ce7073d packages/sandbox/sandbox/src/escalation.ts WIDER_MODES。 */
const STRICTLY_WIDER = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
  'danger-full-access': [],
}

/** 宿主平面注册一次，作用于全部 session（作用域事件对根监听器可达）。 */
export function apply(ctx) {
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'bash') return next()
    if (approvalNever(ctx, exec)) return next()
    const args = exec.arguments
    const requested = args !== null && typeof args === 'object' ? args.sandbox_permissions : undefined
    const ask = { kind: 'ask', reason: 'p2sdk policy: ordinary shell commands require user approval' }
    if (requested === undefined) return ask
    // 解析当前有效模式（tool-bash resolveSandboxPolicy 同款调用）；拿不到就问。
    const policy = typeof ctx.get === 'function' ? ctx.get('sandboxPolicy') : undefined
    let effective
    if (policy !== null && typeof policy === 'object' && typeof policy.resolve === 'function') {
      const standing = policy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
      effective = standing !== null && typeof standing === 'object' ? standing.mode : undefined
    }
    if (typeof effective === 'string' && (STRICTLY_WIDER[effective] ?? []).includes(requested)) return next()
    return ask
  })
}

/**
 * 该 bash 调用所属 session 的有效审批策略是否为显式 'never'（T-12.f1）。
 *
 * 折叠顺序与暴露面（来源: deepseek-harness@ce7073d）：
 * - session override：ApprovalService.overrideOf(session)——读 session 的
 *   approval/policy 事件投影（packages/interaction/user-approval/src/
 *   index.ts:279-281）；preset 切换经 setApprovalPolicy 写入该事件
 *   （packages/interaction/permission-presets/src/index.ts:398-418 set/apply），
 *   新 session 由 pinInitialPermission 补写（:429-457，默认 preset 也写
 *   'ask'，所以 override 有值 ≠ never）。
 * - 部署默认：user-approval 插件 config.policy（构造器 public config，
 *   user-approval index.ts:176-178；base bundle 在
 *   DSH_PERMISSION_MODE=danger-full-access 时配 never，dsh-base
 *   cordis.patch.yml approval 行）。
 * - 折叠 `override ?? config ?? 'ask'` 镜像上游 effectivePolicy（user-approval
 *   index.ts:270-272）与 permission-presets derive（index.ts:348-361）。
 *
 * 读不到服务，或 overrideOf 抛错 → false（照旧 ask，fail closed：无法证明
 * never 就不放宽；session 级意图存在却读不到时，部署默认不能代言它——
 * T-17 最终 L R1）。拿不到 session 则无 override 可折叠，部署默认即有效
 * 策略。可选服务一律 ctx.get，不用 ctx.approval 属性代理（deepseek-harness
 * packages/CLAUDE.md postmortem 0001）。
 */
function approvalNever(ctx, exec) {
  const svc = typeof ctx.get === 'function' ? ctx.get('approval') : undefined
  if (svc === null || typeof svc !== 'object') return false
  const session = exec.agent === undefined ? undefined : exec.agent.session
  let override
  if (session !== undefined && typeof svc.overrideOf === 'function') {
    try {
      override = svc.overrideOf(session)
    } catch {
      // 投影状态读不出（如 session log 缺序号，session-projection/src/
      // index.ts:794-798）：session 级意图存在但不可证（可能是 pin 的 ask），
      // 部署默认不能代言它 → 不回退 config（T-17 最终 L R1：config=never 时
      // 曾因回退而放行），fail closed 到 ask。
      return false
    }
  }
  const config = svc.config
  const configured = config !== null && typeof config === 'object' ? config.policy : undefined
  return (override ?? configured ?? 'ask') === 'never'
}
