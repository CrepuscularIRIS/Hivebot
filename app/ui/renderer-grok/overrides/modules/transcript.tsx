// P5-52 覆盖：消息悬浮操作剥掉无实底的三项，保留 More → Copy。
// renderMessageReactionActions → Add reaction（reactToMessage 无 handler）；
// onReply / onStartThread → Reply、Start a thread（shim sendPrompt 只发纯文本，引用与线程语义落不到 dsh）。
// transcript-card 那条路径（TranscriptCardActionAnchor）按 context.threadRootId 门控 Reply / Start a thread，
// 而 More/Copy 依赖 context 存在：context 原样传，threadRootId 置哨兵 = 「不在主线 → 不给线程操作」。
// （context.threadRootId 全树只有 message-actions.tsx 两处消费，都是这个门控。）
// P5-54：主线 transcript 插入时间分隔 / 未读线（markers.ts，0.78.1 语义；上游只渲染、不生成）。
// P5-55：进入带未读线的会话，线以下超一屏 → 滚到线（顶下 28px）；每次冻结出新起点只滚一次，停留期不再抢滚动。
import { useEffect, useMemo } from 'react'
import { ConversationTranscript as Upstream } from '../../frontend/src/recovered/features/conversation/workspace/transcript'
import { activeAgent, createUnreadTracker, unreadScrollTop, withMarkers } from './markers'

export * from '../../frontend/src/recovered/features/conversation/workspace/transcript'

const NO_THREADS = 'pbots:no-threads'
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
  return <Upstream {...props} entries={entries} onCopyMessage={props.onCopyMessage ?? copyText} onReply={undefined} onStartThread={undefined} renderMessageReactionActions={undefined} resolveTranscriptCardInteractions={cardInteractions} />
}
