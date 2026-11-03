// P5-52 覆盖：会话头剥掉 trailing（ProductionRenderer 只用它放 Channels 按钮；channels RPC 无实底）。
import { ConversationAgentHeader as Upstream, type ConversationAgentHeaderProps } from '../../frontend/src/recovered/features/conversation/workspace/chat-header'

export * from '../../frontend/src/recovered/features/conversation/workspace/chat-header'

export function ConversationAgentHeader(props: ConversationAgentHeaderProps) {
  return <Upstream {...props} trailing={undefined} />
}
