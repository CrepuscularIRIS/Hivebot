// U-11 M1 `pbots:api` 白名单透传桥：白名单 / D9 硬拒层 / §2.2 参数约束 / raw-result / #1 过滤。
// 断言口径 PLAN §2（+4）：精确值断言；「dsh 没收到调用」统一 apiCount === 0。
// 依据：work/p3-contract/CONTRACT.md §2/§2.2（v1.3）+ 勘误行、work/p4-ui/BRIEF.md D9、PLAN U-11 行。
import { describe, expect, it } from 'vitest'
import { M1_ALLOW, d9DeniedReason, registerM1Api } from '../../../main/m1-api'
import { EventsLedger } from '../../../main/dsh/ledger'
import type { ConnectionRpcResult } from '../../../main/dsh/connect'

type MockResult = ConnectionRpcResult | ((method: string, args: unknown) => ConnectionRpcResult)

function makeDsh(result: MockResult = { ok: true, value: null }) {
  let count = 0
  const calls: Array<{ method: string; args: unknown }> = []
  return {
    calls,
    get apiCount(): number { return count },
    async rpc(method: string, args: unknown): Promise<ConnectionRpcResult> {
      count += 1
      calls.push({ method, args })
      return typeof result === 'function' ? result(method, args) : result
    },
  }
}

function readyLedger(): EventsLedger {
  const ledger = new EventsLedger()
  ledger.record({ type: 'ready', clientId: 'cli-1' })
  ledger.record({
    type: 'waterfall', event: 'approval/request', eventId: 'ev-1', agentId: 's-1',
    request: { toolName: 'bash' },
  })
  return ledger
}

function makeApi(result?: MockResult, ledger = readyLedger()) {
  const logs: string[] = []
  const dsh = makeDsh(result)
  const api = registerM1Api({ dsh, ledger, log: (m) => logs.push(m) })
  return { api, dsh, ledger, logs }
}

/** 收窄 M1Result 联合类型：非失败结果直接让测试崩（fail fast）。 */
function expectFail(res: ConnectionRpcResult): { code: string; message: string; details?: unknown } {
  if (res.ok) throw new Error(`expected ok:false, got ${JSON.stringify(res)}`)
  return res.error
}

describe('M1 白名单（C §2 业务表）', () => {
  it('白名单恰为 C §2 表的 16 个 M1 方法（Q-spike：无增行）', () => {
    expect([...M1_ALLOW].sort()).toEqual([
      '$events/result',
      'agentPresets/list',
      'p2temp/session.createWithConnectors',
      'pluginManager/installBundle',
      'pluginManager/listBundles',
      'pluginMarket/listIndexes',
      'pluginMarket/readEntryDetail',
      'pluginMarket/search',
      'session/cancel',
      'session/create',
      'session/events',
      'session/list',
      'session/modelCatalog',
      'session/prompt',
      'session/rename',
      'session/selectModel',
    ])
  })

  it('表外方法 → pbots/forbidden，记日志（含 endpoint），dsh 计数 === 0', async () => {
    const { api, dsh, logs } = makeApi()
    const res = await api({ method: 'workspace/create', args: { x: 1 } })
    expect(res.ok).toBe(false)
    expect(expectFail(res).code).toBe('pbots/forbidden')
    expect(expectFail(res).message).toContain('workspace/create')
    expect(expectFail(res).details).toEqual({})
    expect(dsh.apiCount).toBe(0)
    expect(logs.some((l) => l.includes('workspace/create'))).toBe(true)
  })

  it('method 非字符串 → forbidden，dsh 计数 === 0', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 42 } as unknown as { method: string })
    expect(expectFail(res).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(0)
  })
})

