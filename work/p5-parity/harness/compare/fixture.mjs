// P5-53 对照台 · 统一 fixture（BRIEF §12.7 第 2 条）。
// 一份语义数据 + v1（0.18 移植树）/ v3（原版 0.78.1）两个序列化器。
// 形状差异依据：S0 实测（work/p5-parity/RE-s0-portability.md §entry 形状）与 R3 实测（RE-stub-boot.md §3）。
// 已知字段级差异由序列化层吸收：
//   - 用户消息：v1 = kind:'send-message' + message.type:'text'；v3 = kind:'message' + role:'user'
//   - assistant：v1 = kind:'message' + author；v3 = kind:'message' + role:'assistant'
//   - thinking：v1 = kind:'thinking'；v3 未知（R3 未逆出）→ 默认不注入（v3Thinking=false，实测后可开）
//   - 时间分隔：两侧都由渲染器自管——0.78.1 自动生成 timestamp 行；0.18 renderer 支持
//     'time-separator' kind 但整树无 producer（fidelity 缺口，记 U1′ 差异表），fixture 只放 16 分钟间隔
//   - tool-call 终态：v1 status:'done'；v3 status:'completed'（R3 实证）
//   - 权限 ask 卡：v1 ask:{requestId,status,action:{kind:'run-command',command},target:{kind:'local-computer'}}；
//     v3 ask:{status:'pending',requestId,description}（多带字段会 entry 级 boundary，R3 局限 1）
//   - 头像：两侧都是 agent 记录上的 avatarShape/avatarColor（0.18 production/model.ts:144-147；0.78.1 bundle 实证同名字段）
//   - roster：v1 走 listAgents RPC + transcript snapshot 事件；v3 走 listAgents/getServerAgentRoster RPC
//   - 未读：v1 agent.hasUnread:true；v3 同名（bundle 实证 hasUnread）
//   - 布局：v1 持久化键 'sand.client.slice.ui-layout'（schema 3 信封）；v3 旧键 'sand.sidebar.collapsed'/'sand.sidebar.width'/'sand.infoPane.open'

export const PERSONA_SHAPES = ['blob', 'pebble', 'squircle', 'tablet', 'wedge', 'hex', 'cloud', 'teardrop'];
export const PERSONA_COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'gray'];

// 头像状态矩阵的 3 个状态：activity 形状在两侧 bundle 均被消费（0.78.1 XZe(e.currentActivity)；0.18 agent-avatar.tsx ACTIVITY_TO_STATE）
export const PERSONA_STATES = {
  thinking: { kind: 'thinking' },
  searching: { tool: 'WebSearch' },
  working: { verb: 'coding' },
};

const H = 3600_000;

