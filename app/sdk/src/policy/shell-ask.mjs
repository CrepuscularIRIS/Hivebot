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
export const name = 'p2sdk-shell-ask'

/** 宿主平面注册一次，作用于全部 session（作用域事件对根监听器可达）。 */
export function apply(ctx) {
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'bash') return next()
    // 带 sandbox_permissions 的调用走 tool-bash 自己的升权审批，这里再问会重复弹窗。
    if (exec.arguments !== null && typeof exec.arguments === 'object'
      && exec.arguments.sandbox_permissions !== undefined) {
      return next()
    }
    return { kind: 'ask', reason: 'p2sdk policy: ordinary shell commands require user approval' }
  })
}
