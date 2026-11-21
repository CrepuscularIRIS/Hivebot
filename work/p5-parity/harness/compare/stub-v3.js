// P5-53 对照台 · 原版 0.78.1 桩（协议 v3）。
// 来源: work/p5-parity/harness/grok-r3/stub-init.js（R3 首通产物）泛化：fixture 数据改由
// window.__FIXTURE__（驱动在注入本脚本前内联）提供，roster/transcript/布局不再硬编码。
// 桥面事实全部沿用 R3（RE-stub-boot.md §2）：desktop.main.* 命名空间桥、coordinatorPort.claim
// 同步交付 MessagePort、hello→ready 回显 protocolVersion、readManyClientPersistence 必须带账号槽位。
(() => {
  const FX = window.__FIXTURE__;
  const logs = [];
  const seen = new Set();
  const log = (kind, detail) => {
    const line = `[STUB] ${kind} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    if (!seen.has(line)) { seen.add(line); logs.push(line); }
  };
  window.__stubLogs = logs;

  let THEME = { preference: 'light', resolved: 'light' };
  if (FX?.theme === 'dark' || new URLSearchParams(location.search).get('theme') === 'dark') THEME = { preference: 'dark', resolved: 'dark' };
  window.__setTheme = (a) => { THEME = { preference: a, resolved: a }; };

  const ACCOUNT_SLOT = 'sand.client.slice.client-meta.account-slot';
  const LAYOUT_KEYS = ['sand.sidebar.collapsed', 'sand.sidebar.width', 'sand.infoPane.open'];
  const persist = (key) => {
    if (key === ACCOUNT_SLOT) return JSON.stringify({ schemaVersion: 1, value: 'stub-auth' });
    if (!FX?.layout) return null;
    if (key === 'sand.sidebar.collapsed') return FX.layout.sidebarCollapsed;
    if (key === 'sand.sidebar.width') return FX.layout.sidebarWidth;
    if (key === 'sand.infoPane.open') return FX.layout.infoPaneOpen;
    return null;
  };

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
    readClientPersistence: (...a) => persist(String(a?.[0]?.key ?? '')),
    readManyClientPersistence: (...a) => {
      const inc = a?.[0]?.include ?? [];
      const out = {};
      const allKeys = [ACCOUNT_SLOT, ...LAYOUT_KEYS];
      for (const k of allKeys) {
        const matches = inc.some((p) => p === k || (typeof p === 'string' && p.endsWith('.') && k.startsWith(p)));
        if (!matches) continue;
        const v = persist(k);
        if (v != null) out[k] = v;
      }
      return out;
    },
    listClientPersistenceKeys: [],
  };

  const eventHandlers = new Map();
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
    boot: { theme: THEME, language: { preference: 'system', systemLanguage: 'en', resolved: 'en' }, isEgressTunnelEnabled: false },
    local: {
      getZoomFactor: () => 1,
      stageAttachmentFile: () => Promise.resolve(undefined),
      noteRendererAlive: () => {},
      noteBootGateLanded: () => {},
      noteBootGateOpened: () => {},
    },
    environment: { platform: 'linux', isDev: false, isWaylandClient: false, usesProductionBackend: true, devVoiceHarness: 'package' },
  };

  // fake coordinator（协议 v3；roster/transcript 全部来自 FX）
  const AGENTS = FX?.agents ?? [];
  const COORD_VALUES = {
    getServerAgentRoster: { status: 'enabled', agents: AGENTS, boxAgentCount: 0 },
    getHostStatus: { hostVersion: '0.78.1-stub', latestHostVersion: '0.78.1-stub', hostUpdateAvailable: false, isBusy: false, capabilities: [] },
    getMainAgent: { agentId: FX?.mainAgentId ?? 'ag_main' },
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
    getAgentTranscriptTail: (a) => ({
      entries: FX?.entriesByAgent?.[a?.id] ?? FX?.entriesByAgent?.[FX?.mainAgentId] ?? [],
      nextBeforeSeq: null,
      cloudAgentPeerIds: [],
    }),
  };
  let coordPort = null;
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
            } else if (f?.kind === 'request') {
              log('coord.request', `${f.method}`);
              let v = COORD_VALUES[f.method];
              if (typeof v === 'function') { try { v = v(f.args || {}); } catch (e) { log('coord.value-fn-error', `${f.method}: ${e}`); v = null; } }
              coordPort.postMessage({ kind: 'reply', requestId: f.requestId, outcome: { status: 'ok', value: v === undefined ? null : v } });
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

  window.sandRenderTrace = proxy('sandRenderTrace');
  window.sandPopout = { agentId: null };

  const origMark = performance.mark.bind(performance);
  performance.mark = (n, o) => { log('mark', String(n)); return origMark(n, o); };
  window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });
  window.location.reload = () => log('location.reload', 'blocked');
  window.addEventListener('error', (e) => log('window.error', `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => log('unhandledrejection', String(e.reason?.stack || e.reason).slice(0, 1400)));
  log('stub-installed');
})();
