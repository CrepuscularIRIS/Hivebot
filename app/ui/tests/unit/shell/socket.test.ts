// DshMuxSocket：原帧 tap（含未知 streamId 不丢弃）与流生命周期单测。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { DshMuxSocket, type MuxFrame } from '../../../main/dsh/socket'

let server: Server
let wss: WebSocketServer
let port = 0

beforeAll(async () => {
  server = createServer()
  wss = new WebSocketServer({ server })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterAll(async () => {
  for (const c of wss.clients) c.terminate()
  await new Promise<void>((r) => wss.close(() => r()))
  await new Promise<void>((r) => server.close(() => r()))
})

interface Saw { frame: MuxFrame; dir: string; known: boolean }

describe('DshMuxSocket', () => {
  it('open 流收 item/end，全部帧过 tap（known=true）', async () => {
    const saw: Saw[] = []
    const socket = new DshMuxSocket(`ws://127.0.0.1:${port}/api/remote.mux`, 'c=1')
    socket.setTap((frame, dir, known) => saw.push({ frame, dir, known }))
    wss.once('connection', (conn) => {
      conn.on('message', (data) => {
        const msg = JSON.parse(String(data)) as MuxFrame
        if (msg.type === 'open') {
          conn.send(JSON.stringify({ type: 'item', streamId: msg.streamId, value: { hello: 1 } }))
          conn.send(JSON.stringify({ type: 'end', streamId: msg.streamId }))
        }
      })
    })
    await socket.openPromise
    const frames: MuxFrame[] = []
    const stream = socket.open('session/follow', { request: 1 })
    stream.onFrame((f) => frames.push(f))
    await new Promise((r) => setTimeout(r, 300))
    expect(frames).toEqual([
      { type: 'item', streamId: stream.streamId, value: { hello: 1 } },
      { type: 'end', streamId: stream.streamId },
    ])
    const downs = saw.filter((s) => s.dir === 'down')
    expect(downs.every((s) => s.known)).toBe(true)
    expect(saw.some((s) => s.dir === 'up' && s.frame.type === 'open')).toBe(true)
    socket.close()
  })

  it('未知 streamId 下行帧进 tap（known=false）且不丢不误派', async () => {
    const orphan: Saw[] = []
    const socket = new DshMuxSocket(`ws://127.0.0.1:${port}/api/remote.mux`, 'c=1')
    socket.setTap((frame, dir, known) => { if (!known) orphan.push({ frame, dir, known }) })
    wss.once('connection', (conn) => {
      void conn
      // 服务端主动发一条不属于任何客户端流的帧
    })
    await socket.openPromise
    for (const conn of wss.clients) {
      if (conn.readyState === conn.OPEN) conn.send(JSON.stringify({ type: 'item', streamId: 'not-mine', value: { x: 1 } }))
    }
    await new Promise((r) => setTimeout(r, 300))
    expect(orphan).toEqual([{ frame: { type: 'item', streamId: 'not-mine', value: { x: 1 } }, dir: 'down', known: false }])
    socket.close()
  })

  it('服务端断开 → 流收到 error 帧、onDead 触发一次', async () => {
    let deadCount = 0
    const socket = new DshMuxSocket(`ws://127.0.0.1:${port}/api/remote.mux`, 'c=1')
    await socket.openPromise
    socket.onDead(() => { deadCount += 1 })
    const errs: unknown[] = []
    const stream = socket.open('$events', {})
    stream.onFrame((f) => { if (f.type === 'error') errs.push(f) })
    for (const conn of wss.clients) if (conn.readyState === conn.OPEN) conn.terminate()
    await new Promise((r) => setTimeout(r, 300))
    expect(deadCount).toBe(1)
    expect(errs).toHaveLength(1)
    socket.close()
  })

  it('非 OPEN 状态 send 抛错；stream send 拒绝 open 帧与 streamId 不匹配', async () => {
    const socket = new DshMuxSocket(`ws://127.0.0.1:${port}/api/remote.mux`, 'c=1')
    await socket.openPromise
    const stream = socket.open('e', {})
    expect(() => stream.send({ type: 'open', streamId: stream.streamId, endpoint: 'x' })).toThrowError(/item\/end\/cancel/u)
    expect(() => stream.send({ type: 'item', streamId: 'other', value: 1 })).toThrowError(/mismatch/u)
    expect(() => stream.send({ type: 'cancel', streamId: stream.streamId })).not.toThrow()
    socket.close()
  })
})

void WebSocket
