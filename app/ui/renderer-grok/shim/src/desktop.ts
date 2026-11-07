// P5-51 · window.desktop 扁平桥（0.18 preload 形状，非 0.78.1 的 desktop.main.*）。
// 实底清单 = RE-s0 run-stublogs（启动必需 + 旅程外按需）；其余方法返回空/能力关。
// localToolPermission：恒 "ask"（L-AP：档位由 sdk 档位表 + NEVER 常量决定，renderer 没有写入口）。
// ceiling 恒 "ask"、set 一律拒存回 "ask"——P5-31 起审批卡（overrides/modules/local-tool-view.tsx）只有
// Allow once / Deny once、设置不渲染该下拉，这两条是兜底：万一 always/never 到达，上游
// resolveLocalToolPermissionAction 检测 stored!==requested 降级 allow-once / deny（view.tsx:92-97）。
import type { DesktopBridge, ThemeState, Unsubscribe } from '../../frontend/src/recovered/contracts/desktop-bridge'

export interface DesktopOptions {
  /** 账户槽（cursorAccount.getStatus().authId）——审批卡 permissionScope 与之同值。 */
  authId: string
  platform?: NodeJS.Platform
  appVersion?: string
  /** P5-54：preload 的 webFrame.getZoomFactor 实底（缺省 1，单测 / 无 preload 时）。 */
  getZoomFactor?: () => number
  /** P5-54：持久化读在它之后才回（= coordinator 握手完成）。上游 openAgent 先抓 transport 世代再等 ready，
   * ready 会 ++世代——由持久化恢复的选中 bot 若在握手前 openAgent，tail 回值必被作废，#11 分页游标永远装不上。
   * 读排到握手之后，恢复出来的 openAgent 就落在新世代里。缺省不排队（单测）。 */
  persistenceGate?: Promise<void>
  /** P5-57：pbotsUi.focus 的接收端（缺省空转）。 */
  onFocusAgent?: DesktopBridge['onFocusAgent']
  /** P6-15：worker 合成 section（data.sections；无 worker → null = 今天的扁平列表）。 */
  sidebarSections?: () => unknown[] | null
  /** P5-61.f1 ③：偏好下沉宿主 nativeTheme.themeSource（prefers-color-scheme 随之），resolved = 页面实际所画色调，
   * 原生标题栏控件 / 窗口底色按它着色（system 下宿主 nativeTheme 与 Chromium media 可能不一致，以页面为准）。缺省空转。 */
  setHostTheme?: (theme: ThemeState) => void
}

type AnyWindow = Window & {
  getComputedStyle?(el: Element): { opacity: string }
  matchMedia(q: string): { matches: boolean; addEventListener(type: string, l: () => void): void }
  addEventListener(type: 'resize', l: () => void): void
  removeEventListener(type: 'resize', l: () => void): void
}

const noUnsub: Unsubscribe = () => {}
const listener = (): Unsubscribe => noUnsub

