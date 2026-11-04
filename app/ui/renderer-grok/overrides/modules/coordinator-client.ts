// P5-W3.f1 覆盖（L-7 R5）：sendPrompt 出线前把手动重试的新 nonce 换回原 nonce。
// 换点在 coordinator client 的 call() 上——位于上游全部路由/日志决策（resend 走
// sendComposerPrompt、乐观条目按新 nonce 记账）之后、wire 之前，只改帧里的
// clientNonce（= shim 的 session/prompt.requestId），让 SDK 的 requestId 去重对
// 「已受理但回包丢失」的重试生效。映射来自 acknowledgement 覆盖层的 retryWireNonces
// （retryFailed 观察到的 fresh→prior）。其余方法与帧原样透传。
import {
  createCoordinatorClient as upstreamCreate,
  type ProductionCoordinatorClient,
} from '../../frontend/src/production/coordinator-client'
// L-8 O2：CoordinatorPortBridge 的真正导出位置是 recovered/contracts/desktop-bridge
// （上游 production/coordinator-client 只 import 不 re-export，从那里引是 TS2459）。
import type { CoordinatorPortBridge } from '../../frontend/src/recovered/contracts/desktop-bridge'
import { retryWireNonces } from './acknowledgement'

export * from '../../frontend/src/production/coordinator-client'

/** 只对 sendPrompt 且已登记重试链的 clientNonce 生效；其余原样返回。单测直测。 */
export function withWireSendPromptNonce(method: string, args: unknown): unknown {
  if (method !== 'sendPrompt' || typeof args !== 'object' || args === null) return args
  const record = args as { agentId?: unknown; clientNonce?: unknown }
  if (typeof record.agentId !== 'string' || typeof record.clientNonce !== 'string') return args
  const prior = retryWireNonces.get(`${record.agentId}::${record.clientNonce}`)
  return prior === undefined ? args : { ...record, clientNonce: prior }
}

export function createCoordinatorClient(portBridge: CoordinatorPortBridge): ProductionCoordinatorClient | null {
  const client = upstreamCreate(portBridge)
  if (client === null) return null
  return {
    ...client,
    call: (method: string, args?: unknown) => client.call(method, withWireSendPromptNonce(method, args)),
  }
}
