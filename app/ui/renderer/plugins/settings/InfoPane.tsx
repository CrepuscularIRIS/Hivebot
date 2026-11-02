// P-D bot 配置 info-pane（U-23；裁决见 work/p4-ui/ui/PDC-final.md）。
// 位置 D1：原版会话头「View agent settings」→ 右侧 info-pane（RE-ui-shell §3.2/§3.4）= 主网格第三列，
// 宽 320（280–400 可调，键 sand.infoPane.width）；主列 < 424 时改覆盖式浮层（App 判定）。
// 层级 D3（席 C）：名称 → 失效提示 → 锁定配置 →「用此配置新建」→ 模型 → 主 Bot。
// 配置只读无编辑控件（D11 / C §7.5）；模型 #5 选中即生效、下一轮起、失败回滚（D8）；设主 Bot #20 成功才置顶（D9）。
import { useEffect, useState } from 'react'
import { Icon } from '../../theme/theme'
import { api, changeModel, openNewBot, setMainBot, type DialogInit, type State } from '../../shell/store'
import { Resizer, type ColumnSpec } from '../../shell/Resizer'
import { Avatar, botInfo } from '../bots/Sidebar'

export const INFO_PANE: ColumnSpec = { min: 280, max: 400, initial: 320, key: 'sand.infoPane.width' }

export const currentModel = (s: State, id: string): string | null => s.models[id] ?? s.views[id]?.model ?? null

/** 「用此配置新建」预填（D13–D15）：未知配方不猜，要求重选；否则预填 preset / 连接器 / 可确认的模型。 */
export function cloneInit(s: State, id: string): DialogInit {
  const info = botInfo(s, id)
  const rawPreset = s.views[id]?.preset ?? s.summaries[id]?.preset ?? null
  if (rawPreset?.startsWith('p2temp-') === true && s.meta.recipes[rawPreset] === undefined) {
    return { title: '用此配置新建', note: '原配置无法完整恢复，请重新选择' }
  }
  const model = currentModel(s, id)
  return {
    title: '用此配置新建', note: `已预填「${info.name}」的配置`, preset: info.preset, connectors: info.connectors,
    ...(model !== null ? { model } : {}),
  }
}

interface ModelOption { value: string; label: string; provider: string; model: string }
let catalog: Promise<{ options: ModelOption[]; fallback: string }> | undefined
/** #2 一次拉取、pane 间共用；失败不缓存（下次打开重试）。 */
function loadCatalog(): Promise<{ options: ModelOption[]; fallback: string }> {
  catalog ??= api('session/modelCatalog', {}).then((c) => {
    if (!c.ok) { catalog = undefined; throw new Error(c.error?.message ?? 'modelCatalog failed') }
    const cat = c.value as { default?: { model?: string }; groups?: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> }
    return {
      fallback: cat.default?.model ?? '',
      options: (cat.groups ?? []).flatMap((g) => g.models.map((m) => ({ value: `${g.id}/${m.id}`, label: `${g.name} · ${m.name}`, provider: g.id, model: m.id }))),
    }
  })
  return catalog
}

function ModelPicker({ s, id, disabled }: { s: State; id: string; disabled: boolean }): JSX.Element {
  const [cat, setCat] = useState<{ options: ModelOption[]; fallback: string } | 'error' | null>(null)
  const [phase, setPhase] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; value?: string; message?: string }>({ kind: 'idle' })
  useEffect(() => { void loadCatalog().then(setCat, () => setCat('error')) }, [])
  useEffect(() => {
    if (phase.kind !== 'saved') return
    const t = setTimeout(() => setPhase({ kind: 'idle' }), 2000)
    return () => clearTimeout(t)
  }, [phase])
  const current = currentModel(s, id)
  const shown = phase.kind === 'saving' ? phase.value! : (current ?? '')
  const options = cat !== null && cat !== 'error' ? cat.options : []

  async function pick(value: string): Promise<void> {
    const opt = options.find((o) => o.value === value)
    if (opt === undefined) return
    setPhase({ kind: 'saving', value })
    const res = await changeModel(id, opt.provider, opt.model)
    // 失败：store 未改，显示自然回滚到旧值（席 C：不伪报已切换）
    setPhase(res.ok ? { kind: 'saved' } : { kind: 'error', message: res.error?.message ?? '切换失败' })
  }

  return (
    <div className="pane-field">
      <select
        data-pane-model aria-label="模型" value={shown} disabled={disabled || cat === null || cat === 'error' || phase.kind === 'saving'}
        onChange={(e) => void pick(e.target.value)}
      >
        {/* 当前值不在目录里（或未知）时仍如实显示，不伪装成目录项 */}
        {current === null && <option value="" disabled>跟随配置默认{cat !== null && cat !== 'error' && cat.fallback !== '' ? `（${cat.fallback}）` : ''}</option>}
        {current !== null && !options.some((o) => o.value === current) && <option value={current}>{current}</option>}
        {options.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <span className={`pane-status${phase.kind === 'error' || cat === 'error' ? ' danger' : ''}`} role="status" data-model-status={phase.kind}>
        {cat === null ? '正在加载…'
          : cat === 'error' ? '无法加载模型列表'
            : phase.kind === 'saving' ? '切换中…'
              : phase.kind === 'saved' ? '已切换，下一轮生效'
                : phase.kind === 'error' ? `切换失败：${phase.message}` : '仅影响此 Bot，下一轮生效'}
      </span>
    </div>
  )
}

