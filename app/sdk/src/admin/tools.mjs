// P7-F2 管理工具的动作表（p7-admin PLAN §3.2 / P7-F2 行）：本任务只搭桥，
// 不接任何真实管理动作——动作表为空，默认全拒。真实动作由 P7-M1/M2/M3 注册、
// P7-WM 接线；注册前任何 action 都解析为 unknown → 明确 unavailable 拒绝
//（不静默、不半执行）。工具注册进 dsh（profile/patches/p7-admin.yml）也
// 属 P7-WM，本文件保持纯函数。
import { ACTION_WORDS } from './authority.mjs'

/**
 * 动作注册表（F2：空表）。值 = 动作规格（参数形状 / 撤销句柄等），
 * P7-M* 系列按动作填充。模型不能传表——只有代码可以。
 */
export const ADMIN_ACTIONS = {}

/**
 * 解析一个管理动作是否已接线。
 * @param {unknown} action
 * @returns {{ known: true, spec: object } | { known: false }}
 */
export function resolveAdminAction(action) {
  if (typeof action !== 'string' || !Object.hasOwn(ADMIN_ACTIONS, action)) return { known: false }
  return { known: true, spec: ADMIN_ACTIONS[action] }
}

/**
 * 未接线动作的标准拒绝（明确 unavailable，不是错误吞掉）。
 * @param {string} action
 * @returns {{ code: string, message: string, details: { action: string, wired: string[] } }}
 */
export function adminRefusal(action) {
  return {
    code: 'pbots/admin-unavailable',
    message: `管理动作未接线（unavailable）：${String(action)}。F2 只搭桥不接真实管理动作，动作表为空；已接线动作：${Object.keys(ADMIN_ACTIONS).length === 0 ? '（无）' : Object.keys(ADMIN_ACTIONS).join(', ')}`,
    details: { action: String(action), wired: Object.keys(ADMIN_ACTIONS) },
  }
}

/** authority 的动作词表透出（工具描述 / 校验复用，不另抄一份）。 */
export { ACTION_WORDS }
