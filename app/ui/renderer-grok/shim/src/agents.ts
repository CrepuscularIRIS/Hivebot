// P5-51 · dsh roster/会话态 → 0.18 agent 记录 + persona currentActivity 推导（纯函数）。
// 消费端：production/model.ts projectRendererAgent（字段按其实读：id/name/isMain/currentActivity/
// hasUnread 仅 true 带/isRunning 仅 true 带/awaitingUserResponse 原样）；
// persona 状态映射：recovered/.../agent-avatar.tsx activityState（kind/tool/verb 三词表）。
import type { SessionView } from '../../../renderer/session/reduce'

export interface AgentInput {
  sessionId: string
  title: string | null
  isMain: boolean
  running: boolean
  unread: boolean
  activity: unknown
  updatedAt: number
  awaitingApproval?: boolean
  /** P6-15：可读的等待原因（worker 的 askText / 主 bot 汇总）；给了就优先于 awaitingApproval 的枚举值。 */
  waitingReason?: string
  /** P5-57 D10c：侧栏预览行文案（production/model.ts 读 lastMessagePreview）。 */
  preview?: string
  /** T24：创建对话框选的形象（记录输出 avatarShape/avatarColor；未选 = null → 上游按 agentId 哈希回落）。 */
  avatarShape?: string | null
  avatarColor?: string | null
  /** T41：侧栏隐藏（localStorage 偏好；上游 ProductionRenderer 按 isHidden 过滤 visibleAgents）。 */
  isHidden?: boolean
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
    ...(input.preview !== undefined ? { lastMessagePreview: input.preview } : {}),
    lastMessageId: null,
    memberIds: [],
    conversationPartnerIds: [],
    // T24：上游 projectRendererAgent 读 avatarShape/avatarColor（production/model.ts:147）——
    // 旧键 color/shape 无人读，已删（grep 确认，回执贴）。
    avatarShape: input.avatarShape ?? null,
    avatarColor: input.avatarColor ?? null,
    dataUrl: null,
    awaitingUserResponse: input.waitingReason !== undefined ? { reason: input.waitingReason }
      : input.awaitingApproval === true ? { reason: 'local-tool-permission' } : null,
    isHiddenFromSidebar: input.isHidden === true, // T41：0.79.3 缺省 false（@3282068 isHiddenFromSidebar:o?.isHiddenFromSidebar??!1）
    notificationsEnabled: true,
  }
}

/** P5-56 · dsh 工具名（R4 名单）→ 0.78.1 原版工具名（source/host/sand-activity.ts deriveToolCallActivity）。
 * 上游 activityState 只对 WebFetch/WebSearch/browser_*→searching、Task→orbit、SendToAgent→sending 特判，
 * 其余（Shell/Read/write/edit/glob/grep/…）一律 working——与原版 Read→working 一致，表外名原样透传即可。 */
const ORIGINAL_TOOL: Record<string, string> = {
  bash: 'Shell', shell: 'Shell', read: 'Read', read_image: 'Read',
  web_fetch: 'WebFetch', web_search: 'WebSearch',
  subagent: 'Task', subagent_fork: 'Task', workflow: 'Task',
  send_message: 'SendToAgent',
}

/** 回合进行中的活动推导：最近一个仍 running 的工具 → 原版 {kind:'tool',tool}；否则 thinking（正文/推理中）。
 * 待决审批不在这里表达：toAgentRecord.awaitingUserResponse 非空时上游 persona 直接 idle（原版 mct 闸门）。 */
export function activityOf(view: SessionView): unknown {
  if (!view.running) return null
  for (let i = view.items.length - 1; i >= 0; i -= 1) {
    const item = view.items[i]!
    if (item.kind === 'user') break // 只看本回合：前回合被打断而未收尾的 running 工具不串进来
    if (item.kind === 'tool' && item.status === 'running') return { kind: 'tool', tool: ORIGINAL_TOOL[item.name] ?? item.name }
  }
  return { kind: 'thinking' }
}
