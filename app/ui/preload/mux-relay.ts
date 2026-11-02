// M2 端口转交 relay（Electron message-ports 教程模式，C §2.3 时序）。
// main: webContents.postMessage('pbots:mux-port', {requestId, ok}, [port2])
// preload: 把 port 连同 requestId 用 window.postMessage 转交主 world；
// 页面侧校验 event.source === window 且 requestId 属于自己（W 包装对象负责）。
import { ipcRenderer } from 'electron'

export function installMuxPortRelay(): void {
  ipcRenderer.on('pbots:mux-port', (event, payload: { requestId: string; ok: boolean; error?: unknown }) => {
    if (event.ports.length === 0) {
      window.postMessage({ pbotsMux: payload.requestId, ok: false, ...(payload.error !== undefined ? { error: payload.error } : {}) }, location.origin)
      return
    }
    window.postMessage({ pbotsMux: payload.requestId, ok: true }, location.origin, [event.ports[0]])
  })
}
