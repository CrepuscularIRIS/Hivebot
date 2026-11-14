// U-11 M1 `pbots:api` 白名单透传桥：白名单 / D9 硬拒层 / §2.2 参数约束 / raw-result / #1 过滤。
// 断言口径 PLAN §2（+4）：精确值断言；「dsh 没收到调用」统一 apiCount === 0。
// 依据：work/p3-contract/CONTRACT.md §2/§2.2（v1.3）+ 勘误行、work/p4-ui/BRIEF.md D9、PLAN U-11 行。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { M1_ALLOW, d9DeniedReason, m1Installs, registerM1Api } from '../../../main/m1-api'
import { EventsLedger } from '../../../main/dsh/ledger'
import type { ConnectionRpcResult } from '../../../main/dsh/connect'
// P5-28.f1 S1 断言放本文件（白名单）：testAnswerEvent 是 M1 的旁路安装面。
vi.mock('electron', () => ({ MessageChannelMain: class {} }))
import { registerM2Mux } from '../../../main/m2-mux'

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
  it('白名单恰为 C §2 表的 16 个 M1 方法 + T51 setIndexes + T49 配置口 5 法 + T73b 两法（24 个）', () => {
    expect([...M1_ALLOW].sort()).toEqual([
      '$events/result',
      'agentPresets/list',
      'credentials/describe',
      'credentials/set',
      'credentials/unset',
      'p2sdk/connector_grants_clear',
      'p2sdk/connector_grants_remember',
      'p2temp/session.createWithConnectors',
      'pluginManager/installBundle',
      'pluginManager/listBundles',
      'pluginMarket/listIndexes',
      'pluginMarket/readEntryDetail',
      'pluginMarket/search',
      'pluginMarket/setIndexes',
      'session/cancel',
      'session/create',
      'session/events',
      'session/list',
      'session/modelCatalog',
      'session/prompt',
      'session/rename',
      'session/selectModel',
      'settings/describe',
      'settings/mutate',
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

describe('§2.2 T51 setIndexes 目录源参数守卫（invalid-args）', () => {
  it.each([
    ['非数组 urls', { urls: 'http://x' }],
    ['缺 urls', {}],
    ['超 20 项', { urls: Array.from({ length: 21 }, (_, i) => `http://x/${i}/index.json`) }],
    ['含非字符串', { urls: ['http://x/index.json', 42] }],
    ['含 undefined（T51c R5：find 与未找到同值）', { urls: [undefined, 'https://a.example/index.json'] }],
    ['含空串', { urls: [''] }],
    ['超 2048 字符项', { urls: [`http://x/${'a'.repeat(2100)}/index.json`] }],
  ])('%s → pbots/invalid-args，dsh 计数 === 0', async (_name, args) => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'pluginMarket/setIndexes', args })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('合法 {urls:[…]}（≤20 项、每项非空 ≤2048）→ 透传 dsh（计数 1）', async () => {
    const { api, dsh } = makeApi()
    const res = await api({ method: 'pluginMarket/setIndexes', args: { urls: ['http://127.0.0.1:1/index.json'] } })
    expect(res).toEqual({ ok: true, value: null })
    expect(dsh.apiCount).toBe(1)
    expect(dsh.calls[0]).toEqual({ method: 'pluginMarket/setIndexes', args: { urls: ['http://127.0.0.1:1/index.json'] } })
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

  it('U-26 ②（D5）：__pbotsM1 观测面只记透传成功的调用（拒绝不进）', async () => {
    const start = m1Installs.length
    const rejected = makeApi()
    await rejected.api({ method: 'pluginManager/installBundle', args: { spec: 'x', options: { enabled: true } } })
    expect(m1Installs.length).toBe(start) // enabled:true 拒绝 → 不记
    const ok = makeApi()
    await ok.api({ method: 'pluginManager/installBundle', args: { spec: '@scope/x@1.0.0', options: { enabled: false } } })
    expect(m1Installs[start]).toEqual({ spec: '@scope/x@1.0.0', enabled: false })
    expect(m1Installs.length).toBe(start + 1)
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

  // P5-07 ②：提问事件不接受审批字符串 outcome（作答分支 = P5-28）。
  it.each(['allowed-once', 'rejected'])(
    'P5-07：提问 eventId 传审批字符串 %s → pbots/invalid-args，dsh 计数 === 0',
    async (value) => {
      const ledger = readyLedger()
      ledger.record({
        type: 'waterfall', event: 'user-questions/request', eventId: 'ev-q', agentId: 's-1',
        request: { questions: [{ id: 'q1', question: 'Q?', header: 'H', options: [] }] },
      })
      const { api, dsh } = makeApi(undefined, ledger)
      const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-q', outcome: { kind: 'result', value } } })
      expect(expectFail(res).code).toBe('pbots/invalid-args')
      expect(dsh.apiCount).toBe(0)
      // 提问条目不下账（未作答成功）
      expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-q')).toBe(true)
      // 同 ledger 的审批 eventId 原行为不变（U-11 D9 全集照跑通过）
      const ok = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
      expect(ok).toEqual({ ok: true, value: null })
      expect(dsh.apiCount).toBe(1)
    },
  )

  // P5-28 ①②③：提问作答分支（严格 {answers:[{id,selected,custom?}]}，id 集合 = 该批问题 id 集合）。
  const questionLedger = (): EventsLedger => {
    const ledger = readyLedger() // 审批 ev-1（原行为对照）
    ledger.record({
      type: 'waterfall', event: 'user-questions/request', eventId: 'ev-q', agentId: 's-1',
      request: { questions: [{ id: 'q1', question: '路径?' }, { id: 'q2', question: '备注?' }] },
    })
    return ledger
  }
  const answersArgs = (answers: unknown) => ({
    clientId: 'cli-1', eventId: 'ev-q', outcome: { kind: 'result', value: { answers } },
  })

  it('① 合法 answers → 透传 dsh 原样（args 逐字段相等）、下账；同 ledger 审批行为不变', async () => {
    const { api, dsh, ledger } = makeApi(undefined, questionLedger())
    const args = answersArgs([{ id: 'q1', selected: ['/a'] }, { id: 'q2', selected: [], custom: 'note' }])
    const res = await api({ method: '$events/result', args })
    expect(res).toEqual({ ok: true, value: null })
    expect(dsh.apiCount).toBe(1)
    expect(dsh.calls[0]).toEqual({ method: '$events/result', args }) // 原样转 dsh
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-q')).toBe(false) // 下账
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(true)  // 审批不受影响
  })

  it.each([
    ['id 缺（漏答 q2）', [{ id: 'q1', selected: [] }]],
    ['id 多（未知 q3）', [{ id: 'q1', selected: [] }, { id: 'q2', selected: [] }, { id: 'q3', selected: [] }]],
    ['id 类型错', [{ id: 42, selected: [] }, { id: 'q2', selected: [] }]],
    ['selected 非字符串数组', [{ id: 'q1', selected: 'x' }, { id: 'q2', selected: [] }]],
    ['answers 非数组', 'nope']],
  )('② %s → pbots/invalid-args，dsh 计数 === 0，不下账', async (_name, answers) => {
    const { api, dsh, ledger } = makeApi(undefined, questionLedger())
    const res = await api({ method: '$events/result', args: answersArgs(answers) })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-q')).toBe(true)
  })

  it('② 对审批事件传 answers → pbots/invalid-args，dsh 计数 === 0（P5-07 口径反向）', async () => {
    const { api, dsh } = makeApi() // readyLedger：审批 ev-1
    const res = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: { answers: [{ id: 'q1', selected: [] }] } } } })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
  })

  it('③ 同一提问 eventId 第二次作答 → 拒绝（成功即消费；重连不重复提交）', async () => {
    const { api, dsh } = makeApi(undefined, questionLedger())
    const args = answersArgs([{ id: 'q1', selected: ['/a'] }, { id: 'q2', selected: [] }])
    const first = await api({ method: '$events/result', args })
    expect(first).toEqual({ ok: true, value: null })
    const second = await api({ method: '$events/result', args })
    expect(second.ok).toBe(false)
    expect(dsh.apiCount).toBe(1) // 第二次没到 dsh
  })

  it('提问作答的 clientId 资格口径与审批一致：不匹配 → pbots/forbidden，dsh 计数 === 0', async () => {
    const { api, dsh } = makeApi(undefined, questionLedger())
    const res = await api({ method: '$events/result', args: { clientId: 'cli-other', eventId: 'ev-q', outcome: { kind: 'result', value: { answers: [{ id: 'q1', selected: [] }, { id: 'q2', selected: [] }] } } } })
    expect(expectFail(res).code).toBe('pbots/forbidden')
    expect(dsh.apiCount).toBe(0)
  })

  // P5-28.f1 F2（REVIEW correctness CONFIRMED）：`selected: new Array(1)` 的稀疏槽被 every 跳过，
  // structuredClone 后仍稀疏、rpcRaw JSON 编码成 [null] 上 wire。ledger 层拒后 M1 不得透传。
  it('F2：稀疏 selected（structuredClone 保留洞）→ pbots/invalid-args，dsh 计数 === 0，pending 保留', async () => {
    const { api, dsh, ledger } = makeApi(undefined, questionLedger())
    const sparse = structuredClone(new Array(1))
    expect(0 in sparse).toBe(false)
    const res = await api({ method: '$events/result', args: answersArgs([{ id: 'q1', selected: sparse }, { id: 'q2', selected: [] }]) })
    expect(expectFail(res).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(0)
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-q')).toBe(true)
  })
})

// P5-28.f1 F1（REVIEW correctness CONFIRMED）：同一 eventId 两个在途 api 调用都上 wire，
// 第二份被 gateway 静默忽略却返回 ok:true（假成功）。修法：per-eventId 在途守卫——第一份
// 未 settle 前第二个调用本地拒（forbidden：与 clientId/eventId 资格拒绝同族，不新增契约错误码）。
describe('P5-28.f1 F1：$events/result 同 eventId 在途守卫', () => {
  function deferredDsh(): {
    dsh: { rpc(method: string, args: unknown): Promise<ConnectionRpcResult> }
    calls: Array<{ method: string; args: unknown }>
    resolvers: Array<(r: ConnectionRpcResult) => void>
  } {
    const resolvers: Array<(r: ConnectionRpcResult) => void> = []
    const calls: Array<{ method: string; args: unknown }> = []
    return {
      resolvers, calls,
      dsh: {
        async rpc(method: string, args: unknown): Promise<ConnectionRpcResult> {
          calls.push({ method, args })
          return new Promise((resolve) => resolvers.push(resolve))
        },
      },
    }
  }
  const questionLedgerF1 = (): EventsLedger => {
    const ledger = readyLedger()
    ledger.record({
      type: 'waterfall', event: 'user-questions/request', eventId: 'ev-q', agentId: 's-1',
      request: { questions: [{ id: 'q1', question: '路径?' }, { id: 'q2', question: '备注?' }] },
    })
    return ledger
  }

  it('并发二答（审批）：第二调用本地拒 forbidden、恰 1 份上 wire；成功 settle 后守卫解除且已消费', async () => {
    const { dsh, calls, resolvers } = deferredDsh()
    const api = registerM1Api({ dsh, ledger: readyLedger(), log: () => {} })
    const args = { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } }
    const first = api({ method: '$events/result', args })
    const second = await api({ method: '$events/result', args }) // 第一份在途
    expect(expectFail(second).code).toBe('pbots/forbidden')
    expect(expectFail(second).message).toContain('in flight')
    expect(calls).toHaveLength(1)
    resolvers[0]!({ ok: true, value: null })
    expect((await first).ok).toBe(true)
    const third = await api({ method: '$events/result', args }) // settle 后：已消费 → not pending
    expect(expectFail(third).code).toBe('pbots/forbidden')
    expect(calls).toHaveLength(1)
  })

  it('并发二答（提问 answers，review 复现场景）：第二调用拒、恰 1 份上 wire、ledger 保留', async () => {
    const { dsh, calls, resolvers } = deferredDsh()
    const api = registerM1Api({ dsh, ledger: questionLedgerF1(), log: () => {} })
    const first = api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-q', outcome: { kind: 'result', value: { answers: [{ id: 'q1', selected: ['/a'] }, { id: 'q2', selected: [] }] } } } })
    const second = await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-q', outcome: { kind: 'result', value: { answers: [{ id: 'q1', selected: ['/b'] }, { id: 'q2', selected: [] }] } } } })
    expect(second.ok).toBe(false)
    expect(calls).toHaveLength(1)
    resolvers[0]!({ ok: true, value: null })
    expect((await first).ok).toBe(true)
  })

  it('失败 settle 同样解除守卫：ok:false 后重试可上 wire（pending 保留，R10 口径不变）', async () => {
    const results: ConnectionRpcResult[] = [
      { ok: false, error: { code: 'gateway/503', message: 'x', details: {} } },
      { ok: true, value: null },
    ]
    const calls: Array<{ method: string; args: unknown }> = []
    const dsh = { rpc: async (method: string, args: unknown): Promise<ConnectionRpcResult> => { calls.push({ method, args }); return results.shift()! } }
    const ledger = readyLedger()
    const api = registerM1Api({ dsh, ledger, log: () => {} })
    const args = { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } }
    expect((await api({ method: '$events/result', args })).ok).toBe(false)
    expect(ledger.pendingEvents().some((e) => e.eventId === 'ev-1')).toBe(true)
    expect((await api({ method: '$events/result', args })).ok).toBe(true) // 守卫已随 settle 清除
    expect(calls).toHaveLength(2)
  })

  it('不同 eventId 并发互不阻塞（守卫按 eventId）', async () => {
    const { dsh, resolvers } = deferredDsh()
    const ledger = readyLedger()
    ledger.record({ type: 'waterfall', event: 'approval/request', eventId: 'ev-2', agentId: 's-1', request: { toolName: 'bash' } })
    const api = registerM1Api({ dsh, ledger, log: () => {} })
    const a = api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } } })
    const b = api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-2', outcome: { kind: 'result', value: 'allowed-once' } } })
    resolvers[0]!({ ok: true, value: null })
    resolvers[1]!({ ok: true, value: null })
    const [ra, rb] = await Promise.all([a, b])
    expect([ra.ok, rb.ok]).toEqual([true, true])
  })
})