describe('D9 硬拒层（永久判据，独立于白名单）', () => {
  it.each([
    ['credentials/getToken'],
    ['account/signIn'],
    ['/permission/grant'],
    ['configForms/write'],
    ['configForms/read'],
  ])('%s → forbidden，dsh 计数 === 0，日志 reason 为 d9（先于白名单表外拒绝）', async (method) => {
    const { api, dsh, logs } = makeApi()
    const res = await api({ method, args: {} })
    expect(expectFail(res).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(0)
    expect(logs.some((l) => l.includes('d9'))).toBe(true)
  })

  it('commands/execute 的命令行以 /permission 开头 → forbidden（args.command 与 args.request.command 两种位置）', async () => {
    const { api, dsh } = makeApi()
    for (const args of [{ command: '/permission never on' }, { request: { command: '/permission grant' } }]) {
      const res = await api({ method: 'commands/execute', args })
      expect(expectFail(res).code).toBe('pbots/forbidden')
    }
    expect(dsh.apiCount).toBe(0)
  })

  it('d9DeniedReason 是独立硬编码层：对凭证/account//permission/configForms 恒拒，与白名单无关', () => {
    expect(d9DeniedReason('credentials/anything', {})).toContain('credentials')
    expect(d9DeniedReason('account/getAccessToken', {})).toContain('account')
    expect(d9DeniedReason('/permission/anything', {})).toContain('permission')
    expect(d9DeniedReason('configForms/anything', {})).toContain('configForms')
    expect(d9DeniedReason('commands/execute', { command: '/permission x' })).toContain('permission')
    // 非目标方法不受影响
    expect(d9DeniedReason('session/prompt', { request: {} })).toBeUndefined()
    expect(d9DeniedReason('commands/execute', { command: 'ls -la' })).toBeUndefined()
  })
})

describe('§2.2 installBundle 强制 enabled:false（invalid-args）', () => {
  it.each([
    ['省略 enabled', ['spec']],
    ['enabled:true', ['spec', { enabled: true }]],
    ['非布尔 enabled', ['spec', { enabled: 'false' }]],
  ])('%s → pbots/invalid-args，dsh 计数 === 0', async (_name, args) => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'pluginManager/installBundle', args })
    expect(res).toEqual({ ok: false, error: { code: 'pbots/invalid-args', message: expect.any(String), details: {} } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('enabled === false → 透传 dsh（计数 1）', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'pluginManager/installBundle', args: ['spec', { enabled: false }] })
    expect(res).toEqual({ ok: true, value: null })
    expect(dsh.apiCount).toBe(1)
    expect(dsh.calls[0]).toEqual({ method: 'pluginManager/installBundle', args: ['spec', { enabled: false }] })
  })

  // U-15 联调实测 wire 形状：typert 命名参数 {spec, options}（位置数组会被 gateway 拒）
  it('对象形态 {spec, options:{enabled:false}} → 透传 dsh（真链路形状）', async () => {
    const { api, dsh } = makeApi()
    const args = { spec: '/tmp/bundle', options: { enabled: false } }
    const res = await api({ method: 'pluginManager/installBundle', args })
    expect(res).toEqual({ ok: true, value: null })
    expect(dsh.apiCount).toBe(1)
    expect(dsh.calls[0]).toEqual({ method: 'pluginManager/installBundle', args })
  })

  it('对象形态省略 options → pbots/invalid-args，dsh 计数 === 0', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'pluginManager/installBundle', args: { spec: '/tmp/bundle' } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })
})

describe('§2.2 $events/result 校验（ledger）', () => {
  it("value 'allowed-always' → invalid-args，dsh 计数 === 0", async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-always' } } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('outcome 壳不是 {kind:"result"} → invalid-args', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'other', value: 'rejected' } } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('clientId 不匹配 → pbots/forbidden（U-15 ③ 联调口径），dsh 计数 === 0', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: '$events/result', args: { clientId: 'cli-other', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } } })
    expect(expectFail(res).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(0)
  })

  it('eventId 未下发 / 已 cancel → forbidden，dsh 计数 === 0', async () => {
    const { api, dsh } = makeApi()
    const res1 = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-nope', outcome: { kind: 'result', value: 'rejected' } } })
    expect(expectFail(res1).code).toBe('pbots/forbidden')
    const { api: api2, dsh: dsh2 } = makeApi()
    await api2({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } } })
    expect(dsh2.apiCount).toBe(1)
    // cancel 后同 eventId 再答 → forbidden
    const { api: api3, dsh: dsh3, ledger } = makeApi()
    ledger.record({ type: 'cancel', eventId: 'ev-1' })
    const res3 = await api3({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
    expect(expectFail(res3).code).toBe('pbots/forbidden')
    expect(dsh3.apiCount).toBe(0)
  })

  it('合法作答 → 透传；同 eventId 二次作答 → forbidden（成功即消费）', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
    expect(res).toEqual({ ok: true, value: null })
    expect(dsh.apiCount).toBe(1)
    const res2 = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
    expect(expectFail(res2).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(1)
  })

  it('R10：rpc 失败（ok:false）→ 错误透传且 pending 保留；重发成功才下账，之后同 eventId 再答 forbidden', async () => {
    let fail = true
    const { api, dsh, ledger } = makeApi(() => (fail
      ? { ok: false, error: { code: 'gateway/unavailable', message: '503', details: {} } }
      : { ok: true, value: null }))
    const args = { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } }
    const res = await api({ method: '$events/result', args })
    expect(res.ok).toBe(false)
    expect(dsh.apiCount).toBe(1)
    // 发送失败不得消费：pending 仍在，renderer 可重试
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(true)
    fail = false
    const res2 = await api({ method: '$events/result', args })
    expect(res2).toEqual({ ok: true, value: null })
    expect(dsh.apiCount).toBe(2)
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(false)
    const res3 = await api({ method: '$events/result', args })
    expect(expectFail(res3).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(2)
  })

  it('R10：rpc 抛异常（fetch 裸抛）→ unavailable + pending 保留，重试仍可作答（U-22 GU-1 后不再裸抛）', async () => {
    let throwOnce = true
    const { api, dsh, ledger } = makeApi(() => {
      if (throwOnce) { throwOnce = false; throw new Error('socket hang up') }
      return { ok: true, value: null }
    })
    const args = { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } }
    const first = await api({ method: '$events/result', args })
    expect(first).toEqual({ ok: false, error: { code: 'pbots/unavailable', message: 'dsh rpc failed: socket hang up', details: {} } })
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(true)
    const res = await api({ method: '$events/result', args })
    expect(res.ok).toBe(true)
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(false)
  })

  it('无 ready clientId → forbidden', async () => {
    const ledger = new EventsLedger()
    ledger.record({ type: 'waterfall', event: 'approval/request', eventId: 'ev-1', agentId: 's-1', request: { toolName: 'bash' } })
    const { api, dsh } = makeApi(undefined, ledger)
    const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } } })
    expect(expectFail(res).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(0)
  })
})

