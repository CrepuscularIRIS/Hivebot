// 产品 store（U-21/PAB，PAB-final R0：自写数据层，三桥接口不变）：
// - 一条 CarrierSocket（= 一个 MessagePort）上跑 $events + 所有 session/follow 流；断链 300ms 重开，follow 全部重挂。
// - bot 列表 = #9 session/list（wire 壳 {_request:{}}）+ M3 bots-meta；主 bot 缺失/失效 → #3 建默认 → #20 patch（C §5）。
// - 运行态/活跃度来自 $events emit `api-session/status|activity`（覆盖未打开的 bot）；审批卡只来自 waterfall。
// - 侧栏顺序首载定序后冻结（R9）；唯一例外是设主 bot 后置顶（PDC-final D9）。草稿按 bot 隔离（R21）。
// - U-23：页（chat / market）、建 bot 对话框预填（D15）、#5 改模型、#20 设主 bot、建后重拉 #19。
// E2E 观测面 window.__pbotsDev（m2-port / m2-deadline spec 依赖），只读旁路，不开新 IPC。
import { useSyncExternalStore } from 'react'
import { CarrierSocket, pageEnv } from '../carrier'
import { newDevSocket, PageMux, type DevSocketHandle, type MuxStream } from '../carrier/mux'
import { firstSeqOf, initView, olderItemsOf, reduceFollow, type SessionView } from '../plugins/session/reduce'

export interface Summary { sessionId: string; title: string | null; preset: string | null; running: boolean; updatedAt: number }
export interface Approval {
  eventId: string; agentId: string; toolName: string; callId: string | null; reason: string | null
  phase: 'idle' | 'submitting' | 'submitted' | 'error'; value: 'allowed-once' | 'rejected' | null; error: string | null
}
export interface Recipe { agentPreset: string; connectors: string[]; live: boolean }
export interface Meta { mainBotId: string | null; recipes: Record<string, Recipe> }
export interface ApiResult { ok: boolean; value?: unknown; error?: { code: string; message: string } }
/** 建 bot 对话框预填（PDC-final D13–D15）：null = 关闭；字段缺省 = 不预填。 */
export interface DialogInit { title?: string; note?: string; preset?: string; connectors?: string[]; model?: string }

export interface State {
  boot: 'starting' | 'ready' | 'failed'
  bootError: string | null
  online: boolean
  order: string[]
  summaries: Record<string, Summary>
  meta: Meta
  views: Record<string, SessionView>
  approvals: Approval[]
  unread: Record<string, true>
  selected: string | null
  drafts: Record<string, string>
  flash: string | null
  notice: string | null
  page: 'chat' | 'market'
  dialog: DialogInit | null
  /** #5 成功后的模型（`provider/model`），优先于 follow 快照投影。 */
  models: Record<string, string>
}

/** 冷启动等待上限（R15：超时换「引擎没有响应  重试 →」）。 */
export const BOOT_TIMEOUT_MS = 60_000
/** follow 快照窗口 + #11 每页条数（U-26 ③：窗口外更早历史走「加载更早」分页）。 */
export const HISTORY_PAGE = 40

let state: State = {
  boot: 'starting', bootError: null, online: false, order: [], summaries: {}, meta: { mainBotId: null, recipes: {} },
  views: {}, approvals: [], unread: {}, selected: null, drafts: {}, flash: null, notice: null,
  page: 'chat', dialog: null, models: {},
}
const listeners = new Set<() => void>()
const set = (patch: Partial<State>): void => { state = { ...state, ...patch }; for (const l of [...listeners]) l() }
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getState = (): State => state
export const useStore = (): State => useSyncExternalStore(subscribe, getState)

/** E2E 故障注入（__pbotsDev.failNext，与 closeEvents 同类测试钩子）：方法 → 下一次调用返回的错误，一次性。 */
const injected = new Map<string, { code: string; message: string }>()
/** E2E 时序注入（__pbotsDev.slowNext，O2 竞态复现）：方法 → 下一次调用延迟的 ms，一次性。 */
const delayed = new Map<string, number>()

