// B6 spotlight：全局快捷呼出的 quick-chat 窗（1.1.0 规格 work/grok-1.1.0-re/RE-SPOTLIGHT-1.1.0.md）。
// 608×440 panel 无边框透明置顶；同 index.html + argv --pbots-spotlight 分支；Alt+Space toggle。
// 隐藏用 setOpacity(0)+setIgnoreMouseEvents(true)（非 hide——无闪烁重定位，RE §1）。
// 依赖全注入：单测不 mock electron 模块（本仓 main 层无 vi.mock('electron') 先例）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface SpotlightSettings { version: 1; isEnabled: boolean; shortcut: string }

/** 依赖注入面（electron 侧工厂）；测试传 fake。 */
export interface SpotlightDeps {
  createWindow(opts: Electron.BrowserWindowConstructorOptions): Electron.BrowserWindow
  register(accelerator: string, onPress: () => void): boolean
  unregister(accelerator: string): void
  cursorWorkArea(): Electron.Rectangle
  appName(): string
  loadApp(window: Electron.BrowserWindow): void
  readSettings(): SpotlightSettings | null
  writeSettings(settings: SpotlightSettings): void
  warn(message: string): void
}

export interface SpotlightService {
  /** 快捷键回调：呈现中→收起；隐藏→呈现。 */
  toggle(): void
  present(): void
  dismiss(): void
  dispose(): void
  setShortcut(accelerator: string): Promise<boolean>
  isEnabled(): boolean
  /** B6.2：受信窗引用（assertSender 放行列表）。 */
  readonly window: Electron.BrowserWindow
}

const SIZE = { width: 608, height: 440 } // RE：OLn=560+2*wB=24
const PLACEMENT_Y_RATIO = 0.22 // RE §1：workArea.y + height*0.22
export const SPOTLIGHT_ARGV = '--pbots-spotlight'

export function createSpotlightService(deps: SpotlightDeps, preloadPath: string): SpotlightService {
  const settings: SpotlightSettings = deps.readSettings() ?? { version: 1, isEnabled: true, shortcut: 'Alt+Space' }
  let presented = false

  const window = deps.createWindow({
    ...SIZE,
    title: deps.appName(),
    type: 'panel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      additionalArguments: [SPOTLIGHT_ARGV],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true)
  deps.loadApp(window)

  const present = (): void => {
    const area = deps.cursorWorkArea()
    const x = Math.round(area.x + Math.max(0, (area.width - SIZE.width) / 2))
    const y = Math.round(area.y + area.height * PLACEMENT_Y_RATIO)
    window.setPosition(x, y)
    window.setOpacity(1)
    window.setIgnoreMouseEvents(false)
    window.show()
    window.focus()
    presented = true
  }
  const dismiss = (): void => {
    window.setOpacity(0)
    window.setIgnoreMouseEvents(true)
    presented = false
  }
  const toggle = (): void => { presented ? dismiss() : present() }

  if (settings.isEnabled && !deps.register(settings.shortcut, toggle)) {
    deps.warn(`[spotlight] globalShortcut ${settings.shortcut} 注册失败（被系统占用？）——设置面板可改键`)
  }

  return {
    window,
    toggle,
    present,
    dismiss,
    dispose(): void {
      deps.unregister(settings.shortcut)
      if (!window.isDestroyed()) window.close()
    },
    async setShortcut(accelerator): Promise<boolean> {
      deps.unregister(settings.shortcut)
      const ok = deps.register(accelerator, toggle)
      if (!ok) {
        deps.warn(`[spotlight] globalShortcut ${accelerator} 注册失败`)
        deps.register(settings.shortcut, toggle) // 回滚旧键
        return false
      }
      settings.shortcut = accelerator
      deps.writeSettings(settings)
      return true
    },
    isEnabled: () => settings.isEnabled,
  }
}

/** settings.json 读写（userData 下；1.1.0 规格 {version,isEnabled,shortcut}）。 */
export function readSpotlightSettings(file: string): SpotlightSettings | null {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as SpotlightSettings
    if (v?.version === 1 && typeof v.isEnabled === 'boolean' && typeof v.shortcut === 'string') return v
  } catch { /* 首启无文件 */ }
  return null
}

export function writeSpotlightSettings(file: string, settings: SpotlightSettings): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(settings))
  } catch (error) { console.warn(`[spotlight] settings write failed: ${String(error)}`) }
}
