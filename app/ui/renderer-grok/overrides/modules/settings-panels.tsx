// P5-52 覆盖：设置 General 剥掉 Auto-review（autoReviewInstructions.* 桩不落盘，dsh 无对应能力）与
// Security Key（foreverBox.webauthnProxy 桩；platform=win32 开关下上游会把开关判为可用）两组，上游 null 门控自己收起。
// P5-31：再剥 Execution on Local Computer（always/ask/never 下拉 + 「Your team's admin allows at most…」）。L-AP 档位
// 由 sdk 档位表 + NEVER 常量 + policy-state 决定，renderer 既写不了也读不到实际档位（bash 可能是 ALWAYS），
// 只读展示「Ask every time」会说错，所以整卡不渲染。
import { GeneralSettingsPanel as Upstream, type GeneralSettingsPanelProps } from '../../frontend/src/recovered/features/settings/overlay/panels'

export * from '../../frontend/src/recovered/features/settings/overlay/panels'

export function GeneralSettingsPanel(props: GeneralSettingsPanelProps) {
  return <Upstream {...props} autoReview={undefined} securityKey={undefined} localToolPermission={undefined} />
}
