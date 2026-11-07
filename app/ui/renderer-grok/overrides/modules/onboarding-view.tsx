// T26+T28 覆盖：landing 前奏（T26）+ 0.79.3 六步 walk 与三页（T28：role/attribution/connect，
// tools/create 两步在 0.79.3 已移出）。上游 SignedInOnboarding 是整块组件，加页只能整复制改造
//（搬运阶梯第 3 级，T24 character.tsx 先例）。
// 来源: grok-bot 0.18 reconstructed view.tsx（复制骨架）+ 0.79.3 index.eager-app@380k 与
// chunk-onboarding-flow（walk/三页形态）。
import { useEffect, useRef, useState } from 'react'
import {
  createOnboardingHandOffDwell, INITIAL_ONBOARDING_DRAFT, onboardingStepIndex,
  ONBOARDING_MEET_BEAT_MS, ONBOARDING_MEET_DELAY_BEATS, MEET_TYPED_TEXT, ONBOARDING_DEMO_BEAT_MS, COMPUTER_DEMO_FRAMES,
  ONBOARDING_JOBS_BEAT_MS, ONBOARDING_JOBS_BEAT_LIMIT, type OnboardingComputerSnapshot,
} from '../../frontend/src/recovered/features/onboarding/signed-in/model'
import { createCoordinatorOnboardingReadiness, type OnboardingComputerReadiness, type OnboardingComputerStatusSource } from '../../frontend/src/recovered/features/onboarding/signed-in/computer-readiness'
import { SceneCast, SignedInOnboardingStep } from '../../frontend/src/recovered/features/onboarding/signed-in/view'
import { scenePlacements } from '../../frontend/src/recovered/features/onboarding/signed-in/scene'
import { AttributionStep, ConnectStep, RoleStep } from './onboarding-steps-0793'
import { ATTRIBUTION, creatorContext, HANDOFF_DEFAULTS, next, prev, shuffle, type WalkStep } from './onboarding-walk'

/** view.tsx:31 同形（上游私有常量不导出——本地复制）。 */
const EMPTY_COMPUTER: OnboardingComputerSnapshot = { isComputerReady: false, computerState: null, pullPercent: null }

import type { OnboardingComputerReadiness, OnboardingComputerStatusSource } from '../../frontend/src/recovered/features/onboarding/signed-in/computer-readiness'

export * from '../../frontend/src/recovered/features/onboarding/signed-in/view'

interface Props {
  bridge: import('../../frontend/src/recovered/contracts/desktop-bridge').DesktopBridge
  client: import('../../frontend/src/production/coordinator-client').ProductionCoordinatorClient | null
  accountSlot: string
  computerReadiness?: OnboardingComputerReadiness
  computerStatus?: OnboardingComputerStatusSource
  isAccountOnboarded?: () => Promise<boolean>
  onComplete(agentId: string | null): void
}

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
  return <Walk bridge={props.bridge} client={props.client} computerReadiness={props.computerReadiness} computerStatus={props.computerStatus} finish={finish} isAccountOnboarded={props.isAccountOnboarded} slot={props.accountSlot} />
}

type Step = WalkStep | 'hand-off'

/** T28 复制的上游主体骨架（0.18 view.tsx:164-222）：walk 换 WALK（无 tools/create）、三页接入、
 * connect 前进即 hand-off 自动建主 bot（0.79.3：用户不起名不挑形象，role 进 creatorContext）。 */
