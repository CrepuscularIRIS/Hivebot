// B4.1 斜杠命令注册表（1.1.0 规格：{id,label,icon,keywords} 命令对象 + '/' 触发菜单）。
// 1.1.0 锚：prompt-editor flag sand_hide_slash_commands 门控（静态只枚举出 dev 命令，用户态清单
// 运行时注册）；HiveBot 首版 5 条全部对应已有真实动作（无 flag 系统——常显）。
// 动作走 DOM 桥（触发真实 UI 事件），不走 CommandPalette props 链（那是 ProductionRenderer 完整面）。

export interface SlashCommand {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly keywords: readonly string[]
  /** 执行：返回 true 表示已处理（面板关闭后调用）。 */
  readonly run: () => boolean
}

/** 命中测试：query 对 label/keywords 前缀匹配（1.1.0 同款大小写不敏感）。 */
export function filterSlashCommands(commands: readonly SlashCommand[], query: string): readonly SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (q === '') return commands
  return commands.filter((c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().startsWith(q)))
}

/**
 * 生产注册表。动作桥说明（全部真实 UI 路径，无 mock）：
 * - new-bot：点侧栏 New 钮（aria-label "New bot"——create-dialog e2e 同锚）
 * - search：CommandPalette 快捷键（mod+k——bots-search e2e 同款）
 * - market：composer 连接器市场钮（aria-label "Open connector market"）或侧栏入口
 * - keys：键盘帮助（mod+/ 打开 keybinding help——keyboard-help-install 同源）
 */
export function createSlashCommands(opts: {
  onNewBot: () => void
  onSearch: () => void
  onMarket: () => void
  onKeys: () => void
}): readonly SlashCommand[] {
  return [
    { id: 'new-bot', label: 'New bot', icon: 'plus', keywords: ['new', 'create', 'bot'], run: () => { opts.onNewBot(); return true } },
    { id: 'search', label: 'Search', icon: 'search', keywords: ['find', 'palette', 'search'], run: () => { opts.onSearch(); return true } },
    { id: 'market', label: 'Connector market', icon: 'plug', keywords: ['connector', 'market', 'apps'], run: () => { opts.onMarket(); return true } },
    { id: 'keys', label: 'Keyboard shortcuts', icon: 'keyboard', keywords: ['keys', 'shortcuts', 'help'], run: () => { opts.onKeys(); return true } },
  ]
}
