// Minimal client for the dsh web transport (T-01), reused by later tasks.
// Protocol per work/p2-sdk/reuse/dsh-api.md and the installed
// @deepseek-ai/dsh-client-connection@0.2.2-alpha.2 / dsh-api-gateway sources:
//   HTTP unary: POST /api/<method> with a client-request envelope
//   WS mux:     /api/remote.mux JSON frames {open,item,end,error,cancel}
// The upstream RemoteStreamMuxClient is not exported from the gateway's
// public ./client entry (verified against the published package), so this
// module implements the same wire protocol instead of deep-importing it.
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'

export class MuxError extends Error {}

/** One multiplexed logical stream over a shared authenticated socket. */
export class MuxStream {
  constructor(mux, streamId) {
    this.mux = mux
    this.streamId = streamId
    this.queue = []
    this.waiters = []
    this.done = false
    this.failure = undefined
  }

  _push(frame) {
    if (this.done) return
    const settled = { value: frame, done: false }
    const waiter = this.waiters.shift()
    if (waiter) waiter(settled)
    else this.queue.push(settled)
  }

  _finish(err) {
    if (this.done) return
    this.done = true
    this.failure = err
    this.mux.streams.delete(this.streamId)
    const settled = { value: undefined, done: true, ...(err ? { error: err } : {}) }
    if (this.waiters.length) {
      const waiters = this.waiters
      this.waiters = []
      for (const waiter of waiters) waiter(settled)
    } else {
      this.queue.push(settled)
    }
  }

  /** Async-iterate stream frames ({type:'item',value} payloads) until end. */
  [Symbol.asyncIterator]() {
    return {
      next: async () => {
        const queued = this.queue.shift()
        if (queued) {
          if (queued.error) throw queued.error
          return queued
        }
        if (this.done) {
          if (this.failure) throw this.failure
          return { value: undefined, done: true }
        }
        return await new Promise((resolve, reject) => {
          this.waiters.push((settled) => {
            if (settled.error) reject(settled.error)
            else resolve(settled)
          })
        })
      },
      return: async () => {
        this.cancel()
        return { value: undefined, done: true }
      },
    }
  }

  cancel() {
    if (this.done) return
    this.mux._send({ type: 'cancel', streamId: this.streamId })
    // Upstream sends no terminal frame for a cancel; finish locally so
    // parked next() settles and later consumers see done.
    this._finish()
  }
}

/** One authenticated WebSocket carrying many logical streams. */
export class MuxSocket {
  constructor(url, cookie) {
    this.ws = new WebSocket(url, { headers: { cookie } })
    this.streams = new Map()
    this.closed = false
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve())
      this.ws.once('error', reject)
    })
    this.ws.on('message', (data) => this._receive(String(data)))
    // Unexpected drop (server killed, network cut): finish every logical
    // stream with a connection error so consumers fail instead of hanging.
    this.ws.on('error', (err) => this._onDead(err))
    this.ws.on('close', () => this._onDead(new MuxError('websocket closed')))
  }

  _onDead(err) {
    if (this.closed) return
    this.closed = true
    const muxErr = err instanceof MuxError ? err : new MuxError(`mux connection lost: ${err?.message ?? 'unknown'}`)
    for (const stream of this.streams.values()) stream._finish(muxErr)
  }

  _receive(text) {
    let msg
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }
    if (msg.type === 'item') {
      this.streams.get(msg.streamId)?._push(msg.value ?? {})
    } else if (msg.type === 'error') {
      this.streams.get(msg.streamId)?._finish(new MuxError(JSON.stringify(msg.error ?? {})))
    } else if (msg.type === 'end') {
      this.streams.get(msg.streamId)?._finish()
    }
  }

  _send(frame) {
    if (this.ws.readyState !== WebSocket.OPEN) throw new MuxError('mux socket is not open')
    this.ws.send(JSON.stringify(frame))
  }

  /** Open a logical stream on an endpoint; payload args follow {args: …}. */
  async open(endpoint, args) {
    await this.ready
    if (this.ws.readyState !== WebSocket.OPEN) throw new MuxError('mux socket is not open')
    const streamId = randomUUID()
    const stream = new MuxStream(this, streamId)
    this.streams.set(streamId, stream)
    this._send({ type: 'open', streamId, endpoint, payload: { args } })
    return stream
  }

  close() {
    this.closed = true
    this.ws.close()
    for (const stream of this.streams.values()) stream._finish()
  }
}

/** HTTP unary call through /api/<method> with the client-request envelope. */
export async function rpc(baseUrl, cookie, method, args) {
  const rpcId = randomUUID()
  const res = await fetch(`${baseUrl}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
  })
  if (!res.ok) throw new MuxError(`HTTP ${res.status} from ${method}`)
  const body = await res.json()
  if (body.type !== 'server-response' || body.rpcId !== rpcId) {
    throw new MuxError(`unexpected envelope from ${method}`)
  }
  if (!body.result?.ok) {
    throw new MuxError(`${method} failed: ${JSON.stringify(body.result?.error ?? {})}`)
  }
  return body.result.value
}
