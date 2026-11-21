// P5-53 对照台 · 0.18 移植树桩（协议 v1）。
// 来源: work/p5-parity/evidence/s0-portability/stub-init.js（S0 首通产物）泛化：
// fixture 数据改由 window.__FIXTURE__（驱动在注入本脚本前内联）提供；
// 桥面形状全部沿用 S0（RE-s0-portability.md §桩清单）：
//   - window.desktop 是扁平桥（非 desktop.main.*），启动校验 5 键，getTeachRecordingStatus 形状敏感
//   - transcript 填充走事件：openAgentTail 回值后同步推 transcript snapshot（绕开 openAgent 世代竞态）
//   - 侧栏布局走 agent.clientPersistence 的 'sand.client.slice.ui-layout'（schema 3 信封）
(() => {
  const FX = window.__FIXTURE__;
  const logs = [];
  const counts = new Map();
  const log = (kind, detail) => {
    const line = `[STUB] ${kind} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    const n = (counts.get(line) || 0) + 1;
    counts.set(line, n);
    if (n === 1) { logs.push(line); }
  };
  window.__stubLogs = logs;
  window.__stubCounts = counts;

  const theme0 = FX?.theme === 'dark' || new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  let THEME = { preference: theme0, resolved: theme0 };
  window.__setTheme = (a) => { THEME = { preference: a, resolved: a }; };

  const unsub = () => () => {};
  const listener = (ns, name) => (...a) => { log(`${ns}.${name}`, a.length ? a : ''); return unsub(); };
  const wrapNs = (ns, impl) => new Proxy(impl, {
    get(t, m) {
      if (m === 'then' || m === 'toJSON' || typeof m === 'symbol') return undefined;
      if (m in t) {
        const v = t[m];
        if (typeof v === 'function') return (...a) => { log(`${ns}.${String(m)}`, a.length ? a : ''); return v(...a); };
        return v;
      }
      return (...a) => { log(`${ns}.${String(m)}(unimplemented)`, a.length ? a : ''); return Promise.resolve(undefined); };
    },
  });

  const AGENTS = FX?.agents ?? [];
  const ENTRIES = FX?.entriesByAgent ?? {};
  const AUTH = { kind: 'logged-in', authId: 'stub-auth', email: 'dev@stub.local', displayName: 'Stub Dev', profilePictureUrl: null, isAnysphereUser: true };
  const UPDATE_STATUS = {
    state: { type: 'disabled', reason: 'not-packaged' }, currentVersion: '0.18.0-compare', currentTrack: 'stable',
    trackOverride: null, buildDefaultTrack: 'stable', availableTracks: ['stable'], isTrackManagedByPolicy: false,
    isBelowMinimumVersion: false, autoUpdateWhenIdleOptIn: false, autoUpdateWhenIdleGateEnabled: false,
  };
  const THEME_NS = { initial: THEME, get: () => Promise.resolve(THEME), set: (p) => Promise.resolve({ preference: p, resolved: p === 'system' ? 'light' : p }), onChanged: listener('theme', 'onChanged') };

  window.desktop = new Proxy({
    platform: 'darwin', isDev: false,
    getZoomFactor: () => 1,
    openExternal: () => Promise.resolve(),
    openCloudAgent: () => Promise.resolve(),
    getWindowState: () => Promise.resolve({ isFullscreen: false, isMaximized: true }),
    onWindowStateEvent: listener('desktop', 'onWindowStateEvent'),
    onZoomFactorEvent: listener('desktop', 'onZoomFactorEvent'),
    onFocusAgent: listener('desktop', 'onFocusAgent'),
    onDeepLink: listener('desktop', 'onDeepLink'),
    deepLinksReady: () => Promise.resolve(),
    getBoxMigrationStatus: () => Promise.resolve(null),
    onBoxMigration: listener('desktop', 'onBoxMigration'),
    onDevBoxRebuild: listener('desktop', 'onDevBoxRebuild'),
    onOpenFeedback: listener('desktop', 'onOpenFeedback'),
    onOpenAbout: listener('desktop', 'onOpenAbout'),
    onWidgetGallery: listener('desktop', 'onWidgetGallery'),
    onForceOnboarding: listener('desktop', 'onForceOnboarding'),
    submitFeedback: () => Promise.resolve(null),
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
    stageAttachmentBytes: () => Promise.resolve({ ok: false, reason: 'failed' }),
    commitStagedAttachments: () => Promise.resolve(null),
    discardStagedAttachment: () => Promise.resolve(),
    theme: wrapNs('theme', THEME_NS),
    cursorAccount: wrapNs('cursorAccount', {
      getStatus: () => Promise.resolve(AUTH), login: () => Promise.resolve(AUTH), cancelLogin: () => Promise.resolve(AUTH),
      logout: () => Promise.resolve({ kind: 'logged-out' }), updateName: () => Promise.resolve(AUTH),
      getAvatar: () => Promise.resolve(null), getWeeklyUsage: () => Promise.resolve(null),
      getUsageSummary: () => Promise.resolve(null), getPrReviewPreferences: () => Promise.resolve(null),
      getPrivacyModeEnabled: () => Promise.resolve(null),
      getSandAccess: () => Promise.resolve({ state: 'granted' }), getSandAccessFresh: () => Promise.resolve({ state: 'granted' }),
      invokeDashboardAction: () => Promise.resolve(null), cancelTrial: () => Promise.resolve(null),
      onStatusChanged: listener('cursorAccount', 'onStatusChanged'),
    }),
    mcp: wrapNs('mcp', {
      list: () => Promise.resolve({ servers: [] }), effectivePlugins: () => Promise.resolve([]),
      catalog: () => Promise.resolve([]), teamPopularity: () => Promise.resolve({}),
      pluginLogo: () => Promise.resolve(null), install: () => Promise.resolve({ servers: [] }),
      updatePluginInstall: () => Promise.resolve({ servers: [] }), remove: () => Promise.resolve({ state: { servers: [] }, removed: true }),
      uninstallPlugin: () => Promise.resolve({ state: { servers: [] }, removed: true }),
      authenticate: () => Promise.resolve({ status: 'not-configured', serverName: '' }),
      renameAccount: () => Promise.resolve({ servers: [] }), removeAccount: () => Promise.resolve({ servers: [] }),
      setCustomInstructions: () => Promise.resolve({ servers: [] }),
      listServerTools: () => Promise.resolve([]), toggleToolDisabled: () => Promise.resolve([]),
      onAuthCompleted: listener('mcp', 'onAuthCompleted'),
    }),
    update: wrapNs('update', {
      getStatus: () => Promise.resolve(UPDATE_STATUS), check: () => Promise.resolve(UPDATE_STATUS),
      setTrack: () => Promise.resolve(UPDATE_STATUS), quitAndInstall: () => Promise.resolve(),
      setAutoUpdateWhenIdleOptIn: () => Promise.resolve(UPDATE_STATUS),
      onStatusEvent: listener('update', 'onStatusEvent'),
    }),
    experiments: wrapNs('experiments', {
      initialSnapshot: {}, getSnapshot: () => Promise.resolve({}), applyFeatureFlagOverride: () => Promise.resolve(),
      refresh: () => Promise.resolve(), startRpcTraceWindow: () => Promise.resolve(false),
      onChanged: listener('experiments', 'onChanged'),
    }),
    foreverBox: wrapNs('foreverBox', {
      forceRecreate: () => Promise.resolve(null), update: () => Promise.resolve(null),
      onVncUserPresence: listener('foreverBox', 'onVncUserPresence'),
      onDevBoxPullProgress: listener('foreverBox', 'onDevBoxPullProgress'),
      egressTunnel: wrapNs('foreverBox.egressTunnel', {
        initial: false, initialStatus: null, get: () => Promise.resolve(false), set: (v) => Promise.resolve(v),
        getStatus: () => Promise.resolve(null),
        onChanged: listener('egressTunnel', 'onChanged'), onStatusChanged: listener('egressTunnel', 'onStatusChanged'),
      }),
      webauthnProxy: wrapNs('foreverBox.webauthnProxy', {
        initial: false, get: () => Promise.resolve(false), set: (v) => Promise.resolve(v),
        onChanged: listener('webauthnProxy', 'onChanged'),
      }),
    }),
    onboarding: wrapNs('onboarding', { getSeen: () => Promise.resolve(true), setSeen: () => Promise.resolve(), onSkip: listener('onboarding', 'onSkip') }),
    telemetry: wrapNs('telemetry', new Proxy({}, { get: () => () => {} })),
    timeZone: wrapNs('timeZone', { get: () => Promise.resolve({ detectedTimeZone: 'UTC', overrideTimeZone: null }), setOverride: () => Promise.resolve({ detectedTimeZone: 'UTC', overrideTimeZone: null }) }),
    autoReviewInstructions: wrapNs('autoReviewInstructions', { get: () => Promise.resolve({ isEnabled: false, allowInstructions: [], blockInstructions: [] }), set: (v) => Promise.resolve(v) }),
    localToolPermission: wrapNs('localToolPermission', {
      get: () => Promise.resolve(null), set: (v) => Promise.resolve(v), ceiling: () => Promise.resolve(null),
      recordApproval: () => Promise.resolve(), clearApprovals: () => Promise.resolve(),
    }),
    secrets: wrapNs('secrets', { list: () => Promise.resolve({ keys: [], isPersistent: false }), reveal: () => Promise.resolve(null), upsert: () => Promise.resolve({ synced: false }), remove: () => Promise.resolve({ synced: false }) }),
    agent: wrapNs('agent', {
      getPinnedAgents: () => Promise.resolve([]), setPinnedAgents: (ids) => Promise.resolve(ids),
      getSidebarSections: () => Promise.resolve(null), setSidebarSections: (s) => Promise.resolve(s),
      getDefaultModel: () => Promise.resolve(null), setDefaultModel: (m) => Promise.resolve(m),
      getComputerUseModel: () => Promise.resolve(null), setComputerUseModel: (m) => Promise.resolve(m),
      getAvailableModels: () => Promise.resolve([]),
      clientPersistence: wrapNs('agent.clientPersistence', {
        read: (...a) => {
          const raw = a?.[0];
          const key = typeof raw === 'string' ? raw : String(raw?.key ?? ''); // 实参是位置参数 key（P5-53 实测）
          log('agent.clientPersistence.read-key', key);
          if (key === FX?.layout?.uiLayoutKey) return Promise.resolve(FX.layout.uiLayoutValue);
          return Promise.resolve(null);
        },
        write: () => Promise.resolve(), remove: () => Promise.resolve(),
        listKeys: () => Promise.resolve([]), migrateFromLocalStorage: () => Promise.resolve(false),
      }),
    }),
    windowControls: wrapNs('windowControls', { minimize: () => Promise.resolve(), toggleMaximize: () => Promise.resolve(), close: () => Promise.resolve(), setTitleBarOverlayTone: () => Promise.resolve(), resizeWidth: (d) => Promise.resolve(360 + d) }),
    attachProdBox: wrapNs('attachProdBox', { getStatus: () => Promise.resolve(null), setEnabled: () => Promise.resolve(null) }),
    devRestart: () => Promise.resolve(),
  }, {
    get(t, m) {
      if (m === 'then' || m === 'toJSON' || typeof m === 'symbol') return undefined;
      if (m in t) {
        const v = t[m];
        if (typeof v === 'function') { return (...a) => { log(`desktop.${String(m)}`, a.length ? a : ''); return v(...a); }; }
        return v;
      }
      log(`desktop.${String(m)}(MISSING)`);
      return (...a) => Promise.resolve(undefined);
    },
  });

  // ---- fake coordinator（协议 v1）----
  const COORD = {
    listAgents: AGENTS,
    countAgents: AGENTS.length,
    searchAgents: (a) => { const q = String(a?.query || '').toLowerCase(); return AGENTS.filter((x) => x.name.toLowerCase().includes(q)); },
    openAgentTail: (a) => ({ entries: ENTRIES[a?.id] ?? [], nextBeforeSeq: null }),
    getAgentTranscriptTail: (a) => ({ entries: ENTRIES[a?.id] ?? [], nextBeforeSeq: null }),
    getAgentTranscriptWindow: (a) => ({ entries: ENTRIES[a?.id] ?? [], nextBeforeSeq: null, threadCounts: {} }),
    getAgentThread: (a) => ({ entries: ENTRIES[a?.id] ?? [] }),
    sendPrompt: () => { window.__sendPromptSeen = (window.__sendPromptSeen || 0) + 1; return { accepted: true }; },
    promptAcceptanceStatus: () => ({ status: 'accepted' }),
    getTrays: [], dismissTray: null, clearTrays: null,
    getSubagents: [], getAsyncTasks: [], getAgentWorkflows: [], listAllAutomations: [],
    getForeverBoxStatus: null, ensureForeverBox: null, handBackForeverBox: null,
    getTeachRecordingStatus: { state: 'idle', agentId: null, startedAtMs: null, maxDurationMs: 600000 },
    getConversationOutline: [],
    isAgentNetworkEnabled: false, isGlobalSearchEnabled: false, isEgressTunnelAvailable: false,
    getSharingState: null,
    getAgentAutomations: [], getListenerIntegrations: {}, skillsCatalog: [], listRoutedMcpTools: [],
    searchMedia: [], getCloudAgentInfo: null,
  };
  let coordPort = null;
  const queue = [];
  const flush = () => { while (coordPort && queue.length) { const e = queue.shift(); coordPort.postMessage({ kind: 'event', family: e.family, payload: e.payload }); } };
  window.__pushCoordEvent = (family, payload) => { queue.push({ family, payload }); flush(); };

  window.coordinatorPort = {
    claim(holder) {
      log('coordinatorPort.claim');
      return {
        request() {
          const mc = new MessageChannel();
          coordPort = mc.port1;
          coordPort.onmessage = (ev) => {
            const f = ev.data;
            if (f?.kind === 'lifecycle' && f.phase === 'hello') {
              coordPort.postMessage({ kind: 'lifecycle', phase: 'ready', protocolVersion: f.protocolVersion });
              flush();
            } else if (f?.kind === 'request') {
              let v;
              const entry = COORD[f.method];
              try { v = typeof entry === 'function' ? entry(f.args || {}) : entry; }
              catch (e) { log('coord.value-fn-error', `${f.method}: ${e}`); v = undefined; }
              coordPort.postMessage({ kind: 'reply', requestId: f.requestId, outcome: { status: 'ok', value: v === undefined ? null : v } });
              if (['openAgentTail', 'getAgentTranscriptTail', 'getAgentTranscriptWindow'].includes(f.method) && f.args?.id) {
                window.__pushCoordEvent('transcript', { type: 'snapshot', activeAgentId: f.args.id, entries: ENTRIES[f.args.id] ?? [] });
              }
            } else if (f?.kind === 'cancel') {
              // no-op
            }
          };
          try { holder.onPort && holder.onPort(mc.port2); } catch (e) { log('onPort.error', String(e)); }
        },
        release() { log('coordinatorPort.release'); },
      };
    },
  };

  window.addEventListener('error', (e) => log('window.error', `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => log('unhandledrejection', String(e.reason?.stack || e.reason).slice(0, 1400)));
  window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });
  window.location.reload = () => log('location.reload', 'blocked');
  log('stub-installed');
})();
