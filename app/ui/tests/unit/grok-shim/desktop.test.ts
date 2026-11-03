// P5-51 · window.desktop 扁平桥单测：启动必需回值（RE-s0 §window.desktop）、
// localToolPermission 的 ceiling=ask（隐藏 always 的上游机制）、clientPersistence localStorage。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesktopBridge } from '../../../renderer-grok/shim/src/desktop'

interface MiniWindow {
  localStorage: Storage
  matchMedia: (q: string) => { matches: boolean; addEventListener(type: string, l: () => void): void }
}

const mkWindow = (dark = false): MiniWindow => ({
  localStorage: (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } as unknown as Storage })(),
  matchMedia: () => ({ matches: dark, addEventListener: () => {} }),
})

const b = (w: MiniWindow) => createDesktopBridge(w as unknown as Window, { authId: 'pbots-local', platform: 'linux' })

beforeEach(() => { vi.restoreAllMocks() })

describe('启动必需（0.18 启动校验 hasDesktopBridge 五键 + S0 清单）', () => {
  it('hasDesktopBridge 五键：openExternal/getWindowState/mcp/cursorAccount/update', () => {
    const d = b(mkWindow())
    expect(typeof d.openExternal).toBe('function')
    expect(typeof d.getWindowState).toBe('function')
    expect(typeof d.mcp).toBe('object')
    expect(typeof d.cursorAccount).toBe('object')
    expect(typeof d.update).toBe('object')
  })

  it('cursorAccount.getStatus → logged-in（authId=account slot，审批卡 permissionScope 与之同值）', async () => {
    const d = b(mkWindow())
    await expect(d.cursorAccount.getStatus()).resolves.toMatchObject({ kind: 'logged-in', authId: 'pbots-local' })
    await expect(d.cursorAccount.getSandAccessFresh()).resolves.toBeTruthy()
  })

  it('onboarding.getSeen=true；update.getStatus 完整形状；mcp.list 空；getZoomFactor 同步数值；platform/isDev 同步', async () => {
    const d = b(mkWindow())
    await expect(d.onboarding.getSeen()).resolves.toBe(true)
    const s = await d.update.getStatus()
    expect(s.state.type).toBe('disabled')
    expect(s.currentVersion).toBeTruthy()
    expect(typeof d.getZoomFactor()).toBe('number')
    expect(d.platform).toBe('linux')
    expect(d.isDev).toBe(false)
    await expect(d.mcp.list()).resolves.toEqual({ servers: [] })
    await expect(d.mcp.catalog()).resolves.toEqual([])
  })

  it('on* 订阅返回 unsubscribe；theme initial 亮/暗', () => {
    const light = b(mkWindow(false))
    const dark = b(mkWindow(true))
    expect(light.theme.initial.resolved).toBe('light')
    expect(dark.theme.initial.resolved).toBe('dark')
    const stop = light.theme.onChanged(() => {})
    expect(typeof stop).toBe('function')
    stop()
  })
})

describe('localToolPermission · ceiling=ask（P5-31 v3：shim 下发，不改上游）', () => {
  it('ceiling() → "ask" 字符串（store normalizeCeiling → alwaysBlocked → Always allow 禁用）', async () => {
    const d = b(mkWindow())
    await expect(d.localToolPermission.ceiling()).resolves.toBe('ask')
  })

  it('get → "ask"；set("always") 拒存回 "ask"（上游 resolveLocalToolPermissionAction 检测 stored!==requested → 降级 allow-once）；set("never") 生效', async () => {
    const d = b(mkWindow())
    await expect(d.localToolPermission.get()).resolves.toBe('ask')
    await expect(d.localToolPermission.set('always')).resolves.toBe('ask')
    await expect(d.localToolPermission.get()).resolves.toBe('ask')
    await expect(d.localToolPermission.set('never')).resolves.toBe('never')
    await expect(d.localToolPermission.get()).resolves.toBe('never')
    await expect(d.localToolPermission.clearApprovals()).resolves.toBeUndefined()
  })
})

describe('agent.clientPersistence · localStorage 落盘', () => {
  it('read 缺省 null；write→read 回值；remove 后 null', async () => {
    const w = mkWindow()
    const d = b(w)
    await expect(d.agent.clientPersistence.read('sand.test')).resolves.toBeNull()
    await d.agent.clientPersistence.write('sand.test', JSON.stringify({ a: 1 }))
    await expect(d.agent.clientPersistence.read('sand.test')).resolves.toBe(JSON.stringify({ a: 1 }))
    await d.agent.clientPersistence.remove('sand.test')
    await expect(d.agent.clientPersistence.read('sand.test')).resolves.toBeNull()
  })
})
