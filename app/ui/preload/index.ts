// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/preload-app.ts:79,118
// （按协议+域名+主 frame 门控 exposeInMainWorld 的模式；改动：只暴露 pbots 三个窄函数）
import { contextBridge, ipcRenderer } from 'electron'
import { installMuxPortRelay } from './mux-relay'

const isAppMainFrame = location.protocol === 'pbots-app:' && location.hostname === 'app' && process.isMainFrame

export interface PbotsApiResult {
  ok: boolean
  value?: unknown
  error?: { code: string; message: string; details?: unknown }
}

if (isAppMainFrame) {
  contextBridge.exposeInMainWorld('pbots', {
    /** M1：白名单 /api 调用（C §2）。 */
    api: (method: string, args?: unknown): Promise<PbotsApiResult> =>
      ipcRenderer.invoke('pbots:api', { method, ...(args !== undefined ? { args } : {}) }) as Promise<PbotsApiResult>,
    /** M2：申请一个 mux 端口（端口经 postMessage 转交，见 mux-relay）。 */
    requestMuxPort: (requestId: string): void => { ipcRenderer.send('pbots:mux-port', { requestId }) },
    /** M3：本地 bots 元数据（get / patch mainBotId）。 */
    botsMeta: (op: 'get' | { op: 'patch'; mainBotId: string }): Promise<PbotsApiResult> =>
      ipcRenderer.invoke('pbots:bots-meta', op) as Promise<PbotsApiResult>,
  })
  installMuxPortRelay()
}
