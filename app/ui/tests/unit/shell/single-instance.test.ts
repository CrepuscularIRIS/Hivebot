// U-28 R1：单实例锁守卫。store.ts 的进程内单写者锁依赖「跨进程双开由 Electron app 级
// 单实例兜底」（store.ts 注释）——此前该兜底不存在，双开两个进程会用各自内存快照整体
// 覆盖 bots.json（终审 R1）。guardSingleInstance 是 main() 首行接线的纯函数面。
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {},
  ipcMain: { handle: () => {}, on: () => {} },
  MessageChannelMain: {},
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} },
}))

import { guardSingleInstance } from '../../../main/index'

interface FakeApp {
  lockRequested: number
  listeners: Record<string, unknown[]>
  requestSingleInstanceLock(): boolean
  on(event: string, cb: unknown): void
}

function fakeApp(lock: boolean): FakeApp {
  const listeners: Record<string, unknown[]> = {}
  return {
    lockRequested: 0,
    listeners,
    requestSingleInstanceLock() { this.lockRequested += 1; return lock },
    on(event, cb) { (listeners[event] ??= []).push(cb) },
  }
}

describe('guardSingleInstance（U-28 R1）', () => {
  it('拿到锁 → true，注册 second-instance 聚焦回调（已有实例聚焦自身窗口）', () => {
    const app = fakeApp(true)
    const alerts: Array<[string, string]> = []
    const focus = vi.fn()
    expect(guardSingleInstance(app, focus, (t, m) => alerts.push([t, m]))).toBe(true)
    expect(app.lockRequested).toBe(1)
    expect(app.listeners['second-instance']).toHaveLength(1)
    // 收到 second-instance（另一实例尝试启动）→ 聚焦已有窗口
    ;(app.listeners['second-instance'][0] as () => void)()
    expect(focus).toHaveBeenCalledTimes(1)
    expect(alerts).toEqual([])
  })

  it('拿不到锁（已有实例）→ false + 提示一次，不注册 second-instance（main 应 quit）', () => {
    const app = fakeApp(false)
    const alerts: Array<[string, string]> = []
    expect(guardSingleInstance(app, () => {}, (t, m) => alerts.push([t, m]))).toBe(false)
    expect(app.lockRequested).toBe(1)
    expect(alerts.length).toBe(1)
    expect(alerts[0][1]).toContain('已在运行')
    expect(app.listeners['second-instance']).toBeUndefined()
  })
})
