// 建 bot 对话框（U-21 起，U-23 扩展；裁决见 work/p4-ui/ui/PDC-final.md）：
// #1 preset（radio，R11）→ 连接器（D10：候选只来自 #16 listBundles 的 installed 行；勾 ≥1 走 #4，否则 #3）
// → #2 模型（R13）→ 创建 → 可选 #5 → 选中 → composer 焦点。原生 <dialog>（R12）、D11 固定配置提示、无权限入口（D9）。
// 预填（D13–D15）：「用此配置新建」/「用它新建 Bot」打开同一对话框，只预填不提交；
// 预填连接器已不在 #16 → disabled 未勾 +「未安装 · 去市场安装 →」+ 提交旁「将不带 X 创建」（D11）；
// #16 读取失败 → 预填保留勾选、标「未能确认」，提交交 main/SDK 权威校验（D12）。
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../theme/theme'
import { addCreated, api, closeNewBot, openMarket, refreshMeta, type DialogInit } from '../../shell/store'

interface Preset { id: string; description?: string; isDefault?: boolean }
interface ModelOption { value: string; label: string; provider: string; model: string }
export interface Bundle { name: string; description?: string; installed?: boolean; availability?: string }

/** #16 返回 BundleInfo[]；连接器候选 = installed === true 且文件可读（availability !== 'missing'：manifest 还在、包已被删）。 */
export function installedBundles(value: unknown): Bundle[] {
  return (Array.isArray(value) ? value as Bundle[] : [])
    .filter((b) => b.installed === true && b.availability !== 'missing' && typeof b.name === 'string')
}

