// P5-57 覆盖：0.18 的 PluginsDesktopSurface（Cursor MCP / 技能目录，desktop.mcp.* 我们没有实底）整面换成 P-C 市场
// （定稿 work/p5-parity/ui/P5-57-final.md ①；交互语义复制改造自旧 renderer plugins/market/Market.tsx @4500cd2^）。
// 外壳按 0.78.1：模态 900×700、r14、1px 描边无阴影、48 高头部 + Back / Close 圆钮、「Connect Apps」标题、药丸 tablist（R2 D1–D3）。
// 入口 / overlay 帧 / 命令面板项都是 ProductionRenderer 原样的（footer 药丸 → setOverlay("plugins")）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SandButton, SandIcon, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import type { PluginsDesktopSurfaceProps } from '../../frontend/src/recovered/features/plugins/overlay/desktop-surface'
import { api, monogram, text, ui, useOnline } from './pbots-ui'
import { openNewBot } from './new-bot-dialog'
import {
  classify, enterMarket, install, installedNameOf, installedNames, loadMore, openDetail, outcomeText, refreshBundles, retrySearch, setQuery, setSource,
  targetVersion, useMarket, type Entry, type Kind, type MarketState,
} from './market-store'

export type { PluginsDesktopSurfaceProps } from '../../frontend/src/recovered/features/plugins/overlay/desktop-surface'

function Mono({ name, size }: { name: string; size: number }) {
  return <span className="pb-mono" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{monogram(name)}</span>
}

function Busy() {
  return <span className="pb-busy" role="status">Installing…<span className="pb-progress" /></span>
}

function Status({ m, entry, kind, online }: { m: MarketState; entry: Entry; kind: Kind; online: boolean }) {
  const outcome = m.outcomes[entry.name]
  if (kind === 'installed') return <span className="pb-ok"><SandIcon name="check" size="xs" />Installed</span>
  if (kind === 'browse') return <span className="pb-tag" title="This listing has no install coordinates">Browse only</span>
  if (kind === 'unsupported') return <span className="pb-fail" title={outcomeText(outcome!)}>Can't install</span>
  if (m.installing === entry.name) return <Busy />
  const other = m.installing !== null
  return (
    <span className="pb-row__side">
      {outcome !== undefined && <span className="pb-fail" data-install-error={outcome.code}>{outcomeText(outcome)}</span>}
      <SandButton data-action="install" disabled={other || !online} onClick={() => void install(entry)} shape="pill" size="sm" variant="secondary"
        title={other ? 'Another install is in progress' : !online ? 'Disconnected' : undefined}>
        {outcome !== undefined ? 'Retry' : 'Install'}
      </SandButton>
    </span>
  )
}