function Walk({ bridge, client, computerReadiness, computerStatus, finish, isAccountOnboarded, slot }: {
  bridge: Props['bridge']; client: Props['client']; computerReadiness?: OnboardingComputerReadiness; computerStatus?: OnboardingComputerStatusSource
  finish(agentId: string | null): void; isAccountOnboarded?: () => Promise<boolean>; slot: string
}) {
  const [step, setStep] = useState<Step>('meet')
  const [roleId, setRoleId] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  // review M2：洗牌提升到 Walk（条件渲染会卸载重挂 AttributionStep，其 useState 初始化器
  // 每次重挂都跑——「每次运行洗一次」必须在 Walk 级）
  const [shuffled] = useState(() => shuffle(ATTRIBUTION.choices, Math.random))
  const [draft] = useState(INITIAL_ONBOARDING_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [computer, setComputer] = useState<OnboardingComputerSnapshot>(EMPTY_COMPUTER)
  const creatingRef = useRef(false)
  const createdRef = useRef<{ accountSlot: string; agentId: string } | null>(null)
  const slotRef = useRef(slot)
  const readinessRef = useRef<OnboardingComputerReadiness | null>(computerReadiness ?? null)
  const [dwell] = useState(() => createOnboardingHandOffDwell())
  // review M1：上游 beat 推进（view.tsx useSceneBeat 私有——本地复制同款）
  const useSceneBeat = (active: boolean, intervalMs: number, limit: number): number => {
    const [beat, setBeat] = useState(0)
    useEffect(() => {
      setBeat(0)
      if (!active) return
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
      if (reduced) return
      const timer = window.setInterval(() => setBeat((c) => { if (c >= limit) { window.clearInterval(timer); return c } return c + 1 }), intervalMs)
      return () => window.clearInterval(timer)
    }, [active, intervalMs, limit])
    return beat
  }
  const meetBeat = useSceneBeat(step === 'meet', ONBOARDING_MEET_BEAT_MS, ONBOARDING_MEET_DELAY_BEATS + MEET_TYPED_TEXT.length)
  const demoBeat = useSceneBeat(step === 'computer-demo', ONBOARDING_DEMO_BEAT_MS, COMPUTER_DEMO_FRAMES.length)
  const jobsBeat = useSceneBeat(step === 'jobs', ONBOARDING_JOBS_BEAT_MS, ONBOARDING_JOBS_BEAT_LIMIT)
  slotRef.current = slot
  useEffect(() => {
    const readiness = computerReadiness ?? (client == null ? null : createCoordinatorOnboardingReadiness(client, computerStatus))
    readinessRef.current = readiness
    setComputer(readiness?.getSnapshot() ?? EMPTY_COMPUTER)
    const unsubscribe = readiness?.subscribe(() => setComputer(readiness.getSnapshot()))
    return () => { unsubscribe?.(); if (readiness !== computerReadiness) readiness?.dispose(); if (readinessRef.current === readiness) readinessRef.current = null }
  }, [client, computerReadiness, computerStatus])
  useEffect(() => () => dwell.dispose(), [dwell])
  const goNext = (): void => { const n = next(step as WalkStep); if (n === 'hand-off') { setStep('hand-off'); void create() } else setStep(n) }
  const goBack = (): void => { const p = prev(step as WalkStep); if (p !== null) setStep(p) }

  const create = async (): Promise<void> => {
    if (creatingRef.current) return
    creatingRef.current = true; setError(null)
    const claimed = slot
    try {
      await readinessRef.current?.waitForComputer(); if (slotRef.current !== claimed) return
      const already = await isAccountOnboarded?.() ?? false
      if (slotRef.current !== claimed) return
      if (already) { await bridge.onboarding.setSeen(true); await dwell.wait(); if (slotRef.current === claimed) finish(null); return }
      if (createdRef.current?.accountSlot !== claimed) createdRef.current = null
      if (createdRef.current == null) {
        if (client == null) throw new Error('coordinator is unavailable')
        const result = await client.call('createAgent', {
          origin: 'user', isKickstartRequested: true,
          name: HANDOFF_DEFAULTS.name, description: creatorContext(roleId),
          avatarShape: HANDOFF_DEFAULTS.avatarShape, avatarColor: HANDOFF_DEFAULTS.avatarColor,
        })
        if (slotRef.current !== claimed) return
        const candidate = result != null && typeof result === 'object' && 'agent' in result ? (result as { agent: unknown }).agent : result
        const agentId = candidate != null && typeof candidate === 'object' && 'id' in candidate && typeof (candidate as { id: unknown }).id === 'string' ? (candidate as { id: string }).id : null
        if (agentId == null) throw new Error('createAgent returned a malformed agent reply')
        createdRef.current = { accountSlot: claimed, agentId }
      }
      const agentId = createdRef.current.agentId
      await bridge.onboarding.setSeen(true)
      await dwell.wait()
      if (slotRef.current === claimed) finish(agentId)
    } catch (reason) { if (slotRef.current === claimed) setError(reason instanceof Error ? reason.message : String(reason)) } finally { creatingRef.current = false }
  }

  let body: JSX.Element
  // T28c F2：四步（meet/computer-demo/jobs/hand-off）直接复用上游导出的
  // SignedInOnboardingStep——标题可见/底栏顺序（Next 上 Back 下）/composer/气泡/hand-off
  // 图标+名自动回来；手抄版此前多缺。三页自有组件套 FramedStep 同形包裹。
  if (step === 'role') body = <Framed step={step}><RoleStep onBack={goBack} onForward={goNext} onPick={setRoleId} roleId={roleId} /></Framed>
  else if (step === 'attribution') body = <Framed step={step}><AttributionStep onBack={goBack} onForward={goNext} onPick={setSourceId} shuffled={shuffled} sourceId={sourceId} /></Framed>
  else if (step === 'connect') body = <Framed step={step}><ConnectStep onBack={goBack} onForward={goNext} /></Framed>
  else body = <div className="sand-onboarding__step"><main aria-labelledby={`sand-onboarding-${step}-heading`}><SignedInOnboardingStep computer={computer} dailyTools={[]} demoBeat={demoBeat} draft={draft} error={step === 'hand-off' ? error : null} isAvatarLanded={false} jobsBeat={jobsBeat} meetBeat={meetBeat} onAvatarSlotAttached={() => {}} onBack={goBack} onCreate={() => { void create() }} onDailyToolsChange={() => {}} onDraftChange={() => {}} onForward={goNext} renderCharacter={undefined} step={step as 'meet'} /></main></div>
  const sceneStep = step === 'role' || step === 'attribution' || step === 'connect' ? 'tools' : step
  const beat = step === 'meet' ? meetBeat : step === 'computer-demo' ? demoBeat : step === 'jobs' ? jobsBeat : 0
  return <div className="sand-onboarding" data-platform="linux" data-step={sceneStep} data-step-index={String(onboardingStepIndex(sceneStep as 'tools'))} data-theme={document.documentElement.dataset.theme ?? 'light'} role="main">
    <SceneCast avatarTarget={null} demoBeat={beat} draft={draft} isAvatarLanded={false} jobsBeat={beat} meetBeat={beat} renderCharacter={undefined} step={sceneStep} />
    {body}
  </div>
}

/** T28c：FramedStep 同形（上游 view.tsx:68 未导出——本地 2 行；退场动画归 T32）。 */
function Framed({ step, children }: { step: Step; children: JSX.Element }) {
  return <div className="sand-onboarding__step"><main aria-labelledby={`sand-onboarding-${step}-heading`}>{children}</main></div>
}

// 覆盖层类型出口对齐（上游 view 的这些类型经 export * 已带）
export type { DesktopBridge, ProductionCoordinatorClient, OnboardingComputerReadiness, OnboardingComputerStatusSource, OnboardingCharacterRenderer }
