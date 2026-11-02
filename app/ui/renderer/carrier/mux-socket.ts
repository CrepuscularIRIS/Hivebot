// W 包装对象（C §2.3「包装对象约 40 行」的完整版）：createWebSocket 接缝的 pbots 实现。
// 只实现 open/close/message/error 事件、readyState、send、close——上游 RemoteStreamMuxClient
// 连上 socket 后不发握手帧（GW/client/stream-client.ts:241-295），无需其他成员。
// 端口申请时序：requestMuxPort(requestId) → 监听 window message{pbotsMux}（校验 source===window
// 与 requestId，ES:86）→ 收到端口才 CONNECTING→OPEN；失败/10s 超时 → readyState=3 派发 error 再
// close；迟到的端口立即 close。

/** 页面侧 MessagePort 的最小形状。 */
export interface PortLike {
  start(): void
  close(): void
  postMessage(data: unknown): void
  addEventListener(type: 'message' | 'close', listener: (event: { data?: unknown }) => void): void
}

/** preload relay 转发来的 window message（mux-relay.ts 用 {pbotsMux:requestId} 包装）。 */
export interface CarrierWindowEvent {
  source: unknown
  origin: string
  data: { pbotsMux?: string; ok?: boolean; error?: unknown }
  ports: PortLike[]
}

/** 运行环境接缝（页面默认实现见 ./index.ts；单测注入假 env）。 */
export interface CarrierEnv {
  windowRef: unknown
  requestMuxPort(requestId: string): void
  addMessageListener(listener: (event: CarrierWindowEvent) => void): () => void
  randomId(): string
}

type SocketEvent = 'open' | 'error' | 'close' | 'message'
type AnyListener = (event: never) => void

export type CarrierEventMap = {
  open: { }
  error: { error?: Error }
  close: { }
  message: { data: unknown }
}

/** 每个实例 = 一次端口申请（每次上游 createWebSocket 换一个 MessagePort，C §2 M2 行）。 */
export class CarrierSocket {
  private state: 0 | 1 | 2 | 3 = 0
  private readonly requestId: string
  private timer: ReturnType<typeof setTimeout> | undefined
  private port: PortLike | undefined
  private readonly listeners = new Map<SocketEvent, Array<{ fn: AnyListener; once: boolean }>>()

  // ponytail: 每实例一个常驻 window message 监听（终态后只负责关迟到端口）；高频重连攒监听时再加自清理截止
  constructor(private readonly env: CarrierEnv, timeoutMs = 10_000) {
    this.requestId = env.randomId()
    env.addMessageListener((event) => this.onWindowMessage(event))
    this.timer = setTimeout(() => this.finish(new Error(`mux port transfer timed out after ${timeoutMs}ms`)), timeoutMs)
    env.requestMuxPort(this.requestId)
  }

  get readyState(): number { return this.state }

  send(data: string): void {
    if (this.state !== 1) throw new Error('carrier socket is not open')
    this.port!.postMessage(data)
  }

  close(_code?: number, _reason?: string): void {
    this.finish()
  }

  addEventListener<Event extends SocketEvent>(event: Event, listener: (event: CarrierEventMap[Event]) => void, options?: { once?: boolean }): void {
    const list = this.listeners.get(event) ?? []
    list.push({ fn: listener as AnyListener, once: options?.once === true })
    this.listeners.set(event, list)
  }

  removeEventListener<Event extends SocketEvent>(event: Event, listener: (event: CarrierEventMap[Event]) => void): void {
    const list = this.listeners.get(event)
    if (list === undefined) return
    this.listeners.set(event, list.filter((entry) => entry.fn !== (listener as AnyListener)))
  }

  private dispatch<Event extends SocketEvent>(event: Event, payload: CarrierEventMap[Event]): void {
    const list = this.listeners.get(event)
    if (list === undefined || list.length === 0) return
    const firing = [...list]
    this.listeners.set(event, list.filter((entry) => !entry.once))
    for (const entry of firing) (entry.fn as (e: CarrierEventMap[Event]) => void)(payload)
  }

  /** 终态：清 timer、关端口；有 error 则 error 先于 close（C §2.3）。
   * 订阅保留——迟到的端口（超时后 main 才转交成功的那一个）要靠它立即 close。 */
  private finish(error?: Error): void {
    if (this.state === 3) return
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined }
    this.state = 3
    const port = this.port
    this.port = undefined
    port?.close()
    if (error !== undefined) this.dispatch('error', { error })
    this.dispatch('close', {})
  }

  private onWindowMessage(event: CarrierWindowEvent): void {
    if (event.source !== this.env.windowRef) return // ES:86：拒收错误 source
    const data = event.data
    if (typeof data !== 'object' || data === null) return
    if (data.pbotsMux !== this.requestId) return // 未知 requestId 拒收
    for (const extra of event.ports.slice(1)) extra.close()
    if (this.state === 3) {
      for (const port of event.ports) port.close() // 迟到的端口立即 close
      return
    }
    if (data.ok !== true) {
      this.finish(errorOf(data.error))
      return
    }
    const port = event.ports[0]
    if (port === undefined) {
      this.finish(new Error('mux port transfer arrived without a port'))
      return
    }
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined }
    this.port = port
    port.addEventListener('close', () => this.finish())
    port.addEventListener('message', (e) => this.dispatch('message', { data: (e as { data: unknown }).data }))
    port.start()
    this.state = 1
    this.dispatch('open', {})
  }
}

function errorOf(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  return new Error(`mux port transfer failed: ${JSON.stringify(error ?? null)}`)
}
