// M2 `pbots:mux-port` 端口转交 + streamId 归属 + 原帧 tap 读出 + port 级重连（U-12）。
// 时序与归属依据 work/p3-contract/CONTRACT.md §2.3 / §2（M2 行）；骨架参考 spike/U-00 bridge.mjs 的 makeM2
//（分支 feat/U-00@8998435，未随 W0 合入），按验收重做：10s 超时、senderFrame 校验、main 归属流冲突、
// 重连间隙不转交死 socket、tap 计数观测面。
// 白名单恰三个 endpoint（Q-spike 结论：无增补行；typert wire 的 {request:…} 壳在 payload 内原样透传，SPIKE.md §5.2）。
// U-16：main 常驻 $events 订阅（常开，随每代 socket 重开）+ 无人应答 deadline 代答（./deadline.ts）。
import { MessageChannelMain, type IpcMainEvent } from 'electron'
import type { DshConnection } from '../dsh/connect'
import type { DshMuxSocket, DshTap, MuxFrame } from '../dsh/socket'
import { EventsLedger, type EventsItem } from '../dsh/ledger'
import { approvalDeadlineMsFromEnv, createApprovalDeadline, type ApprovalDeadlineStats } from './deadline'
import { SCHEME } from '../sender'

/** M2 放行的 mux endpoint（C §2 M2 行 + Q-spike 落实：session/control 为 spike 证实必需）。 */
export const M2_ENDPOINTS: ReadonlySet<string> = new Set(['session/follow', '$events', 'session/control'])

/** 转交等待 socket 就绪的时限（C §2.3：10 s）。 */
export const PORT_TRANSFER_TIMEOUT_MS = 10_000

export interface M2Request { requestId: string }

/** MessagePortMain 的最小形状（测试可注入假端口对）。 */
export interface M2Port {
  on(type: 'message' | 'close', cb: (e: { data: unknown }) => void | (() => void)): void
  start(): void
  close(): void
  postMessage(data: unknown): void
}
export interface M2Channel { port1: M2Port; port2: unknown }

/** 原帧 tap 计数 + 拒绝记录：electronApp.evaluate 经 globalThis.__pbotsM2 读出（不新开 IPC 通道，④/D2）。 */
export interface M2Stats {
  downlink: { total: number; orphan: number; items: Record<string, number> }
  rejectedEndpoints: string[]
  rejectedSenders: number
  uplinkDropped: number
  transfers: number
  timeouts: number
  portCancels: number
  /** U-16 代答统计（活引用，随 deadline 巡检更新）。 */
  deadline: ApprovalDeadlineStats
}

export interface M2Deps {
  dsh?: DshConnection
  ledger?: EventsLedger
  /** 等 socket 就绪的时限，默认 10 s（测试注入）。 */
  timeoutMs?: number
  /** 重连间隙轮询间隔，默认 100 ms（测试注入）。 */
  pollMs?: number
  /** 端口对工厂，默认 MessageChannelMain（测试注入）。 */
  makeChannel?: () => M2Channel
  /** U-16 代答观察窗口 ms（默认 2×10s 或 env PBOTS_APPROVAL_DEADLINE_MS；测试注入）。 */
  deadlineMs?: number
  /** U-16 巡检间隔 ms（默认 clamp(deadline/4, 50..1000)；测试注入）。 */
  deadlineTickMs?: number
}

export type M2Handler = ((event: IpcMainEvent, req: M2Request) => void) & {
  readonly stats: M2Stats
  readonly ledger: EventsLedger
  /** E2E 断链注入：关掉当前 socket，触发真实重连路径。 */
  testDropSocket(): void
  /** E2E 作答注入：经 main 自己的 peer 调 $events/result（U-11 M1 白名单落成前的测试通道；
   * 审批作答要求与 $events 流同一 Peer，node 侧测试客户端属另一 Peer 会被 gateway 拒）。 */
  testAnswerEvent(clientId: string, eventId: string, value: 'allowed-once' | 'rejected'): Promise<unknown>
}

/** main 归属标记（socket.open 自开的流；与 port 归属共用 owners 表）。 */
const MAIN = 'main'
type StreamOwner = M2Port | typeof MAIN