export function NewBotDialog({ init }: { init: DialogInit | null }): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [defaultModel, setDefaultModel] = useState('')
  const [bundles, setBundles] = useState<Bundle[] | 'error' | null>(null)
  const [presetId, setPresetId] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = init !== null
  const close = (): void => { if (!busy) closeNewBot() }

  const loadBundles = (): void => {
    setBundles(null)
    void api('pluginManager/listBundles', {}).then((r) => setBundles(r.ok ? installedBundles(r.value) : 'error'))
  }

  useEffect(() => {
    const dlg = ref.current
    if (dlg === null) return
    if (init === null) { if (dlg.open) dlg.close(); return }
    dlg.showModal()
    setError(null)
    setModel('')
    setPresets(null)
    setChecked(init.connectors ?? [])
    loadBundles()
    // O2（REVIEW-P4终审）：失效 token —— 关闭后重开（或换 init 再开）时旧轮次的迟到响应
    // 不得覆盖新一轮的 preset / 模型选择（checked 已由本轮同步设置，混配 = 非用户所选）。
    let stale = false
    void Promise.all([api('agentPresets/list', {}), api('session/modelCatalog', {})]).then(([p, c]) => {
      if (stale) return
      if (!p.ok) { setError(`无法加载基础配置：${p.error?.message ?? ''}`); setPresets([]); return }
      const list = ((p.value as { presets?: Preset[] }).presets ?? [])
      setPresets(list)
      setPresetId(list.find((x) => x.id === init.preset)?.id ?? list.find((x) => x.isDefault)?.id ?? list[0]?.id ?? '')
      // 首次聚焦落在选中 preset 行（席 A）：候选异步到达，渲染后再聚焦
      requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>('input[name="preset"]:checked')?.focus())
      if (c.ok) {
        const cat = c.value as { default?: { model?: string }; groups?: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> }
        const options = (cat.groups ?? []).flatMap((g) => g.models.map((m) => ({ value: `${g.id}/${m.id}`, label: `${g.name} · ${m.name}`, provider: g.id, model: m.id })))
        setDefaultModel(cat.default?.model ?? '')
        setModels(options)
        // D14：只预填目录里能确认的模型
        if (init.model !== undefined && options.some((o) => o.value === init.model)) setModel(init.model)
      }
    })
    return () => { stale = true } // open 翻转（关闭 / 重开）即作废在途轮次
  }, [open]) // 只在开合时重载候选（init 随开合一起变）

  const installedNames = Array.isArray(bundles) ? bundles.map((b) => b.name) : []
  const missing = Array.isArray(bundles) ? (init?.connectors ?? []).filter((n) => !installedNames.includes(n)) : []
  // 提交用的连接器：#16 已知 → 只取已装且勾选的；#16 失败 → 原样交给 main 校验（D12）
  const effective = bundles === 'error' ? checked : checked.filter((n) => installedNames.includes(n))

  const toMarket = (): void => { closeNewBot(); openMarket() }
  const toggle = (name: string): void => setChecked(checked.includes(name) ? checked.filter((n) => n !== name) : [...checked, name])

  async function submit(): Promise<void> {
    if (busy || presetId === '' || bundles === null) return
    setBusy(true)
    setError(null)
    const created = effective.length > 0
      ? await api('p2temp/session.createWithConnectors', { request: { connectors: effective, agentPreset: presetId } })
      : await api('session/create', { request: { agentPreset: presetId } })
    const sid = (created.value as { sessionId?: unknown } | undefined)?.sessionId
    if (!created.ok || typeof sid !== 'string') {
      setBusy(false)
      setError(`创建失败：${created.error?.message ?? '未知错误'}`) // D7：不入列表
      return
    }
    let notice: string | null = null
    const picked = models.find((m) => m.value === model)
    if (picked !== undefined) {
      const sel = await api('session/selectModel', { request: { sessionId: sid, provider: picked.provider, model: picked.model } })
      if (!sel.ok) notice = `Bot 已创建，模型未切换：${sel.error?.message ?? ''}` // 席 C：不让再次点创建造成副本
    }
    if (effective.length > 0) await refreshMeta() // #4 的 recipe 由 main 写入：重拉 #19，否则新 bot 被误判只读
    setBusy(false)
    closeNewBot()
    addCreated(sid, presetId, notice)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus())
  }

  return (
    <dialog
      ref={ref} className="modal" aria-labelledby="new-bot-title" data-dialog="new-bot"
      onCancel={(e) => { e.preventDefault(); close() }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <form className="modal-body" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="modal-head">
          <h2 id="new-bot-title">{init?.title ?? '新建 Bot'}</h2>
          <button type="button" className="icon-btn" aria-label="关闭" disabled={busy} onClick={close}><Icon name="x" /></button>
        </div>
        {init?.note !== undefined && <p className="modal-sub" data-dialog-note>{init.note}</p>}
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
        <fieldset className="field" disabled={busy} data-connectors>
          <legend>连接器</legend>
          <div className="check-list">
            {bundles === null && <div className="field-loading">正在加载…</div>}
            {bundles === 'error' && (
              <div className="field-error" role="alert">
                无法读取已安装连接器
                <button type="button" className="link-btn" data-action="retry-bundles" onClick={loadBundles}>重试</button>
              </div>
            )}
            {bundles === 'error' && checked.map((name) => (
              <label key={name} className="radio-row" data-connector-option={name}>
                <input type="checkbox" checked onChange={() => toggle(name)} />
                <span className="radio-name">{name}</span><span className="radio-desc">未能确认是否已安装</span>
              </label>
            ))}
            {Array.isArray(bundles) && bundles.map((b) => (
              <label key={b.name} className="radio-row" data-connector-option={b.name}>
                <input type="checkbox" value={b.name} checked={checked.includes(b.name)} onChange={() => toggle(b.name)} />
                <span className="radio-name">{b.name}</span>
                {b.description !== undefined && <span className="radio-desc">{b.description}</span>}
              </label>
            ))}
            {missing.map((name) => (
              <div key={name} className="radio-row disabled" data-connector-missing={name}>
                <input type="checkbox" disabled checked={false} readOnly aria-label={name} />
                <span className="radio-name">{name}</span>
                <span className="radio-desc">未安装 · <button type="button" className="link-btn" onClick={toMarket}>去市场安装 →</button></span>
              </div>
            ))}
            {Array.isArray(bundles) && bundles.length === 0 && missing.length === 0 && (
              <div className="field-loading" data-connectors-empty>
                还没有已安装的连接器 · <button type="button" className="link-btn" data-action="to-market" onClick={toMarket}>去市场安装 →</button>
              </div>
            )}
          </div>
        </fieldset>
        <label className="field">
          <span className="field-label">模型</span>
          <select data-model-select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            <option value="">跟随配置默认{defaultModel !== '' ? `（${defaultModel}）` : ''}</option>
            {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <p className="fixed-note">配置随 bot 固定，换配置需新建。</p>
        {missing.length > 0 && <p className="fixed-note warn" data-missing-note>将不带 {missing.join('、')} 创建</p>}
        {error !== null && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={close}>取消</button>
          <button type="submit" className="btn primary" data-action="create-bot" disabled={busy || presetId === '' || bundles === null}>
            {busy ? '创建中…' : <>创建 <Icon name="arrow-right" /></>}
          </button>
        </div>
      </form>
    </dialog>
  )
}
