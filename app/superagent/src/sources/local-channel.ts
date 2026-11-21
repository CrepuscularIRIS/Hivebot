// 来源: B32 新增（plan Task 4）。local channel 回写：只投 inject notice，不伪造 user 消息。
// requestId = 消息 id（重投幂等）；地址缺 session → gone；失败上抛给 Outbox 重试。
import type { OutboundMessage } from '../core/index.ts'

export type LocalDeliver = (input: { sessionId: string; requestId: string; text: string }) => Promise<void>

export const sendLocal = (deliver: LocalDeliver) => async (_host: unknown, message: OutboundMessage): Promise<'sent' | 'gone'> => {
  const session = (message.channel.address as { session?: unknown }).session
  if (typeof session !== 'string' || session === '') return 'gone'
  await deliver({ sessionId: session, requestId: message.id, text: message.text })
  return 'sent'
}