describe('§2.2 #3/#4 参数约束（L2；typert 壳内字段）', () => {
  it("session/create 传 agentPreset 'p2temp-xxx' → invalid-args，dsh 计数 === 0", async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'session/create', args: { request: { cwd: '/w', agentPreset: 'p2temp-abc123' } } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('session/create 合法 agentPreset → 透传', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'session/create', args: { request: { cwd: '/w', agentPreset: 'p2-alpha' } } })
    expect(res.ok).toBe(true)
    expect(dsh.apiCount).toBe(1)
  })

  it.each([
    ['connectors:[]', { connectors: [], agentPreset: 'p2-alpha' }],
    ['connectors 非数组', { connectors: 'x', agentPreset: 'p2-alpha' }],
    ['connectors 含非字符串', { connectors: ['a', 1], agentPreset: 'p2-alpha' }],
    ['agentPreset 为 p2temp-*', { connectors: ['a'], agentPreset: 'p2temp-abc' }],
    ['R1 connectors 含 ../.. 逃逸名', { connectors: ['../..'], agentPreset: 'p2-alpha' }],
    ['R1 connectors 含 @scope/.. 逃逸名', { connectors: ['@p2/..'], agentPreset: 'p2-alpha' }],
    ['R1 connectors 含绝对路径名', { connectors: ['/abs/x'], agentPreset: 'p2-alpha' }],
    ['R1 connectors 含多斜杠名', { connectors: ['@a/b/c'], agentPreset: 'p2-alpha' }],
  ])('#4 %s → invalid-args，dsh 计数 === 0', async (_name, request) => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'p2temp/session.createWithConnectors', args: { request } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('R1 #4 合法 scoped bundle 名（@p2sdk-fixture/demo）→ 透传', async () => {
    const { api, dsh } = makeApi()
    const args = { request: { connectors: ['@p2sdk-fixture/demo'], agentPreset: 'p2-alpha' } }
    const res = await api({ method: 'p2temp/session.createWithConnectors', args })
    expect(res.ok).toBe(true)
    expect(dsh.apiCount).toBe(1)
  })

  it('#4 合法 → 透传（args 原样）', async () => {
    const { api, dsh } = makeApi()
    const args = { request: { connectors: ['conn-a'], agentPreset: 'p2-alpha', cwd: '/w' } }
    const res = await api({ method: 'p2temp/session.createWithConnectors', args })
    expect(res.ok).toBe(true)
    expect(dsh.calls[0]?.args).toEqual(args)
  })
})

