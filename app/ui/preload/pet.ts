// T45a：宠物窗 preload——只有四个无参/整数面（onState/click/move/menu）。
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pet', {
  onState(cb: (state: string) => void): void {
    // T45c M4：测试钩子已删（contextIsolation 下主世界本就读不到，原钩子无效）——e2e 一律经 main 侧 webContents.send 驱动
    ipcRenderer.on('pet:state', (_e, v) => { cb(String((v ?? {}).state ?? 'idle')) })
  },
  click(): void { ipcRenderer.send('pet:click') },
  move(dx: number, dy: number): void { ipcRenderer.send('pet:move', { dx, dy }) },
  menu(): void { ipcRenderer.send('pet:menu') },
})
