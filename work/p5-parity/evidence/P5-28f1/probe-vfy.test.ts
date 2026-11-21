// P5-28.f1 验收独立探针（verifier 自建，不经作者测试）。
// 目标树：/tmp/bot-wt/P5-28f1-verify @01d5190（验收期间零漂移）。
// 覆盖：F1 在途守卫语义（含换 clientId 重连）、F2 稀疏矩阵、S1 门控（真实 process.env + 生产 define 束）、
//       S2 非法批次 M1 照旧拒答 + deadline 闭环独立复演。
import { describe, expect, it, vi, afterEach } from 'vitest'

const WT = '/tmp/bot-wt/P5-28f1-verify/app/ui'
const { EventsLedger } = await import(`${WT}/main/dsh/ledger.ts`)
const { registerM1Api } = await import(`${WT}/main/m1-api/index.ts`)
vi.mock('electron', () => ({ MessageChannelMain: class {} }))
const { registerM2Mux } = await import(`${WT}/main/m2-mux/index.ts`)
const { createApprovalDeadline, QUESTION_DEADLINE_REJECTION } = await import(`${WT}/main/m2-mux/deadline.ts`)

type Res = { ok: boolean; error?: { code: string; message: string } }
const fail = (r: Res) => { if (r.ok) throw new Error(`expected ok:false, got ${JSON.stringify(r)}`); return r.error! }

function deferredDsh() {
  const resolvers: Array<(r: Res) => void> = []
  const calls: Array<{ method: string; args: unknown }> = []
  return {
    resolvers, calls,
    dsh: { rpc: async (method: string, args: unknown) => { calls.push({ method, args }); return new Promise<Res>((resolve) => resolvers.push(resolve as (r: Res) => void)) } },
  }
}
function qLedger(clientId = 'cli-1') {
  const l = new EventsLedger({ warn: () => {} })
  l.record({ type: 'ready', clientId })
  l.record({ type: 'waterfall', event: 'user-questions/request', eventId: 'ev-q', agentId: 's-1', request: { questions: [{ id: 'q1', question: 'a?' }, { id: 'q2', question: 'b?' }] } })
  return l
}
function aLedger(clientId = 'cli-1') {
  const l = new EventsLedger({ warn: () => {} })
  l.record({ type: 'ready', clientId })
  l.record({ type: 'waterfall', event: 'approval/request', eventId: 'ev-1', agentId: 's-1', request: { toolName: 'bash' } })
  return l
}
const answersArgs = (answers: unknown) => ({ clientId: 'cli-1', eventId: 'ev-q', outcome: { kind: 'result', value: { answers } } })

afterEach(() => { delete process.env.PBOTS_TEST_HOOKS; process.env.NODE_ENV = 'test' })

