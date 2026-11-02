// 产品壳（U-21/PAB）：启动封面 → 侧栏 + 会话两列网格。两席提案的裁决记录见
// work/p4-ui/ui/PAB-final.md（R0 路线：自写 React 页 + dev-min 演化的数据层，不 boot dsh client，须 director 追认）。
// 网格 = 原版 `280px minmax(0,1fr)`（无 infoPane 列）；titlebar 38px 拖拽区，窗口控件由 WCO 原生绘制（R16）。
// 启动封面复刻 01-boot.png：Sign in 位换「正在启动本地引擎…」，超时「引擎没有响应  重试 →」，去 Terms（R15、D12②）。
// 键盘：Ctrl+N 新建、Alt+↑/↓ 切 bot（席 A §2）。
import { useEffect, useState } from 'react'
import { GrokMark, Icon } from '../theme/theme'
import { NewBotDialog, Sidebar, SIDEBAR, botInfo } from '../plugins/bots/Sidebar'
import { Conversation } from '../plugins/session/Conversation'
import { getState, retryBoot, select, useStore, type State } from './store'
import './app.css'

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR.key))
    return v >= SIDEBAR.min && v <= SIDEBAR.max ? v : SIDEBAR.initial
  } catch { return SIDEBAR.initial }
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
  const [width, setWidth] = useState(readWidth)
  const [dialog, setDialog] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (getState().boot === 'ready' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setDialog(true) }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const { order, selected } = getState()
        const next = order[order.indexOf(selected ?? '') + (e.key === 'ArrowDown' ? 1 : -1)]
        if (next !== undefined) { e.preventDefault(); select(next) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (s.boot !== 'ready') return <BootCover s={s} />
  const info = s.selected === null ? null : botInfo(s, s.selected)
  return (
    <div className="shell" style={{ gridTemplateColumns: `${width}px minmax(0, 1fr)` }}>
      <Sidebar s={s} width={width} onNew={() => setDialog(true)} onWidth={(w, persist) => {
        setWidth(w)
        if (persist) try { localStorage.setItem(SIDEBAR.key, String(w)) } catch { /* 仅偏好，失败不影响使用 */ }
      }} />
      <main className="main">
        <header className="titlebar drag">
          {info !== null && (
            <>
              <span className="chat-title">{info.name}</span>
              {/* D11：preset / 连接器只读显示，无改动入口 */}
              <span className="chat-meta" data-chat-meta>{info.preset}{info.connectors.length > 0 ? ` · ${info.connectors.join('、')}` : ''}</span>
            </>
          )}
        </header>
        {s.selected !== null && <Conversation key={s.selected} s={s} id={s.selected} />}
      </main>
      <NewBotDialog open={dialog} onClose={() => setDialog(false)} />
    </div>
  )
}
