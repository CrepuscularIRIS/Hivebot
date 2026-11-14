// P5-57 覆盖：0.18 的 PluginsDesktopSurface（Cursor MCP / 技能目录，desktop.mcp.* 我们没有实底）整面换成 P-C 市场
// （定稿 work/p5-parity/ui/P5-57-final.md ①；交互语义复制改造自旧 renderer plugins/market/Market.tsx @4500cd2^）。
// 外壳按 0.78.1：模态 900×700、r14、1px 描边无阴影、48 高头部 + Back / Close 圆钮、「Connect Apps」标题（R2 D1–D2）。
// 列表 / 详情按 R-04（work/p5-parity/RE-market-detail.md）：安装动词一律 Connect → Connecting… → ✓Connected（iSLIjg/JrFTcr/QHcLEN）；
// 行 = sand-plugins-row 单组件（图标 40 + 名称 + 副题 + trailing 态机）；已装预览条（≤4 图标 + 计数 + chevron，「Installed」）
// 代替 tab；详情 = 单列页（头：图标 56 + 标题 + 动作 → 描述 → Information 卡）。目录数据只有 name/title/description/version，
// 分类 chips / 推荐 / Apps·Skills 卡 / Copy link / Tool permissions（L-AP 档位不归 renderer）不做，见 REPORT-P5-57。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SandButton, SandIcon, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import type { PluginsDesktopSurfaceProps } from '../../frontend/src/recovered/features/plugins/overlay/desktop-surface'
import { api, monogram, text, ui, useOnline, type Bundle } from './pbots-ui'
import { BUILTIN_PICKS_URL } from './market-picks'
import { openNewBot } from './new-bot-dialog'
import {
  addIndex, classify, enterMarket, install, installedNameOf, installedNames, loadMore, openDetail, outcomeText, refreshBundles, removeIndex, retrySearch,
  setQuery, setSource, targetVersion, useMarket, type Entry, type Kind, type MarketState,
} from './market-store'

export type { PluginsDesktopSurfaceProps } from '../../frontend/src/recovered/features/plugins/overlay/desktop-surface'

const PREVIEW_MAX = 4 // R-04 §1.2 已装预览条 wo=4

function Mono({ name, size }: { name: string; size: number }) {
  return <span className="pb-mono" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{monogram(name)}</span>
}

/** ✓Connected 徽标（HAt：check 12 + QHcLEN）。 */
function Connected() {
  return <span className="pb-added"><SandIcon name="check" size={12} />Connected</span>
}

/** trailing / 详情动作态机（R-04 §1.2 / §2.2）：Connected 徽标 > Not available > 本会话不受支持 > Connecting… > Connect。 */
function Action({ m, entry, kind, online, size }: { m: MarketState; entry: Entry; kind: Kind; online: boolean; size: 'sm' | 'md' }) {
  const outcome = m.outcomes[entry.name]
  const name = text(entry.title) || entry.name
  if (kind === 'installed') return <Connected />
  if (kind === 'browse') {
    // T69：needs-sign-in 条目（原版目录常见登录服务）——如实标注，无 Connect 钮（Q-048-2=A）
    if (entry.metadata?.keywords?.includes('needs-sign-in') === true) {
      return <span className="pb-status" data-needs-signin role="status" title="This service needs account sign-in, which this build doesn't have yet">Needs sign-in</span>
    }
    return <span className="pb-status" role="status" title="This listing has no install coordinates">Not available</span>
  }
  if (kind === 'unsupported') return <span className="pb-status pb-status--danger" role="status" title={outcomeText(outcome!)}>Not supported</span>
  const connecting = m.installing === entry.name
  const other = m.installing !== null && !connecting
  return (
    <span className="pb-row__action">
      {outcome !== undefined && !connecting && <span className="pb-fail" data-install-error={outcome.code}>{outcomeText(outcome)}</span>}
      <SandButton aria-busy={connecting || undefined} aria-label={`Connect ${name}`} data-action="connect" disabled={connecting || other || !online}
        onClick={() => void install(entry)} shape="pill" size={size} variant="secondary"
        title={other ? 'Another app is connecting' : !online ? 'Disconnected' : undefined}>
        {connecting ? 'Connecting…' : 'Connect'}
      </SandButton>
    </span>
  )
}

