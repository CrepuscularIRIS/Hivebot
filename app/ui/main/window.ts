// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/main.ts:259-295,356-364
// 改动（G2-r1 HIGH-1 门控收紧）：webviewTag 恒 false、devTools 恒 false（生产判据，无 env 旁路）；
// will-navigate 去掉 http 同源放行，只认 pbots-app: 协议内导航。
// U-00.fN（U-21 追认，PAB-final R16）：隐藏原生标题栏 + Window Controls Overlay（38px = 原版 --sand-titlebar-block），
// 底色/符号色 = 会话区 --sand-bg-pane / --sand-text-secondary，随 nativeTheme 切换；不新增 IPC。
import { BrowserWindow, nativeTheme, shell } from 'electron'
import { SCHEME } from './sender'

export const APP_ORIGIN = `${SCHEME}://app/`

const overlay = (): Electron.TitleBarOverlayOptions => (nativeTheme.shouldUseDarkColors
  ? { height: 38, color: '#161616', symbolColor: '#f5f5f5a8' }
  : { height: 38, color: '#ffffff', symbolColor: '#1c1c1cad' })

export function createMainWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: overlay(),
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
  const retint = (): void => { if (!window.isDestroyed()) window.setTitleBarOverlay(overlay()) }
  nativeTheme.on('updated', retint)
  window.on('closed', () => nativeTheme.off('updated', retint))
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