export function api(method: string, args?: unknown): Promise<ApiResult> {
  const fault = injected.get(method)
  if (fault !== undefined) { injected.delete(method); return Promise.resolve({ ok: false, error: fault }) }
  const slowMs = delayed.get(method)
  if (slowMs !== undefined) {
    // O2 E2E 注入：下一次调用延迟 ms 后放行（复现「关闭后重开、旧轮次响应迟到」竞态），一次性。
    delayed.delete(method)
    return sleep(slowMs).then(() => api(method, args))
  }
  if (window.pbots === undefined) return Promise.resolve({ ok: false, error: { code: 'pbots/unavailable', message: 'preload bridge missing' } })
  // U-22 [GU-1] renderer 层兜底：main 侧 handler 抛错时 ipcRenderer.invoke 会 reject
  // （main 层 try/catch 之外的最后一道），断线期间 sendPrompt/cancelTurn/对话框提交不得裸抛。
  return window.pbots.api(method, args).catch((error: unknown): ApiResult => ({
    ok: false,
    error: { code: 'pbots/unavailable', message: `bridge call failed: ${error instanceof Error ? error.message : String(error)}` },
  }))
}

/** M3 调用统一入口。R7（REVIEW-P4终审）：botsMeta 也是裸 ipcRenderer.invoke，main 侧 m3.handler
 * 抛错时同样 reject —— loadRoster/start/setMainBot/refreshMeta 不得裸抛（boot 卡 starting、
 * busy 永不复位），与 U-22 [GU-1] 的 api() 同模式兜成结构化 !ok。 */
export function metaApi(op: 'get' | { op: 'patch'; mainBotId: string }): Promise<ApiResult> {
  if (window.pbots === undefined) return Promise.resolve(NO_BRIDGE)
  return window.pbots.botsMeta(op).catch((error: unknown): ApiResult => ({
    ok: false,
    error: { code: 'pbots/unavailable', message: `bridge call failed: ${error instanceof Error ? error.message : String(error)}` },
  }))
}

type AnyRecord = Record<string, unknown>
const rec = (v: unknown): AnyRecord => (typeof v === 'object' && v !== null ? v as AnyRecord : {})
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---- carrier：$events + follow 共用一条 mux ----
const dev = {
  events: { clientId: undefined as string | undefined, items: [] as unknown[] },
  clientIds: [] as string[], sessions: 0, sockets: [] as DevSocketHandle[],
  /** boot 的 $events 流（D4 E2E 注入：closeEvents 模拟 renderer 离场）。 */
  eventsStream: undefined as MuxStream | undefined,
}
let mux: PageMux | undefined
const followed = new Set<string>()

/** 轮询 stream.items（只增不改）：每到新 item 交给 onItem，流结束停。 */
function pump(stream: MuxStream, onItem: (item: unknown) => void): void {
  let seen = 0
  const tick = (): void => {
    if (seen < stream.items.length) {
      for (; seen < stream.items.length; seen += 1) onItem(stream.items[seen])
    }
    if (!stream.done) setTimeout(tick, 40)
  }
  tick()
}

function openFollow(sessionId: string): void {
  if (mux === undefined) return // 开 socket 后统一重挂
  const stream = mux.open('session/follow', { request: { address: { kind: 'session', sessionId }, assistantStream: true, maxMessages: HISTORY_PAGE } })
  pump(stream, (item) => {
    const view = reduceFollow(state.views[sessionId] ?? initView(sessionId), item)
    const settled = (a: Approval): boolean => a.agentId === sessionId && a.callId !== null
      && view.items.some((i) => i.kind === 'tool' && i.callId === a.callId && (i.decision !== null || i.status !== 'running'))
    set({ views: { ...state.views, [sessionId]: view }, approvals: state.approvals.filter((a) => !settled(a)) })
  })
}

function onEventsItem(item: unknown): void {
  const it = rec(item)
  if (it.type === 'ready' && typeof it.clientId === 'string') {
    dev.events.clientId = it.clientId
    if (dev.clientIds[dev.clientIds.length - 1] !== it.clientId) dev.clientIds.push(it.clientId)
    set({ online: true })
    return
  }
  if (it.type === 'waterfall' && it.event === 'approval/request' && typeof it.eventId === 'string') {
    const req = rec(it.request)
    const approval: Approval = {
      eventId: it.eventId, agentId: String(it.agentId ?? ''), toolName: String(req.toolName ?? 'tool'),
      callId: typeof req.callId === 'string' ? req.callId : null,
      reason: typeof req.displayReason === 'string' ? req.displayReason : typeof req.reason === 'string' ? req.reason : null,
      phase: 'idle', value: null, error: null,
    }
    set({ approvals: [...state.approvals.filter((a) => a.eventId !== approval.eventId), approval] })
    return
  }
  if (it.type === 'cancel' && typeof it.eventId === 'string') {
    set({ approvals: state.approvals.filter((a) => a.eventId !== it.eventId) })
    return
  }
  if (it.type === 'emit' && Array.isArray(it.args)) {
    const [sid, value] = it.args as [unknown, unknown]
    const prev = typeof sid === 'string' ? state.summaries[sid] : undefined
    if (prev === undefined) return
    if (it.event === 'api-session/status' && typeof value === 'boolean') {
      const finished = prev.running && !value && sid !== state.selected
      set({
        summaries: { ...state.summaries, [prev.sessionId]: { ...prev, running: value } },
        unread: finished ? { ...state.unread, [prev.sessionId]: true } : state.unread,
      })
    }
    if (it.event === 'api-session/activity' && typeof value === 'number') {
      set({ summaries: { ...state.summaries, [prev.sessionId]: { ...prev, updatedAt: value } } })
    }
  }
}

