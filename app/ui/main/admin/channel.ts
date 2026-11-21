// P7-F2 受限 SDK→main 管理桥的 main 侧（p7-admin PLAN §3.2「受限管理桥」）。
// 模式沿用（第 2 级，本仓）：P6-10 ⑤ 通道 main 侧 app/ui/main/m3-meta/orch-channel.ts
// ——main 是纯客户端，常驻订阅 SDK 管理插件的请求流，每代 socket 重开；
// 单订阅与旧代拒绝在 SDK 侧（channel.mjs）+ 本文件的 policy 重验共同保证。
// 本文件只做「收帧 → 形状检查 → 重验 → 分发 → respond」，不实现任何管理
// 动作（consumer 的动作表为空）；p7-admin.yml 未加载时流报错只记 1 行日志。
import type { AdminReverifyResult } from './policy'

/** SDK 侧管理桥的流 / 应答端点（app/sdk/src/admin/channel.mjs）。 */
export const ADMIN_REQUESTS_ENDPOINT = 'pbots/admin.requests'
export const ADMIN_RESPOND_METHOD = 'pbots/admin.respond'

/** mux 下行帧（最小面，同 orch-channel.ts）。 */
export type AdminChannelFrame =
  | { type: 'item'; streamId?: string; value?: unknown }
  | { type: 'end' | 'cancel'; streamId?: string }
  | { type: 'error'; streamId?: string; error?: { message?: unknown } }

export interface AdminStreamLike {
  openStream(endpoint: string, args: unknown, onFrame: (frame: AdminChannelFrame) => void): { cancel(): void }
}

/** DshConnection 满足的最小依赖面。 */
export interface AdminDshLike {
  onConnected(listener: (generation: number) => void): unknown
  ready(): Promise<AdminStreamLike>
  rpc(method: string, args: unknown): Promise<{ ok: boolean }>
}

/** 重验后的管理请求（身份四元组 + 动作语义载荷原样透传给 consumer）。 */
export interface AdminRequest {
  requestId: string
  generation: number
  sessionId: string
  turnId: string
  originRef: string
  action: string
  target?: string | null
  params?: Record<string, unknown> | null
}

export type AdminDispatchResult = { value: object } | { error: { code: string, message: string, details?: object } }

export interface AdminChannelDeps {
  dsh: AdminDshLike
  /** 权威重验（policy.reverifyAdminRequest 的组合点，WM 接线时注入台账与当前代）。 */
  verify(request: unknown): AdminReverifyResult
  /** 受限分发（consumer.dispatch；F2 动作表为空 → 一律 unavailable）。 */
  dispatch(request: AdminRequest): Promise<AdminDispatchResult>
  /** 当前连接代（旧代请求在重验中拒）。 */
  currentGeneration(): number
  log?: (message: string) => void
}

function hasRequestShape(item: Record<string, unknown>): boolean {
  return typeof item.sessionId === 'string' && item.sessionId !== ''
    && typeof item.turnId === 'string' && item.turnId !== ''
    && typeof item.originRef === 'string' && item.originRef !== ''
    && typeof item.action === 'string' && item.action !== ''
    && Number.isInteger(item.generation)
}

/**
 * Wire the resident admin-channel subscription. Returns a stop handle for
 * tests; production keeps it for the process lifetime（P7-WM 接线）。
 */
export function wireAdminChannel(deps: AdminChannelDeps): { close(): void } {
  const log = deps.log ?? ((message: string) => console.warn(message))
  let closed = false
  let current: { cancel(): void } | undefined

  const respond = async (requestId: string, outcome: { value: object } | { error: { code: string, message: string, details?: object } }): Promise<void> => {
    // respond 的传输 / 解析失败只记日志（P6 A3 模式）：fire-and-forget 不把
    // 拒绝甩给宿主；SDK 侧请求按超时语义收敛并释放占位，不重试。
    try {
      const response = await deps.dsh.rpc(ADMIN_RESPOND_METHOD, { request: { requestId, ...outcome } })
      if (!response.ok) log(`[admin] respond failed for ${requestId} (main-side outcome: ${outcome.value !== undefined ? 'value' : 'error'})`)
    } catch (error) {
      log(`[admin] respond failed for ${requestId}: ${String(error instanceof Error ? error.message : error)}`)
    }
  }

  const handle = async (item: Record<string, unknown>): Promise<void> => {
    const requestId = item.requestId as string
    if (!hasRequestShape(item)) {
      await respond(requestId, { error: { code: 'pbots/invalid-args', message: 'admin request lacks {generation, sessionId, turnId, originRef, action}', details: {} } })
      return
    }
    const verified = deps.verify(item)
    if (!verified.ok) {
      await respond(requestId, { error: { code: verified.code, message: verified.message, details: {} } })
      return
    }
    let outcome: AdminDispatchResult
    try {
      outcome = await deps.dispatch(item as unknown as AdminRequest)
    } catch (error) {
      outcome = { error: { code: 'pbots/admin-failed', message: `admin dispatch crashed: ${String(error instanceof Error ? error.message : error)}`, details: {} } }
    }
    await respond(requestId, outcome)
  }

  const onFrame = (frame: AdminChannelFrame): void => {
    if (frame.type === 'error' || frame.type === 'end' || frame.type === 'cancel') {
      // p7-admin.yml 未加载 / 流断开——每代只记 1 行，不重试风暴（P6 验收 ⑧ 模式）
      log(`[admin] ${ADMIN_REQUESTS_ENDPOINT} stream closed: ${String(frame.type === 'error' ? (frame.error?.message ?? 'error') : frame.type)}`)
      return
    }
    const item = frame.value
    if (item === undefined) return
    if (item === null || typeof item !== 'object') {
      log(`[admin] dropped invalid ${ADMIN_REQUESTS_ENDPOINT} item: value is ${item === null ? 'null' : typeof item}, expected an object`)
      return
    }
    const candidate = item as { requestId?: unknown, ready?: unknown }
    if (candidate.ready === true || typeof candidate.requestId !== 'string' || candidate.requestId === '') return
    void handle(item as Record<string, unknown>)
  }

  let subscribing = false
  const subscribe = async (): Promise<void> => {
    // 首连竞态下每代只开一条流（P6 D-2 模式：in-flight / 已建立直接返回）
    if (closed || subscribing || current !== undefined) return
    subscribing = true
    try {
      const socket = await deps.dsh.ready()
      if (closed || current !== undefined) return
      current = socket.openStream(ADMIN_REQUESTS_ENDPOINT, {}, onFrame)
    } catch (error) {
      log(`[admin] subscribe failed: ${String(error instanceof Error ? error.message : error)}`)
    } finally {
      subscribing = false
    }
  }

  deps.dsh.onConnected(() => {
    // 新一代连接：旧流作废（socket 已断），重开一条
    current?.cancel()
    current = undefined
    void subscribe()
  })
  void subscribe()

  return {
    close() {
      closed = true
      current?.cancel()
    },
  }
}
