// T81：面板开关命令四件（RE-KEYBINDINGS 第二批 P1）——document 级热键拨 ProductionRenderer
// 的面板 state。state 在锁树够不到——经现有 UI 钮的 click 触达（chat-header 的
// View agent settings 钮 aria-label；Skills/Plugins 入口；newGroupChat 无实底不做）。
// mod+alt+b=toggleInfo · mod+shift+comma=toggleAgentSettings · mod+shift+w=openSkills(=Connect apps)
export function installPanelHotkeys(): () => void {
  const isMac = /mac/i.test(navigator.platform || navigator.userAgent)
  const modKey = (ev: KeyboardEvent): boolean => isMac ? ev.metaKey : ev.ctrlKey
  const clickFirst = (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector)
    if (el === null) return false
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return true
  }
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.isComposing) return
    // toggleInfo：mod+alt+b（mac 另绑 mod+shift+i——RE #28 双键）
    if (modKey(ev) && ev.altKey && !ev.shiftKey && (ev.key === "b" || ev.key === "B")) { ev.preventDefault(); clickFirst('.sand-chat-header__computer'); return } // ComputerHeaderControl=onToggleInfo
    if (isMac && modKey(ev) && ev.shiftKey && !ev.altKey && (ev.key === "i" || ev.key === "I")) { ev.preventDefault(); clickFirst('.sand-chat-header__computer'); return } // ComputerHeaderControl=onToggleInfo
    // toggleAgentSettings：mod+shift+comma（RE #19）——开=identity 钮；关=面板 close 钮
    // （onToggleSettings 恒 setAgentSettingsOpen(true) 非 toggle——ProductionRenderer:3508 实证）
    if (modKey(ev) && ev.shiftKey && !ev.altKey && ev.key === "<") {
      ev.preventDefault()
      const open = document.querySelector('aside.sand-info-pane[data-open] button[aria-label="Close details"]')
      if (open !== null) open.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      else clickFirst('[data-info-row="settings"]')
      return
    }
    // openSkills：mod+shift+w（RE #21——我们的实底=Connect apps/市场面板）
    if (modKey(ev) && ev.shiftKey && !ev.altKey && (ev.key === "w" || ev.key === "W")) { ev.preventDefault(); clickFirst('.sand-agents-sidebar__plugins'); return }
  }
  window.addEventListener("keydown", onKey, true)
  return () => window.removeEventListener("keydown", onKey, true)
}
