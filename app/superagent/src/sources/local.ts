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
    // 手机联通轮实测：relays/notices 以 steer/queue 模式注入主会话后，同样以 user/message 事件回流，
    // watchLocalSession 若不滤会把自己注入的 follow_up/worker_report/candidate 再当新 trigger，
    // 产生 ignore→relay→再收的回声风暴（trial 实测单条消息引发 40+ 次 LLM eval）。
    // 注入卡片的稳定形状：以 {"kind":"..."} 打头且 kind 属于我们产出的卡片类型。
    if (text.startsWith('{"kind":"')) {
      try {
        const kind = JSON.parse(text).kind
        if (kind === 'follow_up' || kind === 'worker_report' || kind === 'worker_attention' || kind === 'candidate' || kind === 'receipt') return
      } catch { /* 非 JSON 整体不滤 */ }
    }
    try { opts.receive(localTrigger({ sessionId: opts.sessionId, messageId: id, text, at: new Date().toISOString() })) } catch { /* empty text 已在上行滤过 */ }
  })
  return () => dispose()
}

export { LOCAL_SOURCE, localTrigger }
