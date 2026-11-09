// T45a：宠物窗 preload——只有四个无参/整数面（onState/click/move/menu）。
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pet', {
  onState(cb: (state: string) => void): void {
    ;((window as unknown as { __petListenersInRenderer?: Array<(s: string) => void> }).__petListenersInRenderer ??= []).push(cb) // e2e 截图驱动口（仅渲染进程内存）
    ipcRenderer.on('pet:state', (_e, v) => { cb(String((v ?? {}).state ?? 'idle')) })
  },
  click(): void { ipcRenderer.send('pet:click') },
  move(dx: number, dy: number): void { ipcRenderer.send('pet:move', { dx, dy }) },
  menu(): void { ipcRenderer.send('pet:menu') },
})
