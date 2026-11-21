// B6.1 单测：spotlight 服务——窗口参量/呈现位置/隐藏语义/dispose/快捷键降级。
// 依赖全注入（FakeWindow/FakeRegistrar），不 mock electron 模块。
import { describe, expect, it } from 'vitest'
import { createSpotlightService, type SpotlightDeps } from '../../../main/spotlight'

type Call = { method: string; args: unknown[] }

class FakeWindow {
  calls: Call[] = []
  opacity = 1
  ignoreMouse = false
  destroyed = false
  bounds = { x: 0, y: 0, width: 608, height: 440 }
  constructor(public opts: Record<string, unknown>) {}
  setOpacity(v: number) { this.opacity = v; this.calls.push({ method: 'setOpacity', args: [v] }) }
  setIgnoreMouseEvents(v: boolean) { this.ignoreMouse = v; this.calls.push({ method: 'setIgnoreMouseEvents', args: [v] }) }
  setAlwaysOnTop(v: boolean, level?: string) { this.calls.push({ method: 'setAlwaysOnTop', args: [v, level] }) }
  setVisibleOnAllWorkspaces(v: boolean) { this.calls.push({ method: 'setVisibleOnAllWorkspaces', args: [v] }) }
  setPosition(x: number, y: number) { this.bounds = { ...this.bounds, x, y }; this.calls.push({ method: 'setPosition', args: [x, y] }) }
  show() { this.calls.push({ method: 'show', args: [] }) }
  focus() { this.calls.push({ method: 'focus', args: [] }) }
  close() { this.destroyed = true; this.calls.push({ method: 'close', args: [] }) }
  isDestroyed() { return this.destroyed }
  loadURL(url: string) { this.calls.push({ method: 'loadURL', args: [url] }) }
}

const workArea = { x: 100, y: 200, width: 1920, height: 1080 }

function makeDeps(overrides: Partial<SpotlightDeps> = {}): SpotlightDeps & { windows: FakeWindow[]; registered: Map<string, () => void> } {
  const windows: FakeWindow[] = []
  const registered = new Map<string, () => void>()
  const deps: SpotlightDeps = {
    createWindow(opts) { const w = new FakeWindow(opts); windows.push(w); return w as unknown as Electron.BrowserWindow },
    register(accelerator, onPress) { registered.set(accelerator, onPress); return true },
    unregister(accelerator) { registered.delete(accelerator) },
    cursorWorkArea() { return workArea },
    appName() { return 'HiveBot' },
    loadApp(w) { (w as unknown as FakeWindow).loadURL('pbots-app://app/') },
    readSettings() { return null },
    writeSettings() {},
    warn() {},
    ...overrides,
  }
  return Object.assign(deps, { windows, registered })
}

describe('B6.1：spotlight 服务', () => {
  it('① 建窗参量：608×440 panel 无边框透明置顶 skipTaskbar show:false + argv', () => {
    const d = makeDeps()
    createSpotlightService(d, '/preload.js')
    const w = d.windows[0]!
    expect(w.opts.width).toBe(608)
    expect(w.opts.height).toBe(440)
    expect(w.opts.type).toBe('panel')
    expect(w.opts.frame).toBe(false)
    expect(w.opts.transparent).toBe(true)
    expect(w.opts.skipTaskbar).toBe(true)
    expect(w.opts.alwaysOnTop).toBe(true)
    expect(w.opts.show).toBe(false)
    const wp = w.opts.webPreferences as { additionalArguments?: string[] }
    expect(wp.additionalArguments).toContain('--pbots-spotlight')
  })

  it('② 呈现位置：光标 workArea 水平居中 + y=+height*0.22；show+focus', () => {
    const d = makeDeps()
    const svc = createSpotlightService(d, '/preload.js')
    svc.present()
    const w = d.windows[0]!
    // 水平居中：workArea.x + (1920-608)/2 = 100+656 = 756；y = 200 + 1080*0.22 = 437.6 → round 438
    expect(w.bounds.x).toBe(756)
    expect(w.bounds.y).toBe(438) // 200+1080*0.22=437.6 → round 438
    expect(w.calls.some((c) => c.method === 'show')).toBe(true)
    expect(w.calls.some((c) => c.method === 'focus')).toBe(true)
  })

  it('③ dismiss：opacity 0 + ignoreMouseEvents true（非 close）', () => {
    const d = makeDeps()
    const svc = createSpotlightService(d, '/preload.js')
    svc.present()
    svc.dismiss()
    const w = d.windows[0]!
    expect(w.opacity).toBe(0)
    expect(w.ignoreMouse).toBe(true)
    expect(w.destroyed).toBe(false)
  })

  it('④ toggle 两态翻转；dispose 注销快捷键并关窗', () => {
    const d = makeDeps()
    const svc = createSpotlightService(d, '/preload.js')
    d.registered.get('Alt+Space')!()
    const w = d.windows[0]!
    expect(w.calls.some((c) => c.method === 'show')).toBe(true)
    d.registered.get('Alt+Space')!()
    expect(w.opacity).toBe(0)
    svc.dispose()
    expect(d.registered.has('Alt+Space')).toBe(false)
    expect(w.destroyed).toBe(true)
  })

  it('⑤ 快捷键注册失败降级：不 throw，记 warn，服务仍可用', () => {
    const warns: string[] = []
    const d = makeDeps({ register: () => false, warn: (m) => warns.push(m) })
    expect(() => createSpotlightService(d, '/preload.js')).not.toThrow()
    expect(warns.some((m) => m.includes('Alt+Space'))).toBe(true)
    const svc = createSpotlightService(d, '/preload.js')
    svc.present() // 服务可用
    expect(d.windows.at(-1)!.calls.some((c) => c.method === 'show')).toBe(true)
  })
})
