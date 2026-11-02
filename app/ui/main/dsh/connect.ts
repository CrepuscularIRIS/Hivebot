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
  /** 单次重连退避上限 ms（指数翻倍封顶，默认 10_000）。 */
  backoffMaxMs?: number
  /** start() 首连整体上限 ms（默认 30_000；超时 reject，后台重试不停止）。 */
  startTimeoutMs?: number
  /** rpc 等待连接的就绪上限 ms（默认 30_000；超时返回 pbots/unavailable）。 */
  rpcTimeoutMs?: number
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
  private reconnectAttempts = 0
  private loopStarted = false
  private readyWaiters: Array<(g: number) => void> = []
  private firstConnectWaiters: Array<(g: number) => void> = []
  /** main 侧已发出的 /api 调用计数（断言口径：拒绝时必须 === 0）。 */
  apiCount = 0

  constructor(opts: DshConnectionOptions) {
    this.baseUrl = opts.baseUrl
    this.opts = opts
  }

  get currentGeneration(): number { return this.generation }

  /** 连接并完成首次 /connect + ws open；之后再断线自动重连。
   * U-17（R2/R3）：首连失败与断线走同一条指数退避重试路径；start() 在
   * startTimeoutMs 内等到首个 generation 才 resolve，超时 reject（后台继续重试，
   * dsh 恢复后 rpc/ready 自行恢复，不再永久挂）。 */
  async start(): Promise<number> {
    this.startLoop()
    if (this.generation >= 1) return this.generation
    const timeoutMs = this.opts.startTimeoutMs ?? 30_000
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`dsh connect timed out after ${timeoutMs}ms`)),
        timeoutMs,
      )
      this.firstConnectWaiters.push((g) => { clearTimeout(timer); resolve(g) })
    })
  }

  /** 常驻连接循环（幂等）：失败进 scheduleReconnect，成功后只等 onDead。 */
  private startLoop(): void {
    if (this.loopStarted) return
    this.loopStarted = true
    void this.tryConnect()
  }

  private async tryConnect(): Promise<void> {
    if (this.stopped) return
    try {
      await this.connectOnce()
      this.reconnectAttempts = 0
    } catch (error) {
      console.warn(`[dsh] connect failed: ${String(error)}`)
      this.scheduleReconnect()
    }
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
      if (this.socket !== socket) return
      // U-17（R13）：死 socket 立即出清，ready() 只会挂起等新代，不再返回死柄。
      this.socket = undefined
      void this.scheduleReconnect()
    })
    for (const w of this.readyWaiters.splice(0)) w(this.generation)
    for (const w of this.firstConnectWaiters.splice(0)) w(this.generation)
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== undefined) return
    const base = this.opts.backoffMs ?? 300
    const cap = this.opts.backoffMaxMs ?? 10_000
    const delay = Math.min(base * 2 ** this.reconnectAttempts, cap)
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.tryConnect()
    }, delay)
  }

  /** 等到当前 generation 的 socket（generation ≥1）；死 socket 已出清，只会等新代。 */
  ready(): Promise<DshMuxSocket> {
    if (this.socket !== undefined) return Promise.resolve(this.socket)
    return new Promise((resolve) => {
      this.readyWaiters.push(() => resolve(this.socket!))
    })
  }

  /** /api 调用（原样返回，计数 +1）。U-17（R3）：未连接时有界等待
   * rpcTimeoutMs，超时返回结构化 pbots/unavailable，不永久挂。 */
  async rpc(method: string, args: unknown): Promise<ConnectionRpcResult> {
    const timeoutMs = this.opts.rpcTimeoutMs ?? 30_000
    let timer: NodeJS.Timeout | undefined
    try {
      const socket = await Promise.race([
        this.ready(),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs) }),
      ])
      if (socket === undefined) {
        return { ok: false, error: { code: 'pbots/unavailable', message: `dsh connection not ready after ${timeoutMs}ms`, details: {} } }
      }
      this.apiCount += 1
      return await rpcRaw(this.baseUrl, this.cookie, method, args)
    } finally {
      clearTimeout(timer)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer)
    this.socket?.close()
  }
}
