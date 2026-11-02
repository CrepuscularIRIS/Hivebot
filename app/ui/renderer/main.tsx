// renderer 入口：产品壳（shell/App）。
import { createRoot } from 'react-dom/client'
import { applyTheme } from './theme/theme'
import { App } from './shell/App'
import { startStore } from './shell/store'

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
startStore()
createRoot(document.getElementById('root')!).render(<App />)
