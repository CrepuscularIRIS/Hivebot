// P5-52 覆盖：侧栏剥掉 carrier 没有实底的回调，上游 `== null` 门控自己收起入口。
// onBroadcast/onOpenNetwork → header 的 Broadcast to agents / Agent network（org-chart，isAgentNetworkEnabled=false 时 trigger 恒空转）
// onDuplicateAgent / onRequestDeleteAgent / onShowFullConversation → 行菜单 Duplicate / Delete / Show full conversation
// （duplicateAgent/deleteAgents 无 handler，getConversationOutline 恒空）。
import { ConversationSidebar as Upstream, type ConversationSidebarProps } from '../../frontend/src/recovered/features/conversation/workspace/sidebar'

export * from '../../frontend/src/recovered/features/conversation/workspace/sidebar'

export function ConversationSidebar(props: ConversationSidebarProps) {
  return <Upstream {...props} onBroadcast={undefined} onOpenNetwork={undefined} onDuplicateAgent={undefined} onRequestDeleteAgent={undefined} onShowFullConversation={undefined} onDeleteSelectedAgents={undefined} />
}
