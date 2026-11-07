// Injected before the app's scripts (Page.addScriptToEvaluateOnNewDocument).
// Stubs the Electron preload surface so the 0.78.1 renderer boots in a plain browser.
(() => {
  const logs = [];
  const seen = new Set();
  const log = (kind, detail) => {
    const line = `[STUB] ${kind} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    if (!seen.has(line)) { seen.add(line); logs.push(line); console.log(line); }
  };
  window.__stubLogs = logs;

  // Values for known desktop.main methods; everything else resolves undefined.
  let THEME = { preference: "light", resolved: "light" };
  if (new URLSearchParams(location.search).get("theme") === "dark") THEME = { preference: "dark", resolved: "dark" };
  window.__setTheme = (a) => { THEME = { preference: a, resolved: a }; };

  const MAIN_VALUES = {
    getSandAccess: { state: 'granted' },
    getSandAccessFresh: { state: 'granted' },
    getThemeState: () => THEME,
    getCursorAuthStatus: { kind: 'logged-in', authId: 'stub-auth', email: 'dev@stub.local', displayName: 'Stub Dev', profilePictureUrl: null, isAnysphereUser: true, isWorkAccount: false, profileReady: true },
    getCursorLoginFlight: { kind: 'idle' },
    getGrokBotTermsRecord: { seenAtMs: 1 },
    getOnboardingSeen: true,
    getServerPinnedAgents: [],
    listSecrets: [],
    getHostSidebarSections: { sections: [], base: [] },
    getHostPinnedAgents: [],
    getSandMachines: { machines: [], currentMachineRemoved: false },
    getCredentialsState: { credentials: [] },
    getLanguageState: () => ({ preference: 'system', systemLanguage: 'en', resolved: 'en' }),
    getCursorSelectedTeam: { fallback: null, selectedTeamId: undefined },
    getWindowState: { isFullscreen: false, isMaximized: true },
    isWindowShown: true,
    readClientPersistence: (...a) => {
      const key = String(a?.[0]?.key ?? '');
      return key.endsWith('client-meta.account-slot') ? JSON.stringify({ schemaVersion: 1, value: 'stub-auth' }) : null;
    },
    readManyClientPersistence: (...a) => {
      const inc = a?.[0]?.include ?? [];
      const out = {};
      if (inc.some((k) => k === 'sand.' || k === 'sand.client.slice.client-meta.account-slot')) {
        out['sand.client.slice.client-meta.account-slot'] = JSON.stringify({ schemaVersion: 1, value: 'stub-auth' });
      }
      return out;
    },
    listClientPersistenceKeys: [],
  };

  const eventHandlers = new Map(); // name -> Set(fn)
  window.__pushEvent = (name, payload) => {
    const set = eventHandlers.get(name);
    if (!set) { log('pushEvent.no-subscriber', name); return false; }
    for (const fn of set) { try { fn(payload); } catch (e) { log('pushEvent.error', `${name}: ${e}`); } }
    return true;
  };

  const proxy = (ns, extra = {}) =>
    new Proxy({ ...extra }, {
      get(t, m) {
        if (m === 'then' || m === 'toJSON' || typeof m === 'symbol') return undefined;
        if (m in t) return t[m];
        return (...a) => {
          if (ns === 'main' && m === 'subscribe' && a[0] && typeof a[0] === 'object') {
            for (const [name, fn] of Object.entries(a[0])) {
              if (typeof fn !== 'function') continue;
              if (!eventHandlers.has(name)) eventHandlers.set(name, new Set());
              eventHandlers.get(name).add(fn);
            }
            log('main.subscribe', Object.keys(a[0]).join(','));
            return { dispose: () => { for (const fn of Object.values(a[0])) for (const s of eventHandlers.values()) s.delete(fn); } };
          }
          log(ns + '.' + String(m), a.length ? a : '');
          let v = MAIN_VALUES[m];
          if (typeof v === 'function') { try { v = v(...a); } catch (e) { log('main.value-fn-error', String(e)); v = undefined; } }
          return Promise.resolve(v);
        };
      },
    });

  window.desktop = {
    main: proxy('main'),
    boot: {
      theme: THEME, language: { preference: "system", systemLanguage: "en", resolved: "en" }, isEgressTunnelEnabled: false,
    },
    local: {
      getZoomFactor: () => 1,
      stageAttachmentFile: (...a) => { log('local.stageAttachmentFile', a); return Promise.resolve(undefined); },
      noteRendererAlive: () => {},
      noteBootGateLanded: () => { log('local.noteBootGateLanded'); },
      noteBootGateOpened: () => { log('local.noteBootGateOpened'); },
    },
    environment: {
      platform: 'linux', isDev: false, isWaylandClient: false,
      usesProductionBackend: true, devVoiceHarness: 'package',
    },
  };

  // Fake coordinator: speaks the port protocol (hello->ready, request->reply, event push).
  window.__coordinatorEvents = []; // queued {family, payload} to push after ready
  const now = Date.now();
  const mkAgent = (id, name, extra = {}) => ({
    id, name, description: `${name} — fixture`,
    createdAtMs: now - 86400000, updatedAtMs: now - 60000,
    status: 'idle', serverId: `srv_${id}`, ...extra,
  });
  const AGENTS = [
    mkAgent('ag_main', 'Main Bot', { isMain: true }),
    mkAgent('ag_research', 'Research Bot'),
    mkAgent('ag_ops', 'Ops Bot'),
  ];
  const COORD_VALUES = {
    getServerAgentRoster: { status: 'enabled', agents: AGENTS, boxAgentCount: 0 },
    getHostStatus: { hostVersion: '0.78.1-stub', latestHostVersion: '0.78.1-stub', hostUpdateAvailable: false, isBusy: false, capabilities: [] },
    getMainAgent: { agentId: 'ag_main' },
    isEgressTunnelAvailable: false,
    getBotTemplateExportPolicy: { policy: 'allowed' },
    getTeachRecordingStatus: { recording: false },
    getTrays: [],
    countAgents: AGENTS.length,
    getSubagents: [],
    getAsyncTasks: [],
    getAgentWorkflows: [],
    getConversationOutline: [],
    getForeverBoxStatus: null,
    ensureForeverBox: null,
    handBackForeverBox: null,
    listAgents: AGENTS,
    openAgentTail: (a) => COORD_VALUES.getAgentTranscriptTail(a),
    getAgentTranscriptTail: () => {
      const t0 = now - 3600_000;
      const entries = [
        { id: 'e10', seq: 10, kind: 'message', role: 'user', content: 'Check the quarterly numbers in ~/q3 and summarize the deltas.', timestampMs: t0 + 1000, status: 'done' },
        // R-01 fixtures: widget / user-form question cards (payload shapes per chunk-view-BnT48mMZ / lxKSMA-f)
        { id: 'e15', seq: 11, kind: 'send-message', timestampMs: t0 + 2000,
          message: { type: 'widget',
            widget: { prompt: 'Which dataset should I use for the revenue forecast?',
              helpText: 'You can change this later.',
              options: [
                { label: 'Q3 actuals', description: 'Latest closed quarter' },
                { label: 'Q4 projections', description: 'Includes pending deals' },
                { label: 'Both, side by side' },
              ],
              allowCustom: true } } },
        { id: 'e16', seq: 12, kind: 'send-message', timestampMs: t0 + 4000,
          message: { type: 'widget',
            widget: { prompt: 'Which reports should the digest include?',
              multiSelect: true,
              options: [ { label: 'Revenue' }, { label: 'Churn' }, { label: 'Usage' } ],
              allowCustom: true } } },
        { id: 'e17', seq: 13, kind: 'send-message', timestampMs: t0 + 6000,
          message: { type: 'widget',
            widget: { prompt: 'Set up the weekly digest',
              steps: [
                { prompt: 'Which day should it go out?', options: [ { label: 'Monday' }, { label: 'Friday' } ] },
                { prompt: 'What format do you prefer?', options: [ { label: 'Bullet list' }, { label: 'Narrative' } ], allowCustom: true },
              ] } } },
        { id: 'e18', seq: 14, kind: 'send-message', timestampMs: t0 + 8000, respondedValue: 'Q3 actuals',
          message: { type: 'widget', widget: { prompt: 'Which dataset should I use?',
            options: [ { label: 'Q3 actuals' }, { label: 'Q4 projections' } ] } } },
        { id: 'e19', seq: 15, kind: 'send-message', timestampMs: t0 + 9000, widgetDismissed: true,
          message: { type: 'widget', widget: { prompt: 'Pick a theme for the deck',
            options: [ { label: 'Minimal' }, { label: 'Bold' } ] } } },
        { id: 'e20', seq: 16, kind: 'send-message', timestampMs: t0 + 10000,
          message: { type: 'user-form',
            formRequest: { title: 'Connect Notion',
              fields: [
                { id: 'email', label: 'Email', type: 'email', required: true },
                { id: 'api_token', label: 'API token', type: 'password', required: true },
                { id: 'remember', label: 'Keep the connection alive', type: 'checkbox' },
              ],
              domains: ['notion.so'] } } },
        { id: 'e11', seq: 17, kind: 'tool-call', name: 'bash', label: 'bash', summary: 'python analyze.py --quarter q3', status: 'completed', timestampMs: t0 + 12000, isRunning: false },
        { id: 'e12', seq: 18, kind: 'tool-call', name: 'read', label: 'read', summary: 'read ~/q3/summary.md', status: 'completed', timestampMs: t0 + 13000, isRunning: false },
        { id: 'e13', seq: 19, kind: 'message', role: 'assistant', content: 'Revenue is up **12%** QoQ. Biggest movers:\n- Subscriptions +18%\n- Churn -2pts\n\nFull breakdown below.', timestampMs: t0 + 14000, status: 'done' },
        { id: 'e14', seq: 20, kind: 'send-message', timestampMs: t0 + 15000,
          message: { type: 'local-tool-permission',
            ask: { status: 'pending', requestId: 'req-001',
                   description: 'pip install pandas — install a dependency to analyze the spreadsheet' } } },
      ];
      return { entries, nextBeforeSeq: null, cloudAgentPeerIds: [] };
    },
  };
  let coordPort = null;
  const coordReady = () => {
    for (const e of window.__coordinatorEvents.splice(0)) coordPort.postMessage({ kind: 'event', family: e.family, payload: e.payload });
  };
  window.coordinatorPort = {
    claim(holder) {
      log('coordinatorPort.claim');
      return {
        request() {
          log('coordinatorPort.request-called');
          const mc = new MessageChannel();
          coordPort = mc.port1;
          coordPort.onmessage = (ev) => {
            const f = ev.data;
            if (f?.kind === 'lifecycle' && f.phase === 'hello') {
              log('coord.hello', `v${f.protocolVersion}`);
              log('coord.ready-sent', `v${f.protocolVersion}`);
              coordPort.postMessage({ kind: 'lifecycle', phase: 'ready', protocolVersion: f.protocolVersion });
              coordReady();
            } else if (f?.kind === 'request') {
              log('coord.request', `${f.method} ${JSON.stringify(f.args)?.slice(0, 200)}`);
              let v = COORD_VALUES[f.method];
              if (typeof v === 'function') { try { v = v(f.args || {}); } catch (e) { log('coord.value-fn-error', String(e)); v = null; } }
              coordPort.postMessage({
                kind: 'reply', requestId: f.requestId,
                outcome: { status: 'ok', value: v === undefined ? null : v },
              });
            } else {
              log('coord.frame', JSON.stringify(f)?.slice(0, 300));
            }
          };
          try { log('coordinatorPort.onPort-invoked'); holder.onPort && holder.onPort(mc.port2); } catch (e) { log('onPort.error', String(e)); }
        },
        release() { log('coordinatorPort.release'); },
      };
    },
  };

  window.sandRenderTrace = proxy('sandRenderTrace');
  window.sandPopout = { agentId: null };

  const origMark = performance.mark.bind(performance);
  performance.mark = (n, o) => { log('mark', String(n)); return origMark(n, o); };
  // headless auto-dismisses beforeunload dialogs as CANCEL, which blocks the reload and keeps the page alive
  window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; log('beforeunload', 'blocked reload attempt'); });
  // prevent reload loops under the stub harness
  window.location.reload = () => log('location.reload', 'blocked');
  window.addEventListener('error', (e) => log('window.error', `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => log('unhandledrejection', String(e.reason?.stack || e.reason).slice(0, 1400)));

  // ---- T20 · 0.79.3 场景 patch（?scene= 选；S1 conv-done / S3 outline 面加宽）----
  {
    const QS = new URLSearchParams(location.search);
    const SCENE = QS.get('scene') || 'conv-done';
    const t0 = now - 3600_000;
    const s1Transcript = () => {
      const entries = SCENE === 'conv-done' ? [
        { id: 's1u', seq: 10, kind: 'message', role: 'user', content: 'Check the environment and summarize.', timestampMs: t0 + 1000, status: 'done' },
        { id: 's1a', seq: 11, kind: 'message', role: 'assistant', content: 'A first answer: got it, checking the environment first.', timestampMs: t0 + 2000, status: 'done' },
        { id: 's1b', seq: 12, kind: 'message', role: 'assistant', content: 'B middle turn: step one looks fine.', timestampMs: t0 + 3000, status: 'done', suppressed: {} },
        { id: 's1t', seq: 13, kind: 'tool-call', name: 'bash', label: 'bash', summary: 'ls -la', status: 'done', timestampMs: t0 + 4000 },
        { id: 's1e', seq: 14, kind: 'message', role: 'assistant', content: 'E final answer: all checks passed, nothing to fix.', timestampMs: t0 + 5000, status: 'done' },
      ] : [];
      return { entries, nextBeforeSeq: null, cloudAgentPeerIds: [] };
    };
    COORD_VALUES.getAgentTranscriptTail = s1Transcript;
    COORD_VALUES.getAgentTranscript = s1Transcript;
    COORD_VALUES.getAgentTranscriptPage = s1Transcript;
    COORD_VALUES.getAgentTranscriptWindow = s1Transcript;
    COORD_VALUES.openAgentTail = s1Transcript;
    COORD_VALUES.openAgent = s1Transcript;
    COORD_VALUES.openAgentWindowed = s1Transcript;
    COORD_VALUES.getConversationOutline = () => ([
      { kind: 'user', id: 'o1', text: 'Check the environment and summarize.' },
      { kind: 'thinking', id: 'o2', text: 'thinking about which files to inspect first' },
      { kind: 'assistant-text', id: 'o3', text: 'A first answer: got it, checking the environment first.' },
      { kind: 'tool-call', id: 'o4', name: 'bash', status: 'done', summary: 'ls -la' },
      { kind: 'tool-call', id: 'o5', name: 'read', status: 'pending', summary: 'read ~/q3/summary.md' },
      { kind: 'assistant-text', id: 'o6', text: 'E final answer: all checks passed, nothing to fix.' },
    ]);
    COORD_VALUES.conversationOutlineGet = COORD_VALUES.getConversationOutline;
    COORD_VALUES.reportTranscriptParity = null;
    COORD_VALUES.reportTranscriptRowLoss = null;
    COORD_VALUES.reportTranscriptSource = null;
    COORD_VALUES.resolveServerTranscriptTail = null;
    MAIN_VALUES.getOnboardingSeen = SCENE !== 'onboarding';
    if (SCENE === 'conv-working-tool') {
      const toolRun = (a) => a.id === 'ag_main' ? { ...a, status: 'running', isRunning: true, currentActivity: { kind: 'tool', tool: 'WebSearch' } } : a;
      const rosterVal0 = COORD_VALUES.getServerAgentRoster;
      COORD_VALUES.getServerAgentRoster = () => ({ ...rosterVal0, agents: rosterVal0.agents.map(toolRun) });
      COORD_VALUES.listAgents = COORD_VALUES.listAgents.map(toolRun);
    }
    if (SCENE === 'conv-working') {
      // S2：主 bot 运行中（isRunning + currentActivity thinking → 状态行短语轮换）
      // 注意：getServerAgentRoster / listAgents 原值是对象/数组（非函数），这里整体替换。
      const running = (a) => a.id === 'ag_main' ? { ...a, status: 'running', isRunning: true, currentActivity: { kind: 'thinking' } } : a;
      const rosterVal = COORD_VALUES.getServerAgentRoster;
      COORD_VALUES.getServerAgentRoster = () => ({ ...rosterVal, agents: rosterVal.agents.map(running) });
      COORD_VALUES.listAgents = COORD_VALUES.listAgents.map(running);
    }
    log('t20-scene', SCENE);
  }

  log('stub-installed');
})();
