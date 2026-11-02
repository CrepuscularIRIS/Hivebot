// dsh 连接层：launch token 换 cookie + mux socket + 断线自动重连（generation 递增）。
// 来源（cookie 交换）: app/sdk/examples/lib/client.mjs:66-77（本地仓 /home/lingxufeng/bot），
// 原样保留 /connect?token=…&interactions=… → 302/303 → Set-Cookie 的交换；
// socket 换 main/dsh/socket.ts（原 connect() 的 MuxSocket 会丢未知 streamId 帧，C:18）。
import { randomUUID } from 'node:crypto'
import { DshMuxSocket } from './socket'

export type ConnectionRpcResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

/** GET /connect 换 operator cookie（client.mjs:67-77 原样）。 */
export async function exchangeLaunchToken(baseUrl: string, token: string, interactions: string): Promise<string> {
  const res = await fetch(`${baseUrl}/connect?token=${encodeURIComponent(token)}&interactions=${interactions}`, {
    redirect: 'manual',
  })
  if (res.status !== 302 && res.status !== 303) {
    throw new Error(`token exchange failed: HTTP ${res.status}`)
  }
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('token exchange returned no cookie')
  return cookie
}

/** raw-result 版 rpc：返回 dsh 的 ConnectionRpcResult 原样（含 details；mux.mjs:156-165 会压平，不用它）。 */
export async function rpcRaw(baseUrl: string, cookie: string, method: string, args: unknown): Promise<ConnectionRpcResult> {
  const rpcId = randomUUID()
  const res = await fetch(`${baseUrl}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
  })
  if (!res.ok) return { ok: false, error: { code: 'pbots/upstream', message: `HTTP ${res.status} from ${method}`, details: {} } }
  const body = (await res.json()) as { type: string; rpcId: string; result?: ConnectionRpcResult }
  if (body.type !== 'server-response' || body.rpcId !== rpcId || body.result === undefined) {
    return { ok: false, error: { code: 'pbots/upstream', message: `unexpected envelope from ${method}`, details: {} } }
  }
  return body.result
}

export interface DshConnectionOptions {
  baseUrl: string
  token: string
  interactions: string
  /** 重连退避基数 ms（默认 300，测试可调小）。 */
  backoffMs?: number
  /** 测试注入口：避免直接 new DshMuxSocket。 */
  makeSocket?: (url: string, cookie: string) => DshMuxSocket
}

/** 一条会自动重连的 dsh 连接；每次成功 /connect + ws open，generation +1。 */
export class DshConnection {
  readonly baseUrl: string
  private readonly opts: DshConnectionOptions
  private cookie = ''
  private socket: DshMuxSocket | undefined
  private generation = 0
  private stopped = false
  private reconnectTimer: NodeJS.Timeout | undefined
  private readyWaiters: Array<(g: number) => void> = []
  /** main 侧已发出的 /api 调用计数（断言口径：拒绝时必须 === 0）。 */
  apiCount = 0

  constructor(opts: DshConnectionOptions) {
    this.baseUrl = opts.baseUrl
    this.opts = opts
  }

  get currentGeneration(): number { return this.generation }

  /** 连接并完成首次 /connect + ws open；之后再断线自动重连。 */
  async start(): Promise<number> {
    await this.connectOnce()
    return this.generation
  }

  private async connectOnce(): Promise<void> {
    this.cookie = await exchangeLaunchToken(this.baseUrl, this.opts.token, this.opts.interactions)
    const url = this.baseUrl.replace(/^http/, 'ws') + '/api/remote.mux'
    const socket = (this.opts.makeSocket ?? ((u, c) => new DshMuxSocket(u, c)))(url, this.cookie)
    await socket.openPromise
    this.socket?.close()
    this.socket = socket
    this.generation += 1
    socket.onDead(() => {
      if (this.socket === socket) void this.scheduleReconnect()
    })
    for (const w of this.readyWaiters.splice(0)) w(this.generation)
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.stopped || this.reconnectTimer !== undefined) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connectOnce().catch((error) => {
        console.warn(`[dsh] reconnect failed: ${String(error)}`)
        void this.scheduleReconnect()
      })
    }, this.opts.backoffMs ?? 300)
  }

  /** 等到当前 generation 的 socket（generation ≥1）。 */
  ready(): Promise<DshMuxSocket> {
    if (this.socket !== undefined) return Promise.resolve(this.socket)
    return new Promise((resolve) => {
      this.readyWaiters.push(() => resolve(this.socket!))
    })
  }

  /** /api 调用（原样返回，计数 +1）。 */
  async rpc(method: string, args: unknown): Promise<ConnectionRpcResult> {
    const socket = await this.ready()
    if (socket === undefined) return { ok: false, error: { code: 'pbots/unavailable', message: 'dsh connection not ready', details: {} } }
    this.apiCount += 1
    return rpcRaw(this.baseUrl, this.cookie, method, args)
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer)
    this.socket?.close()
  }
}
