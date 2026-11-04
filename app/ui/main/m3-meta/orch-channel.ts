// P6-10 ⑤ SDK→main 建 bot 通道的 main 侧（CONTRACT §2.4，整节暂定 Q-021）。
// main 仍是纯客户端：常驻订阅 SDK 编排插件的自有请求流（照 U-16 $events 模
// 式，每代 socket 重开），收到 create 请求 → createWorkerBot 编排 →
// respond unary 应答。流端点不进 M1/M2 renderer 白名单（respond 只对持有请求
// 流的 Peer 生效，SDK 侧校验）。orchestration.yml 未加载时订阅只报 1 行日志，
// 不重试风暴（验收 ⑧）；断流后在途请求由 SDK 侧作废，这里不排队。
import type { ConnectionRpcResult } from './orchestrate'

/** SDK 侧编排插件的流 / 应答端点（app/sdk/src/orchestration/main-channel.mjs）。 */
export const ORCH_REQUESTS_ENDPOINT = 'pbots/orchestration.requests'
export const ORCH_RESPOND_METHOD = 'pbots/orchestration.respond'

/** mux 下行帧（main/dsh/socket.ts MuxFrame 的最小面）。 */
export type OrchFrame =
  | { type: 'item'; streamId?: string; value?: unknown }
  | { type: 'end' | 'cancel'; streamId?: string }
  | { type: 'error'; streamId?: string; error?: { message?: unknown } }

export interface OrchStreamLike {
  openStream(endpoint: string, args: unknown, onFrame: (frame: OrchFrame) => void): { cancel(): void }
}

/** DshConnection 满足的最小依赖面。 */
export interface OrchDshLike {
  onConnected(listener: (generation: number) => void): unknown
  ready(): Promise<OrchStreamLike>
  rpc(method: string, args: unknown): Promise<{ ok: boolean }>
}

export interface OrchChannelDeps {
  dsh: OrchDshLike
  /** ⑤ 编排（createWorkerBot）；请求体原样传入。 */
  create: (request: unknown) => Promise<ConnectionRpcResult<{ sessionId: string; warn?: string }>>
  log?: (message: string) => void
}

/**
 * Wire the resident orch-channel subscription. Returns a stop handle for
 * tests; production keeps it for the process lifetime.
 */
export function wireOrchChannel(deps: OrchChannelDeps): { close(): void } {
  const log = deps.log ?? ((message: string) => console.warn(message))
  let closed = false
  let current: { cancel(): void } | undefined

  const onFrame = (frame: OrchFrame): void => {
    if (frame.type === 'error' || frame.type === 'end' || frame.type === 'cancel') {
      // 验收 ⑧：orchestration.yml 未加载 / 流断开 —— 每代只记 1 行
      log(`[orch] ${ORCH_REQUESTS_ENDPOINT} stream closed: ${String(frame.type === 'error' ? (frame.error?.message ?? 'error') : frame.type)}`)
      return
    }
    const item = frame.value as { requestId?: unknown; ready?: unknown } | undefined
    if (item === undefined || item.ready === true || typeof item.requestId !== 'string') return
    void answer(item as { requestId: string })
  }

  const answer = async (request: { requestId: string }): Promise<void> => {
    let outcome: { value: { sessionId: string; warn?: string } } | { error: { code: string; message: string; details?: unknown } }
    try {
      const created = await deps.create(request)
      outcome = created.ok ? { value: created.value } : { error: created.error }
    } catch (error) {
      outcome = { error: { code: 'pbots/orchestration-failed', message: `create orchestration crashed: ${String(error instanceof Error ? error.message : error)}`, details: {} } }
    }
    const response = await deps.dsh.rpc(ORCH_RESPOND_METHOD, { request: { requestId: request.requestId, ...outcome } })
    if (!response.ok) log(`[orch] respond failed for ${request.requestId} (main-side outcome: ${outcome.value !== undefined ? 'created' : 'failed'})`)
  }

  const subscribe = async (): Promise<void> => {
    if (closed) return
    try {
      const socket = await deps.dsh.ready()
      if (closed) return
      current = socket.openStream(ORCH_REQUESTS_ENDPOINT, {}, onFrame)
    } catch (error) {
      log(`[orch] subscribe failed: ${String(error instanceof Error ? error.message : error)}`)
    }
  }

  deps.dsh.onConnected(() => { void subscribe() })
  void subscribe() // 首次接线时已连接的情形

  return {
    close() {
      closed = true
      current?.cancel()
    },
  }
}
