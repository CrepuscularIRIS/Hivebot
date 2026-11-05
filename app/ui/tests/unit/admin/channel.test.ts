// P7-F2 unit tests（main 侧）：policy.ts 权威重验（伪 source / 旧代 / 记录
// 不存在）、channel.ts 受限管理桥常驻订阅（P6 orch-channel 模式）、consumer.ts
// 空动作表明确 unavailable + 回复不返 token/PID。
import { describe, expect, it } from 'vitest'
import {
  mintOriginRef, AdminOriginRefLedger, reverifyAdminRequest,
  type AdminOriginRefRecord,
} from '../../../main/admin/policy'
import {
  ADMIN_REQUESTS_ENDPOINT, ADMIN_RESPOND_METHOD, wireAdminChannel,
  type AdminChannelFrame, type AdminDshLike,
} from '../../../main/admin/channel'
import { createAdminConsumer, sanitizeAdminValue } from '../../../main/admin/consumer'

// ---- policy：main 按权威身份 / generation / 记录重验 ----

const RECORD: AdminOriginRefRecord = {
  originRef: mintOriginRef(), sessionId: 'session-main', turnId: 'turn-7',
  generation: 3, originClass: 'user',
}
const REQUEST = {
  requestId: 'r1', generation: 3, sessionId: 'session-main', turnId: 'turn-7',
  originRef: RECORD.originRef, action: 'install', target: 'github-connectors', params: {},
}

describe('AdminOriginRefLedger', () => {
  it('issue / lookup；originRef 不可重复签发', () => {
    const ledger = new AdminOriginRefLedger()
    const rec = ledger.issue({ ...RECORD })
    expect(ledger.lookup(rec.originRef)).toEqual(rec)
    expect(ledger.lookup(mintOriginRef())).toBeUndefined()
    expect(() => ledger.issue({ ...RECORD, originRef: rec.originRef })).toThrowError(/duplicate/i)
    expect(() => ledger.issue({ ...RECORD, sessionId: '' })).toThrowError(/invalid/i)
  })
})

describe('reverifyAdminRequest', () => {
  it('完整对上（代 / 会话 / 回合 / 来源类）→ ok', () => {
    expect(reverifyAdminRequest(REQUEST, RECORD, 3)).toEqual({ ok: true })
  })

  it('记录不存在（模型自报 originRef / 伪 source）→ unknown-origin-ref', () => {
    expect(reverifyAdminRequest(REQUEST, undefined, 3)).toMatchObject({ ok: false, code: 'unknown-origin-ref' })
    expect(reverifyAdminRequest({ ...REQUEST, originRef: 'model-made-this-up' }, RECORD, 3)).toMatchObject({ ok: false, code: 'unknown-origin-ref' })
  })

  it('旧代请求拒绝（request.generation ≠ 当前代；记录代过期同样拒）', () => {
    expect(reverifyAdminRequest({ ...REQUEST, generation: 2 }, RECORD, 3)).toMatchObject({ ok: false, code: 'stale-generation' })
    expect(reverifyAdminRequest(REQUEST, { ...RECORD, generation: 1 }, 3)).toMatchObject({ ok: false, code: 'stale-generation' })
  })

  it('originRef 与 session/turn 不属于同一回合 → origin-ref-mismatch', () => {
    expect(reverifyAdminRequest({ ...REQUEST, sessionId: 'session-other' }, RECORD, 3)).toMatchObject({ ok: false, code: 'origin-ref-mismatch' })
    expect(reverifyAdminRequest({ ...REQUEST, turnId: 'turn-9' }, RECORD, 3)).toMatchObject({ ok: false, code: 'origin-ref-mismatch' })
  })

  it('污染来源记录 → tainted-turn 拒', () => {
    const tainted = { ...RECORD, originClass: 'tainted' as const }
    expect(reverifyAdminRequest(REQUEST, tainted, 3)).toMatchObject({ ok: false, code: 'tainted-turn' })
  })
})

// ---- channel：常驻订阅 + 重验 + 分发（P6 orch-channel 模式） ----

interface RpcCall { method: string; args: unknown }
type DispatchResult = { value: object } | { error: { code: string, message: string, details?: object } }

