// P5-52 覆盖：消息悬浮操作剥掉无实底的三项，保留 More → Copy。
// renderMessageReactionActions → Add reaction（reactToMessage 无 handler）；
// onReply / onStartThread → Reply、Start a thread（shim sendPrompt 只发纯文本，引用与线程语义落不到 dsh）。
// transcript-card 那条路径（TranscriptCardActionAnchor）按 context.threadRootId 门控 Reply / Start a thread，
// 而 More/Copy 依赖 context 存在：context 原样传，threadRootId 置哨兵 = 「不在主线 → 不给线程操作」。
// （context.threadRootId 全树只有 message-actions.tsx 两处消费，都是这个门控。）
// P5-54：主线 transcript 插入时间分隔 / 未读线（markers.ts，0.78.1 语义；上游只渲染、不生成）。
// P5-55：进入带未读线的会话，线以下超一屏 → 滚到线（顶下 28px）；每次冻结出新起点只滚一次，停留期不再抢滚动。
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConversationTranscript as Upstream } from '../../frontend/src/recovered/features/conversation/workspace/transcript'
import { AgentAvatar } from '../../frontend/src/recovered/features/conversation/workspace/agent-avatar'
import { activeAgent, createUnreadTracker, unreadScrollTop, withMarkers } from './markers'
import { begin, exitUntil, nextWakeMs, render as renderStatus, step, textKindOf, type Activity, type StatusState } from './status-line'
import '../status-line.css'

export * from '../../frontend/src/recovered/features/conversation/workspace/transcript'

const NO_THREADS = 'pbots:no-threads'

/** T23：活动形状归一（shim activityOf 产 {kind:'thinking'} | {kind:'tool',tool}；其余按无活动）。 */
const normalizeActivity = (raw: unknown): Activity => {
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as { kind?: unknown; tool?: unknown }
    if (r.kind === 'thinking') return { kind: 'thinking' }
    if (r.kind === 'tool' && typeof r.tool === 'string') return { kind: 'tool', tool: r.tool }
  }
  return null
}

/** T23：0.79.3 状态行（吉祥物 + 活动短语）。挂在 .sand-virtual-transcript 最后，随转录滚动。
 * 活动源 = chat-header 覆盖渲染期写入的 activeAgent（同 markers 先例）；wake 定时器兜底重绘。 */
function StatusLine() {
  const box = useRef<{ state: StatusState | null; visibleSince: number | null; exitUntil: number | null }>({ state: null, visibleSince: null, exitUntil: null })
  const [, setTick] = useState(0)
  const now = Date.now()
  const b = box.current
  const activity = normalizeActivity(activeAgent.activity)
  if (activeAgent.running) {
    b.exitUntil = null // review M3：退场窗口内恢复运行 → 取消退场
    if (b.state === null) {
      b.state = begin(activity, now, Math.random)
      b.visibleSince = now
      b.exitUntil = null
    } else {
      b.state = step(b.state, activity, now, Math.random)
    }
  } else if (b.state !== null && b.exitUntil === null) {
    b.exitUntil = exitUntil(now) // Yjn：回合结束保留 140ms 再卸载
  }
  useEffect(() => {
    const cur = box.current
    if (cur.state === null) return
    if (cur.exitUntil !== null) {
      const t = setTimeout(() => { box.current = { state: null, visibleSince: null, exitUntil: null }; setTick((x) => x + 1) }, Math.max(0, cur.exitUntil - Date.now()))
      return () => clearTimeout(t)
    }
    const wake = nextWakeMs(cur.state, Date.now(), cur.visibleSince ?? Date.now())
    if (wake === null) return
    const t = setTimeout(() => setTick((x) => x + 1), Math.max(0, wake - Date.now()))
    return () => clearTimeout(t)
  })
  if (b.state === null || typeof document === 'undefined') return null
  const scroller = document.querySelector<HTMLElement>('.sand-virtual-transcript')
  if (scroller === null) return null
  // 虚拟列表可能在 portal 之后又 append 行——每趟把自己挪回末尾（随转录滚到底可见）
  queueMicrotask(() => {
    const el = scroller.querySelector(':scope > .sand-status-line')
    if (el !== null && el !== scroller.lastElementChild) scroller.appendChild(el)
  })
  const out = renderStatus(b.state, now, b.visibleSince ?? now)
  const kind = textKindOf(b.state.activity)
  return createPortal(
    <div className="sand-status-line" data-role="assistant" data-activity={kind} data-exiting={b.exitUntil !== null || undefined}>
      <span className="sand-status-line__avatar"><AgentAvatar agentId={activeAgent.id ?? ''} color={activeAgent.avatarColor} shape={activeAgent.avatarShape} currentActivity={activeAgent.activity} isRunning size="sm" /></span>
      {out.text !== null ? <span className="sand-activity-label__text">{out.text}</span> : null}
      {out.elapsed !== null ? <span className="sand-activity-elapsed">· {out.elapsed}</span> : null}
    </div>,
    scroller,
  )
}
// P5-55：用户消息改走普通 message 路径后（shim 判侧修正），其 More 菜单的 Copy 依赖 onCopyMessage——宿主没注入，菜单为空 = 死入口。
// 与卡片路径的兜底同语义（message-actions.tsx clipboardCopyForEntry：navigator.clipboard.writeText）。
const copyText = (entry: { text: string }): Promise<void> | undefined => navigator.clipboard?.writeText(entry.text)
const unread = createUnreadTracker()

type Props = Parameters<typeof Upstream>[0]

export function ConversationTranscript(props: Props) {
  const interactions = props.resolveTranscriptCardInteractions
  const cardInteractions = useMemo(() => interactions == null ? interactions : { ...interactions, threadRootId: NO_THREADS }, [interactions])
  const isMainLine = props.threadRootId == null && activeAgent.id !== null
  const unreadBefore = isMainLine ? unread.visit(activeAgent.id!, props.entries) : null
  const entries = useMemo(
    () => (isMainLine ? withMarkers(props.entries, Date.now(), unreadBefore) as Props['entries'] : props.entries),
    [isMainLine, props.entries, unreadBefore],
  )
  const scrollKey = isMainLine && unreadBefore !== null ? `${activeAgent.id}:${unreadBefore}` : null
  useEffect(() => {
    if (scrollKey === null) return
    // 上游跟底在同一提交后执行，下一帧再定位
    const raf = requestAnimationFrame(() => {
      const divider = document.querySelector<HTMLElement>('.sand-virtual-transcript .sand-unread-divider')
      const scroller = divider?.closest<HTMLElement>('.sand-virtual-transcript')
      if (divider == null || scroller == null) return
      const lineTop = divider.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      const top = unreadScrollTop(lineTop, scroller.scrollHeight, scroller.clientHeight)
      if (top !== null) scroller.scrollTop = top
    })
    return () => cancelAnimationFrame(raf)
  }, [scrollKey])
  // T23：typing 三点退役（0.18 构件）——0.79.3 状态行由覆盖层自己渲染（portal 到滚动容器末尾）
  return <>
    <Upstream {...props} isAgentRunning={false} entries={entries} onCopyMessage={props.onCopyMessage ?? copyText} onReply={undefined} onStartThread={undefined} renderMessageReactionActions={undefined} resolveTranscriptCardInteractions={cardInteractions} />
    {isMainLine ? <StatusLine /> : null}
  </>
}
