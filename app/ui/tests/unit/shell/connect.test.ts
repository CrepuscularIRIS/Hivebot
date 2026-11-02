// DshConnection：cookie 交换、generation 递增、断线自动重连、rpc 原样返回与 apiCount。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { WebSocketServer } from 'ws'
import { DshConnection, exchangeLaunchToken, rpcRaw } from '../../../main/dsh/connect'

let server: Server
let wssAll: WebSocketServer
let port = 0
let connectCalls = 0
let wsGenerations = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/connect') {
      connectCalls += 1
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

void wsGenerations
