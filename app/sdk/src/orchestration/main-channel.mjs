// P6-10 ⑤ SDK→main 建 bot 通道（CONTRACT §2.4，整节暂定 Q-021；PLAN 决策 10/30）。
// 形态 = S2 §4.1-4.2 已实证的「SDK 自有 Remote stream（create 请求）+ respond
// unary（应答）」：main 仍是纯客户端，常驻订阅本流；本文件是 SDK 侧插件 +
// 通道簿记。接线骨架来源（第 1 级）:
//   work/p6-orchestration/evidence/s2-cross-session/probe.mjs（TypertRemoteService
//   + createRequire 锚点 + 单订阅者流 + peer 绑定 respond），生产约束按 S2 §4.4
//   补齐：无订阅者立即失败、超时 outcome unknown、断流作废在途、迟到 respond 拒。
//
// 错误形态：工具侧抛 RemoteError，message 一律以 code 前缀开头——dsh 的
// toolErrorResult 只把 message 放进 tool/result 文本（errorInfo 仅认
// HarnessError），模型与 UI 都只能从文本读码（pipeline.ts:695-703）。
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Delivery } from './delivery.mjs'
import { sharedSlots } from './slots.mjs'
import { registerCreateBot } from './create.mjs'
import { registerSendToBot } from './send.mjs'

// 依赖解析同 src/p2temp/index.mjs：裸包名只能解析 app/sdk 直接依赖，从稳定
// 直接依赖（dsh-plugin-market）的真实路径 createResolve，pnpm peer store 保证
// 与 dsh 运行时同一实例。
const require = createRequire(
  realpathSync(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url)),
)
const { TypertRemoteService, RemoteError } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')))

/** Marker property the gateway's SRC discovery reads (what @Remote writes). */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** ⑤ 通道端点（namespace 'pbots' + exportName；不进 M1/M2 renderer 白名单）。 */
export const ORCH_REQUESTS_ENDPOINT = 'pbots/orchestration.requests'
export const ORCH_RESPOND_METHOD = 'pbots/orchestration.respond'
/** 决策 30：createTimeoutMs 缺省 30s（orchestration.yml 可覆盖）。 */
export const DEFAULT_CREATE_TIMEOUT_MS = 30_000

/** 错误构造：message 以 code 前缀开头（见文件头「错误形态」）。 */
export function orchError(code, message, details = {}) {
  return new RemoteError(code, `${code}: ${message}`, details)
}

/**
 * Request bookkeeping for the ⑤ channel, independent of the wire plugin so
 * the security semantics unit-test without a runtime (S2 §4.4 constraints):
 * no subscriber → immediate main-unavailable; respond binds the peer holding
 * the request stream; timeout / stream detach void in-flight requests with
 * outcome 'unknown' and reject late responds; error outcomes pass code and
 * details through unchanged.
 */
export class CreateChannel {
  /**
   * @param {{ timeoutMs?: number }} [options] 决策 30 超时。
   */
  constructor({ timeoutMs = DEFAULT_CREATE_TIMEOUT_MS } = {}) {
    this.timeoutMs = timeoutMs
    /** @type {{ peer: unknown, queue: object[], wake: null | (() => void) } | null} */
    this.subscriber = null
    /** @type {Map<string, { resolve(value: unknown): void, reject(error: unknown): void, peer: unknown, timer: NodeJS.Timeout }>} */
    this.pending = new Map()
  }

  /** Whether main currently holds the request stream. */
  get subscribed() {
    return this.subscriber !== null
  }

  /** The stream generator calls this when main opens the stream. */
  attach(subscriber) {
    this.subscriber = subscriber
  }

