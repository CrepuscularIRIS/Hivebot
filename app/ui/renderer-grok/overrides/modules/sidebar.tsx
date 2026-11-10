// P5-52 覆盖：侧栏剥掉 carrier 没有实底的回调，上游 `== null` 门控自己收起入口。
// onBroadcast/onOpenNetwork → header 的 Broadcast to agents / Agent network（org-chart，isAgentNetworkEnabled=false 时 trigger 恒空转）
// onDuplicateAgent / onRequestDeleteAgent → 行菜单 Duplicate / Delete（无 handler）。
// onShowFullConversation 已于 T21 解锁（shim getConversationOutline 实装 + outline 推送），不再置 undefined。
// P6-15 覆盖（定稿 work/p6-orchestration/ui/P6-15-16-FINAL.md）：shim 推导的 worker 合成 section 只在这里改写 props，
// 上游 sidebar 一行不动。仅当 sections 里有 pbots:* 组时生效（无 worker → props 与此前逐字相同，D11⑤）：
//   a 剥 section 编辑回调（组由 createdBy 推导，不可改名 / 删除 / 拖入拖出）
//   b 去掉空的 pbots 组（主 bot 被 pin 后 main 组为空，否则出现「Drag chats here」）
//   c rail（侧栏收起）下去掉 Workers / Done：上游会把 section 的 agent 平铺进窄轨（sidebar.tsx:461）
//   d Done 默认折叠：isCollapsed 与 onToggle 都取反
//   e 组内按 worker 档位排序（上游 projectRendererAgents 按 updatedAt 重排，shim 给的顺序到这里已丢失）
import { ConversationSidebar as Upstream, type ConversationSidebarProps } from '../../frontend/src/recovered/features/conversation/workspace/sidebar'
import { isDoneSection, isPbotsSection, isWorkerSection } from '../../shim/src/workers'
import { NewBotDialogHost } from './new-bot-dialog'
import { ui, useUiVersion } from './pbots-ui'

export * from '../../frontend/src/recovered/features/conversation/workspace/sidebar'

type Section = NonNullable<ConversationSidebarProps['sections']>[number]

const LOCKED: Partial<ConversationSidebarProps> = {
  onRenameSection: undefined, onStartRenameSection: undefined, onRequestDeleteSection: undefined, onMoveSection: undefined,
  onMoveAgentToSection: undefined, onMoveAgentToNewSection: undefined,
  onMoveSelectedAgentsToSection: undefined, onMoveSelectedAgentsToNewSection: undefined,
}

function workerSections(sections: readonly Section[], railed: boolean): Section[] {
  const rank = (id: string): number => ui()?.workerRank(id) ?? 9
  return sections
    .filter((s) => !(isPbotsSection(s.id) && s.agents.length === 0) && !(railed && isWorkerSection(s.id)))
    .map((s) => !isWorkerSection(s.id) ? s : {
      ...s,
      // ponytail: 用取反凑「Done 默认折叠」——上游 collapse store 没有默认值参数，存储里「已折叠」= 用户展开过
      isCollapsed: isDoneSection(s.id) ? !s.isCollapsed : s.isCollapsed,
      agents: [...s.agents].sort((a, b) => rank(a.id) - rank(b.id) || b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1)),
    })
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  useUiVersion() // 档位变化（审批到达 / 回合结束）即重排
  const pbots = props.sections?.some((s) => isPbotsSection(s.id)) === true
  const toggle = props.onToggleSectionCollapsed
  const worker: Partial<ConversationSidebarProps> = !pbots ? {} : {
    ...LOCKED,
    sections: workerSections(props.sections!, props.sidebarLayout?.isCollapsed === true),
    onToggleSectionCollapsed: toggle == null ? undefined : (id, collapsed) => toggle(id, isDoneSection(id) ? !collapsed : collapsed),
  }
  // P5-57：新建对话框挂在常驻的侧栏下（portal 到 body），注册 pbotsUi.chooser，侧栏 New 经 shim createAgent 先选配置
  return <><NewBotDialogHost /><Upstream {...props} {...worker} onBroadcast={undefined} onOpenNetwork={undefined} onDuplicateAgent={undefined} onRequestDeleteAgent={undefined} onDeleteSelectedAgents={undefined} /></>
}