/** [GU-4] 重连后重拉 roster：只 merge 已在 order 中的行（R9 顺序冻结），running 回落置未读。 */
async function refreshRoster(): Promise<void> {
  const roster = await loadRoster()
  if (typeof roster === 'string') return // 重连间隙拉不到：下次 open 再试（300ms 链路）
  const summaries = { ...state.summaries }
  const unread = { ...state.unread }
  for (const item of roster.items) {
    const prev = summaries[item.sessionId]
    if (prev === undefined) continue // 未在列表中的新 session 不自动加入（新建走对话框）
    if (prev.running && !item.running && item.sessionId !== state.selected) unread[item.sessionId] = true
    summaries[item.sessionId] = item
  }
  set({ summaries, unread })
}

function bootSession(): void {
  const socket = new CarrierSocket(pageEnv())
  socket.addEventListener('open', () => {
    dev.sessions += 1
    mux = new PageMux(socket)
    const feed = mux.open('$events', {})
    dev.events = { clientId: undefined, items: feed.items }
    dev.eventsStream = feed
    pump(feed, onEventsItem)
    for (const sid of followed) openFollow(sid)
    void refreshRoster() // [GU-4] 每代 socket 重开都重拉：断线期间结束的回合不再恒显「回复中」
  })
  socket.addEventListener('close', () => {
    for (const stream of [...(mux?.streams.values() ?? [])]) stream.done = true
    mux = undefined
    set({ online: false, approvals: [] }) // 未决审批在重连 ready 后由 gateway 补发（C §4）
    setTimeout(bootSession, 300)
  })
}

// ---- roster ----
function summaryOf(item: AnyRecord): Summary {
  const values = rec(rec(item.projections).values)
  return {
    sessionId: String(item.sessionId),
    title: typeof values.title === 'string' && values.title !== '' ? values.title : null,
    preset: typeof values.agentPreset === 'string' ? values.agentPreset : null,
    running: item.running === true,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
  }
}

const NO_BRIDGE: ApiResult = { ok: false, error: { code: 'pbots/unavailable', message: 'preload bridge missing' } }
const metaOf = (value: unknown): Meta => {
  const m = rec(value)
  return { mainBotId: typeof m.mainBotId === 'string' ? m.mainBotId : null, recipes: rec(m.recipes) as unknown as Record<string, Recipe> }
}

async function loadRoster(): Promise<{ items: Summary[]; meta: Meta } | string> {
  const [list, meta] = await Promise.all([
    api('session/list', { _request: {} }),
    metaApi('get'),
  ])
  if (!list.ok) return `session/list: ${list.error?.message ?? ''}`
  if (!meta.ok) return `bots-meta: ${meta.error?.message ?? ''}`
  const items = (rec(list.value).items as unknown[] | undefined ?? []).map(rec)
    .filter((i) => typeof i.sessionId === 'string' && i.origin !== 'subagent' && i.parentSessionId === undefined)
    .map(summaryOf)
  return { items, meta: metaOf(meta.value) }
}

/** #19 重拉：#4 建出的连接器 bot 的 recipe 由 main 写入，renderer 须重拉才认得（否则误判只读）。 */
export async function refreshMeta(): Promise<void> {
  const res = await metaApi('get')
  if (res.ok) set({ meta: metaOf(res.value) })
}

