// P7-F2 管理桥的 main 侧分发器（p7-admin PLAN §3.2：consumer.ts 初版只实现
// 已具备的账本查询 / 受限分发，未接动作明确 unavailable）。F2 只搭桥：默认
// 动作表为空，任何 action → pbots/admin-unavailable，不执行任何真实管理
// 动作。真实动作由 P7-M1/M2/M3 注册、P7-WM 接线。回复统一过
// sanitizeAdminValue（不返 token / PID / 凭证——键集与 SDK authority.mjs 的
// PROHIBITED_PARAM_KEYS 同源语义，按 UI 侧最小集维护）。
import type { AdminRequest, AdminDispatchResult } from './channel'

export type AdminActionHandler = (request: AdminRequest) => Promise<AdminDispatchResult>

/** 禁区回复键（归一 = 小写 + 去 -_）：出现在 value 里就整键剥除。 */
const REDACTED_KEYS = new Set([
  'account', 'accounts', 'accesstoken', 'apikey', 'auth', 'authorization',
  'cookie', 'credential', 'credentials', 'passwd', 'password', 'permission',
  'permissions', 'pid', 'ppid', 'privatekey', 'processid', 'refreshtoken',
  'secret', 'secrets', 'sessiontoken', 'token', 'tokens',
])

/**
 * 深剥回复里的禁区键（返回新对象，不改原值）；非 plain object / array 原
 * 样透传。遇环保留截断副本，不递归。
 */
export function sanitizeAdminValue(value: unknown, seen: Set<object> = new Set()): unknown {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    if (seen.has(value)) return []
    seen.add(value)
    return value.map((item) => sanitizeAdminValue(item, seen))
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return {}
    seen.add(value)
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''))) continue
      out[key] = sanitizeAdminValue(item, seen)
    }
    return out
  }
  return value
}

export interface AdminConsumer {
  dispatch(request: AdminRequest): Promise<AdminDispatchResult>
  /** 已接线动作名（F2：空表）。 */
  readonly actions: string[]
}

/**
 * 管理动作分发器。默认（F2）无任何动作：一切 dispatch → 明确 unavailable。
 * `actions` 是 P7-M 系列 / P7-WM 的注册缝——只有代码能注册，模型不能传表。
 */
export function createAdminConsumer(options: { actions?: Record<string, AdminActionHandler> } = {}): AdminConsumer {
  const actions = options.actions ?? {}
  return {
    actions: Object.keys(actions),
    async dispatch(request) {
      const handler = Object.hasOwn(actions, request.action) ? actions[request.action] : undefined
      if (typeof handler !== 'function') {
        return {
          error: {
            code: 'pbots/admin-unavailable',
            message: `管理动作未接线（unavailable）：${request.action}。F2 只搭桥不接真实管理动作；已接线动作：${Object.keys(actions).length === 0 ? '（无）' : Object.keys(actions).join(', ')}`,
            details: { action: request.action, wired: Object.keys(actions) },
          },
        }
      }
      let outcome: AdminDispatchResult
      try {
        outcome = await handler(request)
      } catch (error) {
        outcome = { error: { code: 'pbots/admin-failed', message: `管理动作 ${request.action} 执行异常：${String(error instanceof Error ? error.message : error)}`, details: {} } }
      }
      if ('value' in outcome) return { value: sanitizeAdminValue(outcome.value) as object }
      return outcome
    },
  }
}
