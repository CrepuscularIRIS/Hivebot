import './onboarding-steps-0793.css'
// T28：0.79.3 三页组件（role/attribution/connect）——文案与底栏逻辑按探针结论逐字
//（onboarding-0793-extract.json；i18n 逐字）。选择状态由父组件持有（Back/Next 往返保留）；
// attribution 每次运行洗一次牌（useState 初始化，Fisher-Yates）。
// 品牌图标（x/instagram/…）：本仓无 svg 资产（探针结论），只显示文字标签——回执记。
import type { ReactNode } from 'react'
import { SandButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { ATTRIBUTION, CONNECT, ROLE, type RoleChoice } from './onboarding-walk'

/** 通用底栏（T78 kit 化，0.78.1 Z 组件锚：F 主钮 variant primary / Back secondary；
 * Back 在 288×36 span 内全宽——css 追加段）。 */
function Foot({ back, forward, selected, forwardLabel }: { back(): void; forward(): void; selected: boolean; forwardLabel: string }): ReactNode {
  return (
    <div className="sand-onboarding__footer">
      {selected
        ? <SandButton onClick={forward}>{forwardLabel}</SandButton>
        : <SandButton data-action="skip" onClick={forward} variant="secondary">Skip</SandButton>}
      <span className="sand-onboarding__footer-back"><SandButton onClick={back} variant="secondary">Back</SandButton></span>
    </div>
  )
}

function ChoiceGrid({ step, choices, selectedId, onPick, layout }: { step: string; choices: readonly RoleChoice[]; selectedId: string | null; onPick(id: string): void; layout: 'stacked' | 'inline' }) {
  return (
    <div aria-label={step} className={`sand-onboarding__${step}-choices`} data-layout={layout} role="radiogroup">
      {choices.map((c) => (
        <button aria-checked={selectedId === c.id} data-choice={c.id} key={c.id} onClick={() => onPick(c.id)} role="radio" type="button">
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  )
}

export function RoleStep({ roleId, onPick, onBack, onForward }: { roleId: string | null; onPick(id: string): void; onBack(): void; onForward(): void }) {
  // role 不是最后一步（connect 还在后）——选中后是 Next（探针 _n 逻辑）
  return (
    <section className={`sand-onboarding__role`}>
      <h1 id="sand-onboarding-role-heading">{ROLE.title}</h1>
      <ChoiceGrid choices={ROLE.choices} layout="stacked" onPick={onPick} selectedId={roleId} step="role" />
      <Foot back={onBack} forward={onForward} forwardLabel="Next" selected={roleId !== null} />
    </section>
  )
}

export function AttributionStep({ sourceId, onPick, onBack, onForward, shuffled }: { sourceId: string | null; onPick(id: string): void; onBack(): void; onForward(): void; shuffled: readonly RoleChoice[] }) {
  // review M2：洗牌由 Walk 持有（本组件会被条件渲染卸载重挂——useState 初始化器每次重跑）
  return (
    <section className={`sand-onboarding__attribution`}>
      <h1 id="sand-onboarding-attribution-heading">{ATTRIBUTION.title}</h1>
      <ChoiceGrid choices={shuffled} layout="inline" onPick={onPick} selectedId={sourceId} step="attribution" />
      <Foot back={onBack} forward={onForward} forwardLabel="Continue" selected={sourceId !== null} />
    </section>
  )
}

export function ConnectStep({ onBack, onForward }: { onBack(): void; onForward(): void }) {
  // ponytail: 「已连接」恒 false（shim 无连接器真连 Gmail 的通道）——底栏恒 Skip for now；
  // 连接器接入后改为任一已连接显示 Continue。Connect 钮无现成入口（市场面板是安装非账号连接）——置灰。
  return (
    <section className={`sand-onboarding__connect`}>
      <h1 id="sand-onboarding-connect-heading">{CONNECT.title}</h1>
      <div aria-label="connectors" role="list">
        {CONNECT.connectors.map((name) => (
          <div key={name} role="listitem">
            <span>{name}</span>
            <SandButton disabled title="Connector sign-in isn't wired in this build yet" variant="secondary">Connect</SandButton>
          </div>
        ))}
      </div>
      <div className="sand-onboarding__footer">
        <SandButton data-action="skip" onClick={onForward} variant="secondary">{CONNECT.skip}</SandButton>
        <span className="sand-onboarding__footer-back"><SandButton onClick={onBack} variant="secondary">Back</SandButton></span>
      </div>
    </section>
  )
}
