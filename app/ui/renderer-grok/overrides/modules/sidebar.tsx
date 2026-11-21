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
import { useRef, useState } from 'react'
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
  // T96：多选接线（B1 P1）——上游 selection 面（modifier-click/SidebarSelectionActions）全就绪，
  // Renderer 0 接线；state 放覆盖层。0.78.1 pcn/udn：meta/ctrl=toggle、shift=anchor 区间。
  // T96b（Sol 审 3 中返修）：①区间按**视觉序**（pinned 区在前+sections 展开序——props.agents 是
  // roster 序，pinned 重排后与视觉不一致）；②Delete 门控回 undefined（shim deleteAgents 是
  // unknown-method 无后端实底——确认后 Deleting failed；且单值 deleteAgent state 无队列，批量
  // 同步循环只弹最后一只。等 shim 实装后另开单恢复）。
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const anchorRef = useRef<string | null>(null)
  // 视觉序：pinned 区（props.pinnedAgentIds 序）在前，其余按 sections 展开序（worker 组已被
  // workerSections 重排——与渲染同源排序键：workerRank 优先再 updatedAt）
  const visualOrder = (): string[] => {
    const pinned = props.pinnedAgentIds ?? []
    const rank = (id: string): number => { try { return ui()?.workerRank(id) ?? 9 } catch { return 9 } }
    const sectioned = ((worker.sections ?? props.sections) ?? []).flatMap((sec) => sec.isCollapsed ? [] : [...sec.agents].sort((a, b) => rank(a.id) - rank(b.id) || b.updatedAt - a.updatedAt)).map((a) => a.id)
    const seen = new Set<string>()
    return [...pinned, ...sectioned, ...props.agents.map((a) => a.id)].filter((id) => { if (id == null || seen.has(id)) return false; seen.add(id); return true })
  }
  const order = (id: string): number => visualOrder().indexOf(id)
  const rangeBetween = (from: string, to: string): string[] => {
    const ord = visualOrder()
    const [lo, hi] = ord.indexOf(from) <= ord.indexOf(to) ? [from, to] : [to, from]
    return ord.filter((id) => ord.indexOf(id) >= ord.indexOf(lo) && ord.indexOf(id) <= ord.indexOf(hi))
  }
  const selection: Partial<ConversationSidebarProps> = {
    selectedAgentIds: selectedIds,
    onToggleAgentSelection: (id) => { anchorRef.current = id; setSelectedIds((sel) => sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) },
    onRangeSelectAgent: (id) => {
      const anchor = anchorRef.current ?? visualOrder()[0]
      if (anchor == null) return
      const range = rangeBetween(anchor, id)
      setSelectedIds((sel) => [...new Set([...sel, ...range])])
    },
    onClearAgentSelection: () => { setSelectedIds([]); anchorRef.current = null },
    // B1.A：ProductionRenderer:3469 不传 onDeleteSelectedAgents（0.18 多选删除链未接）——覆盖层自己接：
    // 调 shim deleteAgents（实底逐 id session/delete），完成后清选择；失败不吞（0.78.1 Deleting failed 路径）
    onDeleteSelectedAgents: () => {
      // 主 bot 不可删（shim 侧 mainBotId 是 metaApi 概念无 session/delete 实体——过滤，只删真 session）
      const mainIds = new Set(props.agents.filter((a) => a.isMain).map((a) => a.id))
      const ids = selectedIds.filter((id) => !mainIds.has(id))
      if (ids.length === 0) { setSelectedIds([]); anchorRef.current = null; return }
      // B1.A：走 pbotsUi.deleteAgents（deps 实底），失败 console.warn（0.78.1 Deleting failed 路径）
      void ui()?.deleteAgents(ids).then((res) => {
        setSelectedIds([]); anchorRef.current = null // 无论成败清选择（0.78.1 头随删除退场）
        if (!res.ok) console.warn('[pbots] deleteAgents failed:', res.error?.message)
      })
    },
  }
  const pbots = props.sections?.some((s) => isPbotsSection(s.id)) === true
  const toggle = props.onToggleSectionCollapsed
  const worker: Partial<ConversationSidebarProps> = !pbots ? {} : {
    ...LOCKED,
    sections: workerSections(props.sections!, props.sidebarLayout?.isCollapsed === true),
    onToggleSectionCollapsed: toggle == null ? undefined : (id, collapsed) => toggle(id, isDoneSection(id) ? !collapsed : collapsed),
  }
  // P5-57：新建对话框挂在常驻的侧栏下（portal 到 body），注册 pbotsUi.chooser，侧栏 New 经 shim createAgent 先选配置
  return <><NewBotDialogHost /><Upstream {...props} {...worker} {...selection} onBroadcast={undefined} onOpenNetwork={undefined} onDuplicateAgent={undefined} /></> // B1.A：onRequestDeleteAgent 恢复透传（shim deleteAgents 已实装——session/delete 实底）；onDuplicateAgent 仍门控（shim duplicateAgent 无实底）
}
