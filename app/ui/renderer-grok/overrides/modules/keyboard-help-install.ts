// T94 二批：mod+/ 帮助弹层 + mod+l 选区入 prompt——纯 JS 零 React（shim IIFE 经典
// script 环境：react 打进 bundle 后 process.env 引用炸「process is not defined」）。
const MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
const MOD_LABEL = MAC ? "⌘" : "Ctrl";
const SHIFT_LABEL = MAC ? "⇧" : "Shift";
const ALT_LABEL = MAC ? "⌥" : "Alt";
const SPECIAL: Record<string, string> = { enter: "↵", escape: "⎋", tab: "Tab", equal: "+", minus: "−", comma: ",", slash: "/", bracketleft: "[", bracketright: "]", up: "↑", down: "↓" };

export function buildHotkeyMap(actions: readonly { id: string; hotkey: string }[]): Map<string, string> {
  return new Map(actions.map((a) => [a.id, a.hotkey]));
}

export function keycapsOf(hotkey: string): string[] {
  const caps: string[] = [];
  for (const part of hotkey.split(",")[0]!.trim().split("+")) {
    const p = part.trim();
    if (p === "mod") caps.push(MOD_LABEL);
    else if (p === "shift") caps.push(SHIFT_LABEL);
    else if (p === "alt") caps.push(ALT_LABEL);
    else caps.push(SPECIAL[p] ?? p.toUpperCase());
  }
  return caps;
}


const HELP_CSS = `.sand-keyboard-help-scrim{position:fixed;inset:0;z-index:90;background:rgb(0 0 0/32%);display:grid;place-items:center}.sand-keyboard-help{width:min(720px,92vw);max-height:80vh;overflow:auto;border:0;border-radius:16px;padding:20px 24px;background:var(--sand-bg-elevated);color:var(--sand-text-primary);box-shadow:0 12px 40px rgb(0 0 0/20%),0 0 0 .5px var(--sand-border-quaternary-translucent)}.sand-keyboard-help__head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.sand-keyboard-help__head h2{margin:0;font-size:17px;font-weight:600}.sand-keyboard-help__close{border:0;background:transparent;cursor:pointer;color:var(--sand-text-secondary);font-size:14px;padding:4px 8px;border-radius:8px}.sand-keyboard-help__close:hover{background:var(--sand-bg-elevated-hover,color-mix(in srgb,var(--sand-text-primary) 8%,transparent))}.sand-keyboard-help__group{break-inside:avoid}.sand-keyboard-help__columns{display:grid;grid-template-columns:1fr 1fr;gap:4px 28px}.sand-keyboard-help__group-title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--sand-text-tertiary);margin:12px 0 4px}.sand-keyboard-help__row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px}.sand-keyboard-help__label{color:var(--sand-text-secondary)}.sand-keyboard-help__keys{display:inline-flex;gap:4px}.sand-keyboard-help__keycap{display:inline-flex;min-width:20px;height:20px;padding:0 5px;align-items:center;justify-content:center;border-radius:5px;font-size:11px;font-family:inherit;background:var(--sand-bg-elevated);border:.5px solid var(--sand-border-tertiary-translucent,currentColor);color:var(--sand-text-primary,inherit);box-shadow:0 1px 0 var(--sand-border-tertiary-translucent)}`;

/** T94 二批数据（RE-KEYBINDINGS §4.3——六组 22 行中 DSH 形态可用的部分；
 * Pages/Window 两组与 DSH 桌面形态不符（无 page stage/menubar zoom）——省略注明：
 * Pages（Comment on the page）依赖 page stage 域（H 域）；Window（Zoom/Full screen）属
 * 主进程层（四批形态判定）。条件隐藏=open() 按注册表 id 查不到即整行隐藏（真实现）。 */
interface EntryLite { id: string; label: string; hotkey: string }
const HELP_GROUPS: readonly { title: string; entries: readonly EntryLite[] }[] = [
  { title: "Essentials", entries: [
    { id: "sand.focusSearch", label: "Search Bots", hotkey: "mod+shift+f" },
    { id: "sand.newAgent", label: "New Bot", hotkey: "mod+n" },
    { id: "sand.modEnterSend", label: "Send", hotkey: "mod+enter" },
    { id: "sand.toggleSidebar", label: "Compact sidebar", hotkey: "mod+b" },
    { id: "sand.openSettings", label: "Settings", hotkey: "mod+comma" },
    { id: "sand.keyboardShortcuts", label: "Keyboard shortcuts", hotkey: "mod+slash" },
  ]},
  { title: "Chat", entries: [
    { id: "sand.focusInput", label: "Focus chat", hotkey: "mod+i" },
    { id: "sand.findInChat", label: "Find in chat", hotkey: "mod+f" },
    { id: "sand.addSelectionToPrompt", label: "Add selection to prompt", hotkey: "mod+l" },
  ]},
  { title: "Navigation", entries: [
    { id: "sand.previousAgent", label: "Previous Bot", hotkey: "alt+up" },
    { id: "sand.nextAgent", label: "Next Bot", hotkey: "alt+down" },
    { id: "sand.navigateBack", label: "Back", hotkey: "mod+bracketleft" },
    { id: "sand.navigateForward", label: "Forward", hotkey: "mod+bracketright" },
  ]},
]

