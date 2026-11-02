// 桥级 debug/E2E 接线：boot 即申请 mux 端口并开 $events 流，断链关闭后 300ms 重开（模拟上游
// RemoteStreamMuxClient 的自动重连）。产品化由 U-15/U-21 的 installConnection + ClientRemoteEvents
// 替代（届时删除）。wire 客户端参考 spike/U-00 page/app.js 的 PortMux（feat/U-00@8998435）。
import { CarrierSocket, pageEnv, type CarrierEnv } from './index'

export interface DebugStream {
  streamId: string
  endpoint: string
  items: unknown[]
  done: boolean
  error?: unknown
}

/** 跑在 CarrierSocket 上的最小 mux wire 客户端（open/item/end/cancel/error）。 */
export class DebugMux {
  readonly streams = new Map<string, DebugStream>()
  constructor(private readonly socket: CarrierSocket) {
    socket.addEventListener('message', (e) => this.receive(e.data))
  }

  open(endpoint: string, args?: unknown): DebugStream {
    const streamId = crypto.randomUUID()
    const stream: DebugStream = { streamId, endpoint, items: [], done: false }
    this.streams.set(streamId, stream)
    this.socket.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args } }))
    return stream
  }

  cancel(stream: DebugStream): void {
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

export interface DebugSocketHandle {
  requestId: string
  readyStates: number[]
  relays: Array<{ ok: boolean; ports: number }>
  error: string | undefined
  closed: boolean
  frames: unknown[]
  openStream(endpoint: string, args?: unknown): DebugStream
}

interface EventsView { clientId: string | undefined; items: unknown[] }

const state = {
  events: { clientId: undefined, items: [] } as EventsView,
  clientIds: [] as string[],
  sessions: 0,
  sockets: [] as DebugSocketHandle[],
}

let bootMux: DebugMux | undefined
let seq = 0

function debugEnv(requestId?: string): CarrierEnv {
  const id = requestId ?? `dbg-${++seq}`
  return { ...pageEnv(), randomId: () => id }
}

/** boot 会话：开端口 → $events 流 → 旁听 ready/waterfall/cancel 维护 events 视图；关闭后 300ms 重开。 */
function bootSession(): void {
  const socket = new CarrierSocket(debugEnv())
  socket.addEventListener('open', () => {
    state.sessions += 1
    bootMux = new DebugMux(socket)
    const feed = bootMux.open('$events', {})
    state.events = { clientId: undefined, items: feed.items }
    const poll = (): void => {
      for (const item of feed.items as Array<{ type?: string; clientId?: string }>) {
        if (item.type === 'ready' && typeof item.clientId === 'string') {
          state.events.clientId = item.clientId
          if (state.clientIds[state.clientIds.length - 1] !== item.clientId) state.clientIds.push(item.clientId)
        }
      }
      if (!feed.done) setTimeout(poll, 50)
    }
    poll()
  })
  socket.addEventListener('close', () => {
    for (const stream of [...(bootMux?.streams.values() ?? [])]) stream.done = true
    setTimeout(bootSession, 300)
  })
}

/** 观察用的裸 socket 句柄（不动 boot 会话；E2E 的并发/失败/超时/来源用例驱动）。 */
function newSocket(): DebugSocketHandle {
  const requestId = `dbg-${++seq}`
  const handle: DebugSocketHandle = {
    requestId,
    readyStates: [0],
    relays: [],
    error: undefined,
    closed: false,
    frames: [],
    openStream(endpoint: string, args?: unknown): DebugStream {
      if (muxOf === undefined) throw new Error('debug socket not open yet')
      return muxOf.open(endpoint, args)
    },
  }
  const base = debugEnv(requestId)
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
  let muxOf: DebugMux | undefined
  socket.addEventListener('open', () => { muxOf = new DebugMux(socket); handle.readyStates.push(socket.readyState) })
  socket.addEventListener('message', (e) => { handle.frames.push(e.data) })
  socket.addEventListener('error', (e) => { handle.error = String((e as { error?: Error }).error); handle.readyStates.push(socket.readyState) })
  socket.addEventListener('close', () => { handle.closed = true; handle.readyStates.push(socket.readyState) })
  state.sockets.push(handle)
  return handle
}

/** 挂 window.__pbotsCarrier（E2E 驱动面；产品页不含敏感信息）。getter 保持对 state 的活引用。 */
export function installCarrierDebug(): void {
  ;(window as unknown as Record<string, unknown>).__pbotsCarrier = {
    get events(): EventsView { return state.events },
    get clientIds(): string[] { return state.clientIds },
    get sessions(): number { return state.sessions },
    get sockets(): DebugSocketHandle[] { return state.sockets },
    openStream(endpoint: string, args?: unknown): DebugStream {
      if (bootMux === undefined) throw new Error('boot mux not open yet')
      return bootMux.open(endpoint, args)
    },
    newSocket,
  }
  bootSession()
}
