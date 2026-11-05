// P7-F2 unit tests: 回合来源三分（origin.mjs）与 H1 溯源授权三元组
// （authority.mjs）。验收锚点 = p7-admin PLAN P7-F2 行 + BRIEF v2.3 §6.1.1 H1
// + PLAN §3.3（词表 / 否定 / token 相等 / 禁区 / 单 Mandate）。正文取证的
// 宿主接线属 D-1 后续任务，这里只测纯函数边界。
import { describe, expect, it } from 'vitest'
import {
  HUMAN_KIND, DELEGATED_KINDS, TAINT_KIND,
  classifyOrigin, AdminTurnOrigin,
} from '../../src/admin/origin.mjs'
import {
  ACTION_WORDS, ACTION_SCOPE, PROHIBITED_PARAM_KEYS, MIN_BOT_NAME_CODEPOINTS,
  normalizeText, authorize,
} from '../../src/admin/authority.mjs'

// ---- origin：回合来源三分（user / delegated=goal·schedule / tainted） ----

describe('classifyOrigin', () => {
  it('user kind → user（人类回合，唯一自主来源；H3 / D-1 子题① 前不给别名）', () => {
    expect(classifyOrigin(['user'])).toEqual({ originClass: 'user', auditKinds: ['user'] })
  })

  it('goal / schedule → delegated（委托）', () => {
    expect(classifyOrigin(['goal']).originClass).toBe('delegated')
    expect(classifyOrigin(['schedule']).originClass).toBe('delegated')
    expect(classifyOrigin(['schedule', 'goal'])).toEqual({ originClass: 'delegated', auditKinds: ['schedule', 'goal'] })
    expect(DELEGATED_KINDS).toEqual(['goal', 'schedule'])
  })

  it('人类来源别名与未知 kind → delegated：不污染（R2-1 不变）但无自主权（H3）', () => {
    // user-approval / user-question-reply 是 D-1 子题①，未定前不算人类来源
    expect(classifyOrigin(['user-approval']).originClass).toBe('delegated')
    expect(classifyOrigin(['user-question-reply']).originClass).toBe('delegated')
    expect(classifyOrigin(['working-directory', 'agent-message', 'subagent-settled']).originClass).toBe('delegated')
    expect(classifyOrigin(['mystery-kind']).originClass).toBe('delegated')
  })

  it('认领过 pbots-worker → tainted（污染优先于一切）', () => {
    expect(classifyOrigin(['pbots-worker'])).toEqual({ originClass: 'tainted', auditKinds: ['pbots-worker'] })
    expect(classifyOrigin(['user', 'pbots-worker']).originClass).toBe('tainted')
    expect(classifyOrigin(['goal', 'pbots-worker']).originClass).toBe('tainted')
    expect(TAINT_KIND).toBe('pbots-worker')
  })

  it('无 claim 的回合 → delegated（自主权轴 fail-closed：无来源即无授权）', () => {
    expect(classifyOrigin([])).toEqual({ originClass: 'delegated', auditKinds: [] })
    expect(HUMAN_KIND).toBe('user')
  })
})

describe('AdminTurnOrigin（沿用 P6 TurnOrigin 实例模式）', () => {
  it('按 agent/回合记录 claim 并分类，默认分类最新回合', () => {
    const origin = new AdminTurnOrigin()
    origin.record('bot-a', 1, 'user')
    origin.record('bot-a', 2, 'schedule')
    expect(origin.classify('bot-a', 1).originClass).toBe('user')
    expect(origin.classify('bot-a').originClass).toBe('delegated') // 最新回合 2
    expect(origin.claims('bot-a', 2)).toEqual(['schedule'])
    expect(origin.lastTurn('bot-a')).toBe(2)
  })

  it('同回合多来源合并；污染单调；无记录的 agent 是 delegated 不是 tainted', () => {
    const origin = new AdminTurnOrigin()
    origin.record('bot-a', 3, 'schedule')
    origin.record('bot-a', 3, 'pbots-worker')
    expect(origin.classify('bot-a', 3)).toEqual({ originClass: 'tainted', auditKinds: ['schedule', 'pbots-worker'] })
    expect(origin.classify('bot-b').originClass).toBe('delegated') // 普通 agent 不被连坐全拒
  })
})

// ---- authority：H1 授权三元组（动作 / 精确目标 / 受限参数） ----

/** 人类回合请求的简写。 */
const humanAuth = (over: Record<string, unknown> = {}) => authorize({
  turnClass: 'user', humanUtteranceOfGrant: '', mandate: null,
  action: undefined, target: undefined, params: undefined, ...over,
} as Parameters<typeof authorize>[0])