/** 下行 $events item 的窄判别（ledger 喂数用；形状不对就不喂）。 */
function asEventsItem(value: unknown): EventsItem | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as { type?: unknown }
  if (v.type === 'ready' || v.type === 'waterfall' || v.type === 'cancel') return value as EventsItem
  return undefined
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 拒绝回帧（文本）。 */
function errorFrameText(streamId: string, message: string): string {
  return JSON.stringify({ type: 'error', streamId, error: { code: 'pbots/forbidden', message } })
}

/** port 上的帧一律 JSON 文本（与 WebSocket 文本帧一致；上游 RemoteStreamMuxClient 下行同样只收 string，
 * GW/client/stream-client.ts:328-331）。 */
function parsePortText(data: unknown): MuxFrame | undefined {
  if (typeof data !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(data)
    return typeof parsed === 'object' && parsed !== null ? (parsed as MuxFrame) : undefined
  } catch {
    return undefined
  }
}

/** IPC 来源校验（④）：senderFrame 必须来自 pbots-app://app/（主窗口断言在 index.ts 的 assertPbotsSender）。 */
function senderAllowed(event: IpcMainEvent): boolean {
  const frame = event.senderFrame
  if (frame === null) return false
  try {
    const url = new URL(frame.url)
    return url.protocol === `${SCHEME}:` && url.hostname === 'app'
  } catch {
    return false
  }
}

