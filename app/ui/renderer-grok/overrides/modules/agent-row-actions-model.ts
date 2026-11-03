// P5-52 覆盖：行菜单「Hide from sidebar」上游恒在（setAgentHiddenFromSidebar 无 handler、也没有取消隐藏的入口）→ 滤掉。
import { agentRowActions as upstream, isHideFromSidebarAction } from '../../frontend/src/production/agent-row-actions-model'

export * from '../../frontend/src/production/agent-row-actions-model'

export function agentRowActions(...args: Parameters<typeof upstream>): ReturnType<typeof upstream> {
  return upstream(...args).filter((action) => !isHideFromSidebarAction(action))
}
