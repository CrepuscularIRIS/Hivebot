// P5-52 覆盖：搜索面板 Actions 里滤掉无实底的命令——Channels（channels RPC 无实底）、Settings: Usage & Billing（spend，用量为空）、Settings: Updates（Updates 节已隐藏，见 settings-view）。
import { CommandPalette as Upstream, type CommandPaletteProps } from '../../frontend/src/production/CommandPalette'

export * from '../../frontend/src/production/CommandPalette'

export const HIDDEN_COMMAND_IDS: ReadonlySet<string> = new Set(['info:channels', 'settings:usage', 'settings:beta'])

export function CommandPalette(props: CommandPaletteProps) {
  return <Upstream {...props} commands={props.commands.filter((command) => !HIDDEN_COMMAND_IDS.has(command.id))} />
}