describe('authorize：词表正例与反例（§3.3）', () => {
  it('「装 X」正例：动作词 + token 相等目标 → allow，证据指向人类原文', () => {
    const out = humanAuth({ action: 'install', target: 'github-connectors', humanUtteranceOfGrant: '帮我装 github-connectors 这个插件' })
    expect(out.decision).toBe('allow')
    expect(out.evidenceRef?.source).toBe('human-utterance')
  })

  it('词表覆盖七类规范动作名（§3.3 常量不靠模型）', () => {
    expect(Object.keys(ACTION_WORDS).sort()).toEqual(['archive', 'create', 'disable', 'dispatch', 'install', 'modify', 'restart'])
    expect(ACTION_WORDS.install).toContain('装')
    expect(ACTION_WORDS.install).toContain('install')
    expect(ACTION_WORDS.modify).toContain('改名')
    expect(ACTION_WORDS.disable).toContain('卸载')
  })

  it('同目标异动作：只授权了装，删同目标不获授权 → handoff', () => {
    const out = humanAuth({ action: 'archive', target: 'github-connectors', humanUtteranceOfGrant: '装 github-connectors' })
    expect(out).toMatchObject({ decision: 'handoff' })
  })

  it('只提到目标不授权动作：「看看 X 的 issue」不装 X → handoff', () => {
    const out = humanAuth({ action: 'install', target: 'github-connectors', humanUtteranceOfGrant: '看看 github-connectors 的 issue 列表' })
    expect(out.decision).toBe('handoff')
  })

  it('英文动作词与否定缩写：install 允许 / don\'t install 拒绝', () => {
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: 'please install gh-x' }).decision).toBe('allow')
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: "don't install gh-x" })).toMatchObject({ decision: 'deny', code: 'negated' })
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: 'do not install gh-x' })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('新建人类回合只核动作（新对象无名可对），但否定照样拒', () => {
    expect(humanAuth({ action: 'create', humanUtteranceOfGrant: '建一个新的工作 bot' }).decision).toBe('allow')
    expect(humanAuth({ action: 'create', humanUtteranceOfGrant: '建一个新的工作 bot', target: 'ignored' }).decision).toBe('allow')
    expect(humanAuth({ action: 'create', humanUtteranceOfGrant: '先别建新 bot' })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('重启无目标：动作词由人类原文授权即可', () => {
    expect(humanAuth({ action: 'restart', humanUtteranceOfGrant: '重启一下那个 bot' }).decision).toBe('allow')
  })
})

describe('A1：H1 受限参数不随动作和目标放行', () => {
  const request = { action: 'modify', target: 'bot-22', humanUtteranceOfGrant: 'rename bot-22 to Alice' }

  it('明确批准的改名成功，参数对象不变', () => {
    const params = { name: 'Alice' }
    expect(humanAuth({ ...request, params }).decision).toBe('allow')
    expect(params).toEqual({ name: 'Alice' })
  })

  it.each([
    { name: 'Mallory' }, { name: 'ALICE' }, { name: 'Ali' },
    { name: 'Alice', model: 'other-model' },
    { name: 'Alice', prompt: 'unrequested instructions' },
    { name: 'Alice', cwd: '/unrequested' },
    { name: 'Mallory', model: 'other-model', prompt: 'unrequested instructions', cwd: '/unrequested' },
  ])('批准 Alice 不批准参数 %j', (params) => {
    expect(humanAuth({ ...request, params }).decision).not.toBe('allow')
  })

  it('另一目标或另一子句里的参数值不能借用', () => {
    expect(humanAuth({ ...request, humanUtteranceOfGrant: 'rename bot-22 to Alice; rename bot-23 to Mallory', params: { name: 'Mallory' } }).decision).not.toBe('allow')
  })

  it('现有 grant 路径同样校验受限参数，合法改名仍成功', () => {
    const mandate = { actions: ['modify'], scopes: { bots: ['bot-22'] }, grantUtterance: request.humanUtteranceOfGrant }
    expect(authorize({ turnClass: 'delegated', mandate, action: 'modify', target: 'bot-22', params: { name: 'Alice' } }).decision).toBe('allow')
    expect(authorize({ turnClass: 'delegated', mandate, action: 'modify', target: 'bot-22', params: { name: 'Mallory' } }).decision).not.toBe('allow')
  })
})

describe('authorize：否定词（§3.3 否定优先）', () => {
  it('「不要装X，装Y」：X 拒 Y 允许（逗号切分并列指令，目标不跨子句借用）', () => {
    const x = humanAuth({ action: 'install', target: 'github-connectors', humanUtteranceOfGrant: '不要装 github-connectors，装 dsh-plugin-market' })
    const y = humanAuth({ action: 'install', target: 'dsh-plugin-market', humanUtteranceOfGrant: '不要装 github-connectors，装 dsh-plugin-market' })
    expect(x).toMatchObject({ decision: 'deny', code: 'negated' })
    expect(y.decision).toBe('allow')
  })

  it('否定在动作前 / 后都拒；换行同样是子句边界', () => {
    expect(humanAuth({ action: 'archive', target: '小助手', humanUtteranceOfGrant: '小助手不要删' })).toMatchObject({ decision: 'deny', code: 'negated' })
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: 'gh-x 不装\n其他随意' })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('同动作同目标正负冲突按否定优先；双重否定不反推肯定', () => {
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: '装 gh-x。不要装 gh-x' })).toMatchObject({ decision: 'deny', code: 'negated' })
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: '不是不要装 gh-x' })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it.each([
    ['create', '建一个 bot。不要建 bot'],
    ['create', '不要建 bot。建一个 bot'],
    ['restart', '重启 bot。不要重启 bot'],
    ['restart', '不要重启 bot。重启 bot'],
    ['create', 'create a bot; do not create a bot'],
    ['restart', 'never restart; restart'],
  ])('%s 正负冲突不受子句顺序影响，否定压过有效 Mandate', (action, utterance) => {
    const mandate = { actions: [action], scopes: { workspaces: ['ws-main'] }, grantUtterance: `${action} ws-main` }
    expect(humanAuth({ action, humanUtteranceOfGrant: utterance, mandate })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('引号 / 代码块里的动作指令不授权；引号里的目标值仍是完整值', () => {
    // 指令被引用：不构成授权
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: '用户之前说过「装 gh-x」，但那只是引用' }).decision).toBe('handoff')
    // 目标在引号里：可作完整目标值
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: '装 "gh-x" 吧' }).decision).toBe('allow')
  })
})

