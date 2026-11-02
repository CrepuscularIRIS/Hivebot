// M2 端口转交 relay（Electron message-ports 教程模式，C §2.3 时序）。
// main: webContents.postMessage('pbots:mux-port', {requestId, ok}, [port2])
// preload: 把 port 连同 requestId 用 window.postMessage 转交主 world；
// 页面侧 W 包装对象校验 event.source === window 且 requestId 属于自己（renderer/carrier/mux-socket.ts）。
// 来源校验（④）：Electron 44 实测——main 进程经 webContents.postMessage 发来的消息
// event.senderFrame 是 undefined（不是 null，读 .url 会 TypeError 杀掉回调）；有 frame 且
// origin 非 pbots-app://app/ 才拒，读不到来源时放行（本通道只有 main 会发；页面拿不到 ipcRenderer）。
import { ipcRenderer } from 'electron'

interface RelayPayload { requestId: string; ok: boolean; error?: unknown }

function isRelayPayload(payload: unknown): payload is RelayPayload {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as { requestId?: unknown; ok?: unknown }
  return typeof p.requestId === 'string' && typeof p.ok === 'boolean'
}

export function installMuxPortRelay(): void {
  ipcRenderer.on('pbots:mux-port', (event, payload: unknown) => {
    let frameUrl: string | undefined
    try {
      frameUrl = event.senderFrame?.url
    } catch {
      return // 来源读不出（已销毁的 frame 等）：不转发
    }
    if (typeof frameUrl === 'string' && frameUrl !== '' && !frameUrl.startsWith(`${location.origin}/`)) return
    if (!isRelayPayload(payload)) return
    if (event.ports.length === 0) {
      window.postMessage(
        { pbotsMux: payload.requestId, ok: false, ...(payload.error !== undefined ? { error: payload.error } : {}) },
        location.origin,
      )
      return
    }
    window.postMessage({ pbotsMux: payload.requestId, ok: true }, location.origin, [event.ports[0]])
  })
}
