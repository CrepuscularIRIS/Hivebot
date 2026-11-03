// P5-52 覆盖：消息悬浮操作剥掉无实底的三项，保留 More → Copy。
// renderMessageReactionActions → Add reaction（reactToMessage 无 handler）；
// onReply / onStartThread → Reply、Start a thread（shim sendPrompt 只发纯文本，引用与线程语义落不到 dsh）。
// transcript-card 那条路径（TranscriptCardActionAnchor）按 context.threadRootId 门控 Reply / Start a thread，
// 而 More/Copy 依赖 context 存在：context 原样传，threadRootId 置哨兵 = 「不在主线 → 不给线程操作」。
// （context.threadRootId 全树只有 message-actions.tsx 两处消费，都是这个门控。）
import { useMemo } from 'react'
import { ConversationTranscript as Upstream } from '../../frontend/src/recovered/features/conversation/workspace/transcript'

export * from '../../frontend/src/recovered/features/conversation/workspace/transcript'

const NO_THREADS = 'pbots:no-threads'

export function ConversationTranscript(props: Parameters<typeof Upstream>[0]) {
  const interactions = props.resolveTranscriptCardInteractions
  const cardInteractions = useMemo(() => interactions == null ? interactions : { ...interactions, threadRootId: NO_THREADS }, [interactions])
  return <Upstream {...props} onReply={undefined} onStartThread={undefined} renderMessageReactionActions={undefined} resolveTranscriptCardInteractions={cardInteractions} />
}
