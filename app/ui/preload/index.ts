// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/preload-app.ts:79,118
// （按协议+域名+主 frame 门控 exposeInMainWorld 的模式；改动：只暴露 pbots 三个窄函数）
import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { installMuxPortRelay } from './mux-relay'

const isAppMainFrame = location.protocol === 'pbots-app:' && location.hostname === 'app' && process.isMainFrame

export interface PbotsApiResult {
  ok: boolean
  value?: unknown
  error?: { code: string; message: string; details?: unknown }
}

// B6：spotlight 窗标记（argv --pbots-spotlight——renderer 入口据此分支渲染 SpotlightApp）。
if (process.argv.includes('--pbots-spotlight')) {
  contextBridge.exposeInMainWorld('pbotsSpotlight', { isSpotlight: true as const })
}

if (isAppMainFrame) {
  contextBridge.exposeInMainWorld('pbots', {
    /** M1：白名单 /api 调用（C §2）。 */
    api: (method: string, args?: unknown): Promise<PbotsApiResult> =>
      ipcRenderer.invoke('pbots:api', { method, ...(args !== undefined ? { args } : {}) }) as Promise<PbotsApiResult>,
    /** M2：申请一个 mux 端口（端口经 postMessage 转交，见 mux-relay）。 */
    requestMuxPort: (requestId: string): void => { ipcRenderer.send('pbots:mux-port', { requestId }) },
    /** M3：本地 bots 元数据（CONTRACT M3 行：invoke({op:'get'}) / invoke({op:'patch',mainBotId})）。 */
    /** T7a（L4-c）：skill 启用（list/enable/disable；启用=复制快照）。 */
    skills: (req: { op: 'list'; botId: string } | { op: 'enable'; botId: string; fromBotId: string; name: string } | { op: 'disable'; botId: string; name: string }): Promise<PbotsApiResult> =>
      ipcRenderer.invoke('pbots:skills', req) as Promise<PbotsApiResult>,
    botsMeta: (op: 'get' | { op: 'patch'; mainBotId: string }): Promise<PbotsApiResult> =>
      ipcRenderer.invoke('pbots:bots-meta', op === 'get' ? { op: 'get' } : { op: 'patch', mainBotId: op.mainBotId }) as Promise<PbotsApiResult>,
    /** B45b：per-tool MCP 四档权限（get 全表平铺 / set 单工具档）。文件面在 main（mcp-permissions.ts）。 */
    mcpPermissions: (req: { op: 'get' } | { op: 'set'; serverId: string; tool: string; tier: 'auto_review' | 'always_allow' | 'needs_approval' | 'blocked' }): Promise<PbotsApiResult> =>      ipcRenderer.invoke('pbots:mcp-permissions', req) as Promise<PbotsApiResult>,
    /** D2（0.78.1 custom-mcp-form）：自定义 MCP server 存储（list / set / remove）。文件面在 main（mcp-servers.ts）。 */
    mcpServers: (req: { op: 'list' } | { op: 'set'; name?: string; server?: Record<string, unknown> } | { op: 'remove'; name: string }): Promise<PbotsApiResult> =>
      ipcRenderer.invoke('pbots:mcp-servers', req) as Promise<PbotsApiResult>,
    /** P5-54：renderer-grok desktop 桥的窗口实底（shim desktop.ts 消费）。
     * platform 是**窗口外观语义**而非 process.platform：'win32' = 宿主用原生 titleBarOverlay 画窗口控件
     * （main/window.ts），上游 WindowChrome 走 win32 分支只留拖拽层（P5-52：传 'linux' 会让自绘
     * Minimize/Maximize/Close 复活）。windowControls 因此无需实底——原生控件就是实底。
     * zoom：webFrame 实值（上游按 calc(51px / zoom) 让标题栏块与原生 overlay 等高）。 */
    window: {
      platform: 'win32' as const,
      getZoomFactor: (): number => webFrame.getZoomFactor(),
      /** P5-61.f1 ③：主题偏好 + 页面实际色调下沉宿主（main 校验枚举；原生标题栏控件随之变色）。只转发两个字段。 */
      setTheme: (theme: { preference: string; resolved: string }): void => {
        ipcRenderer.send('pbots:theme', { preference: theme.preference, resolved: theme.resolved })
      },
      /** T45a：桌宠状态下推（main 校验 state 枚举+botId 形状；只收主窗主 frame）。 */
      setPetState: (value: { state: string; botId: string | null }): void => {
        ipcRenderer.send('pbots:pet-state', value)
      },
    },
  })
  installMuxPortRelay()
}
