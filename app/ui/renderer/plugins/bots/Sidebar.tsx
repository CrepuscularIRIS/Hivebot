// P-A bot 侧栏 + 最小建 bot 对话框（U-21；裁决见 work/p4-ui/ui/PAB-final.md）。
// 对照原版 AgentsSidebar（RE-ui-shell §3.1）：保留 Header（新建 + 市场）与 agent 列表；去 Search/section/
// 多选/拖拽/pin/账号 footer（BRIEF §2、D12②）。项 = 48px 两行（R7）、角标 corner-{ring,dot,main}（R8）、
// monogram + botTint（R10）、排序冻结（R9）、调宽 240–400（R6）。对话框：radio preset（R11）+ #2 模型（R13）、
// 原生 <dialog>（R12）、D11 固定配置提示、无权限 preset 入口（D9）。
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { GrokMark, Icon } from '../../theme/theme'
import { addCreated, api, select, type State } from '../../shell/store'

const TINTS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'purple', 'brown']

export interface BotInfo {
  id: string; name: string; preset: string; connectors: string[]; readOnly: boolean; main: boolean
  running: boolean; pending: boolean; unread: boolean; tint: string
}

/** Bot 视图投影（CONTRACT §3.1）：preset/connectors/readOnly 由 header.agentPreset + recipes 推出。 */
export function botInfo(s: State, id: string): BotInfo {
  const sum = s.summaries[id]
  const view = s.views[id]
  const rawPreset = view?.preset ?? sum?.preset ?? null
  const temp = rawPreset?.startsWith('p2temp-') === true
  const recipe = rawPreset === null ? undefined : s.meta.recipes[rawPreset]
  const preset = temp ? (recipe?.agentPreset ?? '未知配置') : (rawPreset ?? '…')
  const main = id === s.meta.mainBotId
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return {
    id, preset, main,
    name: view?.title ?? sum?.title ?? (main ? '主 Bot' : preset),
    connectors: recipe?.connectors ?? [],
    readOnly: temp && (recipe === undefined || recipe.live === false),
    running: view?.loaded === true ? view.running : (sum?.running ?? false),
    pending: s.approvals.some((a) => a.agentId === id),
    unread: s.unread[id] === true,
    tint: TINTS[hash % TINTS.length]!,
  }
}

