// 来源: B32 新增（plan Task 3 收敛版）。主 bot 会话订阅 → Trigger。
// 完整 SourceKind 注册（schema/fields/health）推 B33 接线批——engine.receive 本身收 Trigger，
// 不经 SourceRegistry 也能进 intake（engine.ts 单事务入口）。
import type { Context } from '@deepseek-ai/cordis'
import { localTrigger, LOCAL_SOURCE } from './local-trigger.ts'

type Trigger = ReturnType<typeof localTrigger>
/** user/message 事件里本文件用到的字段。按结构取，不依赖引擎事件联合的具体形状。 */
type UserMessageEvent = { data: { id: string; source: { kind: string }; content: ReadonlyArray<{ type: string; text?: string }> } }

/** dsh-schedule 投递框架里固定的一行（0.3.8 lib/index.js:886 SCHEDULED_MESSAGE_FRAMING）。单条与批量两种投递
 * （renderReminderFraming / renderRecurringReminderBatchFraming）都带它，变更通知（notify）不带。 */
const SCHEDULED_FROM_USER = 'This is a scheduled message from the user'
/** 换段窗口补记的保留期：巡检兜底 60s 一次，留两倍余量；再久的不补（当它不是冲着主会话来的）。 */
const CATCH_UP_WINDOW_MS = 120_000
/** 补记缓冲上限：所有非主会话的用户消息都先进缓冲，封顶防堆积。 */
const CATCH_UP_LIMIT = 200

/** 来源守卫：只有出自用户的消息才变成 trigger，其余返回 undefined。 */
function userTriggerOf(sessionId: string, event: UserMessageEvent): Trigger | undefined {
  // UI 验收 B1：只有出自用户的消息才产生 trigger（真人输入，或用户订好的定时提醒）。
  // kind === 'user'：UI 输入、/api/bot send、手机联通（phone.js 走同一个 bot API）、IM 入站
  //   （ds-bot im/index.js 以 rpcId 前缀 'im:' 识别，kind 仍是 user）的共同形状。
  // kind === 'schedule'：dsh-schedule 0.3.8 有两种同源消息，来源形状一样（都没有 form），只能靠引擎自己写的
  //   固定框架区分。投递（:885–898 / :906–917 渲染 → :1381 send → agent.followup）带 SCHEDULED_FROM_USER 这一行，
  //   引擎明说这是用户发来的定时消息 → 算用户请求；变更通知（:2541 notify → agent.inject，以 "[SCHEDULE CHANGE]"
  //   打头，正文写明 "This notice is not a delivery of the task and needs no action"）不带 → 不算。
  //   只认带这一行的：以后再冒出别的 schedule 消息，默认不进 trigger 表。
  // 不算的：引擎每步注入的 runtime-context / skill-catalog / time-context、ds-bot 的 kickoff / request / reply、
  // ask_user_question 的回答（user-question-reply，属于进行中的那一轮）、本插件自己的卡片
  // （delivery.ts 恒标 dsh-superagent）——它们也都以 user/message 回流，旧实现按文本前缀过滤，
  // 实测把它们全当真人请求，Chief 开场即回应两张由自己运行时上下文生成的 candidate 卡（回声）。
  // 按 string 比较：已装 dsh-session 的类型联合里没有 schedule（dsh-schedule 以模块扩充声明），运行时确实会出现。
  const kind: string = event.data.source.kind
  if (kind !== 'user' && kind !== 'schedule') return undefined
  const { id, content } = event.data
  const text = content.map((b) => (b.type === 'text' ? b.text : '')).join(' ').trim()
  if (text === '') return undefined // 空文本不产生 work item（与 localTrigger 同语义）
  if (kind === 'schedule' && !text.split('\n').includes(SCHEDULED_FROM_USER)) return undefined
  // 纵深防御（手机联通轮回声风暴的旧防线，现由上面的 source 守卫主挡）：relays/notices 以 steer/queue 模式
  // 注入主会话后，同样以 user/message 事件回流，
  // 本监听若不滤会把自己注入的 follow_up/worker_report/candidate 再当新 trigger，
  // 产生 ignore→relay→再收的回声风暴（trial 实测单条消息引发 40+ 次 LLM eval）。
  // 注入卡片的稳定形状：以 {"kind":"..."} 打头且 kind 属于我们产出的卡片类型。
  if (text.startsWith('{"kind":"')) {
    try {
      const kind = JSON.parse(text).kind
      if (kind === 'follow_up' || kind === 'worker_report' || kind === 'worker_attention' || kind === 'candidate' || kind === 'receipt') return undefined
    } catch { /* 非 JSON 整体不滤 */ }
  }
  try { return localTrigger({ sessionId, messageId: id, text, at: new Date().toISOString() }) } catch { return undefined /* 空文本已在上行滤过 */ }
}

