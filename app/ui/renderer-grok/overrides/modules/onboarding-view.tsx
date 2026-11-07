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
function Landing({ onStart, onSkip, bridge }: { onStart(): void; onSkip(): void; bridge: DesktopBridge }) {
  return (
    <div className="sand-onboarding" role="main"> {/* T26b #1：上游覆盖层外壳（production.css:176 position:fixed inset:0）——曾裸 section 落文档流底部屏外 */}
      <section className="sand-onboarding__landing" aria-labelledby="sand-onboarding-landing-heading">
        <h1 id="sand-onboarding-landing-heading">Welcome to Grok Bot</h1>
        <button type="button" data-action="onboarding-start" onClick={onStart}>Get started</button>
        {/* review M：Skip = 提前 seen 后直接退出（onComplete(null)），不进六步 */}
        <button type="button" data-action="onboarding-skip" onClick={() => { void bridge.onboarding.setSeen(true).then(onSkip, onSkip) }}>Skip</button>
      </section>
    </div>
  )
}

/** T26：onboarding 结束（完成或 skip）后重载 roster——首启未建 main bot，seen 落盘后补建。 */
const devCall = (fn: 'reloadRoster' | 'finishKickstart'): void => {
  const dev = (window as unknown as { __pbotsDev?: { reloadRoster?(): Promise<void>; finishKickstart?(): Promise<void> } }).__pbotsDev
  void dev?.[fn]?.()
}
const reloadRoster = (): void => devCall('reloadRoster')
const finishKickstart = (): void => devCall('finishKickstart')

export function SignedInOnboarding(props: Props) {
  const [started, setStarted] = useState(() => {
    try { return window.sessionStorage.getItem('pbots.shim.onboarding-started') === '1' } catch { return false }
  })
  const start = (): void => {
    try { window.sessionStorage.setItem('pbots.shim.onboarding-started', '1') } catch { /* 会话级而已 */ }
    setStarted(true)
  }
  // review M：skip/完成都走这里——seen 已落，退引导 + 补建 main bot（首启未建）
  const finish = (agentId: string | null): void => {
    reloadRoster()
    if (agentId !== null) finishKickstart() // T26b #4：走完引导（建了 bot）才发延后介绍；skip 不发
    props.onComplete(agentId)
  }
  if (!started) return <Landing onStart={start} onSkip={() => finish(null)} bridge={props.bridge} />
  return <Upstream {...props} onComplete={finish} />
}

// 覆盖层类型出口对齐（上游 view 的这些类型经 export * 已带）
export type { DesktopBridge, ProductionCoordinatorClient, OnboardingComputerReadiness, OnboardingComputerStatusSource, OnboardingCharacterRenderer }