function fakeDsh() {
  const rpcs: RpcCall[] = []
  const connected: Array<(generation: number) => void> = []
  const opened: string[] = []
  let frameSink: ((frame: AdminChannelFrame) => void) | undefined
  let readyResolve: (() => void) | undefined
  const readyPromise = new Promise<void>((resolve) => { readyResolve = resolve })
  const dsh: AdminDshLike & {
    rpcs: RpcCall[]; opened: string[]; connect(generation?: number): void
    emit(frame: AdminChannelFrame): void
  } = {
    rpcs, opened,
    onConnected(listener) { connected.push(listener) },
    async ready() {
      await readyPromise
      return {
        openStream(endpoint, _args, onFrame) {
          opened.push(endpoint)
          frameSink = onFrame
          return { cancel() { frameSink = undefined } }
        },
      }
    },
    async rpc(method, args) { rpcs.push({ method, args }); return { ok: true } },
    connect(generation = 1) { for (const listener of connected) listener(generation); readyResolve?.() },
    emit(frame) { frameSink?.(frame) },
  }
  return dsh
}

const wire = (dsh: ReturnType<typeof fakeDsh>, opts: {
  verify?: (req: unknown) => { ok: true } | { ok: false, code: string, message: string }
  dispatch?: (req: unknown) => Promise<DispatchResult>
  generation?: () => number
  log?: string[]
} = {}) => wireAdminChannel({
  dsh,
  verify: opts.verify ?? (() => ({ ok: true })),
  dispatch: opts.dispatch ?? (async () => ({ error: { code: 'pbots/admin-unavailable', message: 'x' } })),
  currentGeneration: opts.generation ?? (() => 3),
  log: opts.log ? (m) => opts.log!.push(m) : undefined,
})

/** connect → subscribe 走一拍微任务。 */
const settled = () => new Promise<void>((resolve) => { setTimeout(resolve, 5) })
const respondArgs = (requestId: string, payload: object) => ({ method: ADMIN_RESPOND_METHOD, args: { request: { requestId, ...payload } } })

describe('wireAdminChannel', () => {
  it('合法请求：重验 → 分发 → respond value（含 operationId 信封）', async () => {
    const dsh = fakeDsh()
    const seen: unknown[] = []
    wire(dsh, { dispatch: async (req) => { seen.push(req); return { value: { ok: true, operationId: 'op-9' } } } })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: REQUEST })
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([REQUEST])
    expect(dsh.rpcs[0]).toEqual(respondArgs('r1', { value: { ok: true, operationId: 'op-9' } }))
  })

  it('重验失败（伪 source / 旧代）→ respond 错误码，不分发', async () => {
    const dsh = fakeDsh()
    const dispatched: unknown[] = []
    wire(dsh, {
      verify: () => ({ ok: false, code: 'unknown-origin-ref', message: 'no such record' }),
      dispatch: async (req) => { dispatched.push(req); return { value: {} } },
    })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: REQUEST })
    await new Promise((r) => setTimeout(r, 10))
    expect(dispatched).toEqual([])
    expect(dsh.rpcs[0]?.args).toMatchObject({ request: { requestId: 'r1', error: { code: 'unknown-origin-ref' } } })
  })

  it('null / 非对象帧只记 1 行日志丢弃，不 respond 不炸常驻回调', async () => {
    const dsh = fakeDsh()
    const logs: string[] = []
    wire(dsh, { log: logs })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: null })
    dsh.emit({ type: 'item', value: 42 })
    dsh.emit({ type: 'item', value: { ready: true } })
    dsh.emit({ type: 'error', error: { message: 'stream died' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs.length).toBe(0)
    expect(logs.length).toBeGreaterThan(0)
  })

  it('形状坏但带 requestId 的请求 → respond pbots/invalid-args（让 SDK 侧立即收敛）', async () => {
    const dsh = fakeDsh()
    wire(dsh, {})
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: { requestId: 'r3', action: 'install' } }) // 缺 sessionId/turnId/originRef
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs[0]?.args).toMatchObject({ request: { requestId: 'r3', error: { code: 'pbots/invalid-args' } } })
  })

  it('新一代连接：旧流作废重开一条（onConnected → cancel + reopen）', async () => {
    const dsh = fakeDsh()
    const handle = wire(dsh, {})
    dsh.connect(1)
    await settled()
    expect(dsh.opened).toEqual([ADMIN_REQUESTS_ENDPOINT])
    dsh.connect(2)
    await settled()
    expect(dsh.opened).toEqual([ADMIN_REQUESTS_ENDPOINT, ADMIN_REQUESTS_ENDPOINT])
    handle.close()
  })

  it('dispatch 异常 → respond 内部错误，不向上抛', async () => {
    const dsh = fakeDsh()
    wire(dsh, { dispatch: async () => { throw new Error('boom') } })
    dsh.connect()
    await settled()
    dsh.emit({ type: 'item', value: REQUEST })
    await new Promise((r) => setTimeout(r, 10))
    expect(dsh.rpcs[0]?.args).toMatchObject({ request: { requestId: 'r1', error: { code: 'pbots/admin-failed' } } })
  })
})

