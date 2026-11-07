// P5-51 · shim 入口：在 0.18 renderer bundle 之前定义 window.desktop（扁平桥）与
// window.coordinatorPort（协议 v1），数据层下接现有 M1/M2 carrier（window.pbots，preload 注入）。
// 由 build 后注入 index.html 的经典 <script> 加载（shim/vite.config.ts 产 IIFE，
// scripts/inject-shim.mjs 插桩），上游 frontend/ 树零改动。
import { createDesktopBridge } from './desktop'
import { createCoordinatorServer } from './coordinator'
import { createShimData, type ShimData } from './data'
import { mountBootCover } from './boot-cover'

interface PbotsPreload {
  api(method: string, args?: unknown): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
  botsMeta(op: 'get' | { op: 'patch'; mainBotId: string }): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
  /** P5-54 preload 窗口实底（preload/index.ts）。 */
  window?: { platform: 'win32'; getZoomFactor(): number; setTheme?(theme: { preference: 'light' | 'dark' | 'system'; resolved: 'light' | 'dark' }): void }
}

export function installShim(win: Window & { pbots?: PbotsPreload; desktop?: unknown; coordinatorPort?: unknown }): void {
  if (win.desktop !== undefined || win.coordinatorPort !== undefined) return // 双装保护
  const pbots = win.pbots
  if (pbots === undefined) throw new Error('pbots preload bridge missing: shim requires window.pbots (M1/M2/M3)')

  // 能力开关（P5-52）：platform='win32' = 「宿主画原生窗口控件」（main/window.ts titleBarOverlay），
  // 上游 WindowChrome 走 win32 分支：只留拖拽层、不渲染自绘 Minimize/Maximize/Close。
  // P5-54：platform / zoom 由 preload 给实底（pbots.window）；platform 恒为 win32 外观语义，绝不取 process.platform。
  const host = pbots.window
  // P5-57 pbotsUi.focus → 上游 desktop.onFocusAgent（parseDesktopIntent focus = {id}）→ openAgent
  const focusListeners = new Set<(value: unknown) => void>()
  let openGate: () => void = () => {}
  const persistenceGate = new Promise<void>((resolve) => { openGate = resolve })
  let sections: () => unknown[] | null = () => null // data 建好后接上（desktop 先于 data 创建）
  const desktop = createDesktopBridge(win, {
    sidebarSections: () => sections(),
    persistenceGate,
    onFocusAgent: (l) => { focusListeners.add(l); return () => { focusListeners.delete(l) } },
    authId: 'pbots-local',
    platform: host?.platform ?? 'win32',
    ...(host !== undefined ? { getZoomFactor: () => host.getZoomFactor() } : {}),
    ...(host?.setTheme !== undefined ? { setHostTheme: (t) => host.setTheme!(t) } : {}),
  })
  // P5-57 启动封面：bundle 之前挂（本脚本 defer、先于 module bundle），roster 就绪即收。
  // P5-61.f1 ①：先建 desktop 桥再挂封面，色调取桥上的 resolved（与正文同源同时机），封面期间的切换随动
  win.desktop = desktop
  const cover = mountBootCover(win.document, desktop.theme.initial.resolved)
  desktop.theme.onChanged((t) => cover.tone(t.resolved))

  const data = createShimData({
    authId: 'pbots-local',
    api: (method, args) => pbots.api(method, args).catch((error: unknown) => ({ ok: false, error: { code: 'pbots/unavailable', message: String(error) } })),
    metaApi: (op) => pbots.botsMeta(op).catch((error: unknown) => ({ ok: false, error: { code: 'pbots/unavailable', message: String(error) } })),
    focus: (id) => { for (const l of [...focusListeners]) l({ id }) },
    boot: (phase) => (phase === 'ready' ? cover.ready() : cover.failed()),
  })
  sections = data.sections
  ;(win as unknown as { pbotsUi?: ShimData['ui'] }).pbotsUi = data.ui
  const server = createCoordinatorServer(data.deps)
  void server.ready.then(openGate)
  data.wire({
    agents: () => server.emit('agents', data.agentsPayload()),
    transcript: (agentId) => server.emit('transcript', data.transcriptPayload(agentId)),
    outline: (agentId) => server.emit('outline', data.outlinePayload(agentId)),
    sections: () => server.emit('host-settings', { fields: ['sidebarSections'] }),
  })
  win.coordinatorPort = {
    claim(consumer: { onPort(port: unknown): void }) { return server.claim(consumer as Parameters<typeof server.claim>[0]) },
  }
  // E2E 观测面（只读）：审批作答值域断言（D9）+ 诊断 dump
  ;(win as unknown as { __pbotsShim?: { answers: ShimData['answers']; debugItems(a: string): unknown[]; requests: string[]; unhandled: string[] } }).__pbotsShim = {
    answers: data.answers,
    debugItems: data.debugItems,
    requests: server.requests,
    unhandled: server.unhandled,
  }
  ;(win as unknown as { __pbotsDev?: ShimData['dev'] }).__pbotsDev = data.dev
  data.start()
}

installShim(window)