describe('raw-result 透传与 #1 过滤', () => {
  it('dsh 失败结果原样返回（含 details，不经压平）', async () => {
    const upstream: ConnectionRpcResult = { ok: false, error: { code: 'gateway/internal', message: 'boom', details: { foo: 1, nested: { a: [1, 2] } } } }
    const { api } = makeApi(upstream)
    const res = await api({ method: 'session/list', args: { request: {} } })
    expect(res).toEqual(upstream)
  })

  it('agentPresets/list：滤掉 p2temp-* 行，其余字段不动，不改写上游对象', async () => {
    const upstreamValue = { presets: [{ id: 'p2-alpha', isDefault: true }, { id: 'p2temp-abc' }, { id: 'p2-beta' }, { id: 'p2temp-xyz', isDefault: false }], extra: 1 }
    const { api, dsh } = makeApi({ ok: true, value: upstreamValue })
    const res = await api({ method: 'agentPresets/list', args: {} })
    expect(res).toEqual({ ok: true, value: { presets: [{ id: 'p2-alpha', isDefault: true }, { id: 'p2-beta' }], extra: 1 } })
    // 不可变：上游原对象保持完整
    expect(upstreamValue.presets).toHaveLength(4)
    expect(dsh.apiCount).toBe(1)
  })

  it('agentPresets/list 非 ok 或 presets 非数组 → 原样返回', async () => {
    const fail: ConnectionRpcResult = { ok: false, error: { code: 'gateway/internal', message: 'x', details: {} } }
    const { api: api1 } = makeApi(fail)
    expect(await api1({ method: 'agentPresets/list', args: {} })).toEqual(fail)
    const { api: api2 } = makeApi({ ok: true, value: { presets: 'nope' } })
    expect(await api2({ method: 'agentPresets/list', args: {} })).toEqual({ ok: true, value: { presets: 'nope' } })
  })

  it('其他方法的 ok value 原样（不过滤）', async () => {
    const upstream: ConnectionRpcResult = { ok: true, value: { items: [{ id: 'p2temp-abc' }] } }
    const { api } = makeApi(upstream)
    const res = await api({ method: 'session/list', args: { request: {} } })
    expect(res).toEqual(upstream)
  })
})

describe('装配（U-15 消费面）', () => {
  it('dsh 未配置 → forbidden', async () => {
    const api = registerM1Api({ ledger: readyLedger(), log: () => {} })
    const res = await api({ method: 'session/list', args: { request: {} } })
    expect(expectFail(res).code).toBe('pbots/forbidden')
  })

  it('默认共享 m1Ledger：未注入 ledger 时用它校验（U-12 的 tap 喂它）', async () => {
    const { m1Ledger } = await import('../../../main/m1-api')
    m1Ledger.record({ type: 'ready', clientId: 'shared-cli' })
    m1Ledger.record({ type: 'waterfall', event: 'approval/request', eventId: 'shared-ev', agentId: 's', request: { toolName: 'bash' } })
    const { api, dsh } = makeApiWithoutLedgerInjection()
    const res = await api({ method: '$events/result', args: { clientId: 'shared-cli', eventId: 'shared-ev', outcome: { kind: 'result', value: 'rejected' } } })
    expect(res.ok).toBe(true)
    expect(dsh.apiCount).toBe(1)
  })
})

function makeApiWithoutLedgerInjection() {
  const dsh = makeDsh()
  const api = registerM1Api({ dsh, log: () => {} })
  return { api, dsh }
}

// U-22 [GU-1]：dsh.rpc 抛错（fetch 断链 / 非 200 / JSON 坏）不得炸 ipcMain.handle —— 全路径转
// {ok:false, code:'pbots/unavailable'}；R10 不变量：$events/result 抛错时 pending 保留可重试。
describe('rpc 抛错兜底（GU-1）', () => {
  function throwingDsh(message = 'fetch failed') {
    let count = 0
    return {
      get apiCount(): number { return count },
      async rpc(): Promise<ConnectionRpcResult> { count += 1; throw new Error(message) },
    }
  }

  it('rpc reject → pbots/unavailable（含 message），不向上抛', async () => {
    const ledger = readyLedger()
    const api = registerM1Api({ dsh: throwingDsh('socket hang up'), ledger, log: () => {} })
    const res = await api({ method: 'session/list', args: { _request: {} } })
    expect(res).toEqual({ ok: false, error: { code: 'pbots/unavailable', message: 'dsh rpc failed: socket hang up', details: {} } })
  })

  it('rpc 抛非 Error 值 → unavailable，message 落 String 化', async () => {
    const api = registerM1Api({ dsh: throwingDsh('boom') as never, ledger: readyLedger(), log: () => {} })
    const res = await api({ method: 'session/prompt', args: { request: { content: [] } } })
    expect(expectFail(res).code).toBe('pbots/unavailable')
  })

  it('$events/result 抛错 → unavailable 且 ledger pending 保留（R10：可重试）', async () => {
    const ledger = readyLedger() // ev-1 pending
    const api = registerM1Api({ dsh: throwingDsh(), ledger, log: () => {} })
    const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } } })
    expect(expectFail(res).code).toBe('pbots/unavailable')
    expect(ledger.pendingEvents().map((e) => e.eventId)).toEqual(['ev-1'])
  })
})