export function Avatar({ info, size }: { info: BotInfo; size: number }): JSX.Element {
  return (
    <span className="avatar" style={{ width: size, height: size, background: `var(--sand-fill-${info.tint}-bubble-user)`, fontSize: Math.round(size * 0.46) }} aria-hidden="true">
      {Array.from(info.name)[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

function subtitle(info: BotInfo): { text: string; tone: string } {
  if (info.pending) return { text: '等待批准', tone: 'warn' }
  if (info.running) return { text: '回复中', tone: 'secondary' }
  if (info.readOnly) return { text: '连接器已失效', tone: 'danger' }
  if (info.connectors.length > 0) return { text: `${info.preset} · ${info.connectors.length} 个连接器`, tone: 'tertiary' }
  // 无标题时标题已是 preset 名（席 A），副行不重复，项退为单行
  return { text: info.name === info.preset ? '' : info.preset, tone: 'tertiary' }
}

function BotItem({ s, id }: { s: State; id: string }): JSX.Element {
  const info = botInfo(s, id)
  const sub = subtitle(info)
  const selected = s.selected === id
  const state = info.pending ? '，等待批准' : info.running ? '，回复中' : info.unread ? '，有新回复' : ''
  return (
    <div
      role="option" aria-selected={selected} tabIndex={selected ? 0 : -1}
      className={`bot-item${info.readOnly ? ' readonly' : ''}${s.flash === id ? ' flash' : ''}`}
      data-session={id} data-preset={s.views[id]?.preset ?? s.summaries[id]?.preset ?? ''} data-main={info.main || undefined}
      data-running={info.running || undefined} data-pending={info.pending || undefined} data-unread={info.unread || undefined}
      aria-label={`${info.name}${info.main ? '（主 Bot）' : ''}${state}`}
      onClick={() => select(id)}
    >
      <span className="avatar-wrap">
        <Avatar info={info} size={28} />
        {info.running && <span className="corner-ring" />}
        {info.pending ? <span className="corner-dot warn" title="等待批准" />
          : info.unread ? <span className="corner-dot accent" title="有新回复" /> : null}
      </span>
      <span className="bot-text">
        <span className="bot-title">{info.name}</span>
        {sub.text !== '' && <span className={`bot-sub ${sub.tone}`}>{sub.text}</span>}
      </span>
      {info.main && <span className="corner-main" title="主 Bot"><Icon name="star" /></span>}
    </div>
  )
}

export const SIDEBAR = { min: 240, max: 400, initial: 280, key: 'sand.sidebar.width' } as const

export function Sidebar({ s, width, onWidth, onNew }: {
  s: State; width: number; onWidth(w: number, persist: boolean): void; onNew(): void
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const onListKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const opts = [...(listRef.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])]
    const i = opts.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
    } else if (e.key === 'Enter' && i >= 0) {
      select(opts[i]!.dataset.session!)
    }
  }
  const drag = (e: PointerEvent<HTMLDivElement>): void => {
    const startX = e.clientX
    const startW = width
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const clamp = (x: number): number => Math.max(SIDEBAR.min, Math.min(SIDEBAR.max, Math.round(startW + x - startX)))
    const move = (ev: globalThis.PointerEvent): void => onWidth(clamp(ev.clientX), false)
    const up = (ev: globalThis.PointerEvent): void => {
      onWidth(clamp(ev.clientX), true)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <aside className="sidebar" aria-label="Bot 侧栏">
      <div className="sidebar-head drag"><GrokMark size={18} /></div>
      <nav className="sidebar-menu">
        <button type="button" className="menu-row" data-action="new-bot" onClick={onNew}>
          <Icon name="plus" /><span>新建 Bot</span><kbd>Ctrl+N</kbd>
        </button>
        <button type="button" className="menu-row" disabled title="即将开放"><Icon name="storefront" /><span>市场</span></button>
      </nav>
      <div className="bot-list" role="listbox" aria-label="Bot 列表" ref={listRef} onKeyDown={onListKey}>
        {s.order.map((id) => <BotItem key={id} s={s} id={id} />)}
      </div>
      <div
        className="resizer" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" tabIndex={0}
        aria-valuemin={SIDEBAR.min} aria-valuemax={SIDEBAR.max} aria-valuenow={width}
        onPointerDown={drag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            onWidth(Math.max(SIDEBAR.min, Math.min(SIDEBAR.max, width + (e.key === 'ArrowRight' ? 8 : -8))), true)
          }
        }}
      />
    </aside>
  )
}

interface Preset { id: string; description?: string; isDefault?: boolean }
interface ModelOption { value: string; label: string; provider: string; model: string }

/** 建 bot 对话框（#1 preset + #2 模型 → #3 建 → 可选 #5 → 选中 → composer 焦点）。 */
export function NewBotDialog({ open, onClose }: { open: boolean; onClose(): void }): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [presetId, setPresetId] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dlg = ref.current
    if (dlg === null) return
    if (!open) { if (dlg.open) dlg.close(); return }
    dlg.showModal()
    setError(null)
    setModel('')
    setPresets(null)
    void Promise.all([api('agentPresets/list', {}), api('session/modelCatalog', {})]).then(([p, c]) => {
      if (!p.ok) { setError(`无法加载基础配置：${p.error?.message ?? ''}`); setPresets([]); return }
      const list = ((p.value as { presets?: Preset[] }).presets ?? [])
      setPresets(list)
      setPresetId(list.find((x) => x.isDefault)?.id ?? list[0]?.id ?? '')
      // 首次聚焦落在默认 preset 行（席 A）：候选异步到达，渲染后再聚焦
      requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>('input[name="preset"]:checked')?.focus())
      if (c.ok) {
        const cat = c.value as { default?: { model?: string }; groups?: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> }
        setDefaultModel(cat.default?.model ?? '')
        setModels((cat.groups ?? []).flatMap((g) => g.models.map((m) => ({ value: `${g.id}/${m.id}`, label: `${g.name} · ${m.name}`, provider: g.id, model: m.id }))))
      }
    })
  }, [open])

  async function submit(): Promise<void> {
    if (busy || presetId === '') return
    setBusy(true)
    setError(null)
    const created = await api('session/create', { request: { agentPreset: presetId } })
    const sid = (created.value as { sessionId?: unknown } | undefined)?.sessionId
    if (!created.ok || typeof sid !== 'string') {
      setBusy(false)
      setError(`创建失败：${created.error?.message ?? '未知错误'}`)
      return
    }
    let notice: string | null = null
    const picked = models.find((m) => m.value === model)
    if (picked !== undefined) {
      const sel = await api('session/selectModel', { request: { sessionId: sid, provider: picked.provider, model: picked.model } })
      if (!sel.ok) notice = `Bot 已创建，模型未切换：${sel.error?.message ?? ''}` // 席 C：不让再次点创建造成副本
    }
    setBusy(false)
    onClose()
    addCreated(sid, presetId, notice)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus())
  }

  return (
    <dialog
      ref={ref} className="modal" aria-labelledby="new-bot-title" data-dialog="new-bot"
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <form className="modal-body" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="modal-head">
          <h2 id="new-bot-title">新建 Bot</h2>
          <button type="button" className="icon-btn" aria-label="关闭" disabled={busy} onClick={onClose}><Icon name="x" /></button>
        </div>
        <fieldset className="field" disabled={busy}>
          <legend>基础配置</legend>
          {presets === null && <div className="field-loading">正在加载…</div>}
          {presets?.map((p) => (
            <label key={p.id} className="radio-row" data-preset-option={p.id}>
              <input type="radio" name="preset" value={p.id} checked={presetId === p.id} onChange={() => setPresetId(p.id)} />
              <span className="radio-name">{p.id}{p.isDefault === true ? '（默认）' : ''}</span>
              {p.description !== undefined && <span className="radio-desc">{p.description}</span>}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="field-label">模型</span>
          <select data-model-select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            <option value="">跟随配置默认{defaultModel !== '' ? `（${defaultModel}）` : ''}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <p className="fixed-note">配置随 bot 固定，换配置需新建。</p>
        {error !== null && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="btn primary" data-action="create-bot" disabled={busy || presetId === ''}>
            {busy ? '创建中…' : <>创建 <Icon name="arrow-right" /></>}
          </button>
        </div>
      </form>
    </dialog>
  )
}
