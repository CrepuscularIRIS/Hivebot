// P5-52 覆盖：会话头剥掉 trailing（ProductionRenderer 只用它放 Channels 按钮；channels RPC 无实底）。
// P5-54：顺带把当前 agentId 交给 transcript 覆盖的未读线（markers.ts activeAgent）。
import { ConversationAgentHeader as Upstream, type ConversationAgentHeaderProps } from '../../frontend/src/recovered/features/conversation/workspace/chat-header'
import { activeAgent } from './markers'

export * from '../../frontend/src/recovered/features/conversation/workspace/chat-header'

export function ConversationAgentHeader(props: ConversationAgentHeaderProps) {
  activeAgent.id = props.agent.id
  return <Upstream {...props} trailing={undefined} />
}