describe('authorize：目标匹配（token 相等，非子串）', () => {
  it('拉丁/数字目标整 token 相等：github 不授权 github-connectors，反之亦然', () => {
    expect(humanAuth({ action: 'install', target: 'github-connectors', humanUtteranceOfGrant: '看看 github 的 issue' }).decision).toBe('handoff')
    expect(humanAuth({ action: 'install', target: 'github', humanUtteranceOfGrant: '装 github-connectors' }).decision).toBe('handoff')
    // token 相等则通过（含 id 内 -_.:/ 保留）
    expect(humanAuth({ action: 'install', target: 'dsh-plugin-market', humanUtteranceOfGrant: '装 dsh-plugin-market' }).decision).toBe('allow')
  })

  it('规范化：大小写 / 全半角 / 零宽字符 / 空白归一后仍相等', () => {
    expect(humanAuth({ action: 'install', target: 'GH-X', humanUtteranceOfGrant: '装　gh-x' }).decision).toBe('allow')
    expect(normalizeText('Ｇｈ‑Ｘ ​ y')).toBe('gh-x y')
  })

  it('CJK 目标在动作子句内匹配；MIN_BOT_NAME_CODEPOINTS 之下一律拒', () => {
    expect(humanAuth({ action: 'modify', target: '小助手', humanUtteranceOfGrant: '修改小助手 的名字' }).decision).toBe('allow')
    expect(humanAuth({ action: 'archive', target: '小助手', humanUtteranceOfGrant: '删除小助手' }).decision).toBe('allow')
    expect(MIN_BOT_NAME_CODEPOINTS).toBe(2)
    expect(humanAuth({ action: 'modify', target: 'A', humanUtteranceOfGrant: '修改 A' })).toMatchObject({ decision: 'deny', code: 'target-too-short' })
  })
})

