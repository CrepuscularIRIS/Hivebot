// P5-57 覆盖：0.18 的 PluginsDesktopSurface（Cursor MCP / 技能目录，desktop.mcp.* 我们没有实底）整面换成 P-C 市场
// （定稿 work/p5-parity/ui/P5-57-final.md ①；交互语义复制改造自旧 renderer plugins/market/Market.tsx @4500cd2^）。
// 外壳按 0.78.1：模态 900×700、r14、1px 描边无阴影、48 高头部 + Back / Close 圆钮、「Connect Apps」标题（R2 D1–D2）。
// 列表 / 详情按 R-04（work/p5-parity/RE-market-detail.md）：安装动词一律 Connect → Connecting… → ✓Connected（iSLIjg/JrFTcr/QHcLEN）；
// 行 = sand-plugins-row 单组件（图标 40 + 名称 + 副题 + trailing 态机）；已装预览条（≤4 图标 + 计数 + chevron，「Your plugins」）
// 代替 tab；详情 = 单列页（头：图标 56 + 标题 + 动作 → 描述 → Information 卡）。目录数据只有 name/title/description/version，
// 分类 chips / 推荐 / Apps·Skills 卡 / Copy link / Tool permissions（L-AP 档位不归 renderer）不做，见 REPORT-P5-57。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SandButton, SandIcon, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import type { PluginsDesktopSurfaceProps } from '../../frontend/src/recovered/features/plugins/overlay/desktop-surface'
import { api, monogram, text, ui, useOnline, type Bundle } from './pbots-ui'
import { openNewBot } from './new-bot-dialog'
import {
  classify, enterMarket, install, installedNameOf, installedNames, loadMore, openDetail, outcomeText, refreshBundles, retrySearch, setQuery, setSource,
  targetVersion, useMarket, type Entry, type Kind, type MarketState,
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
  if (kind === 'browse') return <span className="pb-status" role="status" title="This listing has no install coordinates">Not available</span>
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
    <button type="button" className="pb-installed-preview" aria-label="Your plugins" data-action="your-plugins" onClick={onOpen}>
      <span className="pb-installed-preview__stack">{bundles.slice(0, PREVIEW_MAX).map((b) => <Mono key={b.name} name={b.name} size={18} />)}</span>
      <span className="pb-installed-preview__count" data-installed-count>{bundles.length}</span>
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
      {kind === 'browse' && <p className="pb-note">This listing has no npm install coordinates, so the app can't connect it yet.</p>}
      {kind === 'unsupported' && <p className="pb-note pb-note--danger" data-install-error="not-bundle">Can't connect · {outcomeText(outcome!)}</p>}
      {kind === 'installable' && <p className="pb-note">Connecting checks that this is a supported connector bundle. It won't be turned on for any bot until you pick it when creating one.</p>}
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

function Skeleton() {
  return <div className="pb-skeleton" role="status" aria-label="Loading…">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pb-skeleton__row" />)}</div>
}

function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="pb-empty" data-market-empty><div className="pb-empty__title">{title}</div>{hint !== undefined && <div className="pb-note">{hint}</div>}{action}</div>
}

export function PluginsDesktopSurface({ isOpen, onClose }: PluginsDesktopSurfaceProps) {
  const m = useMarket()
  const online = useOnline()
  const [mine, setMine] = useState(false) // 「Your plugins」已装列表视图
  const [draft, setDraft] = useState(m.query)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isOpen) void enterMarket() }, [isOpen])
  useEffect(() => {
    if (draft === m.query) return
    const t = setTimeout(() => setQuery(draft), 200) // P10 防抖
    return () => clearTimeout(t)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  // 回到列表（首开 / Back）把焦点交给搜索框：Esc 链（清空 → 关）始终可达
  useEffect(() => { if (!mine && m.detail === null) searchRef.current?.focus() }, [mine, m.detail, m.sources])
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
  const view = detail !== undefined ? 'detail' : mine ? 'installed' : 'list'

  let body: ReactNode
  if (detail !== undefined) body = <Detail m={m} entry={detail} online={online} onNewWith={newWith} />
  else if (mine) {
    body = m.bundlesError !== null ? <Empty title="Couldn't read your plugins" hint={m.bundlesError} action={<SandButton onClick={() => void refreshBundles()} shape="pill" variant="secondary">Retry</SandButton>} />
      : m.bundles === null ? <Skeleton />
        : m.bundles.length === 0 ? <Empty title="Nothing installed yet. Find plugins in the marketplace." />
          : <ul className="pb-list" data-installed-list aria-label="Your plugins">
            {m.bundles.map((b) => (
              <Row key={b.name} name={b.name} subtitle={b.description ?? 'Pick it when you create a bot'} iconKey={b.name} attrs={{ 'data-bundle': b.name }}
                trailing={<><Connected /><SandButton data-action="new-with" onClick={() => newWith(b.name)} shape="pill" size="sm" trailingIcon="arrow-right" variant="secondary">New bot</SandButton></>} />
            ))}
          </ul>
  } else if (m.sourcesError !== null) {
    body = <Empty title="Couldn't load the marketplace" hint={m.sourcesError} action={<SandButton onClick={() => void enterMarket(true)} shape="pill" variant="secondary">Retry</SandButton>} />
  } else if (m.sources === null) body = <Skeleton />
  else if (m.sources.length === 0) body = <Empty title="No catalog configured" hint="Catalogs come from the profile's market.yml and can't be changed in the app." />
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
        {m.query === '' && m.bundles !== null && m.bundles.length > 0 && <InstalledPreview bundles={m.bundles} onOpen={openMine} />}
        {m.query !== '' && <h3 className="pb-section-title">Results</h3>}
        <ul className="pb-list" data-market-list>
          {m.entries.map((e) => {
            const kind = classify(e, installed, m.outcomes[e.name])
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

  const back = (): void => { if (detail !== undefined) openDetail(null); else if (mine) setMine(false); else onClose() }
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
        <h2 id="sand-plugins-modal-heading">{view === 'installed' ? 'Your plugins' : 'Connect Apps'}</h2>
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
      <div className="pb-market__scroll">{body}</div>
    </div>
  )
}
