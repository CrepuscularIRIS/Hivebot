// 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447:apps/desktop/src/main.ts:259-295,356-364
// 改动（G2-r1 HIGH-1 门控收紧）：webviewTag 恒 false、devTools 恒 false（生产判据，无 env 旁路）；
// will-navigate 去掉 http 同源放行，只认 pbots-app: 协议内导航。
import { BrowserWindow, shell } from 'electron'
import { SCHEME } from './sender'

export const APP_ORIGIN = `${SCHEME}://app/`

export function createMainWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show: false,
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