// P5-28.f1 S1（REVIEW security CONFIRMED）：testAnswerEvent 可绕 M1 把非法 answers 直发真实
// gateway——生产构建不得安装该钩子；测试安装须显式 opt-in（PBOTS_TEST_HOOKS=1）。
describe('P5-28.f1 S1：m2 testAnswerEvent 门控安装', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('生产环境（NODE_ENV=production、无 PBOTS_TEST_HOOKS）→ 钩子不安装；stats/ledger/testDropSocket 观测面仍在', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PBOTS_TEST_HOOKS', '')
    registerM2Mux({})
    const g = (globalThis as unknown as { __pbotsM2?: { testAnswerEvent?: unknown; stats?: unknown; ledger?: unknown; testDropSocket?: unknown } }).__pbotsM2
    expect(g?.testAnswerEvent).toBeUndefined()
    expect(g?.stats).toBeDefined()
    expect(g?.ledger).toBeDefined()
    expect(typeof g?.testDropSocket).toBe('function')
  })

  it('PBOTS_TEST_HOOKS=1（测试显式 opt-in）→ 安装并经 main peer 直发 $events/result（结构化 answers 原样）', async () => {
    vi.stubEnv('PBOTS_TEST_HOOKS', '1')
    const calls: Array<{ method: string; args: unknown }> = []
    const h = registerM2Mux({
      // ready 永不 resolve：抑制 U-16 常驻 $events 订阅循环（只测钩子的直发行为）
      dsh: { ready: () => new Promise(() => {}), rpc: async (method: string, args: unknown): Promise<ConnectionRpcResult> => { calls.push({ method, args }); return { ok: true, value: null } } } as never,
    })
    expect(typeof h.testAnswerEvent).toBe('function')
    const answers = [{ id: 'q3', selected: [], custom: 'via-hook' }]
    await h.testAnswerEvent?.('c', 'q', { answers })
    expect(calls).toEqual([{ method: '$events/result', args: { clientId: 'c', eventId: 'q', outcome: { kind: 'result', value: { answers } } } }])
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

// ---- T49：DSH 配置口窄门（Q-047「直接抄DSH的配置」；放行依据 2026-11-11 用户原话）----
// credentials 三法 + settings/describe + settings/mutate（探针实测 update 在 llm-pi-ai 上
// 因 p2sdk.yml !!js 节点恒炸，DSH Models 页官方写法即 mutate——receipts/T49-probe.receipt.md）。
describe('T49 DSH 配置口窄门', () => {
  const okCred = (ref: string): unknown => ({ ref, value: 'sk-t49' })
  it('① credentials/set 合法引用（当前路由 apiKeyEnv）→ 透传 dsh，返回不含 value', async () => {
    const { api, dsh } = makeApi({ ok: true, value: undefined })
    const res = await api({ method: 'credentials/set', args: okCred('P2SDK_LLM_API_KEY') })
    expect(res.ok).toBe(true)
    expect(dsh.calls.length).toBe(1)
    expect(JSON.stringify(res)).not.toContain('sk-t49')
  })
  it('② 非法引用名 / 非 llm 引用（GITHUB_TOKEN、DSH_SECRET、小写）→ forbidden，dsh 计数 0', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    for (const ref of ['GITHUB_TOKEN', 'DSH_MASTER_KEY', 'lower_case', 'P2SDK_LLM_API_KEY;rm', 'llm-pi-ai/litellm']) {
      const res = await api({ method: 'credentials/set', args: okCred(ref) })
      expect(expectFail(res).code).toBe('pbots/forbidden')
    }
    expect(dsh.calls.length).toBe(0)
  })
  it('③ credentials/describe：>64 个引用名 → invalid-args；≤64 且形状合法 → 透传', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    const many = Array.from({ length: 65 }, (_, i) => `REF_${i}`)
    const bad = await api({ method: 'credentials/describe', args: { refs: many } })
    expect(expectFail(bad).code).toBe('pbots/invalid-args')
    const badShape = await api({ method: 'credentials/describe', args: { refs: 'P2SDK_LLM_API_KEY' } })
    expect(expectFail(badShape).code).toBe('pbots/invalid-args')
    const good = await api({ method: 'credentials/describe', args: { refs: ['P2SDK_LLM_API_KEY', 'MYROUTE_API_KEY'] } })
    expect(good.ok).toBe(true)
    expect(dsh.calls.length).toBe(1)
  })
  it('④ credentials/* 回包字段过滤：上游多出 value 字段 → main 丢弃（防上游加宽）', async () => {
    const { api } = makeApi({ ok: true, value: { P2SDK_LLM_API_KEY: { configured: true, source: 'file', writable: true, value: 'sk-leak' } } })
    const res = await api({ method: 'credentials/describe', args: { refs: ['P2SDK_LLM_API_KEY'] } })
    expect(res.ok).toBe(true)
    expect(JSON.stringify(res)).not.toContain('sk-leak')
    expect(JSON.stringify(res)).toContain('"source":"file"')
  })
  it('⑤ settings/mutate 非 llm-pi-ai 命名空间 → forbidden；ops 不在 providers 路径 → forbidden；形状/apiKeyEnv 恶意 → invalid', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    const wrongNs = await api({ method: 'settings/mutate', args: { ns: 'agent-default-model', ops: [{ op: 'set', path: ['provider'], value: 'x' }] } })
    expect(expectFail(wrongNs).code).toBe('pbots/forbidden')
    const wrongPath = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['retryPolicy'], value: {} }] } })
    expect(expectFail(wrongPath).code).toBe('pbots/forbidden')
    // 分支补全（验收 4 精神：改动分支全覆盖）
    const notArray = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: 'x' } })
    expect(expectFail(notArray).code).toBe('pbots/invalid-args')
    const wrongOp = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'merge', path: ['providers', 'x'], value: {} }] } })
    expect(expectFail(wrongOp).code).toBe('pbots/forbidden')
    const unsetOk = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', 'x'] }] } })
    expect(unsetOk.ok).toBe(true)
    const badValue = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'x'], value: 'str' }] } })
    expect(expectFail(badValue).code).toBe('pbots/invalid-args')
    const badEnv = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'x'], value: { apiKeyEnv: 'GITHUB_TOKEN' } }] } })
    expect(expectFail(badEnv).code).toBe('pbots/forbidden')
    const emptyValue = await api({ method: 'credentials/set', args: { ref: 'P2SDK_LLM_API_KEY', value: '' } })
    expect(expectFail(emptyValue).code).toBe('pbots/invalid-args')
    const unset = await api({ method: 'credentials/unset', args: { ref: 'P2SDK_LLM_API_KEY' } })
    expect(unset.ok).toBe(true)
    expect(dsh.calls.length).toBe(2) // mutate unset + credentials unset（此前透传的 unsetOk 一次）
  })
  it('⑤b（经理守卫）mutate 的 apiKeyEnv 为 GITHUB_TOKEN / 别的 route 的名 → forbidden，dsh 计数 0；litellm 两种合法名都过', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    const github = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'myroute'], value: { apiKeyEnv: 'GITHUB_TOKEN', api: 'openai-completions' } }] } })
    expect(expectFail(github).code).toBe('pbots/forbidden')
    const foreign = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'routea'], value: { apiKeyEnv: 'ROUTEB_API_KEY', api: 'openai-completions' } }] } })
    expect(expectFail(foreign).code).toBe('pbots/forbidden')
    expect(dsh.calls.length).toBe(0)
    const derivedOk = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'routea'], value: { apiKeyEnv: 'ROUTEA_API_KEY', api: 'openai-completions' } }] } })
    expect(derivedOk.ok).toBe(true)
    const litellmDefault = await api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'litellm'], value: { apiKeyEnv: 'P2SDK_LLM_API_KEY', api: 'openai-completions' } }] } })
    expect(litellmDefault.ok).toBe(true)
    expect(dsh.calls.length).toBe(2)
  })
  it('⑥ settings/update / replace / openSettingsDocument → forbidden（探针定论：写口只开 mutate）', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    for (const m of ['settings/update', 'settings/replace', 'settings/openSettingsDocument']) {
      const res = await api({ method: m, args: { ns: 'llm-pi-ai' } })
      expect(expectFail(res).code).toBe('pbots/forbidden')
    }
    expect(dsh.calls.length).toBe(0)
  })
  it('⑦ 既有 D9 全集照旧拒：account、/permission、configForms；credentials 表外方法（credentials/list）仍拒', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    for (const m of ['account/describe', '/permission/grant', 'configForms/list', 'credentials/list', 'credentials/export']) {
      const res = await api({ method: m, args: {} })
      expect(expectFail(res).code).toBe('pbots/forbidden')
    }
    expect(dsh.calls.length).toBe(0)
  })
  it('⑧ 失败路径错误信息与日志不含传入 value 原文（key 只进不出）', async () => {
    const { api, logs } = makeApi({ ok: false, error: { code: 'credential-rejected', message: 'provider refused', details: {} } })
    const res = await api({ method: 'credentials/set', args: okCred('P2SDK_LLM_API_KEY') })
    expect(expectFail(res).code).toBe('credential-rejected')
    expect(JSON.stringify(logs)).not.toContain('sk-t49')
    expect(JSON.stringify(res)).not.toContain('sk-t49')
  })
})

