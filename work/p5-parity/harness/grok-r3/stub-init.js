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
        { id: 'e11', seq: 11, kind: 'tool-call', name: 'bash', label: 'bash', summary: 'python analyze.py --quarter q3', status: 'completed', timestampMs: t0 + 4000, isRunning: false },
        { id: 'e12', seq: 12, kind: 'tool-call', name: 'read', label: 'read', summary: 'read ~/q3/summary.md', status: 'completed', timestampMs: t0 + 9000, isRunning: false },
        { id: 'e13', seq: 13, kind: 'message', role: 'assistant', content: 'Revenue is up **12%** QoQ. Biggest movers:\n- Subscriptions +18%\n- Churn -2pts\n\nFull breakdown below.', timestampMs: t0 + 15000, status: 'done' },
        { id: 'e14', seq: 14, kind: 'send-message', timestampMs: t0 + 20000,
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
  log('stub-installed');
})();