async function start(): Promise<void> {
  set({ boot: 'starting', bootError: null })
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  let roster = await loadRoster()
  while (typeof roster === 'string') {
    if (Date.now() > deadline) { set({ boot: 'failed', bootError: roster }); return }
    await sleep(500)
    roster = await loadRoster()
  }
  const summaries: Record<string, Summary> = Object.fromEntries(roster.items.map((s) => [s.sessionId, s]))
  let mainBotId = roster.meta.mainBotId
  if (mainBotId === null || summaries[mainBotId] === undefined) {
    // C §5 默认②：主 bot 缺失或指向已不存在的 session → #3 建默认 preset bot → #20 patch
    const created = await api('session/create', { request: {} })
    const sid = rec(created.value).sessionId
    if (!created.ok || typeof sid !== 'string') { set({ boot: 'failed', bootError: `创建主 Bot 失败：${created.error?.message ?? ''}` }); return }
    const patched = await metaApi({ op: 'patch', mainBotId: sid })
    if (!patched.ok) { set({ boot: 'failed', bootError: `设置主 Bot 失败：${patched.error?.message ?? ''}` }); return }
    mainBotId = sid
    summaries[sid] = { sessionId: sid, title: null, preset: null, running: false, updatedAt: Date.now() }
  }
  const rest = Object.values(summaries).filter((s) => s.sessionId !== mainBotId).sort((a, b) => b.updatedAt - a.updatedAt)
  set({ summaries, order: [mainBotId, ...rest.map((s) => s.sessionId)], meta: { ...roster.meta, mainBotId } })
  select(mainBotId)
  set({ boot: 'ready' })
}

// ---- actions ----
export function select(sessionId: string): void {
  if (!followed.has(sessionId)) { followed.add(sessionId); openFollow(sessionId) }
  const { [sessionId]: _cleared, ...unread } = state.unread
  set({ selected: sessionId, unread, notice: null, page: 'chat' })
}

export function openMarket(): void { set({ page: 'market' }) }
export function closeMarket(): void { set({ page: 'chat' }) }
export function openNewBot(init: DialogInit = {}): void { set({ dialog: init }) }
export function closeNewBot(): void { set({ dialog: null }) }

/** #5（PDC-final D8）：只对本 bot、下一轮生效；失败由调用方回滚显示。value = `provider/model`。 */
export async function changeModel(sessionId: string, provider: string, model: string): Promise<ApiResult> {
  const res = await api('session/selectModel', { request: { sessionId, provider, model } })
  if (res.ok) set({ models: { ...state.models, [sessionId]: `${provider}/${model}` } })
  return res
}

/** #20（D9）：成功才更新 mainBotId 并置顶——R9 冻结顺序的唯一例外。 */
export async function setMainBot(sessionId: string): Promise<ApiResult> {
  const res = await metaApi({ op: 'patch', mainBotId: sessionId })
  if (res.ok) {
    set({
      meta: { ...state.meta, mainBotId: sessionId },
      order: [sessionId, ...state.order.filter((id) => id !== sessionId)],
    })
  }
  return res
}

/** 新建 bot 插在主 bot 之下第一位（R9），并选中。 */
export function addCreated(sessionId: string, preset: string, notice: string | null): void {
  const [main, ...rest] = state.order
  set({
    summaries: { ...state.summaries, [sessionId]: { sessionId, title: null, preset, running: false, updatedAt: Date.now() } },
    order: main === undefined ? [sessionId] : [main, sessionId, ...rest.filter((id) => id !== sessionId)],
    flash: sessionId,
  })
  select(sessionId)
  if (notice !== null) set({ notice })
  setTimeout(() => { if (state.flash === sessionId) set({ flash: null }) }, 600)
}

export function setDraft(sessionId: string, text: string): void {
  set({ drafts: { ...state.drafts, [sessionId]: text } })
}

/**
 * #11「加载更早」（U-26 ③）：session/events 取快照窗口之外的更早一页，prepend 到时间线。
 * 失败只重试该页（beforeSeq 游标不变，席 C PAB-proposal-C:104）；空页视为取尽（防重复拉）。
 */
