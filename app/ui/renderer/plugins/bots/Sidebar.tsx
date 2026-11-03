// P-A bot 侧栏 + 最小建 bot 对话框（U-21；裁决见 work/p4-ui/ui/PAB-final.md）。
// 对照原版 AgentsSidebar（RE-ui-shell §3.1）：保留 Header（新建 + 市场）与 agent 列表；去 Search/section/
// 多选/拖拽/pin/账号 footer（BRIEF §2、D12②）。项 = 48px 两行（R7）、角标 corner-{ring,dot,main}（R8）、
// monogram + botTint（R10）、排序冻结（R9）、调宽 240–400（R6）。建 bot 对话框 U-23 起移到 plugins/settings/NewBotDialog.tsx。
// U-23：「市场」行启用（PDC-final P1）；c1 失效 bot 头像加 ⊘ 角标（D5，字形 + 文案，不只靠颜色）。
// U-27（RE-visual-audit A1/A4–A6/A8/A14）：项 = 0.18 `sand-agent-item` 规格（grid 34px 1fr auto、≥58px、头像 34、
// trailing 相对时间）；头部去品牌位只留拖拽区；列表空态 / 断线态。
// P5-11（定稿 work/p5-parity/ui/P5-11-final.md）：A1 头部 icon 行 collapse / search / New Bot（R2 实测同组贴左）；
// A2 搜索 = 头部原位输入框，侧栏内可打印键触发（行为参照 0.18 sidebar-search-trigger.ts，只参照不搬码）；
// A13 折叠 = 宽 78 + 容器 ≤130px 查询（几何全在 sidebar.css，JS 只管 aria / 头部渲染）。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../../theme/theme'
import { openMarket, select, type State } from '../../shell/store'
import { Resizer, readExpanded } from '../../shell/Resizer'
import './sidebar.css'

const TINTS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'purple', 'brown']

export interface BotInfo {
  id: string; name: string; preset: string; connectors: string[]; readOnly: boolean; main: boolean
  running: boolean; pending: boolean; unread: boolean; tint: string; updatedAt: number
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
  return {
    id, preset, main,
    name: view?.title ?? sum?.title ?? (main ? '主 Bot' : preset),
    connectors: recipe?.connectors ?? [],
    readOnly: temp && (recipe === undefined || recipe.live === false),
    running: view?.loaded === true ? view.running : (sum?.running ?? false),
    pending: s.approvals.some((a) => a.agentId === id),
    unread: s.unread[id] === true,
    tint: tintOf(id),
    updatedAt: sum?.updatedAt ?? 0,
  }
}

/** R10 botTint 色族按字符串哈希（bot 用 sessionId，市场条目用包名，P13）。 */
export function tintOf(key: string): string {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]!
}