// —— 语义 fixture（roster + transcript + 权限卡 + 提问场景 + 布局）——
export function semanticFixture(variant = {}) {
  const now = Date.now();
  const t0 = now - 24 * H;
  const running = variant.running === true;
  return {
    now,
    layout: {
      sidebarCollapsed: variant.sidebarCollapsed === true,
      sidebarWidth: 280,
      infoPaneOpen: variant.infoPaneOpen === true,
    },
    roster: [
      {
        id: 'ag_main', name: 'Main Bot', isMain: true, shape: 'squircle', color: 'blue',
        hasUnread: false,
        activity: running ? { kind: 'thinking' } : null, isRunning: running,
      },
      {
        id: 'ag_research', name: 'Research Bot', isMain: false, shape: 'blob', color: 'green',
        hasUnread: true, // §12.7 第 2 条：1 条未读
        activity: { kind: 'thinking' }, isRunning: false,
      },
      {
        id: 'ag_ops', name: 'Ops Bot', isMain: false, shape: 'hex', color: 'orange',
        hasUnread: false,
        activity: { verb: 'coding' }, isRunning: false,
      },
    ],
    // 会话：用户消息 → thinking → bash/read 两种 tool 行 → assistant markdown(代码块) →
    // 16 分钟后的第二条用户消息（跨 15 分钟时间分隔，§12.7 第 2 条）→ 待决审批卡（挂在会话尾部）
    transcript: [
      { type: 'user', at: t0 + 60_000, text: 'Check the quarterly numbers in ~/q3 and summarize the deltas.' },
      { type: 'thinking', at: t0 + 62_000, text: 'The user wants a quarterly delta summary. I should list ~/q3, read the spreadsheets, compute deltas, and present the biggest movers.' },
      { type: 'tool', at: t0 + 65_000, name: 'bash', summary: 'python analyze.py --quarter q3' },
      { type: 'tool', at: t0 + 70_000, name: 'read', summary: 'read ~/q3/summary.md' },
      { type: 'assistant', at: t0 + 80_000, text: 'Revenue is up **12%** QoQ. Biggest movers:\n- Subscriptions +18%\n- Churn -2pts\n\n```python\nprint(top_movers(q3))\n```\nFull breakdown below.' },
      { type: 'user', at: t0 + 90_000 + 16 * 60_000, text: 'Also draft the Q4 outlook section.' },
      { type: 'permission', at: t0 + 90_000 + 17 * 60_000, requestId: 'req-001', command: 'pip install pandas', description: 'pip install pandas — install a dependency to analyze the spreadsheet' },
    ],
    // 提问场景数据（§12.7 对照台范围）：两侧 renderer 今天都不消费（0.18 无提问卡，grep 无结果；
    // 0.78.1 的 32 类 send-message 卡未逐一逆出）。留在 fixture 里供 P5-33/P5-56 接入后启用。
    question: {
      id: 'q-001', prompt: 'Which region should we prioritize for Q4?', multi: false,
      options: ['EMEA', 'APAC', 'Americas'],
    },
  };
}

// —— v1 序列化（0.18 移植树；S0 stub 同款形状）——
export function toV1(fx) {
  const mkAgent = (a) => ({
    id: a.id, name: a.name, description: `${a.name} — compare fixture`, path: `/agents/${a.id}`,
    createdAtMs: fx.now - 7 * 24 * H, updatedAtMs: fx.now - 60_000,
    hasUnread: a.hasUnread, notificationsEnabled: true, notifyOnUpdatesEnabled: false,
    isGroup: false, origin: 'user', lastMessageId: null, lastEntry: null,
    awaitingUserResponse: null, memberIds: [], conversationPartnerIds: [],
    avatarDataUrl: null, avatarShape: a.shape, avatarColor: a.color,
    currentActivity: a.activity, isRunning: a.isRunning === true,
    isPinned: false, isMain: a.isMain === true,
  });
  const entries = fx.transcript.map((e, i) => {
    const id = `${fx.id || 'fx'}-e${i}`;
    const seq = i + 10;
    switch (e.type) {
      case 'user':
        return { kind: 'send-message', id, seq, timestampMs: e.at, message: { type: 'text', content: e.text } };
      case 'thinking':
        return { kind: 'thinking', id, seq, timestampMs: e.at, text: e.text, durationMs: 4200 };
      case 'tool':
        return { kind: 'tool-call', id, seq, timestampMs: e.at, name: e.name, status: 'done', summary: e.summary };
      case 'assistant':
        return { kind: 'message', id, seq, timestampMs: e.at, role: 'assistant', author: 'Main Bot', content: e.text };
      case 'permission':
        return {
          kind: 'send-message', id, seq, timestampMs: e.at,
          // permissionScope/Revision 是 0.18 卡片的硬门槛（ProductionRenderer.tsx:1766-1773 +
          // local-tool-permission-scope.ts：scope 必须等于账号槽位 authId，revision 为非负整数），
          // 缺了卡片静默不渲染。authId 与桩的 cursorAccount.getStatus 对齐 = 'stub-auth'。
          permissionScope: 'stub-auth', permissionScopeRevision: 0,
          message: { type: 'local-tool-permission', ask: { status: 'pending', requestId: e.requestId, action: { kind: 'run-command', command: e.command }, target: { kind: 'local-computer' } } },
        };
      default:
        throw new Error(`v1: unknown entry type ${e.type}`);
    }
  });
  const uiLayout = JSON.stringify({
    schemaVersion: 3,
    value: {
      sidebar: { expandedWidth: fx.layout.sidebarWidth, isCollapsed: fx.layout.sidebarCollapsed },
      infoPane: { isOpen: fx.layout.infoPaneOpen, width: 320 },
    },
  });
  return {
    protocol: 1,
    theme: fx.theme || 'light',
    layout: { uiLayoutKey: 'sand.client.slice.ui-layout', uiLayoutValue: uiLayout },
    agents: fx.roster.map(mkAgent),
    mainAgentId: 'ag_main',
    entriesByAgent: Object.fromEntries(fx.roster.map((a) => [a.id, entries])),
  };
}

