// T77 覆盖：来源 grok-bot-0.18-reconstructed@a9f633e:frontend/src/production/AgentRowActions.tsx
// 整复制仅改菜单项原语：SandButton(variant=secondary 灰底药丸居中) → SandMenuItem
//（ui-menu__row 左对齐透明行 + hover 底，0.78.1 menu item 形态；RE-UI-LAYOUT §1.2）。
// 子菜单项本就是 SandMenuItem（上游 L82-83）——本覆盖消同文件两种原语混用。
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { SandIcon } from "../../frontend/src/recovered/ui/sand-kit-primitives";
import { SandContextMenu, SandMenuContent, SandMenuItem, SandMenuRoot, SandMenuTrigger } from "../../frontend/src/recovered/ui/sand-floating-primitives";
import {
  AGENT_ROW_ACTIONS_LABEL,
  agentRowActions,
  isCopyConversationIdAction,
  isDeleteAgentAction,
  isDuplicateAgentAction,
  isHideFromSidebarAction,
  isMarkAgentUnreadAction,
  isTogglePinAction,
  markAgentUnreadValue,
  togglePinValue
} from "../../frontend/src/production/agent-row-actions-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51965
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2345000
// fcn/rcn/zct: exact agent-row section submenu, labels, current-section projection,
// and new-section callback seam.

export interface AgentRowActionsProps {
  agentId: string;
  agentName: string;
  isGroup?: boolean;
  isPinned?: boolean;
  hasUnread?: boolean;
  isHidden?: boolean;
  onHideFromSidebar(agentId: string): void;
  onCopyConversationId?(agentId: string): void;
  onDuplicateAgent?(agentId: string): void;
  onTogglePin?(agentId: string, isPinned: boolean): void;
  onSetAgentUnread?(agentId: string, isUnread: boolean): void;
  sections?: readonly { id: string; name: string }[];
  currentSectionId?: string;
  onMoveToSection?(sectionId: string): void;
  onMoveToNewSection?(): void;
  onOpenProfile?(agentId: string): void;
  onShowFullConversation?(agentId: string): void;
  onShowAsyncTasks?(agentId: string): void;
  onRequestDelete?(agent: { id: string; name: string; isGroup?: boolean }): void;
  children: ReactNode;
}

/** T77：顶层菜单行——SandContextMenu 只提供 FloatingContext（无 MenuContext），
 * 真 SandMenuItem 会 throw；本地 plain 行借 ui-menu__row 类（左对齐透明行+hover 底+T77 .12s）。 */
function MenuItemRow({ children, onSelect }: { children: ReactNode; onSelect(): void }): ReactNode {
  return <div className="ui-menu__row" data-component="menu-row" role="menuitem" onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} tabIndex={0}>{children}</div>;
}

export function AgentRowActions({ agentId, agentName, isPinned = false, hasUnread = false, isGroup, isHidden = false, onHideFromSidebar, onCopyConversationId, onDuplicateAgent, onTogglePin, onRequestDelete, onSetAgentUnread, sections, currentSectionId, onMoveToSection, onMoveToNewSection, onOpenProfile, onShowFullConversation, onShowAsyncTasks, children }: AgentRowActionsProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const actions = agentRowActions({ hasUnread, isHidden, isPinned, includeCopy: onCopyConversationId != null, includeDelete: onRequestDelete != null, includeDuplicate: onDuplicateAgent != null, includeMarkUnread: onSetAgentUnread != null, includePin: onTogglePin != null });

  const openAt = (x: number, y: number) => {
    if (actions.length === 0) return;
    setMoveMenuOpen(false);
    setMenu({ x, y });
  };
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    openAt(event.clientX, event.clientY);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    openAt(bounds.left + 8, bounds.bottom);
  };

  const canMoveToSection = !isPinned && !isHidden && (onMoveToNewSection != null || (sections != null && sections.length > 0 && onMoveToSection != null));
  const sectionLabel = sections != null && sections.length > 0 ? "Move to" : "Move to new section";
  const closeMenu = () => {
    setMenu(null);
    setMoveMenuOpen(false);
  };

  const content = <div className="ui-menu__list" data-component="menu-list">
    {onOpenProfile == null ? null : <MenuItemRow onSelect={() => { closeMenu(); onOpenProfile(agentId); }}><SandIcon name="pencil" size="sm" />Edit Profile</MenuItemRow>}
    {onShowFullConversation == null ? null : <MenuItemRow onSelect={() => { closeMenu(); onShowFullConversation(agentId); }}><SandIcon name="list-bullets" size="sm" />Show full conversation</MenuItemRow>}
    {onShowAsyncTasks == null ? null : <MenuItemRow onSelect={() => { closeMenu(); onShowAsyncTasks(agentId); }}><SandIcon name="clock" size="sm" />Show async tasks</MenuItemRow>}
    {canMoveToSection ? sections != null && sections.length > 0 ? <>
      <SandMenuRoot closeOnSelect={false} onOpenChange={setMoveMenuOpen} open={moveMenuOpen} placement="right-start">
        <SandMenuTrigger><button className="ui-menu__row sand-agent-row-menu-trigger" role="menuitem" type="button">{sectionLabel}</button></SandMenuTrigger>
        <SandMenuContent ariaLabel="Move to section">
          {onMoveToSection == null ? null : sections.map((section, index) => <SandMenuItem index={index} key={section.id} onSelect={() => { closeMenu(); onMoveToSection(section.id); }}>{section.name}</SandMenuItem>)}
          {onMoveToNewSection == null ? null : <SandMenuItem index={sections.length} onSelect={() => { closeMenu(); onMoveToNewSection(); }}>New section</SandMenuItem>}
        </SandMenuContent>
      </SandMenuRoot>
    </> : <MenuItemRow onSelect={() => { closeMenu(); onMoveToNewSection?.(); }}>Move to new section</MenuItemRow> : null}
    {actions.map((action) => <MenuItemRow
      key={action.id}
      onSelect={() => {
        closeMenu();
        if (isTogglePinAction(action)) onTogglePin?.(agentId, togglePinValue(action));
        else if (isDuplicateAgentAction(action)) onDuplicateAgent?.(agentId);
        else if (isCopyConversationIdAction(action)) onCopyConversationId?.(agentId);
        else if (isMarkAgentUnreadAction(action)) onSetAgentUnread?.(agentId, markAgentUnreadValue(action));
        else if (isHideFromSidebarAction(action)) onHideFromSidebar(agentId);
        else if (isDeleteAgentAction(action)) onRequestDelete?.({ id: agentId, name: agentName, isGroup });
      }}
    >{action.label}</MenuItemRow>)}
  </div>;

  return <SandContextMenu ariaLabel={AGENT_ROW_ACTIONS_LABEL} content={content} onOpenChange={(next) => { setMenu(next); if (next == null) setMoveMenuOpen(false); }} open={menu}>
    <div onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
      {children}
    </div>
  </SandContextMenu>;
}