  /**
   * The stream ended / was cancelled: void every in-flight request (作废 ≠
   * 回滚，CONTRACT §2.4) and drop the subscription.
   */
  detach() {
    this.subscriber = null
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(orchError('main-unavailable', 'request stream closed before main answered (outcome unknown)', { reason: 'stream-closed', outcome: 'unknown' }))
    }
    this.pending.clear()
  }

  /**
   * Tool side: queue one request for main and await its respond.
   * @param {object} payload request body ({kind, name, prompt, mainBotId}).
   * @returns {Promise<object>} main's value ({sessionId, warn?}).
   * @throws {RemoteError} main-unavailable / main's error outcome.
   */
  async request(payload) {
    const sub = this.subscriber
    if (sub === null) {
      throw orchError('main-unavailable', 'main is not subscribed to the create channel (outcome unknown)', { reason: 'no-subscriber', outcome: 'unknown' })
    }
    const requestId = randomUUID()
    const { promise, resolve, reject } = Promise.withResolvers()
    const timer = setTimeout(() => {
      // 决策 30：超时 → 结果未知、不自动重试；迟到 respond 被拒（条目已删）。
      this.pending.delete(requestId)
      reject(orchError('main-unavailable', `create request timed out after ${this.timeoutMs}ms (outcome unknown; do not retry automatically)`, { reason: 'timeout', outcome: 'unknown' }))
    }, this.timeoutMs)
    this.pending.set(requestId, { resolve, reject, peer: sub.peer, timer })
    sub.queue.push({ requestId, ...payload })
    sub.wake?.()
    return promise
  }

  /**
   * Main answers one request. Wrong peer or stale id → pbots/forbidden (the
   * pending entry stays for the holding peer when only the peer was wrong).
   * @param {string} requestId
   * @param {{ value?: object, error?: { code: string, message: string, details?: object } }} outcome
   * @param {unknown} peer the responding invocation's peer.
   */
  respond(requestId, outcome, peer) {
    const entry = this.pending.get(requestId)
    if (entry === undefined || entry.peer !== peer) {
      throw orchError('pbots/forbidden', 'respond rejected: wrong peer or stale request', { requestId })
    }
    this.pending.delete(requestId)
    clearTimeout(entry.timer)
    if (outcome.error !== undefined) {
      const e = outcome.error
      entry.reject(orchError(e.code, e.message, e.details ?? {}))
      return
    }
    entry.resolve(outcome.value)
  }
}

/**
 * The orchestration plugin mounted by profile/patches/orchestration.yml
 * (P6-10；进默认链 = P6-14b，未合前生产不加载)。SDK 侧 ⑤ 通道 + create_bot。
 */
export default class OrchestrationPlugin extends TypertRemoteService {
  static inject = ['tools', 'agents', 'sessionController', 'sessionPersistence']

  /**
   * @param {object} ctx dsh plugin context.
   * @param {{ createTimeoutMs?: number, capacity?: number, crashAt?: string, dataDir?: string }} [config]
   * orchestration.yml config（crashAt / dataDir 为测试与部署注入点）。
   */
  constructor(ctx, config = {}) {
    super(ctx, 'pbotsOrchestration', { namespace: 'pbots' })
    this.config = config
    this.channel = new CreateChannel({ timeoutMs: config.createTimeoutMs ?? DEFAULT_CREATE_TIMEOUT_MS })
    this.slots = sharedSlots(config.capacity)
    this.delivery = new Delivery(ctx)
    this.createBot = registerCreateBot(ctx, this)
    this.sendToBot = registerSendToBot(ctx, this) // P6-11：与 create 共用 turns/slotHolds/slots
  }

  /** Live agent or resume-by-id (cold session attach, P6-09 (a) pattern). */
  async agentOf(sessionId) {
    const live = this.ctx.agents.get(sessionId)
    if (live !== undefined) return live
    const found = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw orchError('pbots/orchestration-failed', `worker session ${sessionId} unresolvable: ${String(found.error)}`, { sessionId })
    return found.agent
  }

  /**
   * The create-request stream main subscribes to (single subscriber per
   * generation; a second concurrent subscription is an error, S2 pattern).
   */
  async *requests() {
    const invocation = this.ctx.invocation
    if (this.channel.subscribed) throw orchError('pbots/forbidden', 'another main client already holds the create channel')
    const sub = { peer: invocation.peer, queue: [], wake: null }
    this.channel.attach(sub)
    const wake = () => sub.wake?.()
    invocation.signal.addEventListener('abort', wake)
    try {
      yield { ready: true }
      while (!invocation.signal.aborted) {
        if (sub.queue.length) yield sub.queue.shift()
        else await new Promise((resolve) => { sub.wake = resolve })
      }
    } finally {
      invocation.signal.removeEventListener('abort', wake)
      if (this.channel.subscriber === sub) this.channel.detach()
    }
  }

  /**
   * main answers a request. Peer-bound to the stream holder (③: 错 Peer 拒).
   * @param {{ requestId?: unknown, value?: unknown, error?: unknown }} request
   */
  respond(request) {
    const { requestId } = request ?? {}
    if (typeof requestId !== 'string' || requestId === '') {
      throw orchError('pbots/invalid-args', 'respond expects {requestId, value | error}')
    }
    const outcome = request.error !== undefined
      ? { error: request.error }
      : { value: request.value }
    return this.channel.respond(requestId, outcome, this.ctx.invocation.peer)
  }
}

Object.defineProperty(OrchestrationPlugin.prototype, REMOTE_METHOD_DESCRIPTOR, { value: { version: 1, methods: [
  { method: 'requests', exportName: 'orchestration.requests', mode: 'stream', invocation: { kind: 'direct' } },
  { method: 'respond', exportName: 'orchestration.respond', invocation: { kind: 'direct' } },
] } })
