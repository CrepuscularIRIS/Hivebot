// 最小产品壳页面（U-00 骨架；产品页由 U-21+ 交付，spike 页面在 spike/U-00）。
import { createRoot } from 'react-dom/client'

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