export interface LocalMasterWatch {
  /** 把主会话切到 sessionId：此后它的用户消息即时入账；补记窗口内已到达该会话、当时它还不是主会话的用户消息（按到达顺序）。
   * 指向同一会话是空操作。 */
  retarget: (sessionId: string) => void
  /** 退订并清空补记缓冲；之后 retarget 也不再入账。 */
  stop: () => void
}

/** 订阅主 bot 会话的用户消息，映射为 local Trigger 交给 receive（哪些算用户消息见 userTriggerOf）。
 *
 * UI 验收 B2 残余 / 顾问复核 F1：DS-Bot 换段（parts.js newPart）先落盘 state.json，插件的监听要等重算后才切到
 * 新段；这段时间里到达新段的用户消息，按会话挂/摘的旧实现直接漏记——实测换段后 0.28s 发出的真人消息永久不在
 * trigger 表，重算再快也只剩一个亚秒级的窗。所以监听一直挂着，听所有会话的 user/message：
 *   - 当前主会话的 → 立即交给 receive；
 *   - 其它会话的 → 先过同一道来源守卫，过了的连同到达时刻留在缓冲里（最多 CATCH_UP_LIMIT 条、CATCH_UP_WINDOW_MS 内），
 *     retarget 到它时按到达顺序补交。
 * 缓冲只在内存里：插件启动前的不算，不会把旧消息灌成新 trigger；trigger 的 id 由会话+消息稳定派生，Intake 去重。 */
export function watchLocalMaster(ctx: Context, opts: { receive: (t: Trigger) => void; windowMs?: number; now?: () => number }): LocalMasterWatch {
  const windowMs = opts.windowMs ?? CATCH_UP_WINDOW_MS
  const now = opts.now ?? Date.now
  let current: string | undefined
  let stopped = false
  const pending: Array<{ sessionId: string; trigger: Trigger; seenAt: number }> = []
  const deliver = (trigger: Trigger) => { try { opts.receive(trigger) } catch { /* receive 抛错不拖垮事件总线上的其它监听 */ } }
  const prune = () => {
    const cutoff = now() - windowMs
    while (pending.length > 0) {
      const oldest = pending[0]
      if (oldest === undefined || (oldest.seenAt >= cutoff && pending.length <= CATCH_UP_LIMIT)) break
      pending.shift()
    }
  }
  const dispose = ctx.on('session/event', (session, event) => {
    if (stopped || event.type !== 'user/message') return
    const trigger = userTriggerOf(session.id, event)
    if (trigger === undefined) return
    if (session.id === current) { deliver(trigger); return }
    pending.push({ sessionId: session.id, trigger, seenAt: now() })
    prune()
  })
  return {
    retarget: (sessionId) => {
      if (stopped || sessionId === current) return
      current = sessionId
      prune()
      for (let i = 0; i < pending.length;) {
        const entry = pending[i]
        if (entry === undefined) break
        if (entry.sessionId !== sessionId) { i++; continue }
        pending.splice(i, 1)
        deliver(entry.trigger)
      }
    },
    stop: () => { stopped = true; pending.length = 0; dispose() },
  }
}

export { LOCAL_SOURCE, localTrigger }