export function installKeyboardHelpHotkeys(actions: readonly { id: string; hotkey: string }[]): () => void {
  const hotkeys = buildHotkeyMap(actions)
  const isMac = /mac/i.test(navigator.platform || navigator.userAgent)
  const modKey = (ev: KeyboardEvent): boolean => isMac ? ev.metaKey : ev.ctrlKey
  let root: HTMLDivElement | null = null

  const close = (): void => { root?.remove(); root = null }
  const keycap = (cap: string): string => `<kbd class="sand-keyboard-help__keycap">${cap}</kbd>`
  const row = (label: string, hk: string): string => `<div class="sand-keyboard-help__row"><span class="sand-keyboard-help__label">${label}</span><span class="sand-keyboard-help__keys">${keycapsOf(hk).map(keycap).join("")}</span></div>`

  let styleEl: HTMLStyleElement | null = null
  const ensureStyle = (): void => {
    if (styleEl !== null) return
    styleEl = document.createElement("style")
    styleEl.textContent = HELP_CSS
    document.head.append(styleEl)
  }
  const open = (): void => {
    close()
    ensureStyle()
    const groupsHtml: string[] = []
    const pushGroup = (title: string, lines: string[]): void => {
      if (lines.length === 0) return // 整组隐藏→不渲染
      groupsHtml.push(`<div class="sand-keyboard-help__group"><div class="sand-keyboard-help__group-title">${title}</div>${lines.join("")}</div>`)
    }
    // Essentials 尾部追加 Go to Bot range（⌘1–9——注册表有 focusAgent1/9 才显示）
    const fa1 = hotkeys.get("sand.focusAgent1"), fa9 = hotkeys.get("sand.focusAgent9")
    const essentials = HELP_GROUPS[0]!.entries
      .filter((e) => hotkeys.size === 0 || hotkeys.has(e.id))
      .map((e) => row(e.label, hotkeys.get(e.id) ?? e.hotkey))
    const showRange = hotkeys.size > 0 ? (fa1 !== undefined && fa9 !== undefined) : true
    if (showRange) {
      const from = keycapsOf(fa1 ?? "mod+1").join(""), to = keycapsOf(fa9 ?? "mod+9").join("")
      const modCap = keycapsOf(fa1 ?? "mod+1")[0] ?? MOD_LABEL
      essentials.push(`<div class="sand-keyboard-help__row"><span class="sand-keyboard-help__label">Go to Bot</span><span class="sand-keyboard-help__keys">${keycap(modCap)}${keycap("1–9")}</span></div>`)
    }
    pushGroup(HELP_GROUPS[0]!.title, essentials)
    for (const group of HELP_GROUPS.slice(1)) {
      pushGroup(group.title, group.entries.filter((e) => hotkeys.size === 0 || hotkeys.has(e.id)).map((e) => row(e.label, hotkeys.get(e.id) ?? e.hotkey)))
    }
    // 范围声明：Go to range 的 id 在注册表；id 查不到=命令未接线→隐藏（0.78.1 jNn 语义）
    void fa1; void fa9
    const half = Math.ceil(groupsHtml.length / 2)
    const el = document.createElement("div")
    el.className = "sand-keyboard-help-scrim"
    el.innerHTML = `<dialog aria-label="Keyboard shortcuts" class="sand-keyboard-help" open>
      <div class="sand-keyboard-help__head"><h2>Keyboard shortcuts</h2><button aria-label="Close" class="sand-keyboard-help__close" type="button">✕</button></div>
      <div class="sand-keyboard-help__columns"><div class="sand-keyboard-help__col">${groupsHtml.slice(0, half).join("")}</div><div class="sand-keyboard-help__col">${groupsHtml.slice(half).join("")}</div></div>
    </dialog>`
    el.addEventListener("click", (ev) => { if (ev.target === el) close() })
    el.querySelector("button")?.addEventListener("click", close)
    document.body.append(el)
    root = el
  }

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.isComposing) return
    if (ev.key === "Escape" && root !== null) { close(); return }
    if (modKey(ev) && !ev.altKey && !ev.shiftKey && ev.key === "/") { ev.preventDefault(); root === null ? open() : close(); return }
    if (modKey(ev) && !ev.altKey && !ev.shiftKey && (ev.key === "l" || ev.key === "L")) {
      ev.preventDefault()
      const sel = window.getSelection()?.toString() ?? ""
      if (sel !== "") {
        const editor = document.querySelector<HTMLElement>(".sand-prompt-form [contenteditable='true']")
        if (editor !== null) {
          editor.focus()
          // execCommand 在 ProseMirror 上不可靠——InputEvent 伪造（同 IME 语义，PM 接管事务）
          const before = document.execCommand("insertText", false, sel)
          if (!before) {
            editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: sel, bubbles: true, cancelable: true }))
            editor.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: sel, bubbles: true }))
          }
        }
      }
    }
  }
  window.addEventListener("keydown", onKey, true)
  return () => { window.removeEventListener("keydown", onKey, true); close(); styleEl?.remove(); styleEl = null }
}
