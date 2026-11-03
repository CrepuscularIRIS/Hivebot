// 产品壳（U-21/PAB；U-23 P-D/P-C 接线）：启动封面 → 侧栏 + 主列 (+ info-pane) 网格。裁决记录：
// work/p4-ui/ui/PAB-final.md（R0 路线：自写 React 页，不 boot dsh client）与 PDC-final.md（U-23）。
// 网格 = 原版 `280px minmax(0,1fr) auto`：第三列 = bot 配置 info-pane（PDC D1），主列 < 424 时 pane 改覆盖式浮层。
// 主列两页：chat（会话）/ market（市场，P1；侧栏保留）。titlebar 38px 拖拽区，窗口控件由 WCO 原生绘制（R16）。
// 头部只读显示 preset / 连接器（锁形，D11），c1 失效时连接器转 danger（D5）；右侧「用此配置新建」与 pane 开合。
// 启动封面复刻 01-boot.png：Sign in 位换「正在启动本地引擎…」，超时「引擎没有响应  重试 →」，去 Terms（R15、D12②）。
// 键盘：Ctrl+N 新建、Alt+↑/↓ 切 bot（席 A §2）。
import { useEffect, useState } from 'react'
import { GrokMark, Icon } from '../theme/theme'
import { Sidebar, SIDEBAR, botInfo } from '../plugins/bots/Sidebar'
import { Conversation } from '../plugins/session/Conversation'
import { NewBotDialog } from '../plugins/settings/NewBotDialog'
import { INFO_PANE, InfoPane, cloneInit } from '../plugins/settings/InfoPane'
import { Market } from '../plugins/market/Market'
import { getState, openNewBot, retryBoot, select, useStore, type State } from './store'
import { readColumn, saveColumn } from './Resizer'
import './app.css'

/** 会话列最窄（--sand-chat-min-width）：再挤就把 pane 改成浮层（PDC D1，回应席 C 的挤压论证）。 */
const CHAT_MIN = 424
const PANE_OPEN_KEY = 'sand.infoPane.open'

function readOpen(): boolean {
  try { return localStorage.getItem(PANE_OPEN_KEY) === '1' } catch { return false }
}

function BootCover({ s }: { s: State }): JSX.Element {
  return (
    <div className="boot-cover drag" data-boot-cover>
      <div className="boot-center">
        <h1 className="boot-brand"><GrokMark size={66} /><span>Grok Bot</span></h1>
        <p className="boot-tagline">Your team of always-on Bots that you can give real work to</p>
        {s.boot === 'failed'
          ? <button type="button" className="boot-action no-drag" data-action="retry-boot" title={s.bootError ?? undefined} onClick={retryBoot}>
            引擎没有响应&nbsp;&nbsp;重试 <Icon name="arrow-right" />
          </button>
          : <div className="boot-action" role="status">正在启动本地引擎…</div>}
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  const s = useStore()
  const [width, setWidth] = useState(() => readColumn(SIDEBAR))
  const [paneW, setPaneW] = useState(() => readColumn(INFO_PANE))
  const [paneOpen, setPaneOpen] = useState(readOpen)
  const [viewport, setViewport] = useState(window.innerWidth)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (getState().boot === 'ready' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openNewBot() }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const { order, selected } = getState()
        const next = order[order.indexOf(selected ?? '') + (e.key === 'ArrowDown' ? 1 : -1)]
        if (next !== undefined) { e.preventDefault(); select(next) }
      }
    }
    const onResize = (): void => setViewport(window.innerWidth)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) }
  }, [])

  if (s.boot !== 'ready') return <BootCover s={s} />
  const info = s.selected === null ? null : botInfo(s, s.selected)
  const showPane = paneOpen && s.page === 'chat' && info !== null
  const overlay = viewport - width - paneW < CHAT_MIN
  const togglePane = (): void => {
    setPaneOpen(!paneOpen)
    try { localStorage.setItem(PANE_OPEN_KEY, paneOpen ? '0' : '1') } catch { /* 仅偏好 */ }
  }
  const columns = `${width}px minmax(0, 1fr)${showPane && !overlay ? ` ${paneW}px` : ''}`
  return (
    <div className="shell" style={{ gridTemplateColumns: columns }}>
      <Sidebar s={s} width={width} onNew={() => openNewBot()} onWidth={(w, persist) => { setWidth(w); if (persist) saveColumn(SIDEBAR, w) }} />
      {s.page === 'market' ? <main className="main"><Market s={s} /></main> : (
        <main className={`main${showPane && !overlay ? ' with-pane' : ''}`}>
          <header className="titlebar drag">
            {info !== null && (
              <>
                <span className="chat-title">{info.name}</span>
                {info.running && <span className="chat-working" role="status" data-working>回复中</span>}
                {/* D11：preset / 连接器只读显示（锁形），无改动入口；c1 时连接器转 danger（D5） */}
                <span className="chat-meta">
                  <Icon name="lock-locked" />
                  <span data-chat-meta>
                    {info.preset}
                    {info.connectors.length > 0 && <> · <span className={info.readOnly ? 'meta-dead' : undefined} data-meta-connectors>{info.connectors.join('、')}</span></>}
                  </span>
                </span>
                <span className="title-actions">
                  <button type="button" className="icon-btn" data-action="clone-config-head" aria-label="用此配置新建" title="用此配置新建" onClick={() => openNewBot(cloneInit(s, info.id))}>
                    <Icon name="copy" />
                  </button>
                  <button type="button" className={`icon-btn${showPane ? ' on' : ''}`} data-action="toggle-info-pane" aria-label="Bot 配置" title="Bot 配置" aria-pressed={showPane} onClick={togglePane}>
                    <Icon name="layout-sidebar-right" />
                  </button>
                </span>
              </>
            )}
          </header>
          {s.selected !== null && <Conversation key={s.selected} s={s} id={s.selected} />}
        </main>
      )}
      {showPane && (
        <InfoPane s={s} id={info.id} width={paneW} overlay={overlay} onClose={togglePane}
          onWidth={(w, persist) => { setPaneW(w); if (persist) saveColumn(INFO_PANE, w) }} />
      )}
      <NewBotDialog init={s.dialog} />
    </div>
  )
}
