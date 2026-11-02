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