// ---- T49b：可写引用名与 mutate 派生同源（Sol M1 + 经理补：route 字母开头）----
describe('T49b 引用名与派生同源', () => {
  const mutateRoute = (api: { (req: { method: string; args: unknown }): Promise<{ ok: boolean }> }, route: string): Promise<unknown> =>
    api({ method: 'settings/mutate', args: { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', route], value: { api: 'openai-completions' } }] } })
  it('① my-route / my_route / a-b-c：mutate 成功后同派生名 credentials/set 不被 forbidden（桩计数 1）', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    for (const route of ['my-route', 'my_route', 'a-b-c']) {
      const mut = await mutateRoute(api as never, route)
      expect(mut.ok).toBe(true)
      const derived = `${route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
      const setRes = await api({ method: 'credentials/set', args: { ref: derived, value: `sk-${route}` } })
      expect(setRes.ok, `${route} → ${derived} 应可写`).toBe(true)
    }
    expect(dsh.calls.length).toBe(6) // 3 mutate + 3 set 全透传
  })
  it('② 数字开头 route（1abc）mutate → forbidden；DSH_X_API_KEY set → forbidden', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    const mut = await mutateRoute(api as never, '1abc')
    expect(expectFail(mut as never).code).toBe('pbots/forbidden')
    const setRes = await api({ method: 'credentials/set', args: { ref: 'DSH_X_API_KEY', value: 'sk' } })
    expect(expectFail(setRes).code).toBe('pbots/forbidden')
    expect(dsh.calls.length).toBe(0)
  })
  it('③ 性质：deriveKeyRef(样本 route) 必过 set/unset 守卫（结构保证）', async () => {
    const { api, dsh } = makeApi({ ok: true, value: {} })
    for (const route of ['litellm', 'minimax-cn', 'openrouter2', 'x', 'a-b-c_d', 'deepseek-official', 'z9']) {
      const derived = `${route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
      const setRes = await api({ method: 'credentials/set', args: { ref: derived, value: 'sk' } })
      expect(setRes.ok, `route=${route} 派生 ${derived} 应可写`).toBe(true)
    }
    expect(dsh.calls.length).toBe(7)
  })
})


describe('T73b 连接器 standing-grants 窄门', () => {
  it('remember：{request:{botId,serverName}} 单键好形状放行；裸形/多余键/坏形状拒且 dsh 计数 0（T73c 边界 5：gateway 要 request 包裹——裸形过 M1 到 gateway 也必失败）', async () => {
    const { api, dsh } = makeApi()
    const ok1 = await api({ method: 'p2sdk/connector_grants_remember', args: { request: { botId: 'session-89122f7f-a17e-4a2f-bb2a-9800d13bc11b', serverName: 'server-memory-30e6e77d' } } })
    expect(ok1.ok).toBe(true)
    expect(dsh.apiCount).toBe(1)
    for (const bad of [
      { botId: 'session-89122f7f-a17e-4a2f-bb2a-9800d13bc11b', serverName: 'server-memory-30e6e77d' }, // 裸形（旧口径——T73b 遗留错形）
      { request: { botId: '../evil', serverName: 'server-memory-30e6e77d' } },
      { request: { botId: 'b', serverName: 'mem ../../x' } },
      { request: { botId: '', serverName: '' } },
      { request: { botId: 'b', serverName: 'x'.repeat(33) } },
      { request: { botId: 'b', serverName: 'server-memory-30e6e77d' }, extra: 1 }, // 多余键
    ]) {
      const res = await api({ method: 'p2sdk/connector_grants_remember', args: bad })
      expect(res.ok, JSON.stringify(bad)).toBe(false)
      expect(expectFail(res).code).toBe('pbots/invalid-args')
    }
    expect(dsh.apiCount, '坏形状不进 dsh').toBe(1)
  })

  it('clear：无参放行；带参拒', async () => {
    const { api, dsh } = makeApi()
    const ok1 = await api({ method: 'p2sdk/connector_grants_clear', args: {} })
    expect(ok1.ok).toBe(true)
    const bad = await api({ method: 'p2sdk/connector_grants_clear', args: { x: 1 } })
    expect(bad.ok).toBe(false)
    expect(expectFail(bad).code).toBe('pbots/invalid-args')
    expect(dsh.apiCount).toBe(1)
  })
})