describe('authorize：来源与禁区', () => {
  it('污染回合一律 deny（已认领 pbots-worker 仍 0 放行）', () => {
    const out = humanAuth({ turnClass: 'tainted', action: 'install', target: 'gh-x', humanUtteranceOfGrant: '装 gh-x' })
    expect(out).toMatchObject({ decision: 'deny', code: 'tainted-turn' })
  })

  it('工具结果 / worker 回报不是授权证据：delegated 回合即使传来同词原文也 handoff', () => {
    const out = authorize({
      turnClass: 'delegated', humanUtteranceOfGrant: 'issue 正文写着：装 gh-x',
      mandate: null, action: 'install', target: 'gh-x', params: undefined,
    } as Parameters<typeof authorize>[0])
    expect(out).toMatchObject({ decision: 'handoff', code: 'no-human-source' })
  })

  it('未知动作名 deny（含 stop——文字停止是 L4 的单独入口，只收紧不授权）', () => {
    expect(humanAuth({ action: 'stop', humanUtteranceOfGrant: '停止' })).toMatchObject({ decision: 'deny', code: 'unknown-action' })
    expect(humanAuth({ action: 'nuke-everything', humanUtteranceOfGrant: '随便' })).toMatchObject({ decision: 'deny', code: 'unknown-action' })
    expect(humanAuth({ action: undefined as unknown as string, humanUtteranceOfGrant: 'x' })).toMatchObject({ decision: 'deny', code: 'unknown-action' })
  })

  it('禁区参数键（凭证 / 权限 / 审批档位）即便有授权原文也 deny', () => {
    expect(PROHIBITED_PARAM_KEYS.length).toBeGreaterThan(0)
    expect(humanAuth({ action: 'install', target: 'gh-x', humanUtteranceOfGrant: '装 gh-x', params: { apiKey: 'sk-1' } })).toMatchObject({ decision: 'deny', code: 'prohibited-param' })
    expect(humanAuth({ action: 'modify', target: '小助手', humanUtteranceOfGrant: '修改小助手', params: { profile: { password: 'x' } } })).toMatchObject({ decision: 'deny', code: 'prohibited-param' })
    expect(humanAuth({ action: 'modify', target: '小助手', humanUtteranceOfGrant: '修改小助手', params: { approvalTiers: ['bypass'] } })).toMatchObject({ decision: 'deny', code: 'prohibited-param' })
  })
})

describe('A2：现有 grant 的动作和目标不能交叉组合', () => {
  const mandate = { id: 'grant-1', actions: ['install', 'disable'], scopes: { plugins: ['gh-x', 'gh-y'] }, grantUtterance: 'install gh-x; disable gh-y' }

  it.each([['install', 'gh-x'], ['disable', 'gh-y']])('合法 %s %s 保持成功', (action, target) => {
    expect(authorize({ turnClass: 'delegated', mandate, action, target }).decision).toBe('allow')
  })

  it.each([['disable', 'gh-x'], ['install', 'gh-y']])('未批准组合 %s %s 不执行', (action, target) => {
    expect(authorize({ turnClass: 'delegated', mandate, action, target }).decision).not.toBe('allow')
  })
})

