// 来源: B32 新增（plan Task 3 收敛版）。主 bot 会话订阅 → Trigger。
// 完整 SourceKind 注册（schema/fields/health）推 B33 接线批——engine.receive 本身收 Trigger，
// 不经 SourceRegistry 也能进 intake（engine.ts 单事务入口）。
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { localTrigger, LOCAL_SOURCE } from './local-trigger.ts'

/** 订阅一个 DSH 会话的用户消息，映射为 local Trigger 交给 receive。返回退订函数。 */
export function watchLocalSession(ctx: Context, opts: { sessionId: string; receive: (t: ReturnType<typeof localTrigger>) => void }): () => void {
  const target = opts.sessionId as SessionId
  const dispose = ctx.on('session/event', (session, event) => {
    if (session.id !== target || event.type !== 'user/message') return
    const { id, content } = event.data
    const text = content.map((b) => (b.type === 'text' ? b.text : '')).join(' ').trim()
    if (text === '') return // 空文本不产生 work item（与 localTrigger 同语义）
    try { opts.receive(localTrigger({ sessionId: opts.sessionId, messageId: id, text, at: new Date().toISOString() })) } catch { /* empty text 已在上行滤过 */ }
  })
  return () => dispose()
}

export { LOCAL_SOURCE, localTrigger }
