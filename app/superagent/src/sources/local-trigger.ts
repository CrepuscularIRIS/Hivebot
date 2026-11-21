// 来源: B32 新增（plan Task 3）。主 bot 会话的用户消息 → work item Trigger。
// 纯函数：id 由会话+消息稳定派生（重试同 id，Intake 去重）；空文本 throw。
import type { Trigger } from '../core/index.ts'

export const LOCAL_SOURCE = 'local'

export function localTrigger(input: { sessionId: string; messageId: string; text: string; at: string }): Trigger {
  const text = input.text.trim()
  if (text === '') throw new Error('local trigger: empty text')
  return {
    id: `local:${input.sessionId}:${input.messageId}`,
    source: LOCAL_SOURCE,
    threads: [{ source: LOCAL_SOURCE, id: input.sessionId }],
    actor: { source: LOCAL_SOURCE, id: 'person' },
    human: true,
    addressed: 'direct',
    at: input.at,
    text,
    channel: { source: LOCAL_SOURCE, thread: `local:${input.sessionId}`, address: { session: input.sessionId } },
    meta: { session: input.sessionId, message: input.messageId },
  }
}
