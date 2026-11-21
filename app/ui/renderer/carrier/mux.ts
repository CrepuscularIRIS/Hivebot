// mux wire 客户端（U-15 起源，U-21 迁入 carrier/ 供产品 store 共用）：CarrierSocket 上的 open/item/end/cancel/error。
// 由 U-12 的 renderer/carrier/debug-boot.ts DebugMux 演化（debug-boot 按 VERIFY-U-12 建议随 U-15 回收）；
// wire 客户端骨架参考 spike/U-00 page/app.js 的 PortMux（feat/U-00@8998435）。
import { CarrierSocket, pageEnv, type CarrierEnv } from './index'

export interface MuxStream {
  streamId: string
  endpoint: string
  items: unknown[]
  done: boolean
  error?: unknown
}

export class PageMux {
  readonly streams = new Map<string, MuxStream>()
  constructor(private readonly socket: CarrierSocket) {
    socket.addEventListener('message', (e) => this.receive(e.data))
  }

  open(endpoint: string, args?: unknown): MuxStream {
    const streamId = crypto.randomUUID()
    const stream: MuxStream = { streamId, endpoint, items: [], done: false }
    this.streams.set(streamId, stream)
    this.socket.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args } }))
    return stream
  }

  cancel(stream: MuxStream): void {
    if (stream.done) return
    this.streams.delete(stream.streamId)
    stream.done = true
    if (this.socket.readyState === 1) {
      this.socket.send(JSON.stringify({ type: 'cancel', streamId: stream.streamId }))
    }
  }

  private receive(data: unknown): void {
    // port 上的帧是 JSON 文本（与 WebSocket 文本帧一致，见 main/m2-mux parsePortText 注）
    if (typeof data !== 'string') return
    let frame: { type?: string; streamId?: string; value?: unknown; error?: unknown }
    try { frame = JSON.parse(data) as typeof frame } catch { return }
    const stream = frame.streamId !== undefined ? this.streams.get(frame.streamId) : undefined
    if (stream === undefined) return
    if (frame.type === 'item') stream.items.push(frame.value)
    if (frame.type === 'error') stream.error = frame.error
    if (frame.type === 'end' || frame.type === 'error') stream.done = true
  }
}

export interface DevSocketHandle {
  requestId: string
  readyStates: number[]
  relays: Array<{ ok: boolean; ports: number }>
  error: string | undefined
  closed: boolean
  frames: unknown[]
  openStream(endpoint: string, args?: unknown): MuxStream
}

let seq = 0

function devEnv(requestId?: string): CarrierEnv {
  const id = requestId ?? `dev-${++seq}`
  return { ...pageEnv(), randomId: () => id }
}

/** 观察用的裸 socket 句柄（不动 boot 会话；m2-port E2E 的并发/失败/超时/来源用例驱动）。 */
export function newDevSocket(register: (handle: DevSocketHandle) => void): DevSocketHandle {
  const requestId = `dev-${++seq}`
  const handle: DevSocketHandle = {
    requestId,
    readyStates: [0],
    relays: [],
    error: undefined,
    closed: false,
    frames: [],
    openStream(endpoint: string, args?: unknown): MuxStream {
      if (muxOf === undefined) throw new Error('dev socket not open yet')
      return muxOf.open(endpoint, args)
    },
  }
  const base = devEnv(requestId)
  const env: CarrierEnv = {
    ...base,
    addMessageListener(listener) {
      return base.addMessageListener((event) => {
        if (event.data?.pbotsMux === requestId) handle.relays.push({ ok: event.data.ok === true, ports: event.ports.length })
        listener(event)
      })
    },
  }
  const socket = new CarrierSocket(env)
  let muxOf: PageMux | undefined
  socket.addEventListener('open', () => { muxOf = new PageMux(socket); handle.readyStates.push(socket.readyState) })
  socket.addEventListener('message', (e) => { handle.frames.push(e.data) })
  socket.addEventListener('error', (e) => { handle.error = String((e as { error?: Error }).error); handle.readyStates.push(socket.readyState) })
  socket.addEventListener('close', () => { handle.closed = true; handle.readyStates.push(socket.readyState) })
  register(handle)
  return handle
}
