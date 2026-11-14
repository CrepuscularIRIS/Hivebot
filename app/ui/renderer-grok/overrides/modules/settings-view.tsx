// P5-52 覆盖：设置只留 General。Router（Cursor/Claude Code/Codex/OpenRouter 路由，我们的 provider 在 dsh 配置里）、
// Updates（update.* 桩：not-packaged；Grok Bot's Computer 的 Update/Reset 走 foreverBox 桩）都没有实底。
// T50：追加 Models 区（Hivebot 自有——0.78.1 无此区；key 只写不读，交互照 DSH Models 页）。
// 类型注意：上游 SettingsSectionId 是封闭 union，本层用宽化 cast 挂自定义 id（不改 recovered）。
import { SETTINGS_SECTIONS, SettingsModalShell as Upstream, type SettingsModalShellProps, type SettingsSection } from '../../frontend/src/recovered/features/settings/overlay/view'
import { ModelsSettingsPanel } from './settings-models'
import './settings-view-t57.css' // T57：0.78.1 像素规格对齐（RE-UI-LAYOUT §1.1–1.6，压 recovered view.css）

export * from '../../frontend/src/recovered/features/settings/overlay/view'

const GENERAL = SETTINGS_SECTIONS.filter((section) => section.id === 'general')
const MODELS_SECTION = { id: 'models', label: 'Models', icon: 'settings-gear' } as unknown as SettingsSection
export const VISIBLE_SETTINGS_SECTIONS = [...GENERAL, MODELS_SECTION]

export function SettingsModalShell(props: SettingsModalShellProps) {
  return (
    <Upstream
      {...props}
      renderSection={(section) => (section === ('models' as never)
        ? <ModelsSettingsPanel />
        : props.renderSection(section))}
      sections={VISIBLE_SETTINGS_SECTIONS}
    />
  )
}
