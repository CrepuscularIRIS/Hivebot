// P-C 市场页（U-23；裁决见 work/p4-ui/ui/PDC-final.md P1–P16）。对照原版 marketplace overlay（RE-ui-shell §3.3：
// Back / 标题 / 搜索 / tabs / Installed / 空态与错误）；占主列、侧栏保留（审批黄点可达，P1）。
// 无「启用」/「安装并启用」（P3）；无目录源写入口（无 setIndexes，P11）；不拉远程 logo，monogram（P13）。
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../theme/theme'
import { api, closeMarket, openNewBot, type State } from '../../shell/store'
import { tintOf } from '../bots/Sidebar'
import { Markdown } from '../session/Markdown'
import {
  classify, enterMarket, install, installedNameOf, installedNames, loadMore, openDetail, outcomeText, refreshBundles, retrySearch, setQuery, setSource,
  targetVersion, text, useMarket, type Entry, type Kind, type MarketState,
} from './store'

const newWith = (name: string): void => openNewBot({ title: '用它新建 Bot', note: `已预勾连接器「${name}」`, connectors: [name] })

function Mono({ name, size }: { name: string; size: number }): JSX.Element {
  const ch = Array.from(name.replace(/^@[^/]*\//, ''))[0]?.toUpperCase() ?? '?'
  return (
    <span className="avatar square" style={{ width: size, height: size, background: `var(--sand-fill-${tintOf(name)}-bubble-user)`, fontSize: Math.round(size * 0.46) }} aria-hidden="true">
      {ch}
    </span>
  )
}

function Status({ m, entry, kind, online }: { m: MarketState; entry: Entry; kind: Kind; online: boolean }): JSX.Element {
  const outcome = m.outcomes[entry.name]
  if (kind === 'installed') return <span className="m-ok"><Icon name="check" />已安装</span>
  if (kind === 'browse') return <span className="m-tag" title="目录里没有这个条目的安装坐标">仅浏览</span>
  if (kind === 'unsupported') return <span className="m-fail" title={outcomeText(outcome!)}>无法安装</span>
  if (m.installing === entry.name) return <span className="m-busy" role="status">安装中…<span className="m-progress" /></span>
  const other = m.installing !== null
  return (
    <span className="m-side-wrap">
      {outcome !== undefined && <span className="m-err" data-install-error={outcome.code}>{outcomeText(outcome)}</span>}
      <button type="button" className="btn secondary" data-action="install" disabled={other || !online}
        title={other ? '另一个安装进行中' : !online ? '连接已断开' : undefined} onClick={() => void install(entry)}>
        {outcome !== undefined ? '重试' : '安装'}
      </button>
    </span>
  )
}

function Row({ m, entry, installed, online }: { m: MarketState; entry: Entry; installed: Set<string>; online: boolean }): JSX.Element {
  const kind = classify(entry, installed, m.outcomes[entry.name])
  const title = text(entry.title) || entry.name
  return (
    <div className="m-row" data-entry={entry.name} data-kind={kind}>
      <button type="button" className="m-main" onClick={() => openDetail(entry.name)}>
        <Mono name={entry.name} size={36} />
        <span className="m-text"><span className="m-title">{title}</span><span className="m-desc">{text(entry.description) || entry.name}</span></span>
      </button>
      <Status m={m} entry={entry} kind={kind} online={online} />
    </div>
  )
}

function Detail({ m, entry, online }: { m: MarketState; entry: Entry; online: boolean }): JSX.Element {
  const installed = installedNames(m)
  const kind = classify(entry, installed, m.outcomes[entry.name])
  // U-26 ①：预勾实际 bundle 名——U-25 wrapper 安装后 #16 里是 @p2sdk-market/<段>（源名留给展示）
  const bundle = installedNameOf(entry, installed)
  const version = targetVersion(entry)?.version
  const [doc, setDoc] = useState<string | 'none' | null>(null)
  useEffect(() => {
    if (m.url === null || version === undefined) { setDoc('none'); return }
    let live = true
    void api('pluginMarket/readEntryDetail', { url: m.url, name: entry.name, version, language: 'zh-CN' }).then((r) => {
      const v = r.value as { status?: string; markdown?: string } | undefined
      if (live) setDoc(r.ok && v?.status === 'found' && typeof v.markdown === 'string' ? v.markdown : 'none')
    })
    return () => { live = false }
  }, [m.url, entry.name, version])
  const outcome = m.outcomes[entry.name]
  return (
    <article className="m-detail" data-market-detail={entry.name} data-kind={kind}>
      <div className="m-detail-head">
        <Mono name={entry.name} size={40} />
        <div className="m-text">
          <h2 className="m-detail-title">{text(entry.title) || entry.name}</h2>
          <span className="m-desc">{entry.name}{version !== undefined ? ` · v${version}` : ''}</span>
        </div>
      </div>
      {text(entry.description) !== '' && <p className="m-detail-desc">{text(entry.description)}</p>}
      <div className="m-action" data-detail-action>
        {kind === 'installed' && (
          <>
            <p className="m-note ok"><Icon name="check" />已安装 · 不会全局启用。在新建 Bot 时勾选它。</p>
            <button type="button" className="btn primary" data-action="new-with" onClick={() => newWith(bundle ?? entry.name)}>用它新建 Bot <Icon name="arrow-right" /></button>
          </>
        )}
        {kind === 'browse' && (
          <>
            <button type="button" className="btn primary" disabled>不可安装</button>
            <p className="m-note">目录里没有这个条目的 npm 安装坐标，本应用暂时装不了，仅供浏览。</p>
          </>
        )}
        {kind === 'unsupported' && <p className="m-note danger" data-install-error="not-bundle">无法安装 · {outcomeText(outcome!)}</p>}
        {kind === 'installable' && (
          <>
            {m.installing === entry.name
              ? <span className="m-busy" role="status">安装中…<span className="m-progress" /></span>
              : <button type="button" className="btn primary" data-action="install" disabled={m.installing !== null || !online} onClick={() => void install(entry)}>
                {outcome !== undefined ? '重试安装' : '安装'}
              </button>}
            {outcome !== undefined && <p className="m-note danger" data-install-error={outcome.code}>{outcomeText(outcome)}</p>}
            <p className="m-note">安装时会校验是否为受支持的连接器包；安装后不会全局启用，需在新建 Bot 时选择。</p>
          </>
        )}
      </div>
      <section className="m-doc">
        <h3>说明</h3>
        {doc === null ? <p className="m-note">正在读取说明…</p>
          : doc === 'none' ? <p className="m-note">暂无详细说明</p>
            : <div className="md"><Markdown text={doc} /></div>}
      </section>
    </article>
  )
}

function Skeleton(): JSX.Element {
  return <div className="m-skeleton" aria-label="正在加载">{Array.from({ length: 6 }, (_, i) => <div key={i} className="m-sk-row" />)}</div>
}

function Empty({ title, hint, action }: { title: string; hint?: string; action?: JSX.Element }): JSX.Element {
  return <div className="m-empty" data-market-empty><div className="m-empty-title">{title}</div>{hint !== undefined && <div className="m-note">{hint}</div>}{action}</div>
}

export function Market({ s }: { s: State }): JSX.Element {
  const m = useMarket()
  const [tab, setTab] = useState<'all' | 'installed'>('all')
  const [draft, setDraft] = useState(m.query)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { void enterMarket() }, [])
  useEffect(() => {
    if (draft === m.query) return
    const t = setTimeout(() => setQuery(draft), 200)
    return () => clearTimeout(t)
  }, [draft]) // 200 ms 防抖（P10）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (e.key === '/' && !typing && document.querySelector('dialog[open]') === null) { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const installed = installedNames(m)
  const detail = m.detail === null ? undefined : m.entries.find((e) => e.name === m.detail)
  const source = m.sources?.find((x) => x.url === m.url)

  let body: JSX.Element
  if (detail !== undefined) body = <Detail m={m} entry={detail} online={s.online} />
  else if (m.sourcesError !== null) {
    body = <Empty title="无法加载市场" hint={m.sourcesError} action={<button type="button" className="btn secondary" onClick={() => void enterMarket(true)}>重试</button>} />
  } else if (m.sources === null) body = <Skeleton />
  else if (m.sources.length === 0) body = <Empty title="还没有配置目录源" hint="目录源由 profile 的 market.yml 配置，应用内不能修改。" />
  else {
    body = (
      <>
        <div className="m-tools">
          <label className="m-search">
            <Icon name="magnifying-glass" />
            <input ref={searchRef} data-market-search type="search" placeholder="搜索插件" aria-label="搜索插件" value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                e.preventDefault()
                if (draft !== '') { setDraft(''); setQuery('') } else closeMarket()
              }} />
          </label>
          {m.sources.length > 1
            ? <select className="m-source" data-market-source aria-label="目录源" value={m.url ?? ''} onChange={(e) => setSource(e.target.value)}>
              {m.sources.map((x) => <option key={x.url} value={x.url}>{text(x.title) || x.url}</option>)}
            </select>
            : <span className="m-caption" data-market-source-caption>来源：{text(source?.title) || source?.url}</span>}
        </div>
        <div className="m-tabs" role="tablist" aria-label="市场分区">
          <button type="button" role="tab" aria-selected={tab === 'all'} data-tab="all" onClick={() => setTab('all')}>全部</button>
          <button type="button" role="tab" aria-selected={tab === 'installed'} data-tab="installed" onClick={() => { setTab('installed'); void refreshBundles() }}>
            已安装 {m.bundles?.length ?? ''}
          </button>
        </div>
        {tab === 'installed' ? (
          m.bundlesError !== null ? <Empty title="无法读取已安装连接器" hint={m.bundlesError} action={<button type="button" className="btn secondary" onClick={() => void refreshBundles()}>重试</button>} />
            : m.bundles === null ? <Skeleton />
              : m.bundles.length === 0 ? <Empty title="还没有安装任何连接器" action={<button type="button" className="btn secondary" onClick={() => setTab('all')}>浏览全部</button>} />
                : <div className="m-list" data-installed-list>
                  {m.bundles.map((b) => (
                    <div key={b.name} className="m-row" data-bundle={b.name}>
                      <span className="m-main static"><Mono name={b.name} size={36} />
                        <span className="m-text"><span className="m-title">{b.name}</span><span className="m-desc">{b.description ?? '已安装 · 在新建 Bot 时勾选它'}</span></span>
                      </span>
                      <button type="button" className="btn secondary" data-action="new-with" onClick={() => newWith(b.name)}>用它新建 Bot <Icon name="arrow-right" /></button>
                    </div>
                  ))}
                </div>
        ) : m.error !== null ? (
          <Empty title="无法加载市场" hint={m.error} action={<button type="button" className="btn secondary" data-action="retry-search" onClick={retrySearch}>重试</button>} />
        ) : m.loading && m.entries.length === 0 ? <Skeleton />
          : m.entries.length === 0 ? (
            m.query !== ''
              ? <Empty title={`没有匹配「${m.query}」的条目`} action={<button type="button" className="btn secondary" onClick={() => { setDraft(''); setQuery('') }}>清除搜索</button>} />
              : <Empty title="这个目录源还没有条目" />
          ) : (
            <>
              <div className="m-list" data-market-list>
                {m.entries.map((e) => <Row key={e.name} m={m} entry={e} installed={installed} online={s.online} />)}
              </div>
              <div className="m-foot">
                <span className="m-note" data-market-count>已加载 {m.entries.length} / {m.total}</span>
                {m.nextOffset !== null && (
                  <button type="button" className="btn secondary" data-action="load-more" disabled={m.loading} onClick={loadMore}>
                    {m.loading ? '正在加载…' : '加载更多'}
                  </button>
                )}
              </div>
            </>
          )}
      </>
    )
  }

  return (
    <section className="market" data-market aria-label="市场">
      <header className="titlebar drag">
        <button type="button" className="back-btn" data-action="market-back" onClick={() => (detail !== undefined ? openDetail(null) : closeMarket())}>
          <Icon name="arrow-left" />{detail !== undefined ? '市场' : '返回'}
        </button>
        <span className="chat-title">市场</span>
      </header>
      {!s.online && <div className="offline-bar" role="status">连接已断开，暂不能安装或新建</div>}
      <div className="m-scroll"><div className="m-col">{body}</div></div>
    </section>
  )
}
