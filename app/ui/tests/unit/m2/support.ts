// M2 单测底座：本地 ws mux 后端（收帧/断链）+ MessagePortMain 形状的假端口对 + 可切换 live socket 的假 dsh 连接。
// electron 由各测试文件 vi.mock（MessageChannelMain → makeChannelPair）。
import { createServer, type Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { DshConnection } from '../../../main/dsh/connect'
import { DshMuxSocket, type MuxFrame } from '../../../main/dsh/socket'

/** MessagePortMain 的最小形状（桥只依赖这些）。 */
export class FakePort {
  private readonly msgListeners = new Set<(e: { data: unknown }) => void>()
  private readonly closeListeners = new Set<() => void>()
  private queue: unknown[] = []
  private started = false
  private closed = false
  peer?: FakePort

  on(type: 'message' | 'close', cb: (e: { data: unknown }) => void | (() => void)): void {
    if (type === 'message') this.msgListeners.add(cb as (e: { data: unknown }) => void)
    else this.closeListeners.add(cb as () => void)
  }

  start(): void {
    this.started = true
    const queued = this.queue.splice(0)
    for (const data of queued) this.emitMessage(data)
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('FakePort: postMessage on closed port')
    this.peer?.receive(data)
  }

  private receive(data: unknown): void {
    if (this.closed) return
    if (!this.started) { this.queue.push(data); return }
    this.emitMessage(data)
  }

  private emitMessage(data: unknown): void {
    for (const l of [...this.msgListeners]) l({ data })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const l of [...this.closeListeners]) l()
    this.peer?.peerClosed()
  }

  private peerClosed(): void {
    if (this.closed) return
    this.closed = true
    for (const l of [...this.closeListeners]) l()
  }
}

export function makeChannelPair(): { port1: FakePort; port2: FakePort } {
  const port1 = new FakePort()
  const port2 = new FakePort()
  port1.peer = port2
  port2.peer = port1
  return { port1, port2 }
}

/** 本地 ws mux 后端：记录上行原帧，可主动下行、整链路 terminate（模拟 socket 断开）。 */
export interface MuxBackend {
  url: string
  received: MuxFrame[]
  connections: WebSocket[]
  /** 新建一条连到后端的 DshMuxSocket（main 侧真实对象，含 openPromise/tap/onDead）。 */
  open(): Promise<DshMuxSocket>
  /** 后端下行（发给最近一条连接）。 */
  send(frame: MuxFrame): void
  terminateAll(): void
  stop(): Promise<void>
}

export async function startMuxBackend(): Promise<MuxBackend> {
  const server: Server = createServer()
  const wss = new WebSocketServer({ server })
  const received: MuxFrame[] = []
  const connections: WebSocket[] = []
  wss.on('connection', (conn) => {
    connections.push(conn)
    conn.on('message', (data) => {
      try { received.push(JSON.parse(String(data)) as MuxFrame) } catch { /* 非 JSON 忽略 */ }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/remote.mux`
  return {
    url,
    received,
    connections,
    async open(): Promise<DshMuxSocket> {
      const socket = new DshMuxSocket(url, 'c=1')
      await socket.openPromise
      return socket
    },
    send(frame: MuxFrame): void {
      const conn = connections[connections.length - 1]
      if (conn !== undefined && conn.readyState === WebSocket.OPEN) conn.send(JSON.stringify(frame))
    },
    terminateAll(): void {
      for (const conn of connections) conn.terminate()
    },
    async stop(): Promise<void> {
      for (const conn of connections) conn.terminate()
      await new Promise<void>((r) => wss.close(() => r()))
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

/** 假 DshConnection：ready() 返回当前 live socket（未设时永久 pending）；测试随时切换以模拟重连。 */
export interface FakeDsh {
  conn: DshConnection
  setLive(socket: DshMuxSocket | undefined): void
}

export function fakeDsh(): FakeDsh {
  let live: DshMuxSocket | undefined
  const conn = {
    ready: (): Promise<DshMuxSocket> =>
      live !== undefined ? Promise.resolve(live) : new Promise<DshMuxSocket>(() => { /* 未就绪：挂起 */ }),
  } as unknown as DshConnection
  return { conn, setLive: (socket) => { live = socket } }
}

/** 假 IpcMainEvent：记录 sender.postMessage 转交调用。 */
export interface RecordedPost { channel: string; payload: unknown; ports: unknown[] }

export function fakeEvent(opts: { url?: string | null; destroyed?: boolean } = {}): {
  event: import('electron').IpcMainEvent
  posts: RecordedPost[]
} {
  const posts: RecordedPost[] = []
  const url = 'url' in opts ? opts.url : 'pbots-app://app/'
  const event = {
    senderFrame: url === null ? null : { url },
    sender: {
      isDestroyed: (): boolean => opts.destroyed === true,
      postMessage: (channel: string, payload: unknown, ports?: unknown[]): void => {
        posts.push({ channel, payload, ports: ports ?? [] })
      },
    },
  } as unknown as import('electron').IpcMainEvent
  return { event, posts }
}

/** 取某条转交成功的 port2（按调用序）。 */
export function pagePort(posts: RecordedPost[], index = 0): FakePort {
  const hit = posts.filter((p) => p.payload != null && (p.payload as { ok?: boolean }).ok === true)[index]
  if (hit === undefined) throw new Error(`no successful transfer #${index}`)
  return hit.ports[0] as FakePort
}