describe('F1 在途守卫（独立复演）', () => {
  it('并发同 eventId（审批）：恰 1 份上 wire，第二份 forbidden(in flight)；settle 后串行二答仍拒', async () => {
    const { dsh, calls, resolvers } = deferredDsh()
    const api = registerM1Api({ dsh: dsh as never, ledger: aLedger(), log: () => {} })
    const args = { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } }
    const first = api({ method: '$events/result', args })
    const second = await api({ method: '$events/result', args })
    expect(fail(second).code).toBe('pbots/forbidden')
    expect(fail(second).message).toContain('in flight')
    expect(calls).toHaveLength(1) // 恰 1 份上 wire
    resolvers[0]!({ ok: true, value: null })
    expect((await first).ok).toBe(true)
    const third = await api({ method: '$events/result', args }) // 串行二答：已消费 → 拒
    expect(fail(third).code).toBe('pbots/forbidden')
    expect(calls).toHaveLength(1)
  })

  it('并发同 eventId（提问 answers，review 复现形）：第二份拒、恰 1 份、pending 在 settle 前保留', async () => {
    const { dsh, calls, resolvers } = deferredDsh()
    const ledger = qLedger()
    const api = registerM1Api({ dsh: dsh as never, ledger, log: () => {} })
    const first = api({ method: '$events/result', args: answersArgs([{ id: 'q1', selected: ['/a'] }, { id: 'q2', selected: [] }]) })
    const second = await api({ method: '$events/result', args: answersArgs([{ id: 'q1', selected: ['/b'] }, { id: 'q2', selected: [] }]) })
    expect(fail(second).code).toBe('pbots/forbidden')
    expect(calls).toHaveLength(1)
    expect(ledger.pendingEventKind('ev-q')).toBe('user-questions/request') // 在途未下账
    resolvers[0]!({ ok: true, value: null })
    expect((await first).ok).toBe(true)
    expect(ledger.pendingEventKind('ev-q')).toBeUndefined() // ok 才消费
  })

  it('rpc 失败（throw → unavailable）解除守卫：重试可上 wire，pending 保留（R10 不变量不破）', async () => {
    const calls: Array<{ method: string; args: unknown }> = []
    let throwOnce = true
    const dsh = { rpc: async (method: string, args: unknown) => { calls.push({ method, args }); if (throwOnce) { throwOnce = false; throw new Error('fetch failed') } return { ok: true, value: null } } }
    const ledger = aLedger()
    const api = registerM1Api({ dsh: dsh as never, ledger, log: () => {} })
    const args = { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } }
    const r1 = await api({ method: '$events/result', args })
    expect(fail(r1).code).toBe('pbots/unavailable')
    expect(ledger.pendingEventKind('ev-1')).toBe('approval/request') // 保留可重试
    const r2 = await api({ method: '$events/result', args }) // 不被守卫误伤
    expect(r2.ok).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('重连换 clientId：在途期间新 client 作答被本地拒（不上 wire）；失败 settle 后新 client 重试成功', async () => {
    const { dsh, calls, resolvers } = deferredDsh()
    const ledger = aLedger('cli-1')
    const api = registerM1Api({ dsh: dsh as never, ledger, log: () => {} })
    const first = api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
    ledger.record({ type: 'ready', clientId: 'cli-2' }) // renderer 重连，新 ready client
    const byNew = await api({ method: '$events/result', args: { clientId: 'cli-2', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
    expect(fail(byNew).code).toBe('pbots/forbidden') // 在途守卫拒，不双上 wire
    expect(calls).toHaveLength(1)
    resolvers[0]!({ ok: false, error: { code: 'gateway/503', message: 'x' } }) // 第一份失败 settle
    expect((await first).ok).toBe(false)
    const retryP = api({ method: '$events/result', args: { clientId: 'cli-2', eventId: 'ev-1', outcome: { kind: 'result', value: 'allowed-once' } } })
    resolvers[1]!({ ok: true, value: null })
    expect((await retryP).ok).toBe(true) // 新 client 重试不被陈旧守卫挡
    expect(calls).toHaveLength(2)
  })

  it('不同 eventId 并发互不阻塞', async () => {
    const { dsh, resolvers } = deferredDsh()
    const ledger = aLedger()
    ledger.record({ type: 'waterfall', event: 'approval/request', eventId: 'ev-2', agentId: 's-1', request: { toolName: 'bash' } })
    const api = registerM1Api({ dsh: dsh as never, ledger, log: () => {} })
    const a = api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-1', outcome: { kind: 'result', value: 'rejected' } } })
    const b = api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-2', outcome: { kind: 'result', value: 'allowed-once' } } })
    resolvers[0]!({ ok: true, value: null }); resolvers[1]!({ ok: true, value: null })
    expect((await Promise.all([a, b])).map((r) => r.ok)).toEqual([true, true])
  })
})

describe('F2 稀疏矩阵（独立复演）', () => {
  it.each([
    ['selected 稀疏（structuredClone 保留洞）', [{ id: 'q1', selected: structuredClone(new Array(1)) }, { id: 'q2', selected: [] }]],
    ['selected 显式 [null]', [{ id: 'q1', selected: [null] }, { id: 'q2', selected: [] }]],
    ['selected 显式 [undefined]', [{ id: 'q1', selected: [undefined] }, { id: 'q2', selected: [] }]],
    ['answers 稀疏（new Array(2)）', structuredClone(new Array(2))],
  ])('%s → invalid-args、dsh=0、pending 保留', async (_n, answers) => {
    const calls: Array<unknown> = []
    const ledger = qLedger()
    const api = registerM1Api({ dsh: { rpc: async (_m: string, _a: unknown) => { calls.push(1); return { ok: true, value: null } } } as never, ledger, log: () => {} })
    expect(fail(await api({ method: '$events/result', args: answersArgs(answers) })).code).toBe('pbots/invalid-args')
    expect(calls).toHaveLength(0)
    expect(ledger.pendingEventKind('ev-q')).toBe('user-questions/request')
  })

  it('正常数组不误伤：空 selected、10000 串、custom、answers 乱序——透传且 wire 参数逐字节一致', async () => {
    const calls: Array<{ method: string; args: unknown }> = []
    const ledger = qLedger()
    const api = registerM1Api({ dsh: { rpc: async (method: string, args: unknown) => { calls.push({ method, args }); return { ok: true, value: null } } } as never, ledger, log: () => {} })
    const good = [{ id: 'q2', selected: [], custom: 'note' }, { id: 'q1', selected: Array.from({ length: 10000 }, () => 'x') }]
    expect((await api({ method: '$events/result', args: answersArgs(good) })).ok).toBe(true)
    expect(calls).toEqual([{ method: '$events/result', args: answersArgs(good) }])
  })
})

describe('S1 门控（真实 process.env，非 stubEnv）', () => {
  it('NODE_ENV=production 且无 opt-in：handler 与 __pbotsM2 均无 testAnswerEvent；观测面仍在', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.PBOTS_TEST_HOOKS
    const h = registerM2Mux({})
    const g = (globalThis as unknown as { __pbotsM2?: Record<string, unknown> }).__pbotsM2
    expect((h as unknown as Record<string, unknown>).testAnswerEvent).toBeUndefined()
    expect(g?.testAnswerEvent).toBeUndefined()
    expect(g?.stats).toBeDefined()
    expect(g?.ledger).toBeDefined()
    expect(typeof g?.testDropSocket).toBe('function')
  })

  it('PBOTS_TEST_HOOKS=1：安装且经 main peer 直发（结构化 answers 原样）', async () => {
    process.env.PBOTS_TEST_HOOKS = '1'
    const calls: Array<{ method: string; args: unknown }> = []
    const h = registerM2Mux({ dsh: { ready: () => new Promise(() => {}), rpc: async (method: string, args: unknown) => { calls.push({ method, args }); return { ok: true, value: null } } } as never })
    expect(typeof (h as unknown as Record<string, unknown>).testAnswerEvent).toBe('function')
    const answers = [{ id: 'q3', selected: [], custom: 'x' }]
    await (h as unknown as { testAnswerEvent: (c: string, e: string, v: unknown) => Promise<unknown> }).testAnswerEvent('c1', 'e1', { answers })
    expect(calls).toEqual([{ method: '$events/result', args: { clientId: 'c1', eventId: 'e1', outcome: { kind: 'result', value: { answers } } } }])
  })

  it('生产 define+minify 束（esbuild --define NODE_ENV=production）：门控仍是运行时 env——未设不装、设 1 装', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.PBOTS_TEST_HOOKS
    const prod = await import('/tmp/bot-p528f1-vfy/m2-prod/m2-mux.prod.mjs')
    const hOff = prod.registerM2Mux({})
    expect((hOff as unknown as Record<string, unknown>).testAnswerEvent).toBeUndefined()
    process.env.PBOTS_TEST_HOOKS = '1'
    const hOn = prod.registerM2Mux({})
    expect(typeof (hOn as unknown as Record<string, unknown>).testAnswerEvent).toBe('function')
  })
})

describe('S2 非法批次（独立复演）', () => {
  it('空串 id 批次：仍入账、questionIds 缺席；M1 结构化作答 → invalid-args（照旧拒答）、dsh=0、pending 不动', async () => {
    const calls: Array<unknown> = []
    const ledger = new EventsLedger({ warn: () => {} })
    ledger.record({ type: 'ready', clientId: 'cli-1' })
    ledger.record({ type: 'waterfall', event: 'user-questions/request', eventId: 'ev-bad', agentId: 's-1', request: { questions: [{ id: '', question: 'a?' }] } })
    expect(ledger.pendingEventKind('ev-bad')).toBe('user-questions/request') // 仍入账（deadline 可见）
    expect(ledger.questionIds('ev-bad')).toBeUndefined()
    const api = registerM1Api({ dsh: { rpc: async () => { calls.push(1); return { ok: true, value: null } } } as never, ledger, log: () => {} })
    expect(fail(await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-bad', outcome: { kind: 'result', value: { answers: [{ id: '', selected: [] }] } } } })).code).toBe('pbots/invalid-args')
    expect(fail(await api({ method: '$events/result', args: { clientId: 'cli-1', eventId: 'ev-bad', outcome: { kind: 'result', value: 'allowed-once' } } })).code).toBe('pbots/forbidden') // 审批串同样本地拒（validateResult kind 不匹配，既有语义）
    expect(calls).toHaveLength(0)
    expect(ledger.pendingEventKind('ev-bad')).toBe('user-questions/request')
  })

  it('闭环（独立假时钟）：越 deadline → {kind:"rejected"} 恰 1 次、无 result 放行、下账不挂起', async () => {
    const ledger = new EventsLedger({ warn: () => {} })
    ledger.record({ type: 'waterfall', event: 'user-questions/request', eventId: 'ev-bad', agentId: 's-1', request: { questions: [{ id: '', question: 'a?' }] } })
    const calls: Array<{ method: string; args: unknown }> = []
    let nowMs = 0
    const dl = createApprovalDeadline({
      dsh: { rpc: async (method: string, args: unknown) => { calls.push({ method, args }); return { ok: true, value: undefined } } } as never,
      ledger, isPortMounted: () => false, mainClientId: () => 'main-c1',
      deadlineMs: 2000, now: () => nowMs, log: () => {},
    })
    dl.review()
    nowMs += 1999; dl.review()
    expect(calls).toEqual([]) // 观察窗口内不发
    nowMs += 1; dl.review()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual([{ method: '$events/result', args: { clientId: 'main-c1', eventId: 'ev-bad', outcome: { kind: 'rejected', error: QUESTION_DEADLINE_REJECTION } } }])
    expect(calls[0]!.args && JSON.stringify(calls[0]!.args).includes('"kind":"result"')).toBe(false) // 绝无 result 放行
    expect(ledger.pendingEvents()).toEqual([]) // 下账完成不挂起
    dl.stop()
  })
})
