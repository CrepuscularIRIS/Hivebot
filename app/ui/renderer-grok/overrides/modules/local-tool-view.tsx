// P5-31 覆盖：本地工具审批卡适配 L-AP 语义（BRIEF A5/A9④/A10）。
// - 只有 Allow once / Deny once：上游四钮里「Always allow」（bash / 文件 / 升权卡无始终允许，A9④）与「Never」
//   （NEVER 是 sdk 代码常量不归用户设，shim 里也没有任何东西执行它，点了只等于拒绝一次）在 DOM 里不存在。
//   上游 Prompt 无条件渲染四钮、无 prop 可剥，所以这里换掉 Prompt/Dock 两个导出，作答逻辑仍走上游
//   resolveLocalToolPermissionAction；Esc = Deny once 与外壳样式改自
//   grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/permissions/local-tool/view.tsx:114-171。
// - 文案：上游是全局开关口吻（「all agents」「can be changed in Settings」），我们的作答只作用于这一次调用。
// - 竖排：上游卡只有 display:flex 原子类、缺 column（重构树遗漏），三段挤成一行；带命令块后更不可读。
// - 卡上显示完整动作：ask.action.command（shim askText：bash 命令全文 / request_network 的 reason 全文）。
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './pbots-ui'
import { noteConnectorAlways } from '../../shim/src/data'
import { SandIcon, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import {
  resolveLocalToolPermissionAction,
  type LocalToolPermissionPromptProps, type LocalToolPermissionRequest, type LocalToolPermissionResolution,
} from '../../frontend/src/recovered/features/permissions/local-tool/view'

export * from '../../frontend/src/recovered/features/permissions/local-tool/view'

function actionText(action: unknown): string | null {
  const command = typeof action === 'object' && action !== null ? (action as { command?: unknown }).command : undefined
  return typeof command === 'string' && command !== '' ? command : null
}

function isFormTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function hasVisibleBlockingSurface(): boolean {
  const selectors = '[data-dune-surface="overlay"], [role="dialog"], [role="alertdialog"], .sand-command-palette, .sand-computer-fullscreen'
  for (const element of document.querySelectorAll(selectors)) {
    if (element instanceof HTMLElement && (element.checkVisibility?.({ visibilityProperty: true }) ?? true)) return true
  }
  return false
}

const button = (primary: boolean, disabled: boolean) => ({
  padding: '6px 9px', borderRadius: 6, font: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  ...(primary
    ? { color: '#161616', background: '#c5f467', border: '1px solid #c5f467' }
    // 上游硬编码 #353535 底 + inherit 字色，亮色下深字压深底；改走主题 token（亮暗都可读）
    : { color: 'inherit', background: 'var(--cursor-bg-secondary, #353535)', border: '1px solid var(--cursor-stroke-secondary, #494949)' }),
})

export function LocalToolPermissionPrompt({ entryId, ask, agentId, store, resolveLocalToolPermission, isEscapeTarget = false, transportState }: LocalToolPermissionPromptProps) {
  const promptRef = useRef<HTMLDivElement>(null)
  const request = useMemo(() => ({ entryId, agentId, ask }), [agentId, ask, entryId])
  const [actionState, setActionState] = useState<'idle' | 'submitting' | 'failed'>('idle')
  const pending = ask.status === 'pending'
  const canAct = pending && actionState !== 'submitting' && agentId != null
  const connector = (ask as { connector?: { serverName: string; displayName: string } }).connector
  const submit = (resolution: LocalToolPermissionResolution) => {
    if (!canAct) return
    setActionState('submitting')
    void resolveLocalToolPermissionAction({ store, request, resolution, resolveLocalToolPermission }).then(
      () => setActionState('idle'),
      () => setActionState('failed'),
    )
  }
  // T73c：Always allow 时序——先 remember（活卡窗内；refused/失败不出卡式作答），成功才
  // resolve('always')（coordinator 映射 allowed-once）。失败回 failed 可重试（工单：防
  // 「用户以为记住了其实只放行一次」）。
  const submitAlways = (): void => {
    if (!canAct || connector === undefined || agentId == null) return
    setActionState('submitting')
    void api('p2sdk/connector_grants_remember', { request: { botId: agentId, serverName: connector.serverName } })
      .then((res: { ok?: boolean }) => {
        if (!res.ok) throw new Error('remember failed')
        noteConnectorAlways(ask.requestId)
        return resolveLocalToolPermissionAction({ store, request, resolution: 'always', resolveLocalToolPermission })
      })
      .then(
        () => setActionState('idle'),
        () => setActionState('failed'),
      )
  }

  useEffect(() => {
    if (transportState === 'connected') store.noteReconnect()
  }, [store, transportState])

  useEffect(() => {
    if (!isEscapeTarget) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isFormTarget(event.target) || hasVisibleBlockingSurface()) return
      const prompt = promptRef.current
      if (prompt == null || !(prompt.checkVisibility?.({ visibilityProperty: true }) ?? true)) return
      event.preventDefault()
      event.stopPropagation()
      submit('deny')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isEscapeTarget, canAct, request, resolveLocalToolPermission, store])

  if (!pending) {
    if (connector !== undefined) {
      // T73c 回显（RE-CONNECTOR-GRANT §2.2 文案，Q-056-3 去假话口径）
      const line = ask.status === 'always'
        ? `Allowed ${connector.displayName} for your messages to this Bot.`
        : ask.status === 'allow-once' ? `Allowed ${connector.displayName} once` : `Skipped ${connector.displayName}`
      return <div className="sand-local-tool-permission-outcome" data-connector-outcome={ask.status} title={line}>{line}</div>
    }
    const outcome = ask.status === 'allow-once' ? 'Grok Bot can run commands on your computer this time.' : 'Grok Bot was not allowed to run commands on your computer.'
    return <div className="sand-local-tool-permission-outcome" title={outcome}>{outcome}</div>
  }
  const command = actionText(ask.action)
  const disabled = !canAct
  // T73c：连接器卡——标题「Allow {displayName}」、无描述行、无下拉（Q-056-2=A）；
  // 主钮 Always allow（primary）在前、次钮 Allow once、Skip（RE §2.2 钮序）。关闭/Esc=Skip。
  if (connector !== undefined) {
    return (
      <div aria-label={`Allow ${connector.displayName}`} className="sand-78zum5 sand-167g77z sand-h8yej3 sand-euugli" data-state={actionState} data-connector-card="" ref={promptRef} style={{ flexDirection: 'column', maxWidth: 560, gap: 8, padding: '14px 16px', color: 'var(--cursor-text-primary, #ececec)', background: 'var(--cursor-bg-elevated, #202020)', border: '1px solid var(--cursor-border-secondary, #414141)', borderRadius: 10, boxShadow: '0 12px 28px rgba(0, 0, 0, .25)', font: '13px/1.4 Inter, ui-sans-serif, system-ui, sans-serif' }}>
        <section className="pb-ask__titlebar" data-pbots="ask-titlebar">
          <span className="pb-ask__badge"><SandIcon name="plug" size="sm" /></span>
          <span className="pb-ask__label">{connector.displayName}</span>
          <SandIconButton aria-label="Skip" className="pb-ask__close" disabled={disabled} icon="close" onClick={() => submit('deny')} shape="circle" size="sm" title="Skip (Esc)" variant="ghost" />
        </section>
        <section className="pb-ask__body">
          <strong>Allow {connector.displayName}?</strong>
          {actionState === 'failed' ? <span style={{ color: '#f87171' }}>Your answer didn&apos;t go through. Check your connection and try again.</span> : null}
        </section>
        <section role="group" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button data-always="" disabled={disabled} onClick={submitAlways} style={button(true, disabled)} type="button">Always allow</button>
          <button disabled={disabled} onClick={() => submit('allow-once')} style={button(false, disabled)} type="button">Allow once</button>
          <button disabled={disabled} onClick={() => submit('deny')} style={button(false, disabled)} type="button">Skip</button>
        </section>
      </div>
    )
  }
  // P5-41.f1：0.78.1 分段结构（RE-visual-078-values B9）——标题条「Computer」+ 关闭钮 / 标题 + 说明 + target 代码块 / 按钮段；
  // 段间距、内边距、代码块填充样式在 p5-55-layout.css（.pb-ask__*）。关闭 = Deny once（0.78.1 关闭钮 aria-label 即「Deny once」，ref 实测）。
  return (
    <div aria-label="Local tool permission" className="sand-78zum5 sand-167g77z sand-h8yej3 sand-euugli" data-state={actionState} ref={promptRef} style={{ flexDirection: 'column', maxWidth: 560, gap: 8, padding: '14px 16px', color: 'var(--cursor-text-primary, #ececec)', background: 'var(--cursor-bg-elevated, #202020)', border: '1px solid var(--cursor-border-secondary, #414141)', borderRadius: 10, boxShadow: '0 12px 28px rgba(0, 0, 0, .25)', font: '13px/1.4 var(--cursor-font-family-sans)' /* T75 */ }}>
      <section className="pb-ask__titlebar" data-pbots="ask-titlebar">
        <span className="pb-ask__badge"><SandIcon name="laptop" size="sm" /></span>
        <span className="pb-ask__label">Computer</span>
        <SandIconButton aria-label="Deny once" className="pb-ask__close" disabled={disabled} icon="close" onClick={() => submit('deny')} shape="circle" size="sm" title="Deny once (Esc)" variant="ghost" />
      </section>
      <section className="pb-ask__body">
        <strong>Allow Grok Bot to run this on your computer?</strong>
        <span data-pbots="ask-scope">Only this time. Grok Bot will ask again next time.</span>
        {command !== null
          ? <div className="pb-ask__code">
            <pre data-pbots="ask-command" style={{ margin: 0, maxHeight: 160, overflow: 'auto', padding: '8px 10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text', background: 'var(--cursor-bg-editor, #181818)', border: '1px solid var(--cursor-border-secondary, #414141)', borderRadius: 6, font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace' }}>{command}</pre>
            <SandIconButton aria-label="Copy code" className="pb-ask__copy" icon="copy" onClick={() => void navigator.clipboard?.writeText(command).catch(() => {})} size="sm" variant="ghost" />
          </div>
          : null}
        {actionState === 'failed' ? <span style={{ color: '#f87171' }}>Your answer didn&apos;t go through. Check your connection and try again.</span> : null}
      </section>
      <section role="group" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button disabled={disabled} onClick={() => submit('allow-once')} style={button(true, disabled)} type="button">Allow once</button>
        <button aria-label="Deny once (Esc)" disabled={disabled} onClick={() => submit('deny')} style={button(false, disabled)} title="Deny once (Esc)" type="button">Deny once</button>
      </section>
    </div>
  )
}

export function LocalToolPermissionDock({ request, ...props }: { request: LocalToolPermissionRequest | null } & Omit<LocalToolPermissionPromptProps, 'entryId' | 'ask' | 'agentId'>) {
  if (request == null) return null
  return <div aria-label="Local tool permissions" className="sand-local-tool-permission-dock sand-78zum5 sand-dt5ytf sand-167g77z sand-h8yej3 sand-euugli" role="region"><LocalToolPermissionPrompt {...props} {...request} /></div>
}
