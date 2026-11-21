// P7-F2 受限 SDK→main 管理桥的 SDK 侧簿记（p7-admin PLAN §3.2「受限管理桥」）。
// 模式沿用（第 2 级，本仓）：P6-10 ⑤ 通道 app/sdk/src/orchestration/main-channel.mjs
// 的 CreateChannel——main-only 单订阅请求流、respond 绑持流 Peer、30s 超时
// outcome unknown 不重试、断流作废在途、迟到 respond 拒、无效 respond 形状
// 收敛为 invalid-response。本文件只做簿记与形状校验，可脱离 dsh 运行时单测。
// 差异：请求体 {requestId,generation,sessionId,turnId,originRef,action,target,
// params}（originRef 是宿主生成可重验的引用，不由模型声明）；入队前先过
// validateAdminRequest（null / 缺字段 / 超长 → 无越权面）；单订阅由 attach
// 拒绝第二个订阅者保证；请求盖章订阅时的连接代（旧代鉴别在 main 侧
// policy 重验）。
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

// 依赖解析同 orchestration/main-channel.mjs：pnpm peer store 保证同一实例。
const require = createRequire(
  realpathSync(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url)),
)
const { RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))

/** ⑤ 模式端点（namespace 'pbots'；不进 M1/M2 renderer 白名单）。 */
export const ADMIN_REQUESTS_ENDPOINT = 'pbots/admin.requests'
export const ADMIN_RESPOND_METHOD = 'pbots/admin.respond'
/** 决策 30 同款：30s 超时缺省，超时 outcome unknown 不自动重试。 */
export const DEFAULT_ADMIN_TIMEOUT_MS = 30_000
/** 超长请求上限（JSON 字符数）：入队前拒绝，不进 main。 */
export const MAX_ADMIN_REQUEST_CHARS = 8_192

/** 错误构造：message 以 code 前缀开头（tool/result 只能从文本读码，同 P6）。 */
export function adminError(code, message, details = {}) {
  return new RemoteError(code, `${code}: ${message}`, details)
}

/**
 * 请求体形状校验（wire 不可信）。null / 非对象 / 缺必填字符串 / params 非
 * plain object / 超长 → 抛 pbots/invalid-args 或 pbots/request-too-large。
 * @param {unknown} payload 调用方请求体（不含 requestId/generation，通道盖章）
 * @returns {{ sessionId: string, turnId: string, originRef: string, action: string, target?: string|null, params?: object }}
 */
export function validateAdminRequest(payload) {
  const bad = (why) => { throw adminError('pbots/invalid-args', `admin request is invalid: ${why}`) }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) bad('expected an object')
  const p = payload
  for (const key of ['sessionId', 'turnId', 'originRef', 'action']) {
    if (typeof p[key] !== 'string' || p[key] === '') bad(`${key} must be a non-empty string`)
  }
  if (p.requestId !== undefined || p.generation !== undefined) bad('requestId/generation are stamped by the channel, not caller-supplied')
  if (p.target !== undefined && p.target !== null && typeof p.target !== 'string') bad('target must be a string or null')
  if (p.params !== undefined && p.params !== null && (typeof p.params !== 'object' || Array.isArray(p.params))) bad('params must be an object')
  let size
  try { size = JSON.stringify(p).length } catch { bad('params are not JSON-serializable') }
  if (size > MAX_ADMIN_REQUEST_CHARS) {
    throw adminError('pbots/request-too-large', `admin request is ${size} chars, over MAX_ADMIN_REQUEST_CHARS=${MAX_ADMIN_REQUEST_CHARS}`)
  }
  return p
}

/**
 * 管理桥请求簿记（照 CreateChannel 安全语义）。副作用类请求超时/断流一律
 * outcome unknown：不重试，由查询操作状态恢复（P7-F1 账本）。
 */
export class AdminChannel {
  /**
   * @param {{ timeoutMs?: number }} [options]
   */
  constructor({ timeoutMs = DEFAULT_ADMIN_TIMEOUT_MS } = {}) {
    this.timeoutMs = timeoutMs
    /** @type {{ peer: unknown, generation: number, queue: object[], wake: null | (() => void) } | null} */
    this.subscriber = null
    /** @type {Map<string, { resolve(value: unknown): void, reject(error: unknown): void, peer: unknown, timer: NodeJS.Timeout }>} */
    this.pending = new Map()
  }