function Row({ m, entry, installed, online }: { m: MarketState; entry: Entry; installed: Set<string>; online: boolean }) {
  const kind = classify(entry, installed, m.outcomes[entry.name])
  return (
    <div className="pb-row" data-entry={entry.name} data-kind={kind}>
      <button type="button" className="pb-row__main" onClick={() => openDetail(entry.name)}>
        <Mono name={entry.name} size={36} />
        <span className="pb-row__text"><span className="pb-row__title">{text(entry.title) || entry.name}</span><span className="pb-row__desc">{text(entry.description) || entry.name}</span></span>
      </button>
      <Status m={m} entry={entry} kind={kind} online={online} />
    </div>
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
  return (
    <article className="pb-detail" data-market-detail={entry.name} data-kind={kind}>
      <div className="pb-detail__head">
        <Mono name={entry.name} size={48} />
        <div className="pb-row__text">
          <h3 className="pb-detail__title">{text(entry.title) || entry.name}</h3>
          <span className="pb-row__desc">{entry.name}{version !== undefined ? ` · v${version}` : ''}</span>
        </div>
      </div>
      {text(entry.description) !== '' && <p className="pb-detail__desc">{text(entry.description)}</p>}
      <div className="pb-detail__action" data-detail-action>
        {kind === 'installed' && (
          <>
            <p className="pb-note pb-note--ok"><SandIcon name="check" size="xs" />Installed. It isn't turned on for every bot: pick it when you create a bot.</p>
            <SandButton data-action="new-with" onClick={() => onNewWith(bundle ?? entry.name)} shape="pill" trailingIcon="arrow-right" variant="primary">New bot with this app</SandButton>
          </>
        )}
        {kind === 'browse' && (
          <>
            <SandButton disabled shape="pill" variant="primary">Not installable</SandButton>
            <p className="pb-note">This listing has no npm install coordinates, so the app can't install it yet. Browse only.</p>
          </>
        )}
        {kind === 'unsupported' && <p className="pb-note pb-note--danger" data-install-error="not-bundle">Can't install · {outcomeText(outcome!)}</p>}
        {kind === 'installable' && (
          <>
            {m.installing === entry.name
              ? <Busy />
              : <SandButton data-action="install" disabled={m.installing !== null || !online} onClick={() => void install(entry)} shape="pill" variant="primary">
                {outcome !== undefined ? 'Retry install' : 'Install'}
              </SandButton>}
            {outcome !== undefined && <p className="pb-note pb-note--danger" data-install-error={outcome.code}>{outcomeText(outcome)}</p>}
            <p className="pb-note">Installing checks that this is a supported connector bundle. It won't be turned on for any bot until you pick it when creating one.</p>
          </>
        )}
      </div>
      <section className="pb-doc" aria-label="About">
        <h4>About</h4>
        {doc === null ? <p className="pb-note" role="status">Loading…</p>
          : doc === 'none' ? <p className="pb-note">No details available.</p>
            : <div className="pb-doc__text">{doc}</div>}
      </section>
    </article>
  )
}

function Skeleton() {
  return <div className="pb-skeleton" role="status" aria-label="Loading">{Array.from({ length: 6 }, (_, i) => <div key={i} className="pb-skeleton__row" />)}</div>
}

function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="pb-empty" data-market-empty><div className="pb-empty__title">{title}</div>{hint !== undefined && <div className="pb-note">{hint}</div>}{action}</div>
}

export function PluginsDesktopSurface({ isOpen, onClose }: PluginsDesktopSurfaceProps) {
  const m = useMarket()
  const online = useOnline()
  const [tab, setTab] = useState<'all' | 'installed'>('all')
  const [draft, setDraft] = useState(m.query)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (isOpen) void enterMarket() }, [isOpen])
  useEffect(() => {
    if (draft === m.query) return
    const t = setTimeout(() => setQuery(draft), 200) // P10 防抖
    return () => clearTimeout(t)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { searchRef.current?.focus() }, [])
  if (!isOpen) return null

  const newWith = (bundle: string): void => {
    void openNewBot({ title: 'New bot with this app', note: `${bundle} is selected. Pick a preset and create.`, connectors: [bundle] }).then((sid) => {
      if (sid === null) return
      onClose()
      ui()?.focus(sid)
    })
  }

  const installed = installedNames(m)
  const detail = m.detail === null ? undefined : m.entries.find((e) => e.name === m.detail)
  const source = m.sources?.find((x) => x.url === m.url)

  let body: ReactNode
  if (detail !== undefined) body = <Detail m={m} entry={detail} online={online} onNewWith={newWith} />
  else if (m.sourcesError !== null) {
    body = <Empty title="Couldn't load apps" hint={m.sourcesError} action={<SandButton onClick={() => void enterMarket(true)} shape="pill" variant="secondary">Retry</SandButton>} />
  } else if (m.sources === null) body = <Skeleton />
  else if (m.sources.length === 0) body = <Empty title="No catalog configured" hint="Catalogs come from the profile's market.yml and can't be changed in the app." />
  else if (tab === 'installed') {
    body = m.bundlesError !== null ? <Empty title="Couldn't read installed apps" hint={m.bundlesError} action={<SandButton onClick={() => void refreshBundles()} shape="pill" variant="secondary">Retry</SandButton>} />
      : m.bundles === null ? <Skeleton />
        : m.bundles.length === 0 ? <Empty title="No apps installed yet" action={<SandButton onClick={() => setTab('all')} shape="pill" variant="secondary">Browse all</SandButton>} />
          : <div className="pb-list" data-installed-list>
            {m.bundles.map((b) => (
              <div key={b.name} className="pb-row" data-bundle={b.name}>
                <span className="pb-row__main pb-row__main--static"><Mono name={b.name} size={36} />
                  <span className="pb-row__text"><span className="pb-row__title">{b.name}</span><span className="pb-row__desc">{b.description ?? 'Installed · pick it when you create a bot'}</span></span>
                </span>
                <SandButton data-action="new-with" onClick={() => newWith(b.name)} shape="pill" size="sm" trailingIcon="arrow-right" variant="secondary">New bot</SandButton>
              </div>
            ))}
          </div>
  } else if (m.error !== null) {
    body = <Empty title="Couldn't load apps" hint={m.error} action={<SandButton data-action="retry-search" onClick={retrySearch} shape="pill" variant="secondary">Retry</SandButton>} />
  } else if (m.loading && m.entries.length === 0) body = <Skeleton />
  else if (m.entries.length === 0) {
    body = m.query !== ''
      ? <Empty title={`No apps match “${m.query}”`} action={<SandButton onClick={() => { setDraft(''); setQuery('') }} shape="pill" variant="secondary">Clear search</SandButton>} />
      : <Empty title="This catalog has no apps yet" />
  } else {
    body = (
      <>
        <div className="pb-list" data-market-list>
          {m.entries.map((e) => <Row key={e.name} m={m} entry={e} installed={installed} online={online} />)}
        </div>
        <div className="pb-foot">
          <span className="pb-note" data-market-count>Showing {m.entries.length} of {m.total}</span>
          {m.nextOffset !== null && (
            <SandButton data-action="load-more" disabled={m.loading} onClick={loadMore} shape="pill" size="sm" variant="secondary">{m.loading ? 'Loading…' : 'Load more'}</SandButton>
          )}
        </div>
      </>
    )
  }

  const back = (): void => { if (detail !== undefined) openDetail(null); else onClose() }
  return (
    <div aria-labelledby="sand-plugins-modal-heading" aria-modal="true" className="sand-plugins-dialog pb-market" data-market data-view={detail !== undefined ? 'detail' : 'list'} role="dialog"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        back()
      }}>
      <header className="pb-market__head">
        {detail !== undefined && <SandIconButton aria-label="Back" data-action="market-back" icon="chevron-left" onClick={back} shape="circle" size="md" variant="ghost" />}
        <h2 id="sand-plugins-modal-heading">Connect Apps</h2>
        <SandIconButton aria-label="Close" className="sand-plugins-dialog__close" icon="close" onClick={onClose} shape="circle" size="md" variant="ghost" />
      </header>
      {!online && <div className="pb-offline" role="status">Disconnected. Installing and creating bots are paused.</div>}
      {detail === undefined && m.sources !== null && m.sources.length > 0 && (
        <div className="pb-market__tools">
          <label className="pb-search">
            <SandIcon name="search" size="sm" />
            <input ref={searchRef} data-market-search type="search" placeholder="Search apps" aria-label="Search apps" value={draft}
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
          <div className="pb-tabs" role="tablist" aria-label="Apps">
            <button type="button" role="tab" aria-selected={tab === 'all'} data-tab="all" onClick={() => setTab('all')}>All</button>
            <button type="button" role="tab" aria-selected={tab === 'installed'} data-tab="installed" onClick={() => { setTab('installed'); void refreshBundles() }}>
              Installed{m.bundles !== null ? ` ${m.bundles.length}` : ''}
            </button>
          </div>
        </div>
      )}
      <div className="pb-market__scroll">{body}</div>
    </div>
  )
}