function Row({ name, subtitle, iconKey, onOpen, trailing, attrs }: { name: string; subtitle: string; iconKey: string; onOpen?: () => void; trailing: ReactNode; attrs: Record<string, string> }) {
  const main = <><Mono name={iconKey} size={40} /><span className="pb-row__main"><span className="pb-row__title">{name}</span><span className="pb-row__desc">{subtitle}</span></span></>
  return (
    <li className="pb-row sand-plugins-row" {...attrs}>
      {onOpen !== undefined
        ? <button type="button" className="pb-row__open" aria-label={`Open ${name}`} onClick={onOpen}>{main}</button>
        : <span className="pb-row__open pb-row__open--static">{main}</span>}
      <span className="pb-row__trailing">{trailing}</span>
    </li>
  )
}

function InstalledPreview({ bundles, onOpen }: { bundles: Bundle[]; onOpen(): void }) {
  return (
    <button type="button" className="pb-installed-preview" aria-label="Installed" data-action="your-plugins" onClick={onOpen}>
      <span className="pb-installed-preview__label">Installed</span>
      {bundles.length > 0 && <span className="pb-installed-preview__stack">{bundles.slice(0, PREVIEW_MAX).map((b) => <Mono key={b.name} name={b.name} size={18} />)}</span>}
      {bundles.length > 0 && <span className="pb-installed-preview__count" data-installed-count>{bundles.length}</span>}
      <SandIcon name="chevron-right" size={12} />
    </button>
  )
}

