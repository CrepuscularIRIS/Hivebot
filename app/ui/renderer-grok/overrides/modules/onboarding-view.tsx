// T26 覆盖：onboarding landing 前奏——0.79.3 七步的第一步是分步序列外的问候封面
//（i18n ZDIydz 'Get started' / yvjVU9 'Welcome to Grok Bot'；step 工具对 landing 返回
// null——chunk-onboarding-flow @15490）。0.18 组件从 meet 起，这里包一层：先渲染封面，
// Get started 后才挂上游六步。上游零改动（MODULE_OVERRIDES 整模块替换，T24 character 先例）。
import { useState } from 'react'
import { SignedInOnboarding as Upstream, type OnboardingCharacterRenderer } from '../../frontend/src/recovered/features/onboarding/signed-in/view'
import type { DesktopBridge } from '../../frontend/src/recovered/contracts/desktop-bridge'
import type { ProductionCoordinatorClient } from '../../frontend/src/production/coordinator-client'
import type { OnboardingComputerReadiness, OnboardingComputerStatusSource } from '../../frontend/src/recovered/features/onboarding/signed-in/computer-readiness'

export * from '../../frontend/src/recovered/features/onboarding/signed-in/view'

type Props = Parameters<typeof Upstream>[0]

/** landing 封面（0.79.3 形态：标题 + Get started；未点进前不挂六步）。 */
function Landing({ onStart, bridge }: { onStart(): void; bridge: DesktopBridge }) {
  return (
    <section className="sand-onboarding__landing" aria-labelledby="sand-onboarding-landing-heading">
      <h1 id="sand-onboarding-landing-heading">Welcome to Grok Bot</h1>
      <button type="button" data-action="onboarding-start" onClick={onStart}>Get started</button>
      <button type="button" data-action="onboarding-skip" onClick={() => { void bridge.onboarding.setSeen(true); onStart() }}>Skip</button>
    </section>
  )
}

export function SignedInOnboarding(props: Props) {
  const [started, setStarted] = useState(() => {
    try { return window.sessionStorage.getItem('pbots.shim.onboarding-started') === '1' } catch { return false }
  })
  const start = (): void => {
    try { window.sessionStorage.setItem('pbots.shim.onboarding-started', '1') } catch { /* 会话级而已 */ }
    setStarted(true)
  }
  if (!started) return <Landing onStart={start} bridge={props.bridge} />
  return <Upstream {...props} />
}

// 覆盖层类型出口对齐（上游 view 的这些类型经 export * 已带）
export type { DesktopBridge, ProductionCoordinatorClient, OnboardingComputerReadiness, OnboardingComputerStatusSource, OnboardingCharacterRenderer }
