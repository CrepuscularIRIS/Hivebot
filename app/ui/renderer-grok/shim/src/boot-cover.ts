// P5-57 · 启动封面（定稿 work/p5-parity/ui/P5-57-final.md ④）：0.18 没有 boot 封面，React 先画空壳、roster 晚到。
// shim 是 defer 经典脚本（先于 module bundle），这里直接挂 DOM：原版 app 图标 + 名称 + spinner；
// roster 首次就绪 → 立刻让出命中、160ms 淡出后移除；8s 未就绪提示「仍在连接」；shim 放弃重试 → 失败态 + Reload。
// 颜色不用 token（data-theme 由 React 晚设）：bg-chrome 亮 #fcfcfc / 暗 #121212（P5-55 实测值）。
// P5-61.f1 ①：色调跟 desktop 桥 theme.resolved（= 正文同一读链），不再跟系统 media——两者相反时出反色封面。
export const BOOT_ICON = './assets/app-icon-C7NKj2u7.png'
const SLOW_MS = 8000

const CSS = `
#pbots-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-content:center;justify-items:center;gap:12px;
  background:#fcfcfc;color:#1c1c1c;font:500 14px/20px system-ui,sans-serif;-webkit-app-region:drag;app-region:drag;
  opacity:1;transition:opacity .16s cubic-bezier(.165,.84,.44,1)}
#pbots-boot[data-phase="ready"]{opacity:0;pointer-events:none}
#pbots-boot img{width:56px;height:56px;border-radius:13px}
#pbots-boot .pb-name{font-size:15px;font-weight:600;letter-spacing:-.01em}
#pbots-boot .pb-status{display:flex;align-items:center;gap:8px;min-height:20px;color:#6b6b6b;font-weight:400}
#pbots-boot .pb-spin{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:pb-spin .7s linear infinite}
#pbots-boot[data-phase="failed"] .pb-spin{display:none}
#pbots-boot button{-webkit-app-region:no-drag;app-region:no-drag;font:inherit;font-weight:500;padding:6px 12px;border-radius:9999px;border:0;
  background:#1c1c1c;color:#fcfcfc;cursor:pointer}
#pbots-boot button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}
@keyframes pb-spin{to{transform:rotate(360deg)}}
#pbots-boot[data-tone="dark"]{background:#121212;color:#f5f5f5}#pbots-boot[data-tone="dark"] .pb-status{color:#a3a3a3}#pbots-boot[data-tone="dark"] button{background:#f5f5f5;color:#121212}
@media (prefers-reduced-motion:reduce){#pbots-boot{transition:none}#pbots-boot .pb-spin{animation:none}}
`

export type BootTone = 'light' | 'dark'
export interface BootCover { ready(): void; failed(): void; tone(tone: BootTone): void }

export function mountBootCover(doc: Document, tone: BootTone): BootCover {
  const style = doc.createElement('style')
  style.textContent = CSS
  const root = doc.createElement('div')
  root.id = 'pbots-boot'
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.dataset.phase = 'starting'
  root.dataset.tone = tone
  const icon = doc.createElement('img')
  icon.src = BOOT_ICON
  icon.alt = ''
  const name = doc.createElement('div')
  name.className = 'pb-name'
  name.textContent = 'Grok Bot'
  const status = doc.createElement('div')
  status.className = 'pb-status'
  const spin = doc.createElement('span')
  spin.className = 'pb-spin'
  spin.setAttribute('aria-hidden', 'true')
  const text = doc.createElement('span')
  text.textContent = 'Starting…'
  status.append(spin, text)
  root.append(icon, name, status)
  doc.head.append(style)
  doc.body.append(root)

  let done = false
  const slow = setTimeout(() => { if (!done) text.textContent = 'Still connecting to the engine…' }, SLOW_MS)
  return {
    tone(next) { root.dataset.tone = next },
    ready() {
      if (done) return
      done = true
      clearTimeout(slow)
      root.dataset.phase = 'ready'
      const reduced = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true
      if (reduced) root.remove()
      else setTimeout(() => root.remove(), 200)
    },
    failed() {
      if (done) return
      clearTimeout(slow)
      root.dataset.phase = 'failed'
      text.textContent = "Couldn't connect to the engine."
      const reload = doc.createElement('button')
      reload.type = 'button'
      reload.textContent = 'Reload'
      reload.addEventListener('click', () => doc.defaultView?.location.reload())
      root.append(reload)
      reload.focus()
    },
  }
}