  /** main 是否持有请求流。 */
  get subscribed() {
    return this.subscriber !== null
  }

  /** 在途请求数（测试 / 观测）。 */
  pendingCount() {
    return this.pending.size
  }

  /**
   * main 打开请求流。单订阅：已有订阅者时第二个客户端不得抢占（重复订阅拒）。
   * @param {{ peer: unknown, generation: number, queue: object[], wake?: null | (() => void) }} subscriber
   */
  attach(subscriber) {
    if (this.subscriber !== null) {
      throw adminError('pbots/forbidden', 'another main client already holds the admin channel')
    }
    this.subscriber = { wake: null, ...subscriber }
  }

  /** 流断开：作废全部在途（作废 ≠ 回滚），弃订阅。 */
  detach() {
    this.subscriber = null
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(adminError('main-unavailable', 'admin request stream closed before main answered (outcome unknown)', { reason: 'stream-closed', outcome: 'unknown' }))
    }
    this.pending.clear()
  }

  /**
   * 工具侧：排队一个管理请求并等 main 的 respond。请求盖章 requestId + 当前
   * 订阅代 generation；超时 → outcome unknown 不重试（未知副作用不重试）。
   * @param {object} payload 请求体（见 validateAdminRequest）
   * @returns {Promise<{ ok: boolean, operationId?: string } & object>} main 的 value
   * @throws {RemoteError} main-unavailable / main 的 error outcome
   */
  async request(payload) {
    const checked = validateAdminRequest(payload)
    const sub = this.subscriber
    if (sub === null) {
      throw adminError('main-unavailable', 'main is not subscribed to the admin channel (outcome unknown)', { reason: 'no-subscriber', outcome: 'unknown' })
    }
    const requestId = randomUUID()
    const { promise, resolve, reject } = Promise.withResolvers()
    const timer = setTimeout(() => {
      this.pending.delete(requestId)
      const index = sub.queue.findIndex((entry) => entry.requestId === requestId)
      if (index >= 0) sub.queue.splice(index, 1)
      reject(adminError('main-unavailable', `admin request timed out after ${this.timeoutMs}ms (outcome unknown; do not retry automatically)`, { reason: 'timeout', outcome: 'unknown' }))
    }, this.timeoutMs)
    this.pending.set(requestId, { resolve, reject, peer: sub.peer, timer })
    // 盖章字段放最后：即便校验放过，调用方值也不得覆盖 requestId/generation
    sub.queue.push({ ...checked, requestId, generation: sub.generation })
    sub.wake?.()
    return promise
  }

  /**
   * main 作答。绑持流 Peer；迟到 / 伪造 requestId 拒；无效形状收敛为
   * invalid-response（outcome unknown，占位释放），每个分支都 settle。
   * @param {string} requestId
   * @param {{ value?: object, error?: { code: string, message: string, details?: object } }} outcome
   * @param {unknown} peer
   */
  respond(requestId, outcome, peer) {
    const entry = this.pending.get(requestId)
    if (entry === undefined || entry.peer !== peer) {
      throw adminError('pbots/forbidden', 'respond rejected: wrong peer or stale request', { requestId })
    }
    this.pending.delete(requestId)
    clearTimeout(entry.timer)
    const invalidResponse = (why) =>
      entry.reject(adminError('main-unavailable', `main answered the admin request with an invalid response: ${why} (outcome unknown)`, { reason: 'invalid-response', outcome: 'unknown', invalid: why }))
    const error = outcome?.error
    if (error !== undefined) {
      if (typeof error !== 'object' || error === null || typeof error.code !== 'string' || error.code === '') {
        invalidResponse('error payload is not {code, message}')
        return
      }
      entry.reject(adminError(error.code, `${error.code}: ${error.message}`, error.details ?? {}))
      return
    }
    if (typeof outcome?.value !== 'object' || outcome.value === null) {
      invalidResponse('no value object')
      return
    }
    entry.resolve(outcome.value)
  }
}
