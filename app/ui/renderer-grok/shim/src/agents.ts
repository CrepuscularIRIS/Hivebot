// P5-51 · dsh roster/会话态 → 0.18 agent 记录 + persona currentActivity 推导（纯函数）。
// 消费端：production/model.ts projectRendererAgent（字段按其实读：id/name/isMain/currentActivity/
// hasUnread 仅 true 带/isRunning 仅 true 带/awaitingUserResponse 原样）；
// persona 状态映射：recovered/.../agent-avatar.tsx activityState（kind/tool/verb 三词表）。
import type { SessionView } from '../../../renderer/plugins/session/reduce'

export interface AgentInput {
  sessionId: string
  title: string | null
  isMain: boolean
  running: boolean
  unread: boolean
  activity: unknown
  updatedAt: number
  awaitingApproval?: boolean
}

export function toAgentRecord(input: AgentInput): Record<string, unknown> {
  return {
    id: input.sessionId,
    name: input.title !== null && input.title !== '' ? input.title : 'New chat',
    description: null,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
    isMain: input.isMain,
    isGroup: false,
    origin: 'user',
    isPinned: false,
    isRunning: input.running,
    currentActivity: input.activity,
    // 0.18 投影只在 true 时带 hasUnread（projectRendererAgent value.hasUnread === true 才展开）
    ...(input.unread ? { hasUnread: true } : {}),
    lastEntry: null,
    lastMessageId: null,
    memberIds: [],
    conversationPartnerIds: [],
    color: null,
    shape: null,
    dataUrl: null,
    awaitingUserResponse: input.awaitingApproval === true ? { reason: 'local-tool-permission' } : null,
    isHiddenFromSidebar: false,
    notificationsEnabled: true,
  }
}

/** web 类工具名 → {tool:'WebFetch'}（persona searching）；其余非 bash → {tool:name}（working）。 */
const activityOfRunningTool = (name: string): { verb: string } | { tool: string } => {
  if (name === 'bash' || name === 'shell') return { verb: 'running-commands' }
  if (name === 'web_fetch' || name === 'webFetch' || name === 'web_search' || name === 'webSearch' || name.startsWith('browser_')) return { tool: 'WebFetch' }
  return { tool: name }
}

/** 回合进行中的活动推导：最后一个 running 工具 → 工具态；否则 thinking（正文/推理中）。 */
export function activityOf(view: SessionView): unknown {
  if (!view.running) return null
  for (let i = view.items.length - 1; i >= 0; i -= 1) {
    const item = view.items[i]!
    if (item.kind === 'tool') {
      if (item.status === 'running') return activityOfRunningTool(item.name)
      return { kind: 'thinking' } // 工具都已收尾：正文/推理阶段
    }
  }
  return { kind: 'thinking' }
}
