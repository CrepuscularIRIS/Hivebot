// P5-W3.f1 覆盖（L-7 R5）：手动重试的 wire requestId 复用原 nonce。
// 上游 resendFailedSend 给重试铸全新 nonce，shim 原样把它当 session/prompt.requestId——
// SDK 只按 requestId 去重（commands.ts hasPromptRequest），全新 id 不命中 → 歧义失败
// （已受理但回包丢失）后的重试会把同一输入再执行一遍（重复写文件/调连接器）。重连
// flush 走的就是「同 nonce 重发」的幂等路径，只有手动重试掉了钥匙。ack 层本来就知道
// 重试链（retryFailed 的 priorNonces），只是从未接到 wire 上——本覆盖层把
// retryFailed 观察到的 fresh→prior 映射登记到 retryWireNonces，coordinator-client
// 覆盖层在 sendPrompt 出线前把 clientNonce 换回原 nonce（SDK 去重命中 / 未受理则
// 正常执行一次），渲染侧回执对账由上游 priorNonces 链照常完成。
import {
  createTranscriptAcknowledgementController as upstreamCreate,
  type TranscriptAcknowledgementController,
} from '../../frontend/src/recovered/features/conversation/workspace/acknowledgement'

export * from '../../frontend/src/recovered/features/conversation/workspace/acknowledgement'

/** retryFailed 观察到的映射：`${agentId}::${freshNonce}` → 原 nonce（sendPrompt 出线前换回）。 */
export const retryWireNonces = new Map<string, string>()

export function createTranscriptAcknowledgementController(): TranscriptAcknowledgementController {
  const controller = upstreamCreate()
  return {
    ...controller,
    retryFailed(input) {
      if (input.freshNonce.length > 0 && input.nonce.length > 0) {
        // f2：连续重试折叠到最初 nonce——prior 若本身是重试铸出的 nonce，映射已指向根，
        // 跟一步再登记（f1 只回退一跳：N1→N2→N3 的 wire 变成 N1、N1、N2，第三次不复用 N1）。
        const root = retryWireNonces.get(`${input.agentId}::${input.nonce}`) ?? input.nonce
        retryWireNonces.set(`${input.agentId}::${input.freshNonce}`, root)
      }
      return controller.retryFailed(input)
    },
  }
}