// ---- consumer：F2 动作表为空，未接动作明确 unavailable ----

describe('createAdminConsumer', () => {
  it('默认无任何动作：一切 dispatch → pbots/admin-unavailable（明确不可用，不执行）', async () => {
    const consumer = createAdminConsumer()
    expect(consumer.actions).toEqual([])
    const out = await consumer.dispatch({ ...REQUEST } as never)
    expect(out).toMatchObject({ error: { code: 'pbots/admin-unavailable' } })
    const message = (out as { error: { message: string } }).error.message
    expect(message).toContain('install')
  })

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    '默认空动作表的原型成员 %s 必须 unavailable', async (action) => {
      await expect(createAdminConsumer().dispatch({ ...REQUEST, action })).resolves.toMatchObject({ error: { code: 'pbots/admin-unavailable' } })
    },
  )

  it('只路由自有函数属性，不调用自定义原型上的 handler 或非函数', async () => {
    let calls = 0
    const inherited = { list: async () => { calls++; return { value: { ok: true } } } }
    const consumer = createAdminConsumer({ actions: Object.create(inherited) })
    expect(await consumer.dispatch({ ...REQUEST, action: 'list' })).toMatchObject({ error: { code: 'pbots/admin-unavailable' } })
    expect(calls).toBe(0)
    const malformed = createAdminConsumer({ actions: { list: {} } as never })
    expect(await malformed.dispatch({ ...REQUEST, action: 'list' })).toMatchObject({ error: { code: 'pbots/admin-unavailable' } })
  })

  it('自有函数即使与原型成员同名也可显式注册', async () => {
    const consumer = createAdminConsumer({ actions: { toString: async () => ({ value: { ok: true } }) } })
    expect(await consumer.dispatch({ ...REQUEST, action: 'toString' })).toEqual({ value: { ok: true } })
  })

  it('注册进来的 handler 才被路由（WM 接线用缝），回复统一过 sanitize', async () => {
    const consumer = createAdminConsumer({
      actions: { list: async () => ({ value: { ok: true, rows: [{ name: 'a' }], token: 'sk-secret', process: { pid: 123 } } }) },
    })
    expect(consumer.actions).toEqual(['list'])
    const out = await consumer.dispatch({ ...REQUEST, action: 'list' } as never)
    expect(out).toEqual({ value: { ok: true, rows: [{ name: 'a' }], process: {} } }) // token 整键剥、pid 深剥
  })

  it('未知动作即使有人伪造请求也不落进 handler', async () => {
    const consumer = createAdminConsumer({ actions: { list: async () => ({ value: { ok: true } }) } })
    const out = await consumer.dispatch({ ...REQUEST, action: 'install' } as never)
    expect(out).toMatchObject({ error: { code: 'pbots/admin-unavailable' } })
  })
})

describe('sanitizeAdminValue（不返 token / PID / 凭证）', () => {
  it('深剥禁区键，保留普通字段，不改原对象', () => {
    const value = { ok: true, token: 'sk-1', nested: { apiKey: 'k', keep: 1 }, rows: [{ password: 'p', name: 'x' }], pid: 4242 }
    const clean = sanitizeAdminValue(value) as Record<string, unknown>
    expect(clean).toEqual({ ok: true, nested: { keep: 1 }, rows: [{ name: 'x' }] })
    expect(value.nested).toEqual({ apiKey: 'k', keep: 1 }) // 原对象不动
  })

  it('非对象透传；数组 / 嵌套数组照样剥', () => {
    expect(sanitizeAdminValue('plain')).toBe('plain')
    expect(sanitizeAdminValue([{ apiKey: 'k' }, 5])).toEqual([{}, 5])
  })
})