export function createDesktopBridge(win: AnyWindow, opts: DesktopOptions): DesktopBridge {
  const store = win.localStorage
  const persisted = (key: string): string | null => { try { return store.getItem(`pbots.shim.${key}`) } catch { return null } }
  const persist = (key: string, value: string | null): void => {
    try { if (value === null) store.removeItem(`pbots.shim.${key}`); else store.setItem(`pbots.shim.${key}`, value) } catch { /* 私有模式等：静默 */ }
  }

  const themeListeners = new Set<(state: ThemeState) => void>()
  const darkQuery = win.matchMedia('(prefers-color-scheme: dark)')
  // L-7 O7：主题偏好落 localStorage（与置顶同存储同取向——reload 静默丢可见偏好是
  // P5-58 已定性的 bug 类）；system 仍实时跟随 prefers-color-scheme。
  const savedPreference = persisted('theme-preference')
  const initialPreference = savedPreference === 'light' || savedPreference === 'dark' || savedPreference === 'system' ? savedPreference : 'system'
  let theme: ThemeState = initialPreference === 'system'
    ? { preference: 'system', resolved: darkQuery.matches ? 'dark' : 'light' }
    : { preference: initialPreference, resolved: initialPreference }
  // 跟随系统（Electron nativeTheme → prefers-color-scheme）：preference=system 时系统切换要推给上游 theme.onChanged，
  // 否则 0.18 只在启动时读一次底色（P5-54 实测：emulateMedia dark 后 data-theme 仍 cursor-light）
  // P5-61.f1 ②：上游监听里同步换 data-theme + token 样式；overrides 的 120–300ms 背景过渡会让 composer / 按钮
  // 滞后正文、拍到混色帧。切换那一帧全局禁过渡（next-themes disableTransitionOnChange 同法），强制算一次样式再撤，
  // 颜色与 data-theme 同帧到位，悬停动效不受影响。`:not(#\#)` 抬权重压过 overrides 的 `.class !important`。
  const emitTheme = (): void => {
    opts.setHostTheme?.(theme)
    const doc = (win as Partial<Window>).document
    const freeze = doc?.createElement('style')
    if (doc !== undefined && freeze !== undefined) {
      freeze.textContent = '*:not(#\\#),*:not(#\\#)::before,*:not(#\\#)::after{transition:none!important}'
      doc.head.append(freeze)
    }
    try {
      for (const l of [...themeListeners]) l(theme)
    } finally {
      if (doc !== undefined && freeze !== undefined) {
        void win.getComputedStyle?.(doc.body).opacity // 强制样式计算：新颜色在禁过渡下落定
        freeze.remove()
      }
    }
  }
  // ③：宿主跟同一偏好（与系统相反时原生控件也不留白块）；建桥即推一次（覆盖宿主镜像过期），之后每次推送随 emitTheme
  opts.setHostTheme?.(theme)
  // P5-61.f2：上游 data-theme 在 ProductionRenderer 的 useEffect 里才设（applyRootShellTheme），侧栏圆钮 / Connect apps
  // 早于它挂载、按 index.css :root 亮默认算底色，data-theme 一到位就沿 .12s/.3s 背景过渡亮→暗滑过（composer 晚挂不受影响）。
  // shim 先于 bundle 落同值（与 window-chrome/model.ts applyRootShellTheme 一致），控件首帧即按 palette 解析，上游再设为空操作。
  const root = (win as Partial<Window>).document?.documentElement
  if (root !== undefined) {
    root.dataset.theme = theme.resolved === 'dark' ? 'cursor-dark' : 'cursor-light'
    root.style.colorScheme = theme.resolved
  }
  darkQuery.addEventListener('change', () => {
    if (theme.preference !== 'system') return
    theme = { preference: 'system', resolved: darkQuery.matches ? 'dark' : 'light' }
    emitTheme()
  })

  const auth: DesktopBridge['cursorAccount']['getStatus'] extends () => Promise<infer T> ? T : never = {
    kind: 'logged-in', authId: opts.authId, email: `${opts.authId}@pbots.local`, displayName: 'Pbots', isAnysphereUser: false,
  }
  const updateStatus: DesktopBridge['update'] extends object ? Awaited<ReturnType<DesktopBridge['update']['getStatus']>> : never = {
    state: { type: 'disabled', reason: 'not-packaged' },
    currentVersion: opts.appVersion ?? '0.0.0-pbots',
    currentTrack: 'stable', trackOverride: null, buildDefaultTrack: 'stable', availableTracks: ['stable'],
    isTrackManagedByPolicy: false, isBelowMinimumVersion: false, autoUpdateWhenIdleOptIn: false, autoUpdateWhenIdleGateEnabled: false,
  }

  // P5-58 去 mock：置顶是真实可见的功能（行菜单 Pin/Unpin → 上游 setPinnedAgents），
  // 恒 [] 的桩会让 reload 后静默丢置顶。落 localStorage（与 clientPersistence 同存储），
  // 损坏值回 []——置顶只是 UI 偏好，丢了不致命。
  const pinnedKey = 'pbots.shim.pinned-agents'
  const readPinned = (): string[] => {
    try {
      const raw = JSON.parse(store.getItem(pinnedKey) ?? '[]')
      return Array.isArray(raw) && raw.every((v) => typeof v === 'string') ? raw : []
    } catch { return [] }
  }

  return {
    platform: opts.platform ?? 'linux',
    isDev: false,
    getZoomFactor: () => opts.getZoomFactor?.() ?? 1,
    // 缩放（Ctrl ± / 0，Electron 默认菜单）在页面侧表现为 resize：resize 时读 webFrame 实值，变了才通知
    onZoomFactorEvent: (l) => {
      if (opts.getZoomFactor === undefined) return noUnsub
      let last = opts.getZoomFactor()
      const onResize = (): void => { const z = opts.getZoomFactor!(); if (z !== last) { last = z; l(z) } }
      win.addEventListener('resize', onResize)
      return () => win.removeEventListener('resize', onResize)
    },
    getWindowState: () => Promise.resolve({ isFullscreen: false, isMaximized: false }),
    onWindowStateEvent: listener,
    windowControls: {
      minimize: () => Promise.resolve(), toggleMaximize: () => Promise.resolve(), close: () => Promise.resolve(),
      setTitleBarOverlayTone: () => Promise.resolve(), resizeWidth: (d: number) => Promise.resolve(360 + d),
    },
    theme: {
      get initial(): ThemeState { return theme },
      get: () => Promise.resolve(theme),
      set: (preference) => {
        theme = preference === 'system'
          ? { preference, resolved: win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }
          : { preference, resolved: preference }
        persist('theme-preference', preference) // L-7 O7：选择要活过刷新/重启
        emitTheme()
        return Promise.resolve(theme)
      },
      onChanged: (l) => { themeListeners.add(l); return () => { themeListeners.delete(l) } },
    },
    cursorAccount: {
      getStatus: () => Promise.resolve(auth),
      login: () => Promise.resolve(auth),
      cancelLogin: () => Promise.resolve(auth),
      logout: () => Promise.resolve({ kind: 'logged-out' }),
      updateName: () => Promise.resolve(auth),
      getAvatar: () => Promise.resolve(null),
      getWeeklyUsage: () => Promise.resolve(null),
      getUsageSummary: () => Promise.resolve(null),
      getPrReviewPreferences: () => Promise.resolve(null),
      getPrivacyModeEnabled: () => Promise.resolve(null),
      getSandAccess: () => Promise.resolve({ state: 'granted' }),
      getSandAccessFresh: () => Promise.resolve({ state: 'granted' }),
      invokeDashboardAction: () => Promise.resolve(null),
      cancelTrial: () => Promise.resolve(null),
      onStatusChanged: listener,
    },
    update: {
      getStatus: () => Promise.resolve(updateStatus),
      check: () => Promise.resolve(updateStatus),
      setTrack: () => Promise.resolve(updateStatus),
      quitAndInstall: () => Promise.resolve(),
      setAutoUpdateWhenIdleOptIn: () => Promise.resolve(updateStatus),
      onStatusEvent: listener,
    },
    mcp: {
      list: () => Promise.resolve({ servers: [] }),
      effectivePlugins: () => Promise.resolve([]),
      catalog: () => Promise.resolve([]),
      teamPopularity: () => Promise.resolve({}),
      pluginLogo: () => Promise.resolve(null),
      install: () => Promise.resolve({ servers: [] }),
      updatePluginInstall: () => Promise.resolve({ servers: [] }),
      remove: () => Promise.resolve({ state: { servers: [] }, removed: true }),
      uninstallPlugin: () => Promise.resolve({ state: { servers: [] }, removed: true }),
      authenticate: () => Promise.resolve({ status: 'not-configured', serverName: '' }),
      renameAccount: () => Promise.resolve({ servers: [] }),
      removeAccount: () => Promise.resolve({ servers: [] }),
      setCustomInstructions: () => Promise.resolve({ servers: [] }),
      listServerTools: () => Promise.resolve([]),
      toggleToolDisabled: () => Promise.resolve([]),
      onAuthCompleted: listener,
    },
    experiments: { initialSnapshot: {}, getSnapshot: () => Promise.resolve({}), applyFeatureFlagOverride: () => Promise.resolve(), refresh: () => Promise.resolve(), startRpcTraceWindow: () => Promise.resolve(false), onChanged: listener },
    foreverBox: {
      forceRecreate: () => Promise.resolve(null),
      update: () => Promise.resolve(null),
      onVncUserPresence: listener,
      onDevBoxPullProgress: listener,
      egressTunnel: { initial: false, initialStatus: null, get: () => Promise.resolve(false), set: (v: boolean) => Promise.resolve(v), getStatus: () => Promise.resolve(null), onChanged: listener, onStatusChanged: listener },
      webauthnProxy: { initial: false, get: () => Promise.resolve(false), set: (v: boolean) => Promise.resolve(v), onChanged: listener },
    },
    // T26：onboarding 首见接 localStorage（先例 avatars.ts）——首启 false 触发 0.18 六步流程；
    // skip = 提前 seen（0.18 语义）。读失败按已见（不把老用户拖进引导）。
    onboarding: {
      getSeen: () => {
        try { return Promise.resolve(window.localStorage.getItem('pbots.shim.onboarding-seen') === '1') } catch { return Promise.resolve(true) }
      },
      setSeen: (v: boolean) => {
        try { window.localStorage.setItem('pbots.shim.onboarding-seen', v ? '1' : '0') } catch { /* 禁用/配额：丢了只会再看一遍引导 */ }
        return Promise.resolve()
      },
      onSkip: listener,
    },
    telemetry: new Proxy({}, { get: () => () => {} }) as unknown as DesktopBridge['telemetry'],
    timeZone: { get: () => Promise.resolve({ detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, overrideTimeZone: null }), setOverride: () => Promise.resolve({ detectedTimeZone: null, overrideTimeZone: null }) },
    autoReviewInstructions: { get: () => Promise.resolve({ isEnabled: false, allowInstructions: [], blockInstructions: [] }), set: (v) => Promise.resolve(v) },
    secrets: { list: () => Promise.resolve({ keys: [], isPersistent: false }), reveal: () => Promise.resolve(null), upsert: () => Promise.resolve({ synced: false }), remove: () => Promise.resolve({ synced: false }) },
    localToolPermission: {
      get: () => Promise.resolve('ask'),
      set: () => Promise.resolve('ask'),
      ceiling: () => Promise.resolve('ask'),
      recordApproval: () => Promise.resolve(),
      clearApprovals: () => Promise.resolve(),
    },
    agent: {
      getPinnedAgents: () => Promise.resolve(readPinned()),
      setPinnedAgents: (ids: readonly string[]) => {
        try { store.setItem(pinnedKey, JSON.stringify([...ids])) } catch { /* 私有模式等：静默 */ }
        return Promise.resolve([...ids])
      },
      getSidebarSections: () => Promise.resolve((opts.sidebarSections?.() ?? null) as never),
      // P6-15：有 worker 时 sections 只由 createdBy 推导，写入一律回推导值（fail closed，用户不能把 bot 拖进 worker 组）；
      // 无 worker 时与此前一致（原样回）
      setSidebarSections: (s: readonly unknown[]) => Promise.resolve((opts.sidebarSections?.() ?? s) as never),
      getDefaultModel: () => Promise.resolve(null),
      setDefaultModel: (m) => Promise.resolve(m),
      getComputerUseModel: () => Promise.resolve(null),
      setComputerUseModel: (m) => Promise.resolve(m),
      getAvailableModels: () => Promise.resolve([]),
      clientPersistence: {
        read: (key: string) => (opts.persistenceGate ?? Promise.resolve())
          .then(() => new Promise<void>((r) => setTimeout(r, 0))) // 让 client.ready 的 then（++世代）先跑完
          .then(() => persisted(key)),
        write: (key: string, value: string) => { persist(key, value); return Promise.resolve() },
        remove: (key: string) => { persist(key, null); return Promise.resolve() },
        listKeys: (prefix: string) => Promise.resolve(Object.keys(store).filter((k) => k.startsWith(`pbots.shim.${prefix}`)).map((k) => k.slice('pbots.shim.'.length))),
        migrateFromLocalStorage: () => Promise.resolve(false),
      },
    },
    onFocusAgent: opts.onFocusAgent ?? listener,
    onDeepLink: listener,
    deepLinksReady: () => Promise.resolve(),
    getBoxMigrationStatus: () => Promise.resolve(null),
    onBoxMigration: listener,
    onDevBoxRebuild: listener,
    onOpenFeedback: listener,
    onOpenAbout: listener,
    submitFeedback: () => Promise.resolve(null),
    onWidgetGallery: listener,
    onForceOnboarding: listener,
    transcribeAudio: () => Promise.resolve({ text: '' }),
    forceGatewayReconnect: () => Promise.resolve(),
    pickAvatarSource: () => Promise.resolve(null),
    pickAvatarFile: () => Promise.resolve(null),
    generateAgentAvatarImage: () => Promise.resolve(''),
    resolveAttachmentMedia: () => Promise.resolve(null),
    readAttachmentText: () => Promise.resolve(null),
    readAttachmentBytes: () => Promise.resolve(null),
    downloadAttachment: () => Promise.resolve(true),
    getLinkMetadata: () => Promise.resolve(null),
    // P5-54：外链实底 = window.open → main setWindowOpenHandler（只把 http(s) 交 shell.openExternal、恒拒新窗，U-00 门控）
    openExternal: (url: string) => {
      try { if (['http:', 'https:'].includes(new URL(url).protocol)) win.open(url, '_blank', 'noopener') } catch { /* 非法 URL：忽略 */ }
      return Promise.resolve()
    },
    openCloudAgent: () => Promise.resolve(),
    stageAttachmentBytes: () => Promise.resolve({ ok: false, reason: 'failed' }),
    commitStagedAttachments: () => Promise.resolve(null),
    discardStagedAttachment: () => Promise.resolve(),
    attachProdBox: { getStatus: () => Promise.resolve(null), setEnabled: () => Promise.resolve(null) },
    devRestart: () => Promise.resolve(),
  }
}
