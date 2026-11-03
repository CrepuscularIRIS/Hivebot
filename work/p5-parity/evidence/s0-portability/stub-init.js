// S0 stub for the 0.18 reconstructed renderer (frontend build).
// Injected via Page.addScriptToEvaluateOnNewDocument before the bundle loads.
// Flat window.desktop bridge (0.18 shape, NOT desktop.main.*) + coordinator fake speaking protocol v1.
// Every desktop method call and coordinator frame is logged into window.__stubLogs (deduped, with counts).
(() => {
  const logs = [];
  const counts = new Map();
  const log = (kind, detail) => {
    const line = `[STUB] ${kind} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    const n = (counts.get(line) || 0) + 1;
    counts.set(line, n);
    if (n === 1) { logs.push(line); console.log(line); }
    else if (n === 2 || n === 10 || n === 50 || n === 200) console.log(line + ` x${n}`);
  };
  window.__stubLogs = logs;
  window.__stubCounts = counts;

  const qs = new URLSearchParams(location.search);
  const theme0 = qs.get('theme') === 'dark' ? 'dark' : 'light';
  let THEME = { preference: theme0, resolved: theme0 };
  window.__setTheme = (a) => { THEME = { preference: a, resolved: a }; };

  const unsub = () => () => {};
  const listener = (ns, name) => (...a) => { log(`${ns}.${name}`, a.length ? a : ''); return unsub(); };

  // Wrap a plain implementation object: every function logs calls, unknown props get logging async stubs.
  const wrapNs = (ns, impl) => new Proxy(impl, {
    get(t, m) {
      if (m === 'then' || m === 'toJSON' || typeof m === 'symbol') return undefined;
      if (m in t) {
        const v = t[m];
        if (typeof v === 'function') {
          return (...a) => { log(`${ns}.${String(m)}`, a.length ? a : ''); const r = v(...a); return r; };
        }
        return v;
      }
      return (...a) => { log(`${ns}.${String(m)}(unimplemented)`, a.length ? a : ''); return Promise.resolve(undefined); };
    },
  });

  const now = Date.now();
  const mkAgent = (id, name, extra = {}) => ({
    id, name, description: `${name} — S0 fixture`, path: `/agents/${id}`,
    createdAt: now - 86400000 * 7, updatedAt: now - 60000,
    hasUnread: false, notificationsEnabled: true, notifyOnUpdatesEnabled: false,
    isGroup: false, origin: 'user', lastMessageId: null, lastEntry: null,
    awaitingUserResponse: null, memberIds: [], conversationPartnerIds: [],
    color: null, shape: null, dataUrl: null, currentActivity: null, isRunning: false,
    isPinned: false, isMain: false, ...extra,
  });
  const AGENTS = [
    mkAgent('ag_main', 'Main Bot', { isMain: true, color: '#1084fe' }),
    mkAgent('ag_research', 'Research Bot', { hasUnread: true, currentActivity: { kind: 'thinking' } }),
    mkAgent('ag_ops', 'Ops Bot', { currentActivity: { verb: 'coding' } }),
  ];
  const t0 = now - 3600_000;
  const mkEntries = (agentId, seq0) => ([
    { kind: 'send-message', id: `${agentId}-e10`, seq: seq0 + 10, timestampMs: t0 + 1000, message: { type: 'text', content: 'Check the quarterly numbers in ~/q3 and summarize the deltas.' } },
    { kind: 'thinking', id: `${agentId}-e10b`, seq: seq0 + 11, timestampMs: t0 + 2000, text: 'The user wants a quarterly delta summary. I should list ~/q3, read the spreadsheets, compute deltas, and present the biggest movers.', durationMs: 4200 },
    { kind: 'tool-call', id: `${agentId}-e11`, seq: seq0 + 12, timestampMs: t0 + 4000, name: 'bash', status: 'done', summary: 'python analyze.py --quarter q3' },
    { kind: 'tool-call', id: `${agentId}-e12`, seq: seq0 + 13, timestampMs: t0 + 9000, name: 'read', status: 'done', summary: 'read ~/q3/summary.md' },
    { kind: 'message', id: `${agentId}-e13`, seq: seq0 + 14, timestampMs: t0 + 15000, role: 'assistant', author: 'Research Bot', content: 'Revenue is up **12%** QoQ. Biggest movers:\n- Subscriptions +18%\n- Churn -2pts\n\n```python\nprint(top_movers(q3))\n```\nFull breakdown below.' },
    { kind: 'send-message', id: `${agentId}-e14`, seq: seq0 + 15, timestampMs: t0 + 20000, message: { type: 'local-tool-permission', ask: { status: 'pending', requestId: `req-${agentId}`, action: { kind: 'run-command', command: 'pip install pandas' }, target: { kind: 'local-computer' } } } },
  ]);

  const AUTH = { kind: 'logged-in', authId: 'stub-auth', email: 'dev@stub.local', displayName: 'Stub Dev', profilePictureUrl: null, isAnysphereUser: true };
  const UPDATE_STATUS = {
    state: { type: 'disabled', reason: 'not-packaged' }, currentVersion: '0.18.0-s0', currentTrack: 'stable',
    trackOverride: null, buildDefaultTrack: 'stable', availableTracks: ['stable'], isTrackManagedByPolicy: false,
    isBelowMinimumVersion: false, autoUpdateWhenIdleOptIn: false, autoUpdateWhenIdleGateEnabled: false,
  };
  const THEME_NS = { initial: THEME, get: () => Promise.resolve(THEME), set: (p) => Promise.resolve({ preference: p, resolved: p === 'system' ? 'light' : p }), onChanged: listener('theme', 'onChanged') };

  window.desktop = new Proxy({
    // sync values
    platform: 'darwin', isDev: false,
    getZoomFactor: () => { log('desktop.getZoomFactor'); return 1; },
    openExternal: (...a) => { log('desktop.openExternal', a); return Promise.resolve(); },
    openCloudAgent: (...a) => { log('desktop.openCloudAgent', a); return Promise.resolve(); },
    getWindowState: () => { log('desktop.getWindowState'); return Promise.resolve({ isFullscreen: false, isMaximized: true }); },
    onWindowStateEvent: listener('desktop', 'onWindowStateEvent'),
    onZoomFactorEvent: listener('desktop', 'onZoomFactorEvent'),
    onFocusAgent: listener('desktop', 'onFocusAgent'),
    onDeepLink: listener('desktop', 'onDeepLink'),
    deepLinksReady: () => { log('desktop.deepLinksReady'); return Promise.resolve(); },
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
    telemetry: wrapNs('telemetry', new Proxy({}, { get: () => (...a) => { log('telemetry.report', a[0] && a[0].kind ? a[0].kind : ''); } })),
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
        read: () => Promise.resolve(null), write: () => Promise.resolve(), remove: () => Promise.resolve(),
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

  // ---- fake coordinator, protocol v1 ----
  const COORD = {
    listAgents: AGENTS,
    countAgents: AGENTS.length,
    searchAgents: (a) => { const q = String(a?.query || '').toLowerCase(); return AGENTS.filter((x) => x.name.toLowerCase().includes(q)); },
    openAgentTail: (a) => ({ entries: mkEntries(a?.id || 'x', 0), nextBeforeSeq: null }),
    getAgentTranscriptTail: (a) => ({ entries: mkEntries(a?.id || 'x', 0), nextBeforeSeq: null }),
    getAgentTranscriptWindow: (a) => ({ entries: mkEntries(a?.id || 'x', 0), nextBeforeSeq: null, threadCounts: {} }),
    getAgentThread: (a) => ({ entries: mkEntries(a?.id || 'x', 0) }),
    sendPrompt: (a) => { log('sendPrompt.payload', { agentId: a?.agentId, text: a?.text ?? a?.message ?? a, keys: Object.keys(a || {}) }); window.__sendPromptSeen = (window.__sendPromptSeen || 0) + 1; return { accepted: true }; },
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
  const flush = () => { while (coordPort && queue.length) { const e = queue.shift(); log('coord.event.push', e.family); coordPort.postMessage({ kind: 'event', family: e.family, payload: e.payload }); } };
  window.__pushCoordEvent = (family, payload) => { queue.push({ family, payload }); flush(); };

  window.coordinatorPort = {
    claim(holder) {
      log('coordinatorPort.claim');
      return {
        request() {
          log('coordinatorPort.request');
          const mc = new MessageChannel();
          coordPort = mc.port1;
          coordPort.onmessage = (ev) => {
            const f = ev.data;
            if (f?.kind === 'lifecycle' && f.phase === 'hello') {
              log('coord.hello', `v${f.protocolVersion}`);
              coordPort.postMessage({ kind: 'lifecycle', phase: 'ready', protocolVersion: f.protocolVersion });
              flush();
            } else if (f?.kind === 'request') {
              log('coord.request', `${f.method} ${JSON.stringify(f.args)?.slice(0, 260)}`);
              let v;
              const entry = COORD[f.method];
              try { v = typeof entry === 'function' ? entry(f.args || {}) : entry; }
              catch (e) { log('coord.value-fn-error', `${f.method}: ${e}`); v = undefined; }
              coordPort.postMessage({ kind: 'reply', requestId: f.requestId, outcome: { status: 'ok', value: v === undefined ? null : v } });
              if (['openAgentTail', 'getAgentTranscriptTail', 'getAgentTranscriptWindow'].includes(f.method) && f.args?.id) {
                window.__pushCoordEvent('transcript', { type: 'snapshot', activeAgentId: f.args.id, entries: mkEntries(f.args.id, 0) });
              }
            } else if (f?.kind === 'cancel') {
              log('coord.cancel', f.requestId);
            } else {
              log('coord.frame', JSON.stringify(f)?.slice(0, 300));
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
  window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; log('beforeunload', 'blocked'); });
  window.location.reload = () => log('location.reload', 'blocked');
  log('stub-installed');
})();