export function registerM2Mux(deps: M2Deps = {}): M2Handler {
  const ledger = deps.ledger ?? new EventsLedger()
  const timeoutMs = deps.timeoutMs ?? PORT_TRANSFER_TIMEOUT_MS
  const pollMs = deps.pollMs ?? 100
  const makeChannel = deps.makeChannel ?? ((): M2Channel => new MessageChannelMain() as unknown as M2Channel)

  const stats: M2Stats = {
    downlink: { total: 0, orphan: 0, items: {} },
    rejectedEndpoints: [],
    rejectedSenders: 0,
    uplinkDropped: 0,
    transfers: 0,
    timeouts: 0,
    portCancels: 0,
    deadline: { answers: 0, answeredEvents: [] },
  }

  /** streamId → 拥有者（port 或 main）。 */
  const owners = new Map<string, StreamOwner>()
  /** port → 其 open 过的 streamId 集。 */
  const portStreams = new Map<M2Port, Set<string>>()
  /** $events endpoint 的流（ledger 旁听范围）。 */
  const eventsStreams = new Set<string>()
  /** 已死 socket（重连间隙 ready() 仍返回它们，不得转交）。 */
  const deadSockets = new WeakSet<DshMuxSocket>()
  let wired: DshMuxSocket | undefined
  /** U-16 main 常驻 $events 订阅（当前代）与其 clientId（作答资格：gateway 只认 active client）。 */
  let mainEvents: { cancel(): void } | undefined
  let mainEventsClientId: string | undefined

  /** 原帧 tap（独占 socket 的单 tap 槽）：下行路由 + 计数 + $events 喂 ledger；上行记录 main 归属流。 */
  const tap: DshTap = (frame, dir) => {
    if (dir === 'up') {
      // main 自己 socket.open() 的流：桥未登记过的 open 即 main 归属（port 的 open 在转发前已登记）。
      if (frame.type === 'open' && !owners.has(frame.streamId)) owners.set(frame.streamId, MAIN)
      return
    }
    stats.downlink.total += 1
    if (frame.type === 'item') {
      stats.downlink.items[frame.streamId] = (stats.downlink.items[frame.streamId] ?? 0) + 1
    }
    const owner = owners.get(frame.streamId)
    if (owner === undefined) {
      stats.downlink.orphan += 1
      return
    }
    if (eventsStreams.has(frame.streamId) && frame.type === 'item') {
      const item = asEventsItem(frame.value)
      if (item !== undefined) ledger.record(item)
    }
    if (frame.type === 'end' || frame.type === 'error') {
      owners.delete(frame.streamId)
      eventsStreams.delete(frame.streamId)
      if (owner !== MAIN) portStreams.get(owner)?.delete(frame.streamId)
    }
    if (owner !== MAIN) owner.postMessage(JSON.stringify(frame))
  }

  function forgetStream(streamId: string, owner: M2Port): void {
    owners.delete(streamId)
    eventsStreams.delete(streamId)
    portStreams.get(owner)?.delete(streamId)
  }

  /** socket 断开：关闭全部 port（C §2 M2：重连就绪前不转交新 port 由 awaitLive 保证）。 */
  function closeAllPorts(): void {
    for (const port of [...portStreams.keys()]) {
      const sids = portStreams.get(port)
      portStreams.delete(port)
      if (sids !== undefined) for (const sid of sids) { owners.delete(sid); eventsStreams.delete(sid) }
      try { port.close() } catch { /* 已关 */ }
    }
  }

  /** U-16 main 常驻 $events 订阅：waterfall/cancel 喂 ledger（renderer 不在也可见、可下账）；
   * ready 只进 mainEventsClientId——不喂 ledger，ledger.readyClientId 归 renderer 的流（M1 §2.2 校验源）。 */
  function openMainEvents(socket: DshMuxSocket): void {
    if (mainEvents !== undefined) return
    try {
      mainEvents = socket.openStream('$events', {}, (frame) => {
        if (frame.type !== 'item') return
        const item = asEventsItem(frame.value)
        if (item === undefined) return
        if (item.type === 'ready') { mainEventsClientId = item.clientId; return }
        ledger.record(item)
      })
    } catch {
      mainEvents = undefined // socket 在 wire 竞态中已死：死回调里已清，下一代重开
    }
  }

  function wire(socket: DshMuxSocket): void {
    if (wired === socket) return
    wired = socket
    socket.setTap(tap)
    openMainEvents(socket)
    socket.onDead(() => {
      deadSockets.add(socket)
      mainEvents = undefined
      mainEventsClientId = undefined
      if (wired === socket) { wired = undefined; closeAllPorts() }
    })
  }

  // U-16 常驻循环：main 的 $events 订阅不依赖 renderer 端口（页面关闭后 pending 仍可见、可代答；
  // 断链重连后在新一代 socket 上重开，gateway 对新 client 补发未决——S5 补发语义）。
  // 无人应答 deadline 代答：经 main 自己的连接（同 Peer）以常驻订阅 clientId 作答（./deadline.ts）。
  if (deps.dsh !== undefined) {
    void (async () => {
      for (;;) {
        const socket = await deps.dsh!.ready()
        if (deadSockets.has(socket)) { await sleep(pollMs); continue }
        wire(socket)
        await new Promise<void>((resolve) => { socket.onDead(resolve) })
      }
    })()
    const deadlineMs = deps.deadlineMs ?? approvalDeadlineMsFromEnv()
    createApprovalDeadline(
      {
        dsh: deps.dsh,
        ledger,
        isPortMounted: () => eventsStreams.size > 0,
        mainClientId: () => mainEventsClientId,
        deadlineMs,
        tickMs: deps.deadlineTickMs ?? Math.min(1_000, Math.max(50, Math.round(deadlineMs / 4))),
      },
      stats.deadline,
    )
  }

  /** 等 live socket：dsh.ready() 可能永久 pending（未连上）或返回死 socket（重连间隙），都受时限约束。 */
  async function awaitLive(deadline: number): Promise<DshMuxSocket | Error> {
    for (;;) {
      const remain = deadline - Date.now()
      if (remain <= 0) return new Error(`mux port transfer timed out after ${timeoutMs}ms (socket not ready)`)
      const socket = await Promise.race([
        deps.dsh!.ready(),
        sleep(remain).then((): 'timeout' => 'timeout'),
      ])
      if (socket !== 'timeout' && !deadSockets.has(socket)) return socket
      // ponytail: DshConnection 无「等下一代」API，重连间隙轮询（U-00 层不改；backoff 300ms 级，轮询足够）
      await sleep(Math.min(pollMs, Math.max(deadline - Date.now(), 0)))
    }
  }

  /** port 上行帧（JSON 文本，C §2.3 W.send(text)）：白名单 + 归属校验后原帧直通（(a)(b)）。 */
  function onPortFrame(port: M2Port, socket: DshMuxSocket, data: unknown): void {
    const frame = parsePortText(data)
    if (frame === undefined) return
    if (typeof frame.streamId !== 'string' || frame.streamId === '') return
    switch (frame.type) {
      case 'open': {
        if (typeof frame.endpoint !== 'string' || !M2_ENDPOINTS.has(frame.endpoint)) {
          stats.rejectedEndpoints.push(String(frame.endpoint))
          port.postMessage(errorFrameText(frame.streamId, `endpoint not allowed: ${String(frame.endpoint)}`))
          return
        }
        if (owners.has(frame.streamId)) { // (a) 与任一现有流（port 或 main 的）冲突即拒
          port.postMessage(errorFrameText(frame.streamId, `streamId already in use: ${frame.streamId}`))
          return
        }
        owners.set(frame.streamId, port)
        portStreams.get(port)?.add(frame.streamId)
        if (frame.endpoint === '$events') eventsStreams.add(frame.streamId)
        break
      }
      case 'item': case 'end': case 'cancel': {
        if (owners.get(frame.streamId) !== port) { // (b) 只放行经本 port open 过的流
          stats.uplinkDropped += 1
          return
        }
        if (frame.type !== 'item') forgetStream(frame.streamId, port)
        break
      }
      default:
        return
    }
    try {
      socket.sendRaw(frame)
    } catch {
      stats.uplinkDropped += 1 // socket 刚死：port 即将被 closeAllPorts 清理
    }
  }

  /** port 关闭 → 对本 port 的每个 streamId 发 cancel（端口废弃清理其全部流）。 */
  function onPortClose(port: M2Port, socket: DshMuxSocket): void {
    const sids = portStreams.get(port)
    if (sids === undefined) return
    portStreams.delete(port)
    for (const sid of sids) {
      forgetStream(sid, port)
      try {
        socket.sendRaw({ type: 'cancel', streamId: sid })
        stats.portCancels += 1
      } catch { /* socket 已死 */ }
    }
  }

  const handler = ((event: IpcMainEvent, req: M2Request) => {
    if (!senderAllowed(event)) { stats.rejectedSenders += 1; return }
    const requestId = (req as M2Request | undefined)?.requestId
    if (typeof requestId !== 'string' || requestId === '') return
    if (deps.dsh === undefined) {
      event.sender.postMessage('pbots:mux-port', { requestId, ok: false, error: 'dsh connection not configured' })
      return
    }
    const deadline = Date.now() + timeoutMs
    void (async () => {
      const live = await awaitLive(deadline)
      if (event.sender.isDestroyed()) return // 等待期间页面没了：不转交也不回执
      if (live instanceof Error) {
        stats.timeouts += 1
        event.sender.postMessage('pbots:mux-port', { requestId, ok: false, error: live.message })
        return
      }
      wire(live)
      const channel = makeChannel()
      portStreams.set(channel.port1, new Set())
      channel.port1.on('message', (e) => onPortFrame(channel.port1, live, (e as { data: unknown }).data))
      channel.port1.on('close', () => onPortClose(channel.port1, live))
      channel.port1.start()
      stats.transfers += 1
      event.sender.postMessage('pbots:mux-port', { requestId, ok: true }, [channel.port2])
    })()
  }) as M2Handler

  Object.assign(handler, {
    stats,
    ledger,
    /** 模拟网络断链：terminate 底层 ws → DshMuxSocket.die() → closeAllPorts + DshConnection 重连。
     * （socket.close() 会预置 dead 抑制 die，不触发重连；故从测试钩子反射到私有 ws。仅 E2E 注入用。） */
    testDropSocket(): void {
      const socket = wired as (DshMuxSocket & { ws?: { terminate?: () => void } }) | undefined
      try { socket?.ws?.terminate?.() } catch { /* 已死 */ }
    },
    testAnswerEvent(clientId: string, eventId: string, value: 'allowed-once' | 'rejected'): Promise<unknown> {
      if (deps.dsh === undefined) return Promise.resolve(undefined)
      return deps.dsh.rpc('$events/result', { clientId, eventId, outcome: { kind: 'result', value } })
    },
  } satisfies Partial<M2Handler>)

  const g = globalThis as { __pbotsM2?: M2Handler }
  g.__pbotsM2 = handler
  return handler
}
