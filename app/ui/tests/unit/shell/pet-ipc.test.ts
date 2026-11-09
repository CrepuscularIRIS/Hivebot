// T45a：main 侧宠物 IPC（假 BrowserWindow/webContents 注入——工单 ⑦–⑩）
import { describe, expect, it, vi } from 'vitest'

const evt = (sender: unknown, frame: unknown) => ({ sender, senderFrame: frame }) as never

// 注：ipcMain/menu/screen 需 mock electron——见下方 vi.mock
vi.mock('electron', () => {
  const listeners = (globalThis as { __petListeners?: Map<string, (e: unknown, v?: unknown) => void> }).__petListeners ?? new Map()
  ;(globalThis as { __petListeners?: Map<string, (e: unknown, v?: unknown) => void> }).__petListeners = listeners
  return {
    ipcMain: { on: (ch: string, fn: (e: unknown, v?: unknown) => void) => { listeners.set(ch, fn) } },
    Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
    screen: { getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    __listeners: listeners,
  }
})

import { registerPetIpc, petInvalidCount } from '../../../main/pet/ipc'
import { __listeners } from 'electron'

const rigReal = () => {
  const petSend = vi.fn()
  const mainShow = vi.fn(), mainFocus = vi.fn()
  const setPosition = vi.fn(), getPosition = vi.fn(() => [100, 100])
  const mainFrame = { url: 'pbots-app://app/' } // assertPbotsSender 认的形状（sender/frame）
  const mainWC = { id: 1, mainFrame }
  const petFrame = { id: 'pet-main' }
  const petWC = { id: 2, mainFrame: petFrame, send: petSend }
  const mainWindow = { webContents: mainWC, isDestroyed: () => false, show: mainShow, focus: mainFocus }
  const petWindow = { webContents: petWC, isDestroyed: () => false, getPosition, setPosition }
  return { petSend, mainShow, mainFocus, setPosition, mainWindow, petWindow, mainWC, petWC, petFrame, mainFrame }
}

// assertPbotsSender 校验 sender===mainWindow.webContents 且 frame 为主 frame——用真 mainWC 即过
describe('T45a pet ipc', () => {
  it('⑦ 非主窗/未知 state/坏 botId → 丢弃（宠物窗没收到）', () => {
    const r = rigReal()
    registerPetIpc(r.mainWindow, r.petWindow)
    const ch = __listeners.get('pbots:pet-state')!
    const badFrame = { id: 'other' }
    ch(evt(r.petWC, badFrame), { state: 'idle' }) // 非主窗
    ch(evt(r.mainWC, r.mainFrame), { state: 'bogus' }) // 未知 state
    ch(evt(r.mainWC, r.mainFrame), { state: 'idle', botId: '../evil' }) // 坏形状
    expect(r.petSend).not.toHaveBeenCalled()
    expect(petInvalidCount()).toBeGreaterThanOrEqual(3)
  })
  it('⑧ 合法 state → 宠物窗收到 {state} 且无 botId 键', () => {
    const r = rigReal()
    registerPetIpc(r.mainWindow, r.petWindow)
    __listeners.get('pbots:pet-state')!(evt(r.mainWC, r.mainFrame), { state: 'waiting', botId: 'session-ok_1' })
    __listeners.get('pbots:pet-state')!(evt(r.mainWC, r.mainFrame), { state: 'waiting', botId: 'session-ok_1' })
    expect(r.petSend).toHaveBeenCalledWith('pet:state', { state: 'waiting' })
    expect(Object.keys(r.petSend.mock.calls[0]![1] as object)).toEqual(['state'])
  })
  it('⑨ pet:* 来自主窗拒；来自宠物窗 click 生效/move 夹边/非整丢弃', () => {
    const r = rigReal()
    registerPetIpc(r.mainWindow, r.petWindow)
    __listeners.get('pet:click')!(evt(r.mainWC, null))
    expect(r.mainShow).not.toHaveBeenCalled()
    __listeners.get('pet:click')!(evt(r.petWC, r.petFrame))
    expect(r.mainShow).toHaveBeenCalled()
    __listeners.get('pet:move')!(evt(r.petWC, r.petFrame), { dx: 1800, dy: 0 })
    expect(r.setPosition).toHaveBeenCalledWith(1720, 100) // 夹进 workArea
    __listeners.get('pet:move')!(evt(r.petWC, r.petFrame), { dx: 1.5, dy: 0 })
    __listeners.get('pet:move')!(evt(r.petWC, r.petFrame), { dx: 5, dy: 'x' })
    expect(petInvalidCount()).toBeGreaterThanOrEqual(3)
  })
})
