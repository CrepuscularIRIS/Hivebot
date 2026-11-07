// T26+T28 覆盖：landing 前奏（T26）+ 0.79.3 六步 walk 与三页（T28：role/attribution/connect，
// tools/create 两步在 0.79.3 已移出）。上游 SignedInOnboarding 是整块组件，加页只能整复制改造
//（搬运阶梯第 3 级，T24 character.tsx 先例）。
// 来源: grok-bot 0.18 reconstructed view.tsx（复制骨架）+ 0.79.3 index.eager-app@380k 与
// chunk-onboarding-flow（walk/三页形态）。
import { useEffect, useRef, useState } from 'react'
import {
  createOnboardingHandOffDwell, INITIAL_ONBOARDING_DRAFT, onboardingStepIndex,
  ONBOARDING_MEET_BEAT_MS, ONBOARDING_MEET_DELAY_BEATS, MEET_TYPED_TEXT, ONBOARDING_DEMO_BEAT_MS, COMPUTER_DEMO_FRAMES,
  ONBOARDING_JOBS_BEAT_MS, ONBOARDING_JOBS_BEAT_LIMIT, ONBOARDING_STEP_EXIT_MS, type OnboardingComputerSnapshot,
} from '../../frontend/src/recovered/features/onboarding/signed-in/model'
import { createCoordinatorOnboardingReadiness, type OnboardingComputerReadiness, type OnboardingComputerStatusSource } from '../../frontend/src/recovered/features/onboarding/signed-in/computer-readiness'
import { SceneCast, SignedInOnboardingStep } from '../../frontend/src/recovered/features/onboarding/signed-in/view'
import { scenePlacements } from '../../frontend/src/recovered/features/onboarding/signed-in/scene'
import { AttributionStep, ConnectStep, RoleStep } from './onboarding-steps-0793'
import { ATTRIBUTION, creatorContext, HANDOFF_DEFAULTS, next, prev, roleUseCaseBots, SCENE_AS, shuffle, type WalkStep } from './onboarding-walk'

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
const devCall = (fn: 'reloadRoster' | 'finishKickstart', sid?: string): Promise<void> => {
  const dev = (window as unknown as { __pbotsDev?: { reloadRoster?(): Promise<void>; finishKickstart?(sid?: string): Promise<void> } }).__pbotsDev
  return dev?.[fn]?.(sid) ?? Promise.resolve()
}
const reloadRoster = (): Promise<void> => devCall('reloadRoster')
const finishKickstart = (sid?: string): Promise<void> => devCall('finishKickstart', sid)