// —— v3 序列化（原版 0.78.1；R3 stub 同款形状）——
export function toV3(fx, opts = {}) {
  const includeThinking = opts.v3Thinking === true; // 0.78.1 thinking entry 形状未实证，默认不注入
  const mkAgent = (a) => ({
    id: a.id, name: a.name, description: `${a.name} — compare fixture`,
    createdAtMs: fx.now - 7 * 24 * H, updatedAtMs: fx.now - 60_000,
    status: 'idle', serverId: `srv_${a.id}`,
    avatarShape: a.shape, avatarColor: a.color,
    hasUnread: a.hasUnread,
    currentActivity: a.activity, isRunning: a.isRunning === true,
    isMain: a.isMain === true,
  });
  let seq = 10;
  const entries = [];
  for (const e of fx.transcript) {
    const id = `${fx.id || 'fx'}-e${seq}`;
    switch (e.type) {
      case 'user':
        entries.push({ id, seq: seq++, kind: 'message', role: 'user', content: e.text, timestampMs: e.at, status: 'done' });
        break;
      case 'thinking':
        if (includeThinking) entries.push({ id, seq: seq++, kind: 'thinking', text: e.text, timestampMs: e.at });
        break;
      case 'tool':
        entries.push({ id, seq: seq++, kind: 'tool-call', name: e.name, label: e.name, summary: e.summary, status: 'completed', timestampMs: e.at, isRunning: false });
        break;
      case 'assistant':
        entries.push({ id, seq: seq++, kind: 'message', role: 'assistant', content: e.text, timestampMs: e.at, status: 'done' });
        break;
      case 'permission':
        entries.push({
          id, seq: seq++, kind: 'send-message', timestampMs: e.at,
          // P5-53 实测：ask 只有 description 会 row 级 boundary（TypeError）；带全
          // description+action+target 三字段才能渲染出完整卡（Never/Always allow/Allow once）
          message: { type: 'local-tool-permission', ask: { status: 'pending', requestId: e.requestId, description: e.description, action: 'run-command', target: '~/q3' } },
        });
        break;
      default:
        throw new Error(`v3: unknown entry type ${e.type}`);
    }
  }
  return {
    protocol: 3,
    theme: fx.theme || 'light',
    layout: {
      sidebarCollapsed: fx.layout.sidebarCollapsed ? '1' : '0',
      sidebarWidth: String(fx.layout.sidebarWidth),
      infoPaneOpen: fx.layout.infoPaneOpen ? '1' : '0',
    },
    agents: fx.roster.map(mkAgent),
    mainAgentId: 'ag_main',
    entriesByAgent: Object.fromEntries(fx.roster.map((a) => [a.id, entries])),
  };
}

// —— 头像矩阵 roster（8 形 × 11 色，全部带显式 avatarShape/avatarColor；0.18 侧不虚拟化，可整列渲染）——
export function personaMatrixRoster(stateKey) {
  const activity = PERSONA_STATES[stateKey];
  const out = [];
  for (const shape of PERSONA_SHAPES) {
    for (const color of PERSONA_COLORS) {
      out.push({
        id: `pz_${shape}_${color}`, name: `${shape}-${color}`, isMain: false,
        shape, color, hasUnread: false, activity, isRunning: false,
      });
    }
  }
  return out;
}