export async function loadOlder(sessionId: string): Promise<void> {
  const view = state.views[sessionId]
  if (view === undefined || !view.hasMore || view.older.phase === 'loading') return
  const gen = view.gen // O1：本页发起时的快照代号（beforeSeq 对准的是这个窗口）
  set({ views: { ...state.views, [sessionId]: { ...view, older: { phase: 'loading' } } } })
  const res = await api('session/events', {
    request: {
      address: { kind: 'session', sessionId },
      ...(view.firstSeq !== null ? { beforeSeq: view.firstSeq } : {}),
      maxMessages: HISTORY_PAGE,
    },
  })
  const cur = state.views[sessionId]
  if (cur === undefined || cur.gen !== gen) return
  // O1（REVIEW-P4终审）：响应迟到期间快照已换代（断链重连重建窗口）——旧页对着旧窗口的
  // firstSeq，拼进新窗口会跳段 + 游标回退（缺口不可补），直接丢弃（新快照已把 older 重置 idle）。
  if (!res.ok) {
    set({ views: { ...state.views, [sessionId]: { ...cur, older: { phase: 'error' } } } })
    return
  }
  const page = rec(res.value)
  const records = Array.isArray(page.records) ? page.records : []
  const seq = firstSeqOf(records)
  set({
    views: {
      ...state.views,
      [sessionId]: {
        ...cur,
        // 无 seq 可作下一页游标，或服务端报取尽 / 空页 → 按钮消失
        hasMore: page.hasMore === true && records.length > 0 && seq !== null,
        firstSeq: seq ?? cur.firstSeq,
        items: [...olderItemsOf(records), ...cur.items],
        older: { phase: 'idle' },
      },
    },
  })
}

export function sendPrompt(sessionId: string, text: string): Promise<ApiResult> {
  return api('session/prompt', {
    request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }] },
  })
}

export function cancelTurn(sessionId: string): Promise<ApiResult> {
  return api('session/cancel', { request: { sessionId } })
}

const patchApproval = (eventId: string, patch: Partial<Approval>): void =>
  set({ approvals: state.approvals.map((a) => (a.eventId === eventId ? { ...a, ...patch } : a)) })

/** 作答只发 allowed-once / rejected（C §4 不变式；main 校验 clientId/eventId，§2.2）。 */
export async function answer(eventId: string, value: 'allowed-once' | 'rejected'): Promise<void> {
  const a = state.approvals.find((x) => x.eventId === eventId)
  if (a === undefined || a.phase === 'submitting' || a.phase === 'submitted' || !state.online) return
  patchApproval(eventId, { phase: 'submitting', value, error: null })
  let res: ApiResult
  try {
    res = await api('$events/result', { clientId: dev.events.clientId, eventId, outcome: { kind: 'result', value } })
  } catch {
    patchApproval(eventId, { phase: 'error', error: '提交结果未知，等待同步' }) // 席 C：不确定时不诱导盲重答
    return
  }
  if (!res.ok) { patchApproval(eventId, { phase: 'error', value: null, error: res.error?.message ?? '提交失败' }); return }
  if (a.callId === null) set({ approvals: state.approvals.filter((x) => x.eventId !== eventId) })
  else patchApproval(eventId, { phase: 'submitted' })
}

export function retryBoot(): void { void start() }

/** 启动：E2E 观测面 + boot socket + roster。 */
export function startStore(): void {
  ;(window as unknown as Record<string, unknown>).__pbotsDev = {
    get events() { return dev.events },
    get clientIds() { return dev.clientIds },
    get sessions() { return dev.sessions },
    get sockets() { return dev.sockets },
    get bots() { return Object.values(state.views) },
    get state() { return state },
    newSocket(): DevSocketHandle { return newDevSocket((h) => { dev.sockets.push(h) }) },
    openStream(endpoint: string, args?: unknown): MuxStream {
      if (mux === undefined) throw new Error('boot mux not open yet')
      return mux.open(endpoint, args)
    },
    /** D2：boot mux 当前流快照（streamId ↔ endpoint 对应，供 main tap 计数按流断言）。 */
    muxStreams(): Array<{ streamId: string; endpoint: string }> {
      return [...(mux?.streams.values() ?? [])].map((s) => ({ streamId: s.streamId, endpoint: s.endpoint }))
    },
    /** D4 E2E 注入：关掉 boot $events 流（模拟 renderer 离场；main 侧 eventsStreams 清空 →
     * 无人应答窗口开始累计）。与 m2 的 testDropSocket 同模式的测试钩子。 */
    /** U-23 E2E 注入：让 renderer 下一次调用 method 直接返回该错误（验证回滚 / 失败分类 UI）。 */
    failNext(method: string, code = 'pbots/test-fault', message = 'injected by E2E'): void { injected.set(method, { code, message }) },
    /** U-29 O2 E2E 注入：让 renderer 下一次调用 method 延迟 ms 后放行（复现旧轮次响应迟到竞态）。 */
    slowNext(method: string, ms: number): void { delayed.set(method, ms) },
    closeEvents(): void {
      if (dev.eventsStream !== undefined && mux !== undefined) { mux.cancel(dev.eventsStream); dev.eventsStream = undefined }
    },
  }
  bootSession()
  void start()
}
