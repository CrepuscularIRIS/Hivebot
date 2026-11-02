// 最小页面入口（U-00 骨架；U-12 的 debug-boot 3 行已按 VERIFY-U-12 建议随 U-15 回收）。
// U-15 起渲染 dev-min 临时页面（D1 出口）；产品壳由 U-21+ 交付。
import { createRoot } from 'react-dom/client'
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

createRoot(document.getElementById('root')!).render(<DevMinApp />)
