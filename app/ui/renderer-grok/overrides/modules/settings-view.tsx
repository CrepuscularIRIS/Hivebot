// P5-52 覆盖：设置只留 General。Router（Cursor/Claude Code/Codex/OpenRouter 路由，我们的 provider 在 dsh 配置里）、
// Updates（update.* 桩：not-packaged；Grok Bot's Computer 的 Update/Reset 走 foreverBox 桩）都没有实底。
import { SETTINGS_SECTIONS, SettingsModalShell as Upstream, type SettingsModalShellProps } from '../../frontend/src/recovered/features/settings/overlay/view'

export * from '../../frontend/src/recovered/features/settings/overlay/view'

export const VISIBLE_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter((section) => section.id === 'general')

export function SettingsModalShell(props: SettingsModalShellProps) {
  return <Upstream {...props} sections={VISIBLE_SETTINGS_SECTIONS} />
}
