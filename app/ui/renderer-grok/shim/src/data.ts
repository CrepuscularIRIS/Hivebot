// P5-51 · 数据层：现有 M1/M2/M3 carrier（app/ui/renderer/carrier + window.pbots）⇄ coordinator 事件流。
// 复用旧 renderer 的构件（PLAN：P6-01 foldTurns + reduce 直 import，不改）：
// - roster：api session/list + M3 bots-meta；主 bot 缺失 → session/create → patch（旧 store.start 同流程）
// - 会话：mux session/follow → reduceFollow → SessionView；序列化经 serialize（foldTurns 在内）
// - 审批：$events waterfall approval/request → local-tool-permission 卡 entry（含 permissionScope/
//   Revision，P5-50 坑2 的渲染硬条件）；作答走 api $events/result，值域 ⊆ {allowed-once, rejected}
// - 推送：roster 变化 → agents 事件；view 变化 → transcript snapshot 事件（S0 坑1 口径）
// ponytail: snapshot 全量推（每事件一次 JSON 序列化），流式高频场景的增量 diff 留 P5-54 优化。
import { CarrierSocket, pageEnv } from '../../../renderer/carrier'
import { newDevSocket, PageMux, type DevSocketHandle, type MuxStream } from '../../../renderer/carrier/mux'
import { initView, olderItemsOf, reduceFollow, type SessionView } from '../../../renderer/session/reduce'
import { askText, serialize, permissionEntry, type RawEntry } from './entries'
import { activityOf, toAgentRecord } from './agents'
import type { CoordinatorDeps } from './coordinator'
import { botConfigOf, type PbotsUi, type Recipe } from './bots'

type AnyRecord = Record<string, unknown>
const rec = (v: unknown): AnyRecord => (typeof v === 'object' && v !== null ? v as AnyRecord : {})
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface ApiResult { ok: boolean; value?: unknown; error?: { code: string; message: string } }
interface Summary { sessionId: string; title: string | null; preset: string | null; running: boolean; updatedAt: number }
interface Ask { agentId: string; callId: string | null; toolName: string; reason: string | null; at: number }

const HISTORY_PAGE = 40
/** tail 回值时 follow 快照还没到：回这个探针游标，首次取更早页时再按 live 窗口定（transcriptWindow）。 */
const TAIL_PROBE = Number.MAX_SAFE_INTEGER
/** 0.18 sidebar 新建会话按钮的 createAgent 实参名（ProductionRenderer.tsx:2815）。 */
const NEW_CHAT = 'New chat'
/** D10c：失效 bot 在侧栏预览行的文案。 */
export const CONNECTOR_UNAVAILABLE = 'Connector unavailable'

export interface ShimDataOptions {
  authId: string
  api(method: string, args?: unknown): Promise<ApiResult>
  metaApi(op: 'get' | { op: 'patch'; mainBotId: string }): Promise<ApiResult>
  log?: (message: string) => void
  /** P5-57：pbotsUi.focus → desktop.onFocusAgent 监听者（index.ts 接线）。 */
  focus?: (agentId: string) => void
  /** P5-57 启动封面：roster 首次就绪 / 重试耗尽。 */
  boot?: (phase: 'ready' | 'failed') => void
}

export interface ShimData {
  deps: CoordinatorDeps
  /** coordinator server 的 emit 接线（agents / transcript 事件推送）。 */
  wire(push: { agents(): void; transcript(agentId: string): void }): void
  agentsPayload(): unknown[]
  transcriptPayload(agentId: string): { type: 'snapshot'; activeAgentId: string; entries: RawEntry[] }
  /** E2E 观测面：已发出的审批作答（eventId → dsh 值），断言值域 ⊆ {allowed-once, rejected}。 */
  answers: Array<{ eventId: string; value: string }>
  /** E2E 观测面：view items 原样（诊断 tool result）。 */
  debugItems(agentId: string): unknown[]
  /** E2E 观测面 window.__pbotsDev（P5-54 从旧 renderer store 平移，契约同名同形：m2-port / m2-deadline /
   * d4-deadline / questions-answer 等 carrier 级 spec 依赖）。只读旁路 + 测试注入钩子，不开新 IPC。 */
  dev: DevSurface
  /** P5-57 覆盖层数据面（window.pbotsUi）。 */
  ui: PbotsUi
  start(): void
}

