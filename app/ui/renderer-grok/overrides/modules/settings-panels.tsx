// P5-52 覆盖历史：曾剥掉 Auto-review / Security Key / LocalToolPermission（桩不落盘）。
// B18：Security Key 不再剥——shim webauthnProxy 已落 localStorage（切了能存），0.78.1 区序要求该行渲染
// （platform=linux 归 windows 映射，开关可用）。Auto-review/LocalToolPermission 维持剥离（renderer 读不到真实档位）。
// T73c：加「Connector preferences · Clear」——一键清 standing-grants（RE-CONNECTOR-GRANT §2.3：
// 原版无 per-bot 列表，只有一键；文案 Q-056-3）。确认框用原生 <dialog>（p5-57 pb-dialog 同形态）。
import { useState } from 'react'
import { GeneralSettingsPanel as Upstream, type GeneralSettingsPanelProps } from '../../frontend/src/recovered/features/settings/overlay/panels'
import { SandButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { api } from './pbots-ui'

export * from '../../frontend/src/recovered/features/settings/overlay/panels'

export function GeneralSettingsPanel(props: GeneralSettingsPanelProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clearAll = (): void => {
    if (busy) return
    setBusy(true)
    void api('p2sdk/connector_grants_clear', {}).then(
      (res: { ok?: boolean; error?: { message?: string } }) => {
        setBusy(false)
        if (res?.ok === false) { setError(String(res.error?.message ?? 'clear failed').slice(0, 120)); return }
        setError(null); setOpen(false)
      },
      (e: unknown) => { setBusy(false); setError(String((e as { error?: { message?: string } })?.error?.message ?? e).slice(0, 120)) },
    )
  }
  return (
    <>
      <Upstream {...props} autoReview={undefined} localToolPermission={undefined} />
      <div className="pb-settings-connector-preferences" data-connector-preferences>
        <span>Connector preferences</span>
        <SandButton data-action="connector-clear" onClick={() => { setError(null); setOpen(true) }} shape="pill" size="sm" variant="secondary">Clear</SandButton>
      </div>
      <dialog className="pb-dialog" data-connector-clear-dialog open={open} onCancel={(e) => { e.preventDefault(); if (!busy) setOpen(false) }}>
        <h3>Clear connector preferences?</h3>
        <p>Bots you always allowed to use your connectors will ask again the next time they need one.</p>
        {error !== null ? <p role="alert" style={{ color: 'var(--sand-text-danger, #f87171)' }}>{error}</p> : null}
        <div role="group" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <SandButton data-action="connector-clear-cancel" disabled={busy} onClick={() => setOpen(false)} shape="pill" size="sm" variant="secondary">Cancel</SandButton>
          <SandButton data-action="connector-clear-confirm" disabled={busy} onClick={clearAll} shape="pill" size="sm" variant="primary">{busy ? 'Clearing…' : 'Clear'}</SandButton>
        </div>
      </dialog>
    </>
  )
}
