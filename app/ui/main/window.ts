// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/main.ts:259-295,356-364
// 改动（G2-r1 HIGH-1 门控收紧）：webviewTag 恒 false、devTools 恒 false（生产判据，无 env 旁路）；
// will-navigate 去掉 http 同源放行，只认 pbots-app: 协议内导航。
// U-00.fN（U-21 追认，PAB-final R16）：隐藏原生标题栏 + Window Controls Overlay，
// 底色/符号色 = 会话区 --sand-bg-pane / --sand-text-secondary，随 nativeTheme 切换（P5-61.f1 起 themeSource 由 pbots:theme 设为用户偏好）。
// P5-54：overlay 高 38 → 51 = renderer-grok win32 语义的标题栏块（0.18 window-chrome/model.ts
// WINDOW_CHROME_METRICS.hiddenControlsBlock，renderer 侧按 calc(51px / zoom) 与之等高）。
// P5-61.f1 ③：主题偏好下沉 nativeTheme.themeSource（0.18 prefs/theme-controller.ts 同构）——原生 overlay、窗口底色、
// renderer 的 prefers-color-scheme 都跟用户偏好而非系统；<dataDir>/theme-source 是 renderer localStorage 的镜像，
// 建窗前应用，shim 跑起来之前的首帧就对。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BrowserWindow, nativeTheme, shell } from 'electron'
import { SCHEME } from './sender'

export const APP_ORIGIN = `${SCHEME}://app/`

/** renderer-grok 的 win32 标题栏块高（与 WINDOW_CHROME_METRICS.hiddenControlsBlock 同值）。 */
export const TITLEBAR_OVERLAY_HEIGHT = 51

type ThemeSource = typeof nativeTheme.themeSource

/** renderer 推来的页面实际色调（P5-61.f1）；推到之前按 nativeTheme（冷启已由镜像设好 themeSource）。 */
let painted: 'light' | 'dark' | undefined
let pushedPreference: ThemeSource | undefined
const isDark = (): boolean => (painted === undefined ? nativeTheme.shouldUseDarkColors : painted === 'dark')

const overlay = (): Electron.TitleBarOverlayOptions => (isDark()
  ? { height: TITLEBAR_OVERLAY_HEIGHT, color: '#161616', symbolColor: '#f5f5f5a8' }
  : { height: TITLEBAR_OVERLAY_HEIGHT, color: '#ffffff', symbolColor: '#1c1c1cad' })

const windowBackground = (): string => (isDark() ? '#121212' : '#fcfcfc') // = 启动封面 bg-chrome

const isThemeSource = (v: unknown): v is ThemeSource => v === 'light' || v === 'dark' || v === 'system'

/** 建窗前调用：镜像文件缺失 / 损坏 → 保持 system。 */
export function restoreThemeSource(file: string): void {
  try {
    const saved = readFileSync(file, 'utf8').trim()
    if (isThemeSource(saved)) nativeTheme.themeSource = saved
  } catch { /* 首启无镜像 */ }
}

function retint(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  window.setTitleBarOverlay(overlay())
  window.setBackgroundColor(windowBackground())
}

/** renderer（已过 sender 校验）推来的 {preference, resolved}：非法值整条丢弃；落镜像失败只告警（下次启动由 renderer 回推纠正）。
 * resolved 决定原生 overlay / 窗口底色（立即 retint）；preference 变了才写 themeSource 与镜像。 */
export function applyThemeSource(file: string, value: unknown, window: BrowserWindow): void {
  const v = value as { preference?: unknown; resolved?: unknown } | null
  if (typeof v !== 'object' || v === null || !isThemeSource(v.preference) || (v.resolved !== 'light' && v.resolved !== 'dark')) return
  painted = v.resolved
  retint(window)
  // 只在偏好本身变了才动 themeSource：system 下 media 变化引起的回推（同一 preference）不覆盖外部设的 themeSource
  if (v.preference === pushedPreference) return
  pushedPreference = v.preference
  nativeTheme.themeSource = v.preference
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, v.preference)
  } catch (error) { console.warn(`[theme] mirror write failed: ${String(error)}`) }
}

export function createMainWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: overlay(),
    backgroundColor: windowBackground(),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: false,
    },
  })
  const onUpdated = (): void => retint(window)
  nativeTheme.on('updated', onUpdated)
  window.on('closed', () => nativeTheme.off('updated', onUpdated))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== `${SCHEME}:`) {
      event.preventDefault()
      if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    }
  })
  return window
}