export function Avatar({ info, size }: { info: BotInfo; size: number }): JSX.Element {
  return (
    <span className="avatar" style={{ width: size, height: size, background: `var(--sand-fill-${info.tint}-bubble-user)`, fontSize: Math.round(size * 0.46) }} aria-hidden="true">
      {Array.from(info.name)[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

/** 0.18 sidebar.tsx relativeTime（now/Xm/Xh/Xd）的本地化版；0 = 未知不显示。 */
export function relativeTime(updatedAt: number, now: number): string {
  if (updatedAt <= 0) return ''
  const minutes = Math.round(Math.max(0, now - updatedAt) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} 小时` : `${Math.round(hours / 24)} 天`
}

function subtitle(info: BotInfo): { text: string; tone: string } {
  if (info.pending) return { text: '等待批准', tone: 'warn' }
  if (info.running) return { text: '回复中', tone: 'accent' } // A9：working 副行 accent（0.18 __activity）
  if (info.readOnly) return { text: '连接器已失效', tone: 'danger' }
  if (info.connectors.length > 0) return { text: `${info.preset} · ${info.connectors.length} 个连接器`, tone: 'tertiary' }
  // 无标题时标题已是 preset 名（席 A），副行不重复，项退为单行
  return { text: info.name === info.preset ? '' : info.preset, tone: 'tertiary' }
}

function BotItem({ s, id, now, compact }: { s: State; id: string; now: number; compact: boolean }): JSX.Element {
  const info = botInfo(s, id)
  const sub = subtitle(info)
  const selected = s.selected === id
  const when = relativeTime(info.updatedAt, now)
  const state = info.pending ? '，等待批准' : info.running ? '，回复中' : info.unread ? '，有新回复' : ''
  return (
    <div
      role="option" aria-selected={selected} tabIndex={selected ? 0 : -1}
      className={`bot-item${info.readOnly ? ' readonly' : ''}${s.flash === id ? ' flash' : ''}`}
      data-session={id} data-preset={s.views[id]?.preset ?? s.summaries[id]?.preset ?? ''} data-main={info.main || undefined}
      data-running={info.running || undefined} data-pending={info.pending || undefined} data-unread={info.unread || undefined}
      aria-label={`${info.name}${info.main ? '（主 Bot）' : ''}${state}`} title={compact ? info.name : undefined}
      onClick={() => select(id)}
    >
      <span className="avatar-wrap">
        <Avatar info={info} size={34} />
        {info.running && <span className="corner-ring" />}
        {info.pending ? <span className="corner-dot warn" title="等待批准" />
          : info.unread ? <span className="corner-dot accent" title="有新回复" />
            : info.readOnly ? <span className="corner-off" title="连接器已失效" data-corner-off><Icon name="slash-circle" /></span> : null}
      </span>
      <span className="bot-text">
        <span className="bot-title">{info.name}</span>
        {sub.text !== '' && <span className={`bot-sub ${sub.tone}`}>{sub.text}</span>}
      </span>
      <span className="bot-trailing">
        {when !== '' && <time dateTime={new Date(info.updatedAt).toISOString()} data-updated>{when}</time>}
        {info.main && <span className="corner-main" title="主 Bot"><Icon name="star" /></span>}
      </span>
    </div>
  )
}

// 折叠宽 78 = 条目 54（R2）+ .bot-list padding-inline 12×2；推导值非实测，R3 回来可调。键名照 0.18 LEGACY_UI_LAYOUT_KEYS。
export const SIDEBAR = {
  min: 240, max: 400, initial: 280, key: 'sand.sidebar.width', compact: { width: 78, key: 'sand.sidebar.collapsed' },
} as const
const COMPACT_MAX = 130 // = sidebar.css 容器查询断点

/** 0.18 createSidebarSearchTrigger 的可打印键判定 + 输入法组合 / 输入件内不截获。 */
function isSearchKey(e: KeyboardEvent<HTMLElement>): boolean {
  return !e.defaultPrevented && !e.nativeEvent.isComposing && e.key.length === 1 && e.key !== ' '
    && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') === null
}

export function Sidebar({ s, width, onWidth, onNew }: {
  s: State; width: number; onWidth(w: number, persist: boolean): void; onNew(): void
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLButtonElement>(null)
  const [now, setNow] = useState(Date.now)
  const [query, setQuery] = useState<string | null>(null) // null = 搜索关闭
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const searching = query !== null
  useEffect(() => {
    const el = inputRef.current
    if (el !== null) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } // 带入的首字符后接着打
  }, [searching])
  const compact = width <= COMPACT_MAX
  const q = query?.trim().toLowerCase() ?? ''
  const shown = q === '' ? s.order : s.order.filter((id) => botInfo(s, id).name.toLowerCase().includes(q))
  const closeSearch = (): void => { setQuery(null); requestAnimationFrame(() => searchRef.current?.focus()) }
  const toggleCompact = (): void => {
    if (compact) return onWidth(readExpanded(SIDEBAR), true)
    setQuery(null)
    onWidth(SIDEBAR.compact.width, true)
  }
  const onAsideKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (searching || compact || s.order.length === 0 || !isSearchKey(e)) return
    e.preventDefault()
    setQuery(e.key)
  }
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
  return (
    <aside className="sidebar" aria-label="Bot 侧栏" onKeyDown={onAsideKey}>
      {/* A1：无品牌位；R2 new-actions 一组贴左。A2：搜索态原位替换该组（头部高度不变，列表不位移） */}
      <div className="sidebar-head drag">
        {!searching ? (
          <div className="sidebar-actions">
            <button type="button" className="head-btn collapse" data-action="collapse-sidebar" aria-expanded={!compact}
              aria-label={compact ? '展开侧栏' : '收起侧栏'} title={compact ? '展开侧栏' : '收起侧栏'} onClick={toggleCompact}>
              <Icon name="layout-sidebar-right" />
            </button>
            <button type="button" className="head-btn" data-action="search" ref={searchRef} disabled={s.order.length === 0}
              aria-label="搜索 Bot" title="搜索（在侧栏中直接输入）" onClick={() => setQuery('')}>
              <Icon name="magnifying-glass" />
            </button>
            <button type="button" className="head-btn" data-action="new-bot" aria-label="新建 Bot" title="新建 Bot（Ctrl+N）" onClick={onNew}>
              <Icon name="plus" />
            </button>
          </div>
        ) : (
          <div className="sidebar-search" role="search">
            <Icon name="magnifying-glass" />
            <input
              ref={inputRef} data-sidebar-search type="text" role="searchbox" aria-label="搜索 Bot" placeholder="搜索 Bot"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Escape') { e.preventDefault(); closeSearch() }
                else if (e.key === 'Enter' && shown[0] !== undefined) select(shown[0])
                else if (e.key === 'ArrowDown') { e.preventDefault(); listRef.current?.querySelector<HTMLElement>('[role=option]')?.focus() }
              }}
              // 失焦且 query 空 → 收起；有 query 保留（让用户去点结果）；点 ✕ 不算离开
              onBlur={(e) => { if (e.currentTarget.value === '' && !e.currentTarget.parentElement!.contains(e.relatedTarget)) setQuery(null) }}
            />
            <button type="button" className="head-btn" data-action="search-clear" aria-label="清空搜索" title="清空搜索"
              onClick={() => { setQuery(''); inputRef.current?.focus() }}>
              <Icon name="x" />
            </button>
            {q !== '' && shown.length > 0 && <span className="sr-only" role="status" data-search-count>{shown.length} 个结果</span>}
          </div>
        )}
      </div>
      <nav className="sidebar-menu">
        <button type="button" className={`menu-row${s.page === 'market' ? ' active' : ''}`} data-action="market" aria-current={s.page === 'market' ? 'page' : undefined} onClick={openMarket}>
          <Icon name="storefront" /><span>市场</span>
        </button>
      </nav>
      <div className="bot-list" role="listbox" aria-label="Bot 列表" ref={listRef} onKeyDown={onListKey}>
        {/* A14：0.18 RosterStatus。列表在本地缓存，断线时不清空，只在顶部挂「无法连接」状态（自动重连，无手动重试） */}
        {!s.online && (
          <div className="roster-state" role="status" data-roster-state="unreachable">
            <span className="roster-state-head"><span className="dot warn" />连不上本地引擎</span>
            <span className="roster-state-body">Bot 都还在，正在重连…</span>
          </div>
        )}
        {s.order.length === 0 ? <div className="roster-empty" data-roster-state="empty">还没有 Bot</div>
          : shown.length === 0 && <div className="roster-empty" role="status" data-roster-state="no-match">没有名字含「{query?.trim()}」的 Bot</div>}
        {shown.map((id) => <BotItem key={id} s={s} id={id} now={now} compact={compact} />)}
      </div>
      <Resizer spec={SIDEBAR} width={width} side="right" label="调整侧栏宽度" onWidth={onWidth} />
    </aside>
  )
}
