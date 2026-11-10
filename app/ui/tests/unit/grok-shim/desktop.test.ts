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

  it('get → "ask"；set 一律拒存回 "ask"（L-AP：档位由 sdk 档位表 + NEVER 常量定，renderer 无写入口；P5-31 起卡与设置都不再发 always/never）', async () => {
    const d = b(mkWindow())
    await expect(d.localToolPermission.get()).resolves.toBe('ask')
    await expect(d.localToolPermission.set('always')).resolves.toBe('ask')
    await expect(d.localToolPermission.set('never')).resolves.toBe('ask')
    await expect(d.localToolPermission.get()).resolves.toBe('ask')
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

describe('agent 置顶 · localStorage 落盘（P5-58 去 mock：Pin 菜单项真实可见，恒 [] 会在 reload 后静默丢置顶）', () => {
  it('setPinnedAgents 落盘；同一 window 上的新桥实例（reload 语义）读回同一列表', async () => {
    const w = mkWindow()
    const first = b(w)
    await expect(first.agent.getPinnedAgents()).resolves.toEqual([])
    await expect(first.agent.setPinnedAgents(['b2', 'a1'])).resolves.toEqual(['b2', 'a1'])
    const reloaded = b(w) // reload：shim 重建，localStorage 仍在
    await expect(reloaded.agent.getPinnedAgents()).resolves.toEqual(['b2', 'a1'])
    await expect(reloaded.agent.setPinnedAgents([])).resolves.toEqual([])
    await expect(b(w).agent.getPinnedAgents()).resolves.toEqual([])
  })

  it('损坏的落盘值（手改 localStorage）回 []，不抛', async () => {
    const w = mkWindow()
    w.localStorage.setItem('pbots.shim.pinned-agents', '{not json')
    const d = b(w)
    await expect(d.agent.getPinnedAgents()).resolves.toEqual([])
  })
})

describe('主题偏好 · localStorage 落盘（L-7 O7：手动选择不能在 reload 后静默回到跟随系统）', () => {
  it('theme.set 落盘；同一 window 上的新桥实例（reload 语义）恢复所选偏好', async () => {
    const w = mkWindow()
    const first = b(w)
    expect(first.theme.initial.preference).toBe('system')
    await expect(first.theme.set('dark')).resolves.toMatchObject({ preference: 'dark', resolved: 'dark' })
    const reloaded = b(w) // reload：shim 重建，localStorage 仍在
    expect(reloaded.theme.initial).toMatchObject({ preference: 'dark', resolved: 'dark' })
    await expect(reloaded.theme.set('system')).resolves.toMatchObject({ preference: 'system' })
    expect(b(w).theme.initial.preference).toBe('system')
  })

  it('损坏的落盘值回 system（跟随系统），不抛', () => {
    const w = mkWindow()
    w.localStorage.setItem('pbots.shim.theme-preference', 'neon')
    expect(b(w).theme.initial.preference).toBe('system')
  })
})

describe('P5-61.f1 主题下沉宿主 + 切换帧禁过渡', () => {
  it('③ 建桥即把落盘偏好 + 实际所画色调推给宿主（与系统相反也照推），set 与 system 下的 media 变化再推', async () => {
    let dark = false
    let onMedia = (): void => {}
    const w = { ...mkWindow(), matchMedia: () => ({ get matches() { return dark }, addEventListener: (_: string, l: () => void) => { onMedia = l } }) }
    w.localStorage.setItem('pbots.shim.theme-preference', 'dark')
    const pushed: string[] = []
    const d = createDesktopBridge(w as unknown as Window, { authId: 'x', setHostTheme: (t) => pushed.push(`${t.preference}/${t.resolved}`) })
    expect(d.theme.initial).toEqual({ preference: 'dark', resolved: 'dark' })
    expect(pushed).toEqual(['dark/dark'])
    await d.theme.set('light')
    await d.theme.set('system')
    dark = true; onMedia()
    expect(pushed).toEqual(['dark/dark', 'light/light', 'system/light', 'system/dark'])
  })

  it('② 推送监听期间挂全局禁过渡样式（权重压过 .class !important），监听返回且强制样式计算后移除', async () => {
    const head: unknown[] = []
    let flushed = 0
    const style = { textContent: '', remove() { head.splice(head.indexOf(this), 1) } }
    const doc = { createElement: () => style, head: { append: (s: unknown) => head.push(s) }, body: {} }
    const w = { ...mkWindow(), document: doc, getComputedStyle: () => { flushed++; return { opacity: '1' } } }
    const d = createDesktopBridge(w as unknown as Window, { authId: 'x' })
    const seen: Array<{ attached: boolean; resolved: string }> = []
    d.theme.onChanged((t) => seen.push({ attached: head.includes(style), resolved: t.resolved }))
    await d.theme.set('dark')
    expect(seen).toEqual([{ attached: true, resolved: 'dark' }])
    expect(style.textContent).toMatch(/:not\(#\\#\)[^{]*\{[^}]*transition:\s*none\s*!important/)
    expect(flushed).toBe(1)
    expect(head).toEqual([])
  })
})

describe('P5-61.f2 建桥即落 html[data-theme]（先于 bundle 首次挂载）', () => {
  // 根因：侧栏控件在上游 useEffect 设 data-theme 之前就挂上，按 index.css :root 亮默认算底色，
  // data-theme 到位后 .12s/.3s 背景过渡从亮滑到暗。shim 先于 bundle 落同值，上游再设是空操作。
  for (const [saved, cls] of [['dark', 'cursor-dark'], ['light', 'cursor-light']] as const) {
    it(`保存 ${saved} → 建桥后 html data-theme=${cls}、color-scheme=${saved}（与上游 applyRootShellTheme 同值）`, () => {
      const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } }
      const w = { ...mkWindow(saved === 'light'), document: { documentElement: root } }
      w.localStorage.setItem('pbots.shim.theme-preference', saved)
      createDesktopBridge(w as unknown as Window, { authId: 'x' })
      expect(root.dataset.theme).toBe(cls)
      expect(root.style.colorScheme).toBe(saved)
    })
  }
})

describe('P6-15 sidebar sections 实底（E2 / E10 / E11）', () => {
  it('无 worker（sidebarSections 回 null / 未接）→ get 回 null，set 原样回（与此前一致）', async () => {
    const plain = b(mkWindow())
    expect(await plain.agent.getSidebarSections()).toBeNull()
    const user = [{ id: 's1', name: 'Mine', agentIds: ['a'], isCollapsed: false }]
    expect(await plain.agent.setSidebarSections(user)).toEqual(user)
    const none = createDesktopBridge(mkWindow() as unknown as Window, { authId: 'x', sidebarSections: () => null })
    expect(await none.agent.setSidebarSections(user)).toEqual(user)
  })
  it('有 worker → get 回推导值；用户写入一律回推导值（不能把 bot 拖进 / 拖出 worker 组）', async () => {
    const derived = [{ id: 'pbots:main:m', name: '', agentIds: ['m'], isCollapsed: false }, { id: 'pbots:workers:m', name: 'Workers', agentIds: ['w'], isCollapsed: false }]
    const d = createDesktopBridge(mkWindow() as unknown as Window, { authId: 'x', sidebarSections: () => derived })
    expect(await d.agent.getSidebarSections()).toEqual(derived)
    expect(await d.agent.setSidebarSections([{ id: 'pbots:workers:m', name: 'Workers', agentIds: ['w', 'other'], isCollapsed: false }])).toEqual(derived)
  })
})
