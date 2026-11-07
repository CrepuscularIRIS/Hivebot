// P5-57 · 新建 Bot 对话框（定稿 P5-57-final ②；逻辑复制改造自旧 renderer plugins/settings/NewBotDialog.tsx @4500cd2^）。
// #1 preset（radio）→ 连接器（候选只来自 #16 installed 行；勾 ≥1 走 #4，否则 #3）→ #2 模型 → 创建 → 可选 #5。
// 原生 <dialog>（焦点陷阱 / Esc 原生）；D11 固定配置说明；无权限入口（D9）。
// 预填（D13–D15）：「New bot with this app」/「New bot with this configuration」打开同一对话框，只预填不提交；
// 预填连接器已不在 #16 → disabled 未勾 +「Not installed」+ 提交旁「Will be created without X」（D11）；
// #16 读取失败 → 预填保留勾选、标「Couldn't confirm」，交 main/SDK 权威校验（D12）。
// 入口：shim createAgent（侧栏 New）经 pbotsUi.chooser 进来；市场 / 配置面板直接 openNewBot()。
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { SandButton, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { OnboardingCharacter, personaInk, personaShapePath, PICKER_COLORS, PICKER_SHAPES } from './character'
import { api, installedBundles, modelOptions, ui, type Bundle, type ModelOption, type NewBotInit } from './pbots-ui'

interface Preset { id: string; description?: string; isDefault?: boolean }
interface Pending { init: NewBotInit; seq: number; resolve(sessionId: string | null): void }

let pending: Pending | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = (): void => { for (const l of [...listeners]) l() }

/** 打开对话框；resolve 新 bot 的 sessionId（取消 = null）。已开着时先按取消收掉上一轮。 */
export function openNewBot(init: NewBotInit = {}): Promise<string | null> {
  pending?.resolve(null)
  return new Promise((resolve) => { seq += 1; pending = { init, seq, resolve }; emit() })
}

/** T24：形象初值——形状/颜色各自随机（每次打开对话框重抽；T20b initials 实测口径）。 */
export function initialCharacter(rand: () => number): { shape: string; color: string } {
  return {
    shape: PICKER_SHAPES[Math.floor(rand() * PICKER_SHAPES.length)]!,
    color: PICKER_COLORS[Math.floor(rand() * PICKER_COLORS.length)]!,
  }
}

const themeOf = (): 'light' | 'dark' => (typeof document === 'undefined' || !document.documentElement.dataset.theme.endsWith('dark') ? 'light' : 'dark')

/** T24：形状钮的静态 SVG（0.79.3 用 hT 3D 引擎逐帧画——有意偏差：静态，见 character.tsx 头注）。 */
function ShapeGlyph({ shape, color, size = 28, pressed = false }: { shape: string; color: string; size?: number; pressed?: boolean }) {
  const ink = personaInk(color, themeOf())
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="-15 -15 259 259" style={{ display: 'block' }}>
      {pressed ? <path d={personaShapePath(shape)} fill="none" stroke="var(--sand-border, #1c1c1c33)" strokeWidth={14} /> : null}
      {pressed ? <path d={personaShapePath(shape)} fill="none" stroke="var(--sand-surface, #ffffff)" strokeWidth={8} /> : null}
      <path d={personaShapePath(shape)} fill={ink} />
    </svg>
  )
}

/** 「去市场装」：关对话框（按取消）并请求打开市场（ProductionRenderer 的 footer 入口，同一 overlay）。 */
function toMarket(): void {
  finish(null)
  document.querySelector<HTMLButtonElement>('.sand-agents-sidebar__plugins')?.click()
}

function finish(sessionId: string | null): void {
  const p = pending
  pending = null
  emit()
  p?.resolve(sessionId)
}

const usePending = (): Pending | null => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => pending, () => null)

export function NewBotDialogHost() {
  useEffect(() => {
    const u = ui()
    if (u === null) return
    u.chooser = openNewBot
    return () => { if (u.chooser === openNewBot) u.chooser = undefined }
  }, [])
  const p = usePending()
  return createPortal(<NewBotDialog key={p?.seq ?? 0} init={p?.init ?? null} />, document.body)
}