function Info({ rows }: { rows: Array<[string, string]> }) {
  return (
    <section className="pb-card" aria-label="Information">
      <h4>Information</h4>
      <dl className="pb-info">{rows.map(([k, v]) => <div key={k} className="pb-info__row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  )
}

function Detail({ m, entry, online, onNewWith }: { m: MarketState; entry: Entry; online: boolean; onNewWith(bundle: string): void }) {
  const installed = installedNames(m)
  const kind = classify(entry, installed, m.outcomes[entry.name])
  const bundle = installedNameOf(entry, installed) // U-26 ①：预勾实际 bundle 名（wrapper 安装后是 @p2sdk-market/<段>）
  const version = targetVersion(entry)?.version
  const [doc, setDoc] = useState<string | 'none' | null>(null)
  useEffect(() => {
    if (m.url === null || version === undefined) { setDoc('none'); return }
    let live = true
    void api('pluginMarket/readEntryDetail', { url: m.url, name: entry.name, version, language: 'en' }).then((r) => {
      const v = r.value as { status?: string; markdown?: string } | undefined
      if (live) setDoc(r.ok && v?.status === 'found' && typeof v.markdown === 'string' ? v.markdown : 'none')
    })
    return () => { live = false }
  }, [m.url, entry.name, version])
  const outcome = m.outcomes[entry.name]
  const source = m.sources?.find((x) => x.url === m.url)
  const title = text(entry.title) || entry.name
  return (
    <article className="pb-detail" data-market-detail={entry.name} data-kind={kind}>
      <header className="pb-detail__head">
        <Mono name={entry.name} size={56} />
        <div className="pb-detail__titles">
          <h3 className="pb-detail__title" data-detail-hero-title>{title}</h3>
          <span className="pb-row__desc">{entry.name}{version !== undefined ? ` · v${version}` : ''}</span>
        </div>
        <span className="pb-detail__action" data-detail-action><Action m={m} entry={entry} kind={kind} online={online} size="md" /></span>
      </header>
      {text(entry.description) !== '' && <p className="pb-detail__desc">{text(entry.description)}</p>}
      {kind === 'installed' && (
        <section className="pb-card pb-card--action">
          <p className="pb-note">Connected apps aren't turned on for every bot. Pick this one when you create a bot.</p>
          <SandButton data-action="new-with" onClick={() => onNewWith(bundle ?? entry.name)} shape="pill" trailingIcon="arrow-right" variant="primary">New bot with this app</SandButton>
        </section>
      )}
      {kind === 'browse' && entry.metadata?.keywords?.includes('needs-sign-in') === true
        && <p className="pb-note" data-needs-signin-note>Sign-in connectors aren't supported in this build yet.</p>}
      {kind === 'unsupported' && <p className="pb-note pb-note--danger" data-install-error="not-bundle">Couldn't connect <details className="pb-install-error-details"><summary>Details</summary><span>{outcomeText(outcome!)}</span></details></p>}
      {kind === 'installable' && <p className="pb-note">Connecting checks that this app is supported. It won't be turned on for any bot until you pick it when creating one.</p>}
      <Info rows={[
        ['Package', entry.name],
        ...(version !== undefined ? [['Version', version] as [string, string]] : []),
        ['Catalog', text(source?.title) || source?.url || '—'],
        ['Availability', kind === 'installed' ? 'Connected' : kind === 'installable' ? 'Public' : 'Not available'],
      ]} />
      <section className="pb-card" aria-label="About">
        <h4>About</h4>
        {doc === null ? <p className="pb-note" role="status">Loading…</p>
          : doc === 'none' ? <p className="pb-note">No details available.</p>
            : <div className="pb-doc__text">{doc}</div>}
      </section>
    </article>
  )
}

/** T51：Index sources 管理视图（DSH Discover 同款语义）：列（标题/URL/错误/删除）+ 加源表单（被拒保留草稿与原因）。 */
function IndexSources({ m, onDone }: { m: MarketState; onDone(): void }) {
  const [draft, setDraft] = useState('')
  const [why, setWhy] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const host = (url: string): string => { try { return new URL(url).host } catch { return url } }
  const add = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const err = await addIndex(draft)
    setBusy(false)
    if (err !== null) { setWhy(err); return } // 被拒：保留草稿 + 原因（DSH 同款）
    setDraft(''); setWhy(null)
  }
  const remove = async (url: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    const err = await removeIndex(url)
    setBusy(false)
    if (err !== null) setWhy(err)
  }
  return <div className="pb-market__sources" data-index-sources>
    {/* T71b：无源空态删——sources 恒含内置（同主页空态的不可达证明），列表永不空 */}
    {m.sources === null
      ? <Skeleton />
      : <ul className="pb-list" data-index-list aria-label="Index sources">
        {m.sources.map((s) => (
          <li key={s.url} className="pb-row" data-index-item={s.url}>
            <span className="pb-row__main">
              <strong>{text(s.title) || host(s.url)}</strong>
              <span className="pb-row__desc">{s.url}</span>
              {s.error !== undefined && <span className="pb-row__desc pb-row__error" data-index-error>{s.error}</span>}
            </span>
            {s.url === BUILTIN_PICKS_URL
              ? <span className="pb-status" data-builtin-source title="Ships with Hivebot — always available offline">Built-in</span> // T69：内置源无删除钮
              : <SandButton data-action="remove-index" disabled={busy} onClick={() => void remove(s.url)} shape="pill" size="sm" variant="secondary">Remove</SandButton>}
          </li>
        ))}
      </ul>}
    <form className="pb-market__add" data-index-add onSubmit={(e) => { e.preventDefault(); void add() }}>
      <label className="pb-search">
        <input aria-label="Index source URL" data-index-input onChange={(e) => { setDraft(e.target.value); setWhy(null) }} placeholder="https://example.com/index.json" type="url" value={draft} />
      </label>
      <SandButton data-action="add-index" disabled={busy || draft.trim() === ''} shape="pill" size="sm" type="submit" variant="secondary">Add</SandButton>
    </form>
    {why !== null && <p className="pb-note pb-note--error" data-index-refused role="alert">{why}</p>}
    <p className="pb-note">Index sources come from third parties. Hivebot doesn't review the plugins they list.</p>
    <div className="pb-market__footbar">
      <SandButton className="pb-market__done" data-action="sources-done" onClick={onDone} shape="pill" size="md" variant="secondary">Done</SandButton>
    </div>
  </div>
}

function Skeleton() {
  return <div className="pb-skeleton" role="status" aria-label="Loading…">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pb-skeleton__row" />)}</div>
}

function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="pb-empty" data-market-empty><div className="pb-empty__title">{title}</div>{hint !== undefined && <div className="pb-note">{hint}</div>}{action}</div>
}

export function PluginsDesktopSurface({ isOpen, onClose }: PluginsDesktopSurfaceProps) {
  const m = useMarket()
  const online = useOnline()
  const [mine, setMine] = useState(false) // 「Installed」已装列表视图
  const [managing, setManaging] = useState(false) // T51：Index sources 管理视图
  const [draft, setDraft] = useState(m.query)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isOpen) void enterMarket() }, [isOpen])
  useEffect(() => {
    if (draft === m.query) return
    const t = setTimeout(() => setQuery(draft), 200) // P10 防抖
    return () => clearTimeout(t)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  // 回到列表（首开 / Back）把焦点交给搜索框：Esc 链（清空 → 关）始终可达
  useEffect(() => { if (!mine && !managing && m.detail === null) searchRef.current?.focus() }, [mine, managing, m.detail, m.sources])
  if (!isOpen) return null

  const newWith = (bundle: string): void => {
    void openNewBot({ title: 'New bot with this app', note: `${bundle} is selected. Pick a preset and create.`, connectors: [bundle] }).then((sid) => {
      if (sid === null) return
      onClose()
      ui()?.focus(sid)
    })
  }
  const openMine = (): void => { setMine(true); void refreshBundles() }

  const installed = installedNames(m)
  const detail = m.detail === null ? undefined : m.entries.find((e) => e.name === m.detail)
  const source = m.sources?.find((x) => x.url === m.url)
  const view = detail !== undefined ? 'detail' : managing ? 'sources' : mine ? 'installed' : 'list' // T71：从 Installed 进管理页 heading 要对（list→managing 原路径等价）

  // P5-41.f1 ④：可连接的排在前面（仅浏览的 Not available 不再埋掉首屏）。稳定分区，组内保持目录顺序。
  // ponytail: 只在已加载页内分区；Load more 新到的可连接条目会插到顶部分组，目录大到要按需加载可连接项时改服务端排序。
  const rows = m.entries.map((entry) => ({ entry, kind: classify(entry, installed, m.outcomes[entry.name]) }))
    .sort((a, b) => Number(a.kind === 'browse') - Number(b.kind === 'browse'))
  let body: ReactNode
  if (detail !== undefined) body = <Detail m={m} entry={detail} online={online} onNewWith={newWith} />
  else if (managing) body = <IndexSources m={m} onDone={() => { setManaging(false); setMine(false) }} /> // T71：done 恒回列表（经 Installed 进管理页时 mine 残留会停在 Installed）
  else if (mine) {
    // T71：Index sources 入口收二级——Installed 视图列表下方（Q-055-1=A，Q-056-1=A）
    const sourcesBtn = <div className="pb-installed-footer"><SandButton data-action="manage-index-sources" onClick={() => setManaging(true)} shape="pill" size="sm" variant="secondary">Index sources</SandButton></div>
    body = m.bundlesError !== null ? <Empty title="Couldn't load installed apps" hint={m.bundlesError} action={<SandButton onClick={() => void refreshBundles()} shape="pill" variant="secondary">Retry</SandButton>} />
      : m.bundles === null ? <Skeleton />
        : m.bundles.length === 0 ? <Empty title="Nothing installed yet." />
          : <>
            <ul className="pb-list" data-installed-list aria-label="Installed">
              {m.bundles.map((b) => (
                <Row key={b.name} name={b.name} subtitle={b.description ?? 'Pick it when you create a bot'} iconKey={b.name} attrs={{ 'data-bundle': b.name }}
                  trailing={<><Connected /><SandButton data-action="new-with" onClick={() => newWith(b.name)} shape="pill" size="sm" trailingIcon="arrow-right" variant="secondary">New bot</SandButton></>} />
              ))}
            </ul>
          </>
    body = <>{body}{sourcesBtn}</> // T71c：入口无条件——错误/骨架/空/列表任何态都够得到（bundlesError 漏入口是 T71 引入的退化）
  } else if (m.sourcesError !== null) {
    body = <Empty title="Couldn't load the marketplace" hint={m.sourcesError} action={<SandButton onClick={() => void enterMarket(true)} shape="pill" variant="secondary">Retry</SandButton>} />
  } else if (m.sources === null) body = <Skeleton />
  else if (m.error !== null) {
    body = <Empty title="Couldn't load the marketplace" hint={m.error} action={<SandButton data-action="retry-search" onClick={retrySearch} shape="pill" variant="secondary">Retry</SandButton>} />
  } else if (m.loading && m.entries.length === 0) body = <Skeleton />
  else if (m.entries.length === 0) {
    body = m.query !== ''
      ? <Empty title={`No plugins match "${m.query.trim()}"`} action={<SandButton onClick={() => { setDraft(''); setQuery('') }} shape="pill" variant="secondary">Clear search</SandButton>} />
      : <Empty title="This catalog has no plugins yet" />
  } else {
    body = (
      <>
        {m.query !== '' && <h3 className="pb-section-title">Results</h3>}
        {rows.every((r) => r.kind === 'browse') && (
          <p className="pb-note pb-market__hint" data-market-hint>Listings marked Not available have no install package — they're here for reference. Search by name to find one you can connect.</p>
        )}
        <ul className="pb-list" data-market-list>
          {rows.map(({ entry: e, kind }) => {
            return <Row key={e.name} name={text(e.title) || e.name} subtitle={text(e.description) || e.name} iconKey={e.name} onOpen={() => openDetail(e.name)}
              attrs={{ 'data-entry': e.name, 'data-kind': kind }} trailing={<Action m={m} entry={e} kind={kind} online={online} size="sm" />} />
          })}
        </ul>
        <div className="pb-foot">
          <span className="pb-note" data-market-count>Showing {m.entries.length} of {m.total}</span>
          {m.nextOffset !== null && (
            <SandButton data-action="load-more" disabled={m.loading} onClick={loadMore} shape="pill" size="sm" variant="secondary">{m.loading ? 'Loading…' : 'Load more'}</SandButton>
          )}
        </div>
      </>
    )
  }

  // T71 审修①：back 按显示优先级退栈（managing 先于 mine）——经 Installed 进管理页时
  // mine/managing 同真，原顺序第一次 Back 只清 mine 仍停管理页。
  const back = (): void => { if (detail !== undefined) openDetail(null); else if (managing) setManaging(false); else if (mine) setMine(false); else onClose() }
  return (
    <div aria-labelledby="sand-plugins-modal-heading" aria-modal="true" className="sand-plugins-dialog pb-market" data-market data-view={view} role="dialog"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        back()
      }}>
      <header className="pb-market__head">
        {view !== 'list' && <SandIconButton aria-label="Back to Marketplace" data-action="market-back" icon="chevron-left" onClick={back} shape="circle" size="md" variant="ghost" />}
        <h2 id="sand-plugins-modal-heading">{view === 'installed' ? 'Installed' : view === 'sources' ? 'Index sources' : 'Connect Apps'}</h2>
        <SandIconButton aria-label="Close" className="sand-plugins-dialog__close" icon="close" onClick={onClose} shape="circle" size="md" variant="ghost" />
      </header>
      {!online && <div className="pb-offline" role="status">Disconnected. Connecting apps and creating bots are paused.</div>}
      {view === 'list' && m.sources !== null && m.sources.length > 0 && (
        <div className="pb-market__tools">
          <label className="pb-search">
            <SandIcon name="search" size="sm" />
            <input ref={searchRef} data-market-search type="search" placeholder="Search plugins" aria-label="Search plugins" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || draft === '') return
                e.preventDefault() // 有字先清空；空了再 Esc 才关（冒泡到外层 back）
                setDraft('')
                setQuery('')
              }} />
          </label>
          {m.sources.length > 1
            ? <select className="pb-select" data-market-source aria-label="Catalog" value={m.url ?? ''} onChange={(e) => setSource(e.target.value)}>
              {m.sources.map((x) => <option key={x.url} value={x.url}>{text(x.title) || x.url}</option>)}
            </select>
            : <span className="pb-note" data-market-source-caption>From {text(source?.title) || source?.url}</span>}
        </div>
      )}
      <div className="pb-market__scroll">
        {/* T71 审修②：Installed 入口与数据解耦——list 视图恒渲染（bundles 加载失败/null 期也有入口；
            预览条属稳定二级导航，不随目录分支消失）。 */}
        {view === 'list' && m.query === '' && <InstalledPreview bundles={m.bundles ?? []} onOpen={openMine} />}
        {body}
      </div>
    </div>
  )
}
