// P-A bot 侧栏 + 最小建 bot 对话框（U-21；裁决见 work/p4-ui/ui/PAB-final.md）。
// 对照原版 AgentsSidebar（RE-ui-shell §3.1）：保留 Header（新建 + 市场）与 agent 列表；去 Search/section/
// 多选/拖拽/pin/账号 footer（BRIEF §2、D12②）。项 = 48px 两行（R7）、角标 corner-{ring,dot,main}（R8）、
// monogram + botTint（R10）、排序冻结（R9）、调宽 240–400（R6）。建 bot 对话框 U-23 起移到 plugins/settings/NewBotDialog.tsx。
// U-23：「市场」行启用（PDC-final P1）；c1 失效 bot 头像加 ⊘ 角标（D5，字形 + 文案，不只靠颜色）。
import { useRef, type KeyboardEvent } from 'react'
import { GrokMark, Icon } from '../../theme/theme'
import { openMarket, select, type State } from '../../shell/store'
import { Resizer } from '../../shell/Resizer'

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
  return {
    id, preset, main,
    name: view?.title ?? sum?.title ?? (main ? '主 Bot' : preset),
    connectors: recipe?.connectors ?? [],
    readOnly: temp && (recipe === undefined || recipe.live === false),
    running: view?.loaded === true ? view.running : (sum?.running ?? false),
    pending: s.approvals.some((a) => a.agentId === id),
    unread: s.unread[id] === true,
    tint: tintOf(id),
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
          : info.unread ? <span className="corner-dot accent" title="有新回复" />
            : info.readOnly ? <span className="corner-off" title="连接器已失效" data-corner-off><Icon name="slash-circle" /></span> : null}
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
  return (
    <aside className="sidebar" aria-label="Bot 侧栏">
      <div className="sidebar-head drag"><GrokMark size={18} /></div>
      <nav className="sidebar-menu">
        <button type="button" className="menu-row" data-action="new-bot" onClick={onNew}>
          <Icon name="plus" /><span>新建 Bot</span><kbd>Ctrl+N</kbd>
        </button>
        <button type="button" className={`menu-row${s.page === 'market' ? ' active' : ''}`} data-action="market" aria-current={s.page === 'market' ? 'page' : undefined} onClick={openMarket}>
          <Icon name="storefront" /><span>市场</span>
        </button>
      </nav>
      <div className="bot-list" role="listbox" aria-label="Bot 列表" ref={listRef} onKeyDown={onListKey}>
        {s.order.map((id) => <BotItem key={id} s={s} id={id} />)}
      </div>
      <Resizer spec={SIDEBAR} width={width} side="right" label="调整侧栏宽度" onWidth={onWidth} />
    </aside>
  )
}