describe('authorize：Mandate 路径（单 Mandate 原则）', () => {
  const mandate = {
    id: 'm-1', goalId: 'g-1',
    actions: ['install'],
    scopes: { plugins: ['github-connectors'] },
    grantUtterance: '装 github-connectors',
  }

  it('委托回合凭有效 Mandate 放行，证据指向该 Mandate', () => {
    const out = authorize({ turnClass: 'delegated', humanUtteranceOfGrant: '', mandate, action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])
    expect(out.decision).toBe('allow')
    expect(out.evidenceRef).toMatchObject({ source: 'mandate', mandateId: 'm-1' })
  })

  it('同目标异动作 / 目标不在范围 → handoff（覆盖不完整）', () => {
    expect(authorize({ turnClass: 'delegated', mandate, humanUtteranceOfGrant: '', action: 'disable', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'handoff', code: 'mandate-action-uncovered' })
    expect(authorize({ turnClass: 'delegated', mandate, humanUtteranceOfGrant: '', action: 'install', target: 'other-plugin', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'handoff', code: 'mandate-target-uncovered' })
  })

  it('单 Mandate 原则：A 有动作无目标 / B 有目标无动作，各自都不放行（无并集入口）', () => {
    const a = { ...mandate, id: 'm-a', scopes: { plugins: ['other'] } }
    const b = { ...mandate, id: 'm-b', actions: ['archive'] }
    expect(authorize({ turnClass: 'delegated', mandate: a, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0]).decision).toBe('handoff')
    expect(authorize({ turnClass: 'delegated', mandate: b, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0]).decision).toBe('handoff')
  })

  it('Mandate 授予本身受 H1：范围项 / 动作不在授予回合人类原文 → handoff（不写入）', () => {
    const bad = { ...mandate, grantUtterance: '去做 gh 相关的事' }
    expect(authorize({ turnClass: 'delegated', mandate: bad, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'handoff', code: 'mandate-grant-unevidenced' })
    // 否定子句里的同词不算证据
    const negated = { ...mandate, grantUtterance: '不要装 github-connectors' }
    expect(authorize({ turnClass: 'delegated', mandate: negated, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'handoff', code: 'mandate-grant-unevidenced' })
  })

  it.each([
    ['install', { plugins: ['gh-x'] }, 'gh-x', '装 gh-x。不要装 gh-x'],
    ['install', { plugins: ['gh-x'] }, 'gh-x', '不要装 gh-x。装 gh-x'],
    ['install', { plugins: ['gh-x'] }, 'gh-x', 'install gh-x; do not install gh-x'],
    ['create', { workspaces: ['ws-main'] }, 'ws-main', '创建 ws-main。不要创建 ws-main'],
    ['restart', {}, undefined, '重启 bot。不要重启 bot'],
  ])('Mandate %s 授予同动作同目标正负冲突必须拒绝', (action, scopes, target, grantUtterance) => {
    const grant = { id: 'conflicted', actions: [action], scopes, grantUtterance }
    expect(authorize({ turnClass: 'delegated', mandate: grant, action, target })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('Mandate 的否定只约束同动作同精确目标，不误拒其他动作或目标', () => {
    for (const grantUtterance of ['装 gh-x。不要装 gh-xy', '装 gh-x。不要卸载 gh-x']) {
      const grant = { actions: ['install'], scopes: { plugins: ['gh-x'] }, grantUtterance }
      expect(authorize({ turnClass: 'delegated', mandate: grant, action: 'install', target: 'gh-x' }).decision).toBe('allow')
    }
  })

  it('Mandate 中其他已列范围项有冲突也不能把整份授予当作有效', () => {
    const grant = { actions: ['install'], scopes: { plugins: ['gh-x', 'gh-y'] }, grantUtterance: '装 gh-x。装 gh-y。不要装 gh-y' }
    expect(authorize({ turnClass: 'delegated', mandate: grant, action: 'install', target: 'gh-x' })).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('过期 / 撤销 / 形状坏的 Mandate → deny', () => {
    const now = 1_000_000
    expect(authorize({ turnClass: 'delegated', mandate: { ...mandate, deadline: now - 1 }, now, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'deny', code: 'mandate-expired' })
    expect(authorize({ turnClass: 'delegated', mandate: { ...mandate, revoked: true }, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'deny', code: 'mandate-revoked' })
    expect(authorize({ turnClass: 'delegated', mandate: { actions: 'install' }, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'deny', code: 'malformed-mandate' })
    expect(authorize({ turnClass: 'delegated', mandate: { ...mandate, grantUtterance: '' }, humanUtteranceOfGrant: '', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'deny', code: 'malformed-mandate' })
  })

  it('Mandate 目标桶随动作走（install→plugins，modify→bots，dispatch→workspaces）', () => {
    expect(ACTION_SCOPE).toMatchObject({ install: 'plugins', disable: 'plugins', modify: 'bots', archive: 'bots', dispatch: 'workspaces', restart: null })
    const ws = { id: 'm-2', actions: ['dispatch'], scopes: { workspaces: ['ws-main'] }, grantUtterance: '派活到 ws-main' }
    expect(authorize({ turnClass: 'delegated', mandate: ws, humanUtteranceOfGrant: '', action: 'dispatch', target: 'ws-main', params: undefined } as Parameters<typeof authorize>[0]).decision).toBe('allow')
    expect(authorize({ turnClass: 'delegated', mandate: ws, humanUtteranceOfGrant: '', action: 'dispatch', target: 'ws-other', params: undefined } as Parameters<typeof authorize>[0]).decision).toBe('handoff')
  })

  it('人类原文的显式否定压过 Mandate 放行', () => {
    const out = authorize({ turnClass: 'user', mandate, humanUtteranceOfGrant: '不要装 github-connectors', action: 'install', target: 'github-connectors', params: undefined } as Parameters<typeof authorize>[0])
    expect(out).toMatchObject({ decision: 'deny', code: 'negated' })
  })

  it('无 Mandate 的委托回合 → handoff（不 deny：普通工具不受连坐，管理转需要你处理）', () => {
    expect(authorize({ turnClass: 'delegated', mandate: null, humanUtteranceOfGrant: '', action: 'install', target: 'gh-x', params: undefined } as Parameters<typeof authorize>[0])).toMatchObject({ decision: 'handoff', code: 'no-human-source' })
  })

  it('无原文无 Mandate 的人类回合 → handoff（fail-closed）', () => {
    expect(humanAuth({ action: 'install', target: 'gh-x' })).toMatchObject({ decision: 'handoff' })
  })
})
