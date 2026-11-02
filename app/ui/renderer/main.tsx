// 最小产品壳页面（U-00 骨架；产品页由 U-21+ 交付，spike 页面在 spike/U-00）。
// U-12：接线 carrier debug-boot（E2E 走真 preload 需要 page 侧入口；U-15 起由真 carrier 替代）。
import { createRoot } from 'react-dom/client'
import { installCarrierDebug } from './carrier/debug-boot'

declare global {
  interface Window {
    pbots?: {
      api: (method: string, args?: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
      requestMuxPort: (requestId: string) => void
      botsMeta: (op: 'get' | { op: 'patch'; mainBotId: string }) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
    }
  }
}

function Boot(): JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>pbots</h1>
      <p id="shell-ready">shell skeleton loaded (pbots-app://app/)</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Boot />)
installCarrierDebug()
