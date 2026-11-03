// P5-52 覆盖：设置 General 剥掉 Auto-review（autoReviewInstructions.* 桩不落盘，dsh 无对应能力）与
// Security Key（foreverBox.webauthnProxy 桩；platform=win32 开关下上游会把开关判为可用）两组，上游 null 门控自己收起。
import { GeneralSettingsPanel as Upstream, type GeneralSettingsPanelProps } from '../../frontend/src/recovered/features/settings/overlay/panels'

export * from '../../frontend/src/recovered/features/settings/overlay/panels'

export function GeneralSettingsPanel(props: GeneralSettingsPanelProps) {
  return <Upstream {...props} autoReview={undefined} securityKey={undefined} />
}