export function SignedInOnboarding(props: Props) {
  const [started, setStarted] = useState(() => {
    try { return window.sessionStorage.getItem('pbots.shim.onboarding-started') === '1' } catch { return false }
  })
  const start = (): void => {
    try { window.sessionStorage.setItem('pbots.shim.onboarding-started', '1') } catch { /* 会话级而已 */ }
    setStarted(true)
  }
  // review M：skip/完成都走这里——seen 已落，退引导 + 补建 main bot（首启未建）。
  // T28b：先发 roster 刷新拿住 promise（防整体替换冲掉后面建的模板 bot），同步进主界面
  //（不等模板 bot）；之后后台串行：reload 完 → 主 bot 介绍 → 模板 bot 逐个建+介绍。
  // ponytail: 失败只 console.warn（0.79.3 的 fail 用户也看不到——进主界面后的呈现面另做）。
  const finish = (agentId: string | null, roleId: string | null = null): void => {
    const reloaded = reloadRoster()
    if (agentId !== null) {
      void reloaded
        .then(() => finishKickstart(agentId))
        .then(async () => {
          for (const req of roleUseCaseBots(roleId)) {
            const r = await props.client?.call('createAgent', req)
            const candidate = r != null && typeof r === 'object' && 'agent' in r ? (r as { agent: unknown }).agent : r
            const id = candidate != null && typeof candidate === 'object' && 'id' in candidate && typeof (candidate as { id: unknown }).id === 'string' ? (candidate as { id: string }).id : null
            if (id == null) throw new Error('createAgent returned a malformed agent reply')
            await finishKickstart(id)
          }
        })
        .catch((err) => console.warn('[onboarding] role-use-case-bots', err))
    }
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
  finish(agentId: string | null, roleId?: string | null): void; isAccountOnboarded?: () => Promise<boolean>; slot: string
}) {
  const [step, setStep] = useState<Step>('meet')
  const [exiting, setExiting] = useState<Step | null>(null) // T32：退场层（上游 view.tsx:197——EXIT_MS 后卸载）
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
  useEffect(() => { if (exiting == null) return; const t = window.setTimeout(() => setExiting(null), ONBOARDING_STEP_EXIT_MS); return () => window.clearTimeout(t) }, [exiting])
  const transition = (to: Step): void => { setExiting(step); setStep(to) } // T32：换步统一走 transition（退场层先记旧步）
  const goNext = (): void => { const n = next(step as WalkStep); if (n === 'hand-off') { transition('hand-off'); void create() } else transition(n) }
  const goBack = (): void => { const p = prev(step as WalkStep); if (p !== null) transition(p) }

  const create = async (): Promise<void> => {
    if (creatingRef.current) return
    creatingRef.current = true; setError(null)
    const claimed = slot
    try {
      await readinessRef.current?.waitForComputer(); if (slotRef.current !== claimed) return
      const already = await isAccountOnboarded?.() ?? false
      if (slotRef.current !== claimed) return
      if (already) { await bridge.onboarding.setSeen(true); await dwell.wait(); if (slotRef.current === claimed) finish(null); return } // T28bb：return 恢复无条件（槽位变更时旧槽不再往下建孤儿 bot）
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
      if (slotRef.current === claimed) finish(agentId, roleId)
    } catch (reason) { if (slotRef.current === claimed) setError(reason instanceof Error ? reason.message : String(reason)) } finally { creatingRef.current = false }
  }

  const bodyOf = (s: Step): JSX.Element => {
    // T32：bodyOf 统一——三页自有组件+四步上游组件，退场层与当前层共用
    if (s === 'role') return <RoleStep onBack={goBack} onForward={goNext} onPick={setRoleId} roleId={roleId} />
    if (s === 'attribution') return <AttributionStep onBack={goBack} onForward={goNext} onPick={setSourceId} shuffled={shuffled} sourceId={sourceId} />
    if (s === 'connect') return <ConnectStep onBack={goBack} onForward={goNext} />
    return <SignedInOnboardingStep computer={computer} dailyTools={[]} demoBeat={demoBeat} draft={draft} error={s === 'hand-off' ? error : null} isAvatarLanded={false} jobsBeat={jobsBeat} meetBeat={meetBeat} onAvatarSlotAttached={() => {}} onBack={goBack} onCreate={() => { void create() }} onDailyToolsChange={() => {}} onDraftChange={() => {}} onForward={goNext} renderCharacter={undefined} step={s as 'meet'} />
  }
  const sceneOf = (s: Step): string => (s === 'role' || s === 'attribution' || s === 'connect' ? SCENE_AS[s] : s) // T32：SCENE_AS 映射（原内联三元）
  const sceneStep = sceneOf(step)
  return <div className="sand-onboarding" data-platform="linux" data-step={sceneStep} data-step-index={String(onboardingStepIndex(sceneStep as 'tools'))} data-theme={document.documentElement.dataset.theme ?? 'light'} role="main">
    <SceneCast avatarTarget={null} demoBeat={demoBeat} draft={draft} isAvatarLanded={false} jobsBeat={jobsBeat} meetBeat={meetBeat} renderCharacter={undefined} step={sceneStep} /> // T32：beat 分开传（view.tsx:223）
    {exiting !== null ? <Framed exiting key={`exit-${exiting}`} step={exiting}>{bodyOf(exiting)}</Framed> : null}
    <Framed key={step} step={step}>{bodyOf(step)}</Framed>
  </div>
}

/** T32：FramedStep 同形（上游 view.tsx:68-69 逐字——exiting 形态 aria-hidden+动画+pointerEvents none）。 */
function Framed({ step, children, exiting = false }: { step: Step; children: JSX.Element; exiting?: boolean }) {
  return <div aria-hidden={exiting || undefined} className="sand-onboarding__step" style={exiting ? { animation: 'sand-onboarding-step-exit .1s ease-in both', pointerEvents: 'none' } : undefined}><main aria-labelledby={`sand-onboarding-${step}-heading`}>{children}</main></div>
}

// 覆盖层类型出口对齐（上游 view 的这些类型经 export * 已带）
export type { DesktopBridge, ProductionCoordinatorClient, OnboardingComputerReadiness, OnboardingComputerStatusSource, OnboardingCharacterRenderer }
