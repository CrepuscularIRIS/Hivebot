// P5-51 · window.desktop 扁平桥（0.18 preload 形状，非 0.78.1 的 desktop.main.*）。
// 实底清单 = RE-s0 run-stublogs（启动必需 + 旅程外按需）；其余方法返回空/能力关。
// localToolPermission：ceiling 恒 "ask" → 上游 ceilingBlocksAlways 把「Always allow」禁用
// （P5-31 v3：L-AP 语义由 shim 下发，不改上游文件）；set("always") 拒存回 "ask" →
// 上游 resolveLocalToolPermissionAction 检测 stored!==requested 自动降级 allow-once（view.tsx:92-97）。
import type { DesktopBridge, ThemeState, Unsubscribe } from '../../frontend/src/recovered/contracts/desktop-bridge'

export interface DesktopOptions {
  /** 账户槽（cursorAccount.getStatus().authId）——审批卡 permissionScope 与之同值。 */
  authId: string
  platform?: NodeJS.Platform
  appVersion?: string
}

type AnyWindow = Window & { matchMedia(q: string): { matches: boolean; addEventListener(type: string, l: () => void): void } }

const noUnsub: Unsubscribe = () => {}
const listener = (): Unsubscribe => noUnsub

export function createDesktopBridge(win: AnyWindow, opts: DesktopOptions): DesktopBridge {
  const store = win.localStorage
  const persisted = (key: string): string | null => { try { return store.getItem(`pbots.shim.${key}`) } catch { return null } }
  const persist = (key: string, value: string | null): void => {
    try { if (value === null) store.removeItem(`pbots.shim.${key}`); else store.setItem(`pbots.shim.${key}`, value) } catch { /* 私有模式等：静默 */ }
  }

  let permission: 'ask' | 'never' = 'ask'
  const themeListeners = new Set<(state: ThemeState) => void>()
  let theme: ThemeState = { preference: 'system', resolved: win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }

  const auth: DesktopBridge['cursorAccount']['getStatus'] extends () => Promise<infer T> ? T : never = {
    kind: 'logged-in', authId: opts.authId, email: `${opts.authId}@pbots.local`, displayName: 'Pbots', isAnysphereUser: false,
  }
  const updateStatus: DesktopBridge['update'] extends object ? Awaited<ReturnType<DesktopBridge['update']['getStatus']>> : never = {
    state: { type: 'disabled', reason: 'not-packaged' },
    currentVersion: opts.appVersion ?? '0.0.0-pbots',
    currentTrack: 'stable', trackOverride: null, buildDefaultTrack: 'stable', availableTracks: ['stable'],
    isTrackManagedByPolicy: false, isBelowMinimumVersion: false, autoUpdateWhenIdleOptIn: false, autoUpdateWhenIdleGateEnabled: false,
  }

  return {
    platform: opts.platform ?? 'linux',
    isDev: false,
    getZoomFactor: () => 1,
    onZoomFactorEvent: listener,
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
        for (const l of [...themeListeners]) l(theme)
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
    onboarding: { getSeen: () => Promise.resolve(true), setSeen: () => Promise.resolve(), onSkip: listener },
    telemetry: new Proxy({}, { get: () => () => {} }) as unknown as DesktopBridge['telemetry'],
    timeZone: { get: () => Promise.resolve({ detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, overrideTimeZone: null }), setOverride: () => Promise.resolve({ detectedTimeZone: null, overrideTimeZone: null }) },
    autoReviewInstructions: { get: () => Promise.resolve({ isEnabled: false, allowInstructions: [], blockInstructions: [] }), set: (v) => Promise.resolve(v) },
    secrets: { list: () => Promise.resolve({ keys: [], isPersistent: false }), reveal: () => Promise.resolve(null), upsert: () => Promise.resolve({ synced: false }), remove: () => Promise.resolve({ synced: false }) },
    localToolPermission: {
      get: () => Promise.resolve(permission),
      set: (v: unknown) => {
        // 拒存 always（D9/L-AP：始终允许不进 renderer 侧授权）；never 生效到本 renderer 会话
        if (v === 'never') permission = 'never'
        return Promise.resolve(permission)
      },
      ceiling: () => Promise.resolve('ask'),
      recordApproval: () => Promise.resolve(),
      clearApprovals: () => { permission = 'ask'; return Promise.resolve() },
    },
    agent: {
      getPinnedAgents: () => Promise.resolve([]),
      setPinnedAgents: (ids: readonly string[]) => Promise.resolve([...ids]),
      getSidebarSections: () => Promise.resolve(null),
      setSidebarSections: (s: readonly unknown[]) => Promise.resolve(s as never),
      getDefaultModel: () => Promise.resolve(null),
      setDefaultModel: (m) => Promise.resolve(m),
      getComputerUseModel: () => Promise.resolve(null),
      setComputerUseModel: (m) => Promise.resolve(m),
      getAvailableModels: () => Promise.resolve([]),
      clientPersistence: {
        read: (key: string) => Promise.resolve(persisted(key)),
        write: (key: string, value: string) => { persist(key, value); return Promise.resolve() },
        remove: (key: string) => { persist(key, null); return Promise.resolve() },
        listKeys: (prefix: string) => Promise.resolve(Object.keys(store).filter((k) => k.startsWith(`pbots.shim.${prefix}`)).map((k) => k.slice('pbots.shim.'.length))),
        migrateFromLocalStorage: () => Promise.resolve(false),
      },
    },
    onFocusAgent: listener,
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
    openExternal: () => Promise.resolve(),
    openCloudAgent: () => Promise.resolve(),
    stageAttachmentBytes: () => Promise.resolve({ ok: false, reason: 'failed' }),
    commitStagedAttachments: () => Promise.resolve(null),
    discardStagedAttachment: () => Promise.resolve(),
    attachProdBox: { getStatus: () => Promise.resolve(null), setEnabled: () => Promise.resolve(null) },
    devRestart: () => Promise.resolve(),
  }
}