function NewBotDialog({ init }: { init: NewBotInit | null }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [bundles, setBundles] = useState<Bundle[] | 'error' | null>(null)
  const [presetId, setPresetId] = useState('')
  // T24：形象（每轮开合按 key 重挂 → useState 初始化器即「每次打开随机」）
  const [character, setCharacter] = useState(() => initialCharacter(Math.random))
  // T30：名字（255/trim 置灰；Enter 走 form 隐式提交）
  const [name, setName] = useState('')
  const [checked, setChecked] = useState<string[]>(init?.connectors ?? [])
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => { if (!busy) finish(null) }

  const loadBundles = (): void => {
    setBundles(null)
    void api('pluginManager/listBundles', {}).then((r) => setBundles(r.ok ? installedBundles(r.value) : 'error'))
  }

  useEffect(() => {
    const dlg = ref.current
    if (dlg === null || init === null) return
    if (!dlg.open) dlg.showModal()
    loadBundles()
    let stale = false // 关闭 / 换一轮后，旧轮次的迟到响应不得覆盖（O2）
    void Promise.all([api('agentPresets/list', {}), api('session/modelCatalog', {})]).then(([p, c]) => {
      if (stale) return
      if (!p.ok) { setError(`Couldn't load presets: ${p.error?.message ?? ''}`); setPresets([]); return }
      const list = ((p.value as { presets?: Preset[] }).presets ?? [])
      setPresets(list)
      setPresetId(list.find((x) => x.id === init.preset)?.id ?? list.find((x) => x.isDefault)?.id ?? list[0]?.id ?? '')
      requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>('input[aria-label="Bot name"]')?.focus()) // T30：打开聚焦名字框
      if (c.ok) {
        const cat = modelOptions(c.value)
        setDefaultModel(cat.fallback)
        setModels(cat.options)
        if (init.model !== undefined && cat.options.some((o) => o.value === init.model)) setModel(init.model) // D14：只预填可确认的
      }
    })
    return () => { stale = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 每轮开合按 key 重挂，挂载即一轮

  if (init === null) return null

  const installedNames = Array.isArray(bundles) ? bundles.map((b) => b.name) : []
  const missing = Array.isArray(bundles) ? (init.connectors ?? []).filter((n) => !installedNames.includes(n)) : []
  // 提交用的连接器：#16 已知 → 只取已装且勾选的；#16 失败 → 原样交 main 校验（D12）
  const effective = bundles === 'error' ? checked : checked.filter((n) => installedNames.includes(n))
  const toggle = (name: string): void => setChecked(checked.includes(name) ? checked.filter((n) => n !== name) : [...checked, name])

  async function submit(): Promise<void> {
    const u = ui()
    if (busy || presetId === '' || bundles === null || u === null || name.trim() === '') return
    setBusy(true)
    setError(null)
    const picked = models.find((m) => m.value === model)
    const res = await u.createBot({ preset: presetId, connectors: effective, avatar: character, name: name.trim(), ...(picked !== undefined ? { model: { provider: picked.provider, model: picked.model } } : {}) })
    setBusy(false)
    if (!res.ok) { setError(`Couldn't create the bot: ${res.message}`); return } // D7：不入列表
    finish(res.sessionId)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".sand-prompt-form [contenteditable='true']")?.focus())
  }

  return (
    <dialog
      ref={ref} className="pb-dialog pb-new-bot" aria-labelledby="pb-new-bot-title" data-dialog="new-bot"
      onCancel={(e) => { e.preventDefault(); close() }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <form className="pb-dialog__body" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <header className="pb-dialog__head">
          <h2 id="pb-new-bot-title">{init.title ?? 'Create New Bot'}</h2>
          <SandIconButton aria-label="Close" disabled={busy} icon="close" onClick={close} shape="circle" size="md" variant="ghost" />
        </header>
        {init.note !== undefined && <p className="pb-dialog__note" data-dialog-note>{init.note}</p>}
        <div className="pb-character" data-character>
          <span className="pb-character__preview" data-preview data-avatar-shape={character.shape} data-avatar-color={character.color} aria-label={`${character.shape} preview`}>
            <OnboardingCharacter color={character.color} shape={character.shape} sizePx={96} state="idle" paused />
          </span>
          <input aria-label="Bot name" className="pb-name-input" maxLength={255} onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy && name.trim() !== '' && presetId !== '' && bundles !== null) { e.preventDefault(); void submit() } }} placeholder="Name your Bot" type="text" value={name} />
          <div className="pb-character__shapes" role="group" aria-label="character shape">
            {PICKER_SHAPES.map((shape) => (
              <button key={shape} type="button" className="pb-character__shape" data-shape={shape}
                aria-label={`${shape} character shape`} aria-pressed={character.shape === shape}
                onClick={() => setCharacter({ ...character, shape })}>
                <ShapeGlyph pressed={character.shape === shape} shape={shape} color={character.color} />
              </button>
            ))}
          </div>
          <div className="pb-character__colors" role="group" aria-label="character color">
            {PICKER_COLORS.map((color) => (
              <button key={color} type="button" className="pb-character__color" data-color={color}
                aria-label={`${color[0]!.toUpperCase()}${color.slice(1)} character color`} aria-pressed={character.color === color}
                style={{ backgroundColor: personaInk(color, themeOf()) }}
                onClick={() => setCharacter({ ...character, color })} />
            ))}
          </div>
        </div>
        <details className="pb-more" open={init.preset !== undefined || (init.connectors !== undefined && init.connectors.length > 0) || init.model !== undefined}>
          <summary>More options</summary>
          <fieldset className="pb-field" disabled={busy}>
          <legend>Preset</legend>
          {presets === null && <div className="pb-muted" role="status">Loading…</div>}
          {presets?.map((p) => (
            <label key={p.id} className="pb-option" data-preset-option={p.id}>
              <input type="radio" name="pb-preset" value={p.id} checked={presetId === p.id} onChange={() => setPresetId(p.id)} />
              <span className="pb-option__name">{p.id}{p.isDefault === true ? ' (default)' : ''}</span>
              {p.description !== undefined && <span className="pb-option__desc">{p.description}</span>}
            </label>
          ))}
        </fieldset>
        <fieldset className="pb-field" disabled={busy} data-connectors>
          <legend>Connectors</legend>
          {bundles === null && <div className="pb-muted" role="status">Loading…</div>}
          {bundles === 'error' && (
            <div className="pb-error" role="alert">
              Couldn't read installed connectors <button type="button" className="pb-link" data-action="retry-bundles" onClick={loadBundles}>Retry</button>
            </div>
          )}
          {bundles === 'error' && checked.map((name) => (
            <label key={name} className="pb-option" data-connector-option={name}>
              <input type="checkbox" checked onChange={() => toggle(name)} />
              <span className="pb-option__name">{name}</span><span className="pb-option__desc">Couldn't confirm it's installed</span>
            </label>
          ))}
          {Array.isArray(bundles) && bundles.map((b) => (
            <label key={b.name} className="pb-option" data-connector-option={b.name}>
              <input type="checkbox" value={b.name} checked={checked.includes(b.name)} onChange={() => toggle(b.name)} />
              <span className="pb-option__name">{b.name}</span>
              {b.description !== undefined && <span className="pb-option__desc">{b.description}</span>}
            </label>
          ))}
          {missing.map((name) => (
            <div key={name} className="pb-option" data-disabled data-connector-missing={name}>
              <input type="checkbox" disabled checked={false} readOnly aria-label={name} />
              <span className="pb-option__name">{name}</span>
              <span className="pb-option__desc">Not installed · <button type="button" className="pb-link" onClick={toMarket}>Open Connect apps</button></span>
            </div>
          ))}
          {Array.isArray(bundles) && bundles.length === 0 && missing.length === 0 && (
            <div className="pb-muted" data-connectors-empty>
              No connectors installed yet · <button type="button" className="pb-link" data-action="to-market" onClick={toMarket}>Open Connect apps</button>
            </div>
          )}
        </fieldset>
        <label className="pb-field">
          <span className="pb-field__label">Model</span>
          <select className="pb-select" data-model-select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            <option value="">Preset default{defaultModel !== '' ? ` (${defaultModel})` : ''}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <p className="pb-muted">Configuration is locked when the bot is created. To change it, create a new bot.</p>
        {missing.length > 0 && <p className="pb-warn" data-missing-note>Will be created without {missing.join(', ')}</p>}
        </details>
        {error !== null && <p className="pb-error" role="alert">{error}</p>}
        <footer className="pb-dialog__actions">
          <SandButton disabled={busy} onClick={close} shape="pill" variant="secondary">Cancel</SandButton>
          <SandButton data-action="create-bot" disabled={name.trim() === '' || presetId === '' || bundles === null} pending={busy} shape="pill" type="submit" variant="primary">
            {busy ? 'Creating…' : 'Create'}
          </SandButton>
        </footer>
      </form>
    </dialog>
  )
}
