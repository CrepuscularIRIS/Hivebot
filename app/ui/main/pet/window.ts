// T45a：宠物窗——透明置顶小窗（第二个渲染进程，权限面窄：只收一个状态枚举）。
import { BrowserWindow, screen } from 'electron'

export function createPetWindow(petPreload: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 200, height: 200, show: false, resizable: false,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: petPreload, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, devTools: false },
  })
  const area = screen.getPrimaryDisplay().workArea
  win.setPosition(area.x + area.width - 200 - 24, area.y + area.height - 200 - 24)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => { event.preventDefault() })
  return win
}
