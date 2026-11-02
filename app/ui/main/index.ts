// pbots Electron 壳主入口（P4 U-00）。
// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/main.ts:185-192（scheme 注册，改动：去 corsEnabled）
//     + apps/desktop/src/main.ts:762-775（protocol.handle 骨架，改动：只留静态分支，不抄 forward、不注入 BOOT，其余 404）
//     + apps/desktop/src/web-document.ts:18-31（静态文档服务，改动：不注入 BOOT、响应加 CSP）
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { app, BrowserWindow, ipcMain, MessageChannelMain, protocol } from 'electron'
import { SCHEME, assertPbotsSender } from './sender'
import { createMainWindow } from './window'
import { createReadyGate } from './ready'
import { DshConnection } from './dsh/connect'
import { EventsLedger } from './dsh/ledger'
import { registerM1Api } from './m1-api'
import { registerM2Mux } from './m2-mux'
import { registerM3Meta } from './m3-meta'
import { ensureThenReady, restoreGated } from './m3-meta/ensure'

if (process.type === 'browser') {
  // 必须在 app ready 前注册；单测导入本模块时（纯 node）跳过。
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  }])
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
  '.map': 'application/json',
}

/** 最小 CSP（G2-r2 附加 2）：防同源 XSS 自答审批；U-22 完整化。 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ')

export type AppPathResult = { status: 400 | 403; file?: undefined } | { status: 200; file: string }

/** 静态资源路径解析（防穿越，来源 web-document.ts:22-25 改写为可单测纯函数）。 */
export function resolveAppPath(root: string, rawPathname: string): AppPathResult {
  let pathname: string
  try { pathname = decodeURIComponent(rawPathname) } catch { return { status: 400 } }
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  const directory = resolve(root)
  if (!target.startsWith(directory + sep)) return { status: 403 }
  return { status: 200, file: target }
}

async function serveAppDocument(request: Request, root: string): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  const url = new URL(request.url)
  if (url.hostname !== 'app') return new Response(null, { status: 404 })
  const resolved = resolveAppPath(root, url.pathname)
  if (resolved.status !== 200) return new Response(null, { status: resolved.status })
  let body: Buffer
  try {
    body = await readFile(resolved.file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), {
    headers: {
      'content-type': MIME[extname(resolved.file)] ?? 'application/octet-stream',
      'content-security-policy': CSP,
    },
  })
}

async function main(): Promise<void> {
  const ready = createReadyGate()
  await app.whenReady()
  const appRoot = process.env.PBOTS_APP_ROOT ?? resolve(__dirname, '..', 'renderer')
  protocol.handle(SCHEME, (request) => serveAppDocument(request, resolve(appRoot)))

  const preload = resolve(__dirname, '..', 'preload', 'index.cjs')
  const mainWindow = createMainWindow(preload)
  mainWindow.once('ready-to-show', () => { mainWindow.show(); ready.setWindowReady() })

  const handoff = process.env.PBOTS_DSH_HANDOFF
  let dsh: DshConnection | undefined
  let dshStart: Promise<number> | undefined
  if (handoff) {
    const baseUrl = (await readFile(resolve(handoff, 'base-url'), 'utf8')).trim()
    const token = (await readFile(resolve(handoff, 'launch-token'), 'utf8')).trim()
    dsh = new DshConnection({ baseUrl, token, interactions: 'answer' })
    dshStart = dsh.start()
    void dshStart.then(() => ready.setDshReady())
  }

  const assertSender = (event: Parameters<typeof assertPbotsSender>[0]): void =>
    assertPbotsSender(event, mainWindow)

  // IPC 通道先注册、后加载页面：ipcRenderer.send 是即发即弃，晚注册会丢消息。
  const spikeBridge = process.env.PBOTS_SPIKE_BRIDGE
  if (spikeBridge !== undefined && spikeBridge !== '') {
    // spike 桥（spike/U-00 作参考，不随 W0 合入）：占用三条通道，自身负责来源校验。
    const mod = (await import(spikeBridge)) as {
      register(ctx: unknown): void
    }
    mod.register({
      ipcMain, mainWindow, assertSender, dsh, ready,
      MessageChannelMain, ledger: new EventsLedger(),
      log: (m: string) => console.log(`[spike] ${m}`),
    })
  } else {
    const m1 = registerM1Api({ dsh })
    // U-14（CONTRACT #21）：#21 恢复全部 settle 前 M1/M2 不就绪 —— 入口挂 restore 闸门
    const m1Gated = restoreGated(ready, m1)
    ipcMain.handle('pbots:api', (event, req) => { assertSender(event); return m1Gated(req) })
    const m2 = registerM2Mux({ dsh })
    const m2Gated = restoreGated(ready, m2) as (event: Parameters<typeof m2>[0], req: Parameters<typeof m2>[1]) => void
    ipcMain.on('pbots:mux-port', (event, req) => {
      try { assertSender(event) } catch (error) { console.warn(error); return }
      void m2Gated(event, req)
    })
    const m3 = registerM3Meta({ dsh, dataDir: process.env.PBOTS_DATA_DIR ?? app.getPath('userData') })
    ipcMain.handle('pbots:bots-meta', (event, req) => { assertSender(event); return m3.handler(req) })

    // U-14 先 restore 后 ready：dsh 连上 → 读盘完成 → #21 逐个 ensure（30s each 超时按
    // 失败、allSettled、失败进 failed set 不阻断）→ 放行 restore 条件。dsh 起不来时
    // dsh 条件本就不开，此处只补 settle 观察面，不跑恢复。
    if (dsh !== undefined && dshStart !== undefined) {
      void dshStart.then(
        async () => { await m3.init; await ensureThenReady({ dsh, store: m3.store, failed: m3.failed, ready }) },
        (error) => {
          console.warn(`[m3] restore skipped: dsh start failed: ${String(error)}`)
          ready.setRestoreSettled([...m3.failed])
        },
      )
    }
  }

  await mainWindow.loadURL(process.env.PBOTS_APP_URL ?? `${SCHEME}://app/`)

  app.on('window-all-closed', () => {
    if (process.env.PBOTS_HOLD_ON_CLOSE !== '1') app.quit()
  })
}

// 只在 Electron 主进程内自启（process.type === 'browser' 是 Electron 注入的运行时标识；
// 单测以纯 node 导入本模块取纯函数时不启动 app）。
if (process.type === 'browser') {
  void main().catch((error) => {
    console.error(error)
    app.exit(1)
  })
}
