// T-01.f1 acceptance tests: mux disconnect robustness.
// Fixes REVIEW-T-01.md R2/R3 (major: no ws 'close' handling, dead-socket
// open()) plus O4 (cancel does not finish local iteration), O5 (ended
// streams leak in the map), O6 (waiter path swallows error frames).
// ①② run against a real mock runtime (dsh found via pgrep -P, never
// pkill -f); ③④⑤ run against an in-process ws server driving raw frames.
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket as WsSocket, WebSocketServer } from 'ws'
import { MuxError, MuxSocket } from '../../examples/lib/mux.mjs'
import { connect } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll fn() every 10ms until truthy or timeout (guards frame timing). */
async function waitFor<T>(fn: () => T | undefined, ms = 3000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() > end) throw new Error('waitFor timeout')
    await sleep(10)
  }
}

/** SIGKILL the dsh child of a start.mjs parent; fall back to the parent. */
function killDsh(parentPid: number) {
  let pids: number[] = []
  try {
    pids = execSync(`pgrep -P ${parentPid}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number)
  } catch {
    // pgrep exits 1 on no match
  }
  if (pids.length === 0) pids = [parentPid]
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

describe('against the real mock runtime', () => {
  let rt: Runtime

  beforeAll(async () => {
    rt = await launchRuntime()
  })

  afterAll(async () => {
    await rt?.stop()
  })

  // ② close() then open() must fail immediately, not return a dead stream.
  it('open() on a closed socket rejects with MuxError', async () => {
    const client = await connect({ baseUrl: rt.baseUrl, token: rt.token })
    client.close()
    await expect(client.socket.open('session/follow', {})).rejects.toThrow(MuxError)
  }, 30_000)

  // ① kill dsh mid-stream -> for-await exits with a connection error
  // (not a hang, not a silent normal end).
  it('for-await rejects with a connection error when dsh is killed mid-stream', async () => {
    const { sessionId } = await rt.client.call('session/create', {
      request: { cwd: join(rt.home, 'workspace') },
    })
    const stream = await rt.client.follow(sessionId)
    let frames = 0
    const consumed = (async () => {
      for await (const _frame of stream) frames++
    })()
    // Wait until the server has accepted the open (frame server-side), then
    // the iterator is parked in next() awaiting further frames.
    await sleep(150)
    killDsh(rt.child.pid)
    const outcome = await Promise.race([
      consumed.then(
        () => 'ended-normally' as const,
        (err: unknown) => err,
      ),
      sleep(5000).then(() => 'still-pending' as const),
    ])
    expect(outcome).toBeInstanceOf(MuxError)
    expect(String(outcome)).toMatch(/mux connection lost|websocket closed/)
  }, 60_000)
})

describe('against an in-process ws frame server', () => {
  let wss: WebSocketServer
  let serverSocket: WsSocket
  let mux: MuxSocket
  const opened: Array<{ streamId: string; endpoint: string }> = []

  beforeAll(async () => {
    wss = new WebSocketServer({ port: 0 })
    wss.on('connection', (ws) => {
      serverSocket = ws
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data))
        if (msg.type === 'open') opened.push({ streamId: msg.streamId, endpoint: msg.endpoint })
      })
    })
    const { port } = wss.address() as { port: number }
    mux = new MuxSocket(`ws://127.0.0.1:${port}`, 'x=test')
    await mux.ready
  })

  afterAll(async () => {
    mux?.close()
    await new Promise<void>((resolve) => wss?.close(() => resolve()))
  })

  const openOn = async (endpoint: string) => {
    const stream = await mux.open(endpoint, {})
    await waitFor(() => opened.find((f) => f.endpoint === endpoint && f.streamId === stream.streamId))
    return stream
  }

  // ③ cancel() settles a parked next() as done.
  it('cancel() ends a parked next() with done', async () => {
    const stream = await openOn('t3-park')
    const iter = stream[Symbol.asyncIterator]()
    const next = iter.next()
    await sleep(30) // parked: no server frames in flight
    stream.cancel()
    const outcome = await Promise.race([next, sleep(5000).then(() => 'still-pending')])
    expect(outcome).toEqual({ value: undefined, done: true })
  }, 15_000)

  // ⑤ a waiter parked before an error frame gets a rejected next(), not a
  // normal done (O6: waiter path used to swallow the error field).
  it('a parked next() rejects when an error frame arrives', async () => {
    const stream = await openOn('t5-err')
    const iter = stream[Symbol.asyncIterator]()
    const next = iter.next()
    await sleep(30) // parked
    serverSocket.send(JSON.stringify({ type: 'error', streamId: stream.streamId, error: { code: 'X' } }))
    await expect(next).rejects.toThrow(MuxError)
  }, 15_000)

  // ④ 100 normally-ended streams leave no entries in the streams map (O5).
  it('100 ended streams leave streams.size at 0', async () => {
    const streams = []
    for (let i = 0; i < 100; i++) streams.push(await mux.open('t4-end', {}))
    await waitFor(() => (opened.filter((f) => f.endpoint === 't4-end').length >= 100 ? true : undefined))
    for (const f of opened.filter((f) => f.endpoint === 't4-end')) {
      serverSocket.send(JSON.stringify({ type: 'end', streamId: f.streamId }))
    }
    await Promise.all(
      streams.map(async (s) => {
        for await (const _frame of s) {
          // drain until end
        }
      }),
    )
    expect(mux.streams.size).toBe(0)
  }, 15_000)
})