function MainBotSection({ s, id }: { s: State; id: string }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setError(null) }, [id])
  if (id === s.meta.mainBotId) return <p className="pane-text" data-main-note>这是主 Bot，固定在侧栏顶部。</p>
  return (
    <div className="pane-field">
      <button type="button" className="btn secondary" data-action="set-main" disabled={busy || !s.online} onClick={() => {
        setBusy(true)
        setError(null)
        void setMainBot(id).then((r) => { setBusy(false); if (!r.ok) setError(`设置失败：${r.error?.message ?? ''}`) })
      }}>
        <Icon name="star" />{busy ? '设置中…' : '设为主 Bot'}
      </button>
      {error !== null && <span className="pane-status danger" role="alert">{error}</span>}
    </div>
  )
}

export function InfoPane({ s, id, width, overlay, onWidth, onClose }: {
  s: State; id: string; width: number; overlay: boolean; onWidth(w: number, persist: boolean): void; onClose(): void
}): JSX.Element {
  const info = botInfo(s, id)
  return (
    <aside className={`info-pane${overlay ? ' overlay' : ''}`} aria-label="Bot 配置" data-info-pane={id} style={{ width }}>
      <Resizer spec={INFO_PANE} width={width} side="left" label="调整配置栏宽度" onWidth={onWidth} />
      <header className="pane-head drag">
        <Avatar info={info} size={24} />
        <span className="pane-name">{info.name}</span>
        {info.main && <span className="pane-badge"><Icon name="star" />主 Bot</span>}
        <button type="button" className="icon-btn" aria-label="关闭配置栏" onClick={onClose}><Icon name="x" /></button>
      </header>
      <div className="pane-scroll">
        {info.readOnly && (
          <div className="pane-alert" role="status" data-pane-alert><Icon name="slash-circle" />连接器已失效，请新建 bot</div>
        )}
        <section className="pane-section" aria-labelledby="pane-config">
          <h3 id="pane-config">配置（创建时固定）</h3>
          <div className="pane-row" data-pane-preset>
            <Icon name="lock-locked" /><span className="pane-key">基础配置</span><span className="pane-val">{info.preset}</span>
          </div>
          <div className="pane-row" data-pane-connectors>
            <Icon name="lock-locked" /><span className="pane-key">连接器</span>
            <span className={`pane-val${info.readOnly ? ' danger' : ''}`}>{info.connectors.length > 0 ? info.connectors.join('、') : '未使用'}</span>
            {info.readOnly && <span className="pane-flag" data-connector-dead><span className="dot danger" />已失效</span>}
          </div>
          <p className="fixed-note">配置随 bot 固定，换配置需新建。</p>
          <button type="button" className="btn secondary" data-action="clone-config" onClick={() => openNewBot(cloneInit(s, id))}>
            <Icon name="copy" />用此配置新建
          </button>
        </section>
        <section className="pane-section" aria-labelledby="pane-model">
          <h3 id="pane-model">模型</h3>
          <ModelPicker key={id} s={s} id={id} disabled={info.readOnly || !s.online} />
        </section>
        <section className="pane-section" aria-labelledby="pane-main">
          <h3 id="pane-main">主 Bot</h3>
          <MainBotSection s={s} id={id} />
        </section>
      </div>
    </aside>
  )
}