export interface DevSurface {
  readonly events: { clientId: string | undefined; items: unknown[] }
  readonly clientIds: string[]
  readonly sessions: number
  readonly sockets: DevSocketHandle[]
  /** 已 follow 的会话视图（D1/D2：preset / chunkCount / turnEnded / cwd …）。 */
  readonly bots: SessionView[]
  readonly state: { order: string[]; meta: { mainBotId: string | null }; views: Record<string, SessionView> }
  newSocket(): DevSocketHandle
  openStream(endpoint: string, args?: unknown): MuxStream
  muxStreams(): Array<{ streamId: string; endpoint: string }>
  /** D4 注入：关掉 boot $events 流（模拟 renderer 离场）。 */
  closeEvents(): void
  /** 故障注入：下一次 method 调用直接返回该错误（一次性）。 */
  failNext(method: string, code?: string, message?: string): void
}

export function createShimData(opts: ShimDataOptions): ShimData {
  const log = opts.log ?? (() => {})
  const push: { agents(): void; transcript(agentId: string): void } = { agents: () => {}, transcript: () => {} }

  let order: string[] = []
  let summaries: Record<string, Summary> = {}
  let mainBotId: string | null = null
  let recipes: Record<string, Recipe> = {}
  const models = new Map<string, string>() // #5 成功后的本地值（快照下一轮才投影）
  const uiListeners = new Set<() => void>()
  let uiVersion = 0
  const uiChanged = (): void => { uiVersion += 1; for (const l of [...uiListeners]) l() }
  const views = new Map<string, SessionView>()
  const unread = new Set<string>()
  const asks = new Map<string, Ask>() // eventId → pending 审批
  const pendingNonce = new Map<string, string>() // agentId → 待补记 clientNonce（按消息身份 source.rpcId 绑定，L-7 R4 f2）
  const createNotices = new Map<string, string>() // agentId → 新建 bot 的非致命失败通知（首条用户消息前展示，L-7 O4）
  let revision = 0
  let eventsClientId: string | undefined
  let booted = false
  const answers: ShimData['answers'] = []

  // ---- carrier ----
  let mux: PageMux | undefined
  const followed = new Set<string>()
  const followStreams = new Map<string, MuxStream>()

  const dev = {
    events: { clientId: undefined as string | undefined, items: [] as unknown[] },
    clientIds: [] as string[], sessions: 0, sockets: [] as DevSocketHandle[],
    eventsStream: undefined as MuxStream | undefined,
  }
  const injected = new Map<string, { code: string; message: string }>()
  const metaApi = opts.metaApi
  const api = (method: string, args?: unknown): Promise<ApiResult> => {
    const fault = injected.get(method)
    if (fault === undefined) return opts.api(method, args)
    injected.delete(method)
    return Promise.resolve({ ok: false, error: fault })
  }

  const agentName = (id: string): string => {
    const s = summaries[id]
    return s !== undefined && s.title !== null && s.title !== '' ? s.title : NEW_CHAT
  }

  const configOf = (id: string) => (summaries[id] === undefined && !views.has(id) ? null : botConfigOf({
    rawPreset: views.get(id)?.preset ?? summaries[id]?.preset ?? null,
    recipes,
    model: models.get(id) ?? views.get(id)?.model ?? null,
    isMain: id === mainBotId,
    running: views.get(id)?.running ?? summaries[id]?.running === true,
  }))

  const recordOf = (id: string): AnyRecord =>
    toAgentRecord({
      sessionId: id,
      title: summaries[id]?.title ?? null,
      isMain: id === mainBotId,
      running: views.get(id)?.running ?? summaries[id]?.running === true,
      unread: unread.has(id),
      activity: views.has(id)
        ? activityOf(views.get(id)!)
        : (summaries[id]?.running === true ? { kind: 'thinking' } : null),
      updatedAt: summaries[id]?.updatedAt ?? Date.now(),
      awaitingApproval: [...asks.values()].some((a) => a.agentId === id),
      // D10c 侧栏角标：失效 bot 的预览行（0.18 行内 lastMessagePreview 槽）
      ...(configOf(id)?.readOnly === true ? { preview: CONNECTOR_UNAVAILABLE } : {}),
    })

  const askEntries = (agentId: string): RawEntry[] => {
    const out: RawEntry[] = []
    for (const [eventId, ask] of asks) {
      if (ask.agentId !== agentId) continue
      revision += 1
      // 完整动作按同 callId 工具行实参现算（approval/request 先于工具行到达时退 reason，下一次推送补上）
      const tool = views.get(agentId)?.items.find((i) => i.kind === 'tool' && i.callId === ask.callId)
      const command = askText(ask, tool?.kind === 'tool' ? tool.args : undefined)
      out.push(permissionEntry({ id: `perm-${eventId}`, requestId: eventId, scope: opts.authId, revision, at: ask.at, command }))
    }
    return out
  }

  /** L-7 O4：新建 bot 的非致命失败（selectModel 失败等）在空会话里以 notice 呈现，
   * 首条用户消息到达后撤下（对齐旧 renderer addCreated(sid, preset, notice) 的可见性）。 */
  const createNotice = (agentId: string): RawEntry[] => {
    const text = createNotices.get(agentId)
    if (text === undefined) return []
    const view = views.get(agentId)
    if (view !== undefined && view.items.some((i) => i.kind === 'user')) {
      createNotices.delete(agentId)
      return []
    }
    return [{ kind: 'notice', id: `create-notice-${agentId}`, timestampMs: Date.now(), content: text }]
  }

  const entriesOf = (agentId: string): RawEntry[] => {
    const view = views.get(agentId)
    if (view === undefined || !view.loaded) return [...createNotice(agentId), ...askEntries(agentId)]
    const pending = pendingNonce.get(agentId)
    const main = serialize({
      items: view.items, hasMore: view.hasMore, running: view.running, streaming: view.streaming,
      agentName: agentName(agentId),
      ...(pending !== undefined ? { clientNonce: pending } : {}),
    })
    if (pending !== undefined && main.some((e) => e.clientNonce === pending)) pendingNonce.delete(agentId)
    return [...main, ...createNotice(agentId), ...askEntries(agentId)]
  }

  // 首个 openAgentTail 回值之前不推该 bot 的 transcript 快照：上游 openAgent 见 entriesByAgent 已有条目就不再取 tail，
  // 而分页游标（nextBeforeSeq）只随 tail 回值安装——先推快照会让重入的 openAgent 抢掉游标，#11 永不翻页（P5-54 实测）。
  const tailed = new Set<string>()
  const pushTranscript = (agentId: string): void => { if (tailed.has(agentId)) push.transcript(agentId) }

  const onFollowItem = (agentId: string, item: unknown): void => {
    const view = reduceFollow(views.get(agentId) ?? initView(agentId), item)
    views.set(agentId, view)
    // 已在会话流里定局的审批（main deadline 代答 / 别处作答后 $events 不再发 cancel）从 dock 收掉——旧 store 同口径
    for (const [eventId, ask] of asks) {
      if (ask.agentId === agentId && ask.callId !== null
        && view.items.some((i) => i.kind === 'tool' && i.callId === ask.callId && (i.decision !== null || i.status !== 'running'))) asks.delete(eventId)
    }
    pushTranscript(agentId)
    push.agents() // running/activity 随 view 变化（persona 动态）
  }

  const openFollow = (agentId: string): void => {
    if (mux === undefined || followStreams.has(agentId)) return
    const stream = mux.open('session/follow', {
      request: { address: { kind: 'session', sessionId: agentId }, assistantStream: true, maxMessages: HISTORY_PAGE },
    })
    followStreams.set(agentId, stream)
    let seen = 0
    const tick = (): void => {
      for (; seen < stream.items.length; seen += 1) onFollowItem(agentId, stream.items[seen])
      if (!stream.done) setTimeout(tick, 40)
    }
    tick()
  }

  const summaryOf = (item: AnyRecord): Summary => {
    const values = rec(rec(item.projections).values)
    return {
      sessionId: String(item.sessionId),
      title: typeof values.title === 'string' && values.title !== '' ? values.title : null,
      preset: typeof values.agentPreset === 'string' ? values.agentPreset : null,
      running: item.running === true,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    }
  }

  /** roster 拉取 + 主 bot 保障（旧 store.start 同流程：缺失/失效 → #3 建默认 → #20 patch）。
   * 单飞：boot 重试与 socket 重开的并发调用共享同一次执行（双跑会双建主 bot）。 */
  let rosterFlight: Promise<void> | null = null
  const loadRoster = async (): Promise<void> => {
    if (rosterFlight !== null) return rosterFlight
    rosterFlight = doLoadRoster().finally(() => { rosterFlight = null })
    return rosterFlight
  }
  const doLoadRoster = async (): Promise<void> => {
    const [list, meta] = await Promise.all([api('session/list', { _request: {} }), metaApi('get')])
    if (!list.ok) throw new Error(`session/list: ${list.error?.message ?? ''}`)
    if (!meta.ok) throw new Error(`bots-meta: ${meta.error?.message ?? ''}`)
    const items = (rec(list.value).items as unknown[] | undefined ?? []).map(rec)
      .filter((i) => typeof i.sessionId === 'string' && i.origin !== 'subagent' && i.parentSessionId === undefined)
      .map(summaryOf)
    const listed = rec(meta.value).mainBotId
    recipes = rec(rec(meta.value).recipes) as unknown as Record<string, Recipe>
    const nextSummaries: Record<string, Summary> = Object.fromEntries(items.map((s) => [s.sessionId, s]))
    if (typeof listed !== 'string' || nextSummaries[listed] === undefined) {
      const created = await api('session/create', { request: {} })
      const sid = rec(created.value).sessionId
      if (!created.ok || typeof sid !== 'string') throw new Error(`创建主 Bot 失败：${created.error?.message ?? ''}`)
      const patched = await metaApi({ op: 'patch', mainBotId: sid })
      if (!patched.ok) throw new Error(`设置主 Bot 失败：${patched.error?.message ?? ''}`)
      nextSummaries[sid] = { sessionId: sid, title: null, preset: null, running: false, updatedAt: Date.now() }
      mainBotId = sid
    } else {
      mainBotId = listed
    }
    // 顺序首载定序后冻结（R9）：主 bot 置顶，其余按 updatedAt；后续只并入新 session
    const rest = Object.values(nextSummaries).filter((s) => s.sessionId !== mainBotId).sort((a, b) => b.updatedAt - a.updatedAt)
    summaries = nextSummaries
    order = order.length === 0 ? [mainBotId!, ...rest.map((s) => s.sessionId)] : [...new Set([mainBotId!, ...order, ...rest.map((s) => s.sessionId)])]
    followed.add(mainBotId!)
    openFollow(mainBotId!)
    push.agents()
    opts.boot?.('ready')
  }

  const onEventsItem = (item: unknown): void => {
    const it = rec(item)
    if (it.type === 'ready' && typeof it.clientId === 'string') {
      eventsClientId = it.clientId
      dev.events.clientId = it.clientId
      if (dev.clientIds[dev.clientIds.length - 1] !== it.clientId) dev.clientIds.push(it.clientId)
      return
    }
    if (it.type === 'waterfall' && it.event === 'approval/request' && typeof it.eventId === 'string') {
      const req = rec(it.request)
      asks.set(it.eventId, {
        agentId: String(it.agentId ?? ''),
        callId: typeof req.callId === 'string' ? req.callId : null,
        toolName: String(req.toolName ?? 'tool'),
        // displayReason 是本地化对象 {en,…}（dsh-user-approval types.d.ts:65），优先于 reason
        reason: typeof rec(req.displayReason).en === 'string' ? rec(req.displayReason).en as string : typeof req.reason === 'string' ? req.reason : null,
        at: Date.now(),
      })
      pushTranscript(String(it.agentId ?? ''))
      push.agents()
      return
    }
    if (it.type === 'cancel' && typeof it.eventId === 'string') {
      asks.delete(it.eventId)
      push.agents()
      return
    }
    if (it.type === 'emit' && Array.isArray(it.args)) {
      const [sid, value] = it.args as [unknown, unknown]
      const prev = typeof sid === 'string' ? summaries[sid] : undefined
      if (prev === undefined || typeof value !== 'boolean' || it.event !== 'api-session/status') return
      const finished = prev.running && !value
      summaries = { ...summaries, [prev.sessionId]: { ...prev, running: value } }
      if (finished && sid !== mainBotId) unread.add(prev.sessionId) // 当前打开的 bot 由 setAgentUnread 清
      push.agents()
    }
  }

  const bootSession = (): void => {
    const socket = new CarrierSocket(pageEnv())
    socket.addEventListener('open', () => {
      dev.sessions += 1
      mux = new PageMux(socket)
      uiChanged()
      const feed = mux.open('$events', {})
      dev.events = { clientId: undefined, items: feed.items }
      dev.eventsStream = feed
      let seen = 0
      const tick = (): void => {
        for (; seen < feed.items.length; seen += 1) onEventsItem(feed.items[seen])
        if (!feed.done) setTimeout(tick, 40)
      }
      tick()
      for (const id of followed) openFollow(id)
      void loadRoster().catch((e) => log(`[shim] roster failed: ${String(e)}`))
    })
    socket.addEventListener('close', () => {
      for (const stream of followStreams.values()) stream.done = true
      followStreams.clear()
      mux = undefined
      uiChanged()
      setTimeout(bootSession, 300) // 断链重开：follow 全部重挂，快照重建（未决审批由 gateway 补发，C §4）
    })
  }

  // ---- coordinator deps（13 RPC 实底） ----
  const deps: CoordinatorDeps = {
    listAgents: () => order.map(recordOf),
    openAgentTail: (id) => {
      followed.add(id)
      openFollow(id)
      tailed.add(id)
      // #11 游标：上游 pagination 只随 tail 回值安装一次（installInitialPage），而回值必须立刻回——openAgent 早于
      // coordinator ready 发出，ready 会 ++transport 世代、作废迟到的回值（P5-54 实测）。快照未到时回探针游标
      // TAIL_PROBE：滚到顶时由 transcriptWindow 换成 live 窗口首 seq（或判定无更早历史）。
      const view = views.get(id)
      const nextBeforeSeq = view?.loaded !== true ? TAIL_PROBE : view.hasMore && view.firstSeq !== null ? view.firstSeq : null
      return { entries: entriesOf(id), nextBeforeSeq }
    },
    transcriptWindow: async (id, cursor) => {
      // #11 加载更早：cursor = 上游 pagination 持有的游标（首页来自 openAgentTail，之后来自上一页 nextBeforeSeq）。
      // 更早的页不并入 view：上游把分页条目与 live 快照按 id 合并（mergeOlderTranscriptEntries），快照重推不会冲掉它们。
      const view = views.get(id)
      if (cursor === TAIL_PROBE && view !== undefined && view.loaded && (!view.hasMore || view.firstSeq === null)) {
        return { entries: [], threadCounts: {} } // 无 nextBeforeSeq → 上游置 exhausted
      }
      const before = cursor === TAIL_PROBE ? view?.firstSeq ?? undefined : cursor
      const res = await api('session/events', {
        request: {
          address: { kind: 'session', sessionId: id },
          ...(before !== null && before !== undefined ? { beforeSeq: before } : {}),
          maxMessages: HISTORY_PAGE,
        },
      })
      if (!res.ok) throw new Error(res.error?.message ?? 'session/events failed')
      const page = rec(res.value)
      const records = Array.isArray(page.records) ? page.records : []
      const firstEvent = rec(rec(records[0]).event).seq
      const firstSeq = typeof firstEvent === 'number' ? firstEvent : undefined
      return {
        entries: serialize({ items: olderItemsOf(records), hasMore: page.hasMore === true, running: false, streaming: null, agentName: agentName(id) }),
        ...(page.hasMore === true && records.length > 0 && firstSeq !== undefined ? { nextBeforeSeq: firstSeq } : {}),
        threadCounts: {},
      }
    },
    sendPrompt: async (args) => {
      const agentId = typeof args.agentId === 'string' ? args.agentId : ''
      const prompt = typeof args.prompt === 'string' ? args.prompt : ''
      const nonce = typeof args.clientNonce === 'string' ? args.clientNonce : crypto.randomUUID()
      // L-7 R4（f2 身份匹配）：nonce = wire requestId，SDK 把它写进新消息的 source.rpcId，
      // 序列化按 rpcId 绑定到对应消息；发送失败不删（歧义场景下回执仍会到达并按 rpcId 命中，
      // 同文本旧消息不可能误拿 nonce）。
      if (typeof args.clientNonce === 'string') pendingNonce.set(agentId, args.clientNonce)
      const res = await api('session/prompt', { request: { requestId: nonce, sessionId: agentId, mode: 'queue', content: [{ type: 'text', text: prompt }] } })
      if (!res.ok) throw new Error(res.error?.message ?? 'session/prompt failed')
      return { accepted: true }
    },
    resolvePermission: async (input) => {
      answers.push({ eventId: input.requestId, value: input.dshValue })
      const res = await api('$events/result', { clientId: eventsClientId, eventId: input.requestId, outcome: { kind: 'result', value: input.dshValue } })
      if (!res.ok) throw new Error(res.error?.message ?? '$events/result failed')
      const ask = asks.get(input.requestId)
      asks.delete(input.requestId)
      if (ask !== undefined) pushTranscript(ask.agentId)
      push.agents()
    },
    setAgentUnread: (id, value) => { if (value) unread.add(id); else unread.delete(id); push.agents() },
    createAgent: async (args) => {
      // P5-57：覆盖层注册了新建对话框 → 先选 preset / 连接器 / 模型（D10/D11），取消回 null（上游 projectRendererAgent(null) → 不选中）
      if (ui.chooser !== undefined) {
        const chosen = await ui.chooser({})
        return chosen === null ? null : recordOf(chosen)
      }
      const res = await api('session/create', { request: {} })
      if (!res.ok || typeof rec(res.value).sessionId !== 'string') throw new Error(res.error?.message ?? 'session/create failed')
      const sid = rec(res.value).sessionId as string
      const name = rec(args).name
      const titled = typeof name === 'string' && name !== '' && name !== NEW_CHAT
      if (titled) await api('session/rename', { request: { sessionId: sid, title: name as string } })
      summaries = { ...summaries, [sid]: { sessionId: sid, title: titled ? (name as string) : null, preset: null, running: false, updatedAt: Date.now() } }
      order = [...order, sid]
      followed.add(sid)
      openFollow(sid)
      push.agents()
      return recordOf(sid)
    },
    updateAgent: async (args) => {
      const id = typeof args.id === 'string' ? args.id : ''
      const name = rec(args.profile).name
      if (typeof name === 'string' && name !== '') {
        const res = await api('session/rename', { request: { sessionId: id, title: name } })
        if (!res.ok) throw new Error(res.error?.message ?? 'session/rename failed')
        const prev = summaries[id]
        if (prev !== undefined) summaries = { ...summaries, [id]: { ...prev, title: name } }
        push.agents()
      }
      return recordOf(id)
    },
  }

  const ui: PbotsUi = {
    version: () => uiVersion,
    subscribe(listener) { uiListeners.add(listener); return () => { uiListeners.delete(listener) } },
    online: () => mux !== undefined,
    config: configOf,
    api,
    async createBot(req) {
      const res = req.connectors.length > 0
        ? await api('p2temp/session.createWithConnectors', { request: { connectors: req.connectors, agentPreset: req.preset } })
        : await api('session/create', { request: { agentPreset: req.preset } })
      const sid = rec(res.value).sessionId
      if (!res.ok || typeof sid !== 'string') return { ok: false, message: res.error?.message ?? 'unknown error' } // D7：不入列表
      let notice: string | null = null
      if (req.model !== undefined) {
        const sel = await ui.selectModel(sid, req.model.provider, req.model.model)
        if (!sel.ok) notice = `Bot created, but the model wasn't changed: ${sel.error?.message ?? ''}`
      }
      // L-7 O4：非致命失败不能静默吞掉——落进空会话的 transcript notice（旧 renderer
      // 的 addCreated(sid, presetId, notice) 同一可见性，新架构的呈现位置是会话内）。
      if (notice !== null) createNotices.set(sid, notice)
      // #4 的 recipe 由 main 写入：重拉 M3，否则新 bot 被误判只读
      if (req.connectors.length > 0) {
        const meta = await metaApi('get')
        if (meta.ok) recipes = rec(rec(meta.value).recipes) as unknown as Record<string, Recipe>
      }
      // 本地 preset 先记 p2temp 前缀未知：#4 的实际 preset id 由 follow header 给，#3 就是所选
      summaries = { ...summaries, [sid]: { sessionId: sid, title: null, preset: req.connectors.length > 0 ? null : req.preset, running: false, updatedAt: Date.now() } }
      order = [...order.filter((id) => id !== sid), sid]
      followed.add(sid)
      openFollow(sid)
      push.agents()
      return { ok: true, sessionId: sid, notice }
    },
    async setMain(id) {
      const res = await metaApi({ op: 'patch', mainBotId: id })
      if (res.ok) {
        mainBotId = id
        order = [id, ...order.filter((x) => x !== id)]
        push.agents()
      }
      return res
    },
    async selectModel(id, provider, model) {
      const res = await api('session/selectModel', { request: { sessionId: id, provider, model } })
      if (res.ok) { models.set(id, `${provider}/${model}`); push.agents() }
      return res
    },
    cancel: (id) => api('session/cancel', { request: { sessionId: id } }),
    focus: (id) => opts.focus?.(id),
  }

  const devSurface: DevSurface = {
    get events() { return dev.events },
    get clientIds() { return dev.clientIds },
    get sessions() { return dev.sessions },
    get sockets() { return dev.sockets },
    get bots() { return [...views.values()] },
    get state() { return { order: [...order], meta: { mainBotId }, views: Object.fromEntries(views) } },
    newSocket: () => newDevSocket((h) => { dev.sockets.push(h) }),
    openStream(endpoint, args) {
      if (mux === undefined) throw new Error('boot mux not open yet')
      return mux.open(endpoint, args)
    },
    muxStreams: () => [...(mux?.streams.values() ?? [])].map((s) => ({ streamId: s.streamId, endpoint: s.endpoint })),
    closeEvents() {
      if (dev.eventsStream !== undefined && mux !== undefined) { mux.cancel(dev.eventsStream); dev.eventsStream = undefined }
    },
    failNext(method, code = 'pbots/test-fault', message = 'injected by E2E') { injected.set(method, { code, message }) },
  }

  return {
    deps,
    answers,
    dev: devSurface,
    ui,
    debugItems: (agentId) => [...(views.get(agentId)?.items ?? [])],
    wire(target) { push.agents = () => { target.agents(); uiChanged() }; push.transcript = target.transcript },
    agentsPayload: () => order.map(recordOf),
    transcriptPayload: (agentId) => ({ type: 'snapshot', activeAgentId: agentId, entries: entriesOf(agentId) }),
    start() {
      if (booted) return
      booted = true
      bootSession()
      void loadRoster().catch(async (e) => {
        // main 的 restore 闸门期 M1 返回 pbots/restore-pending：轮询到成功（bootSession open 后亦会重拉）
        log(`[shim] first roster failed: ${String(e)}`)
        for (let i = 0; i < 120; i += 1) {
          await sleep(500)
          try { await loadRoster(); return } catch { /* 重试 */ }
        }
        opts.boot?.('failed')
      })
    },
  }
}
