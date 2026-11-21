// DshConnection：cookie 交换、generation 递增、断线自动重连、rpc 原样返回与 apiCount。
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { WebSocketServer } from 'ws'
import { DshConnection, exchangeLaunchToken, rpcRaw } from '../../../main/dsh/connect'

let server: Server
let wssAll: WebSocketServer
let port = 0
let connectCalls = 0
let wsGenerations = 0
/** 失败注入：>0 时每个 /connect 先回 500（每次递减）；Infinity = 持续失败。 */
let connectFailures = 0
/** 每次 /connect 尝试的时间戳（退避形状断言用）。 */
const connectTimestamps: number[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/connect') {
      connectCalls += 1
      connectTimestamps.push(Date.now())
      if (connectFailures > 0) {
        connectFailures -= 1
        res.writeHead(500); res.end()
        return
      }
      res.writeHead(302, { 'set-cookie': `dsh-session=fake-${connectCalls}; Path=/` , location: './api/remote.mux' })
      res.end()
      return
    }
    if (url.pathname.startsWith('/api/')) {
      const method = url.pathname.slice('/api/'.length)
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const envelope = JSON.parse(body) as { rpcId: string }
        if (method === 'missing') {
          res.writeHead(404); res.end()
        } else if (method === 'boom') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: false, error: { code: 'gateway/internal', message: 'boom', details: { k: 1 } } } }))
        } else if (method === 'odd') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ type: 'weird' }))
        } else {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { method } } }))
        }
      })
      return
    }
    res.writeHead(404); res.end()
  })
  wssAll = new WebSocketServer({ server })
  wssAll.on('connection', () => { wsGenerations += 1 })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterAll(async () => {
  for (const c of wssAll.clients) c.terminate()
  await new Promise<void>((r) => wssAll.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

const base = () => `http://127.0.0.1:${port}`

describe('exchangeLaunchToken', () => {
  it('302 + set-cookie → cookie 串', async () => {
    const cookie = await exchangeLaunchToken(base(), 'tok', 'answer')
    expect(cookie).toBe('dsh-session=fake-1')
  })
})

describe('DshConnection', () => {
  it('start 后 generation===1；断线后自动重连 generation===2', async () => {
    const conn = new DshConnection({ baseUrl: base(), token: 't', interactions: 'answer', backoffMs: 100 })
    const g1 = await conn.start()
    expect(g1).toBe(1)
    // 模拟 socket 死亡：直接 close 当前 socket 触发 onDead → 重连
    const current = await conn.ready()
    ;(current as unknown as { ws: { close(): void } }).ws.close()
    await new Promise((r) => setTimeout(r, 700))
    expect(conn.currentGeneration).toBe(2)
    conn.stop()
  })

  it('rpc 原样透传 ok 与 !ok（details 不压平），apiCount 计数', async () => {
    const conn = new DshConnection({ baseUrl: base(), token: 't', interactions: 'answer', backoffMs: 100 })
    await conn.start()
    const ok = await conn.rpc('session/list', { cursor: null })
    expect(ok).toEqual({ ok: true, value: { method: 'session/list' } })
    const bad = await conn.rpc('boom', {})
    expect(bad).toEqual({ ok: false, error: { code: 'gateway/internal', message: 'boom', details: { k: 1 } } })
    const odd = await conn.rpc('odd', {})
    expect(odd.ok).toBe(false)
    expect(conn.apiCount).toBe(3)
    conn.stop()
  })
})

describe('rpcRaw 非 2xx', () => {
  it('HTTP 404 → pbots/upstream，不抛', async () => {
    const r = await rpcRaw(base(), 'x', 'missing', {})
    expect(r).toEqual({ ok: false, error: { code: 'pbots/upstream', message: 'HTTP 404 from missing', details: {} } })
  })
})

// U-17（W1 预审 R2+R3+R13）：首败指数退避重试、rpc 有界等待、死 socket 不再被 ready() 返回。
describe('DshConnection U-17（R2/R3/R13）', () => {
  beforeEach(() => {
    connectFailures = 0
    connectTimestamps.length = 0
  })

  it('① 首连失败按指数退避重试到成功；重试期间 rpc 排队，连接后放行（不永久挂）', async () => {
    connectFailures = 2
    const conn = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer',
      backoffMs: 20, backoffMaxMs: 500, startTimeoutMs: 5_000, rpcTimeoutMs: 5_000,
    })
    try {
      const rpcP = conn.rpc('session/list', {}) // 未连接即调用：应排队而非挂死/报错
      const g = await conn.start()
      expect(g).toBe(1)
      expect(await rpcP).toEqual({ ok: true, value: { method: 'session/list' } })
      expect(conn.apiCount).toBe(1)
      expect(connectTimestamps.length).toBe(3) // 1 首败 + 1 重试失败 + 1 成功
    } finally { conn.stop() }
  })

  it('①② 首连持续失败：start() 按 startTimeoutMs 有界 reject；rpc 按.rpcTimeoutMs 返回结构化错误且不发请求', async () => {
    connectFailures = Number.POSITIVE_INFINITY
    const conn = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer',
      backoffMs: 10, startTimeoutMs: 200, rpcTimeoutMs: 150,
    })
    try {
      await expect(conn.start()).rejects.toThrow('dsh connect timed out after 200ms')
      expect(await conn.rpc('session/list', {})).toEqual({
        ok: false,
        error: { code: 'pbots/unavailable', message: 'dsh connection not ready after 150ms', details: {} },
      })
      expect(conn.apiCount).toBe(0)
    } finally { conn.stop() }
  })

  it('③ socket 死亡即从可用集合清除：ready() 挂起等新代，不返回死柄；rpc 结构化报错且不发请求', async () => {
    const conn = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer',
      backoffMs: 5_000, rpcTimeoutMs: 200, // 退避拉长：观察窗口内不会出现新代
    })
    try {
      await conn.start()
      const current = await conn.ready()
      const died = new Promise<void>((r) => current.onDead(() => r()))
      ;(current as unknown as { ws: { terminate(): void } }).ws.terminate() // 触发 die/onDead（U-12 经验：不用 close()）
      await died // 等 die 已派发（事件前窗口里 socket 物理上还「活着」，不可观测属正常）
      const early = await Promise.race([
        conn.ready().then(() => 'resolved' as const),
        new Promise<'pending'>((r) => setTimeout(() => r('pending'), 300)),
      ])
      expect(early).toBe('pending')
      expect(await conn.rpc('session/list', {})).toEqual({
        ok: false,
        error: { code: 'pbots/unavailable', message: 'dsh connection not ready after 200ms', details: {} },
      })
      expect(conn.apiCount).toBe(0)
      expect(conn.currentGeneration).toBe(1) // 未伪造新代
    } finally { conn.stop() }
  })

  it('① 退避形状：间隔按 2^n 指数增长，且受 backoffMaxMs 封顶', async () => {
    connectFailures = 3
    const connExp = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer',
      backoffMs: 40, backoffMaxMs: 10_000, startTimeoutMs: 5_000,
    })
    try {
      await connExp.start()
      const ts = connectTimestamps.slice()
      const gaps = ts.slice(1).map((t, i) => t - ts[i])
      expect(gaps.length).toBe(3)
      expect(gaps[0]).toBeGreaterThanOrEqual(35)
      expect(gaps[1]).toBeGreaterThanOrEqual(70) // 固定退避只会是 ~40ms
      expect(gaps[2]).toBeGreaterThanOrEqual(140)
    } finally { connExp.stop() }

    connectTimestamps.length = 0
    connectFailures = 1
    const connCap = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer',
      backoffMs: 2_000, backoffMaxMs: 60, startTimeoutMs: 5_000, // 基数 2000 被封顶到 60
    })
    try {
      await connCap.start()
      const gap = connectTimestamps[1] - connectTimestamps[0]
      expect(gap).toBeGreaterThanOrEqual(55)
      expect(gap).toBeLessThanOrEqual(500) // 未封顶会是 ~2000ms
    } finally { connCap.stop() }
  })
})

