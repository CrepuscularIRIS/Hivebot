// T45a：宠物 IPC——状态入（只认主窗）+ 三动作（只认宠物窗）。宠物窗拿不到 botId/正文。
import { ipcMain, Menu, screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { assertPbotsSender } from '../sender'
import { BOT_ID_RE } from '../skills'

const PET_STATES = ['idle', 'waiting', 'working', 'thinking', 'error', 'success'] as const
type PetState = (typeof PET_STATES)[number]
let invalidCount = 0
export const petInvalidCount = (): number => invalidCount

/** 挂全部宠物通道；返回最新合法状态（供窗 ready 后首推）。 */
export function registerPetIpc(mainWindow: BrowserWindow, petWindow: BrowserWindow): { state: PetState } {
  const latest = { state: 'idle' as PetState }
  ipcMain.on('pbots:pet-state', (event, value) => {
    try { assertPbotsSender(event, mainWindow) } catch { invalidCount += 1; return }
    const state = (value ?? {}).state
    const botId = (value ?? {}).botId
    if (typeof state !== 'string' || !(PET_STATES as readonly string[]).includes(state)) { invalidCount += 1; return }
    if (botId !== null && botId !== undefined && (typeof botId !== 'string' || !BOT_ID_RE.test(botId))) { invalidCount += 1; return }
    latest.state = state
    // 只转发 state——宠物窗拿不到 botId（工单 ⑧）
    if (!petWindow.isDestroyed()) petWindow.webContents.send('pet:state', { state })
  })
  const onlyPet = (event: Electron.IpcMainEvent): boolean =>
    !petWindow.isDestroyed() && event.sender === petWindow.webContents && event.senderFrame === petWindow.webContents.mainFrame
  ipcMain.on('pet:click', (event) => {
    if (!onlyPet(event)) { invalidCount += 1; return }
    mainWindow.show(); mainWindow.focus()
  })
  ipcMain.on('pet:move', (event, raw) => {
    if (!onlyPet(event)) { invalidCount += 1; return }
    const dx = (raw ?? {}).dx, dy = (raw ?? {}).dy
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 2000 || Math.abs(dy) > 2000) { invalidCount += 1; return }
    if (petWindow.isDestroyed()) return
    const [x, y] = petWindow.getPosition()
    const area = screen.getDisplayNearestPoint({ x: x + dx, y: y + dy }).workArea
    const nx = Math.min(Math.max(x + dx, area.x), area.x + area.width - 200)
    const ny = Math.min(Math.max(y + dy, area.y), area.y + area.height - 200)
    petWindow.setPosition(nx, ny)
  })
  ipcMain.on('pet:menu', (event) => {
    if (!onlyPet(event)) { invalidCount += 1; return }
    Menu.buildFromTemplate([{ label: 'Hide pet', click: () => { if (!petWindow.isDestroyed()) petWindow.hide() } }]).popup({ window: petWindow })
  })
  return latest
}
