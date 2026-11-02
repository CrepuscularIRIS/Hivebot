// U-15 dev-min carrier 层：boot $events（断链 300ms 重开）+ per-bot session/follow。
// $events/审批作答由 U-22 的 ClientRemoteEvents + ui-approval 承担（届时本目录删除）；
// 这里只旁听 ready/waterfall/cancel 维护视图（m2-port E2E D4①② 与 U-15 ③ 依赖）。
import { CarrierSocket, pageEnv } from '../carrier'
import { newDevSocket, PageMux, type DevSocketHandle, type MuxStream } from './mux'
import { initBot, reduceItem, type BotView } from './reduce'

export interface EventsView { clientId: string | undefined; items: unknown[] }

interface DevState {
  events: EventsView
  clientIds: string[]
  sessions: number
  sockets: DevSocketHandle[]
  bots: BotView[]
}

const state: DevState = {
  events: { clientId: undefined, items: [] },
  clientIds: [],
  sessions: 0,
  sockets: [],
  bots: [],
}

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void { for (const l of [...listeners]) l() }

let bootMux: PageMux | undefined

/** boot 会话：开端口 → $events 流 → 旁听 ready/waterfall/cancel 维护 events 视图；关闭后 300ms 重开。 */
function bootSession(): void {
  const socket = new CarrierSocket(pageEnv())
  socket.addEventListener('open', () => {
    state.sessions += 1
    bootMux = new PageMux(socket)
    const feed = bootMux.open('$events', {})
    state.events = { clientId: undefined, items: feed.items }
    const poll = (): void => {
      for (const item of feed.items as Array<{ type?: string; clientId?: string }>) {
        if (item.type === 'ready' && typeof item.clientId === 'string') {
          state.events.clientId = item.clientId
          if (state.clientIds[state.clientIds.length - 1] !== item.clientId) state.clientIds.push(item.clientId)
        }
      }
      notify()
      if (!feed.done) setTimeout(poll, 50)
    }
    poll()
  })
  socket.addEventListener('close', () => {
    for (const stream of [...(bootMux?.streams.values() ?? [])]) stream.done = true
    setTimeout(bootSession, 300)
  })
}

/** per-bot session/follow：一个 CarrierSocket 一条流；item 归约进 BotView（D1 流式渲染的数据源）。 */
export function followBot(sessionId: string): void {
  if (state.bots.some((b) => b.sessionId === sessionId)) return
  state.bots = [...state.bots, initBot(sessionId)]
  notify()
  const socket = new CarrierSocket(pageEnv())
  socket.addEventListener('open', () => {
    const mux = new PageMux(socket)
    const feed: MuxStream = mux.open('session/follow', {
      request: { address: { kind: 'session', sessionId }, assistantStream: true },
    })
    let seen = 0 // 已归约的 item 数（items 数组只增不改，游标在闭包）
    const poll = (): void => {
      let bot = state.bots.find((b) => b.sessionId === sessionId)
      if (bot === undefined) return
      for (; seen < feed.items.length; seen += 1) {
        bot = reduceItem(bot, feed.items[seen])
      }
      state.bots = state.bots.map((b) => (b.sessionId === sessionId ? bot! : b))
      notify()
      if (!feed.done) setTimeout(poll, 40)
    }
    poll()
  })
}

/** 当前 bot 视图快照（app.tsx 渲染数据源）。 */
export function devBots(): BotView[] { return state.bots }

/** E2E 驱动面（m2-port/d1 spec）：getter 保持对 state 的活引用。 */
export function installDevSurface(): void {
  ;(window as unknown as Record<string, unknown>).__pbotsDev = {
    get events(): EventsView { return state.events },
    get clientIds(): string[] { return state.clientIds },
    get sessions(): number { return state.sessions },
    get sockets(): DevSocketHandle[] { return state.sockets },
    get bots(): BotView[] { return state.bots },
    newSocket(): DevSocketHandle { return newDevSocket((h) => { state.sockets.push(h) }) },
    openStream(endpoint: string, args?: unknown): MuxStream {
      if (bootMux === undefined) throw new Error('boot mux not open yet')
      return bootMux.open(endpoint, args)
    },
  }
  bootSession()
}