void wsGenerations

// U-28 R3/R4：连接成功事件（onConnected）——首连超时 reject 后后台重连成功、以及断线
// 重连，都必须能被 main 观察到（恢复编排挂它补跑 #21，不再被一次性 start() 永久跳过）。
describe('DshConnection U-28（R3/R4）：onConnected', () => {
  beforeEach(() => {
    connectFailures = 0
    connectTimestamps.length = 0
  })

  it('start() 超时 reject 后服务恢复 → 后台重连成功仍触发 onConnected（generation 1）', async () => {
    connectFailures = Number.POSITIVE_INFINITY
    const conn = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer',
      backoffMs: 10, backoffMaxMs: 20, startTimeoutMs: 100,
    })
    try {
      await expect(conn.start()).rejects.toThrow('dsh connect timed out after 100ms')
      const got: number[] = []
      conn.onConnected((g) => got.push(g))
      connectFailures = 0 // 服务恢复
      await new Promise((r) => setTimeout(r, 600))
      expect(got).toEqual([1])
      expect(conn.currentGeneration).toBe(1)
    } finally { conn.stop() }
  })

  it('断线重连 → 再次触发（generation 2）；listener 抛错不破坏后续 waiter', async () => {
    const conn = new DshConnection({
      baseUrl: base(), token: 't', interactions: 'answer', backoffMs: 50,
    })
    try {
      const got: number[] = []
      conn.onConnected(() => { throw new Error('listener boom') })
      conn.onConnected((g) => got.push(g))
      const g1 = await conn.start()
      expect(g1).toBe(1)
      const current = await conn.ready() // 坏 listener 未破坏 ready waiter
      ;(current as unknown as { ws: { close(): void } }).ws.close()
      await new Promise((r) => setTimeout(r, 900))
      expect(got).toEqual([1, 2])
    } finally { conn.stop() }
  })
})
