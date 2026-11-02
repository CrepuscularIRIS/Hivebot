// renderer 入口：U-21 起渲染产品壳（shell/App）；dev-min 临时页保留在 `#dev-min`（U-22 删除前的调试入口）。
import { createRoot } from 'react-dom/client'
import { applyTheme } from './theme/theme'
import { App } from './shell/App'
import { startStore } from './shell/store'
import { DevMinApp } from './dev-min/app'

declare global {
  interface Window {
    pbots?: {
      api: (method: string, args?: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
      requestMuxPort: (requestId: string) => void
      botsMeta: (op: 'get' | { op: 'patch'; mainBotId: string }) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
    }
  }
}

applyTheme()
const devMin = location.hash === '#dev-min'
if (!devMin) startStore()
createRoot(document.getElementById('root')!).render(devMin ? <DevMinApp /> : <App />)
