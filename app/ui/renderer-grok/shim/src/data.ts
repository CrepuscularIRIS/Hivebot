// P5-51 · 数据层：现有 M1/M2/M3 carrier（app/ui/renderer/carrier + window.pbots）⇄ coordinator 事件流。
// 复用旧 renderer 的构件（PLAN：P6-01 foldTurns + reduce 直 import，不改）：
// - roster：api session/list + M3 bots-meta；主 bot 缺失 → session/create → patch（旧 store.start 同流程）
// - 会话：mux session/follow → reduceFollow → SessionView；序列化经 serialize（foldTurns 在内）
// - 审批：$events waterfall approval/request → local-tool-permission 卡 entry（含 permissionScope/
//   Revision，P5-50 坑2 的渲染硬条件）；作答走 api $events/result，值域 ⊆ {allowed-once, rejected}
// - 推送：roster 变化 → agents 事件；view 变化 → transcript snapshot 事件（S0 坑1 口径）
// - P6-15 worker 分组：createdBy = M3 bots[id]（CONTRACT v1.5 §3.1）；worker 全部常驻 follow（状态 / 结果预览）；
//   合成 section 推导（workers.ts）+ 成员变化时推 host-settings{fields:['sidebarSections']}（上游只认这个事件重拉）；
//   $events 出现未知 sid 的 status → 重拉 roster（main 建出的新 worker，D11①不重载即出现）
// ponytail: snapshot 全量推（每事件一次 JSON 序列化），流式高频场景的增量 diff 留 P5-54 优化。
// ponytail: worker 全部常驻 follow（每个一条 mux 流），worker 上限由容量控制（≤ 数十）；多了改成只 follow 未读 / 运行中的。
import { CarrierSocket, pageEnv } from '../../../renderer/carrier'
import { newDevSocket, PageMux, type DevSocketHandle, type MuxStream } from '../../../renderer/carrier/mux'
import { initView, olderItemsOf, reduceFollow, type SessionView } from '../../../renderer/session/reduce'
import { avatarOf, saveAvatar } from './avatars'
import { askText, isKickstartEntry, isKickstartTitle, kickstartPrompt, serialize, permissionEntry, type RawEntry } from './entries'
import { readCeiling, writeCeiling, listCeilings, removeCeiling } from './tool-ceiling'
import { createDraftSend } from './draft-send'
import { routeMainBotPrompt } from '../../frontend/src/recovered/features/conversation/workspace/superagent-router'

// A9：sendPrompt args.richText（tiptap doc JSON 串）里的 workflowReference 节点 → 标记行。
// 只取 id/label（iconId/iconUrl 渲染层可缺省）；解析失败静默回空（发送不因富文本损坏失败）。
function extractSkillRefMarks(richText: unknown): string {
  if (typeof richText !== 'string' || richText.length === 0) return ''
  let doc: unknown
  try { doc = JSON.parse(richText) } catch { return '' }
  const out: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node == null) return
    const n = node as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] }
    if (n.type === 'workflowReference') {
      const id = typeof n.attrs?.id === 'string' ? n.attrs.id : ''
      const label = typeof n.attrs?.label === 'string' ? n.attrs.label : ''
      if (id !== '' || label !== '') out.push(`\u2063[skill:${encodeURIComponent(id)}@${encodeURIComponent(label)}]\u2063`)
      return
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)
  return out.join('\n')
}
import { toOutlineItems } from './outline'
import { activityOf, toAgentRecord } from './agents'
import type { CoordinatorDeps } from './coordinator'

// T73c：连接器卡的 always 标记（卡侧 remember 成功后 noteConnectorAlways(eventId)；
// resolvePermission 时据此把回显区分为 always / allow-once）。内存态，不落盘。
const connectorAlways = new Set<string>()
export function noteConnectorAlways(eventId: string): void { connectorAlways.add(eventId) }

/** T73c：serverName（带 -hash8 尾）→ picks 显示名；查不到回 serverName。
 *  hash 不可逆且 renderer 无 node:crypto——用结构匹配：剥 -[0-9a-f]{8}$ 尾后对
 *  picks 包名末段/包含比对（picks 是上架集合的同步子集；第三方装的回 serverName）。 */
/** picks 上架表（market-picks 仅 type 依赖 market-store——无模块环，静态安全）。 */
import { PICKS as CONNECTOR_PICKS } from '../../overrides/modules/market-picks'
const connectorPicks = (): Array<{ name: string; title: string }> => CONNECTOR_PICKS as unknown as Array<{ name: string; title: string }>

export function connectorDisplayNameOf(serverName: string, picks: Array<{ name: string; title: string }>): string {
  const stem = serverName.replace(/-[0-9a-f]{8}$/, '')
  for (const p of picks) {
    const tail = p.name.split('/').pop() ?? p.name
    if (tail === stem || p.name.includes(stem)) return p.title
  }
  return serverName
}
import { botConfigOf, type PbotsUi, type Recipe } from './bots'
import { aggregateOf, previewOf, rankOf, sectionsOf, viewFacts, type PeerMeta, type SectionRecord, type WorkerFacts } from './workers'
import { toWidget, toAnswer, batchComplete, type WidgetQ } from './questions' // T40
import { petStateOf, type PetState } from './pet' // T45a

type AnyRecord = Record<string, unknown>
const rec = (v: unknown): AnyRecord => (typeof v === 'object' && v !== null ? v as AnyRecord : {})
/** M3 bots[id].createdBy（CONTRACT v1.5 §3.1，可选键；坏值丢弃）。 */
export const createdByOf = (meta: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(rec(rec(meta).bots)).flatMap(([id, v]) => {
    const by = rec(v).createdBy
    return typeof by === 'string' && by !== '' && by !== id ? [[id, by]] : []
  }))
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** GU-P6-15-r1 ②：ask 是否仍算该 worker 待决。eventId 优先两路对身份（$events 一路按 asks 键、
 * approval/asked 一路按 view.asked → 工具行 awaiting）；两路都对不上 → 中性 false（Answered），
 * 不回落「该 worker 当前是否有别的未决」——旧 ask 不借新 ask 重新亮 Needs you。eventId=null 才是「有无未决」语义。 */
export function askPendingOf(
  workerId: string,
  eventId: string | null,
  asks: ReadonlyMap<string, { agentId: string; outcome?: string }>, // T73c 四审：类型补 outcome（过滤读取三处——TS2339）
  view?: SessionView,
): boolean {
  if (eventId !== null) {
    const byEvent = asks.get(eventId)
    if (byEvent !== undefined) return byEvent.agentId === workerId && byEvent.outcome === undefined // T73c 三审②：终态/在途不算待答
    const callId = view?.asked[eventId]
    if (callId !== undefined) return view!.items.some((i) => i.kind === 'tool' && i.callId === callId && i.awaiting && i.decision === null)
    return false
  }
  let mine = false
  for (const a of asks.values()) if (a.agentId === workerId && a.outcome === undefined) mine = true // T73c 三审②
  return mine
}

interface ApiResult { ok: boolean; value?: unknown; error?: { code: string; message: string } }
interface Summary { sessionId: string; title: string | null; preset: string | null; running: boolean; updatedAt: number }
interface Ask { agentId: string; callId: string | null; toolName: string; reason: string | null; at: number
  /** T73c：连接器卡终态回显（bash/文件卡仍答完即删、无此字段）。answering =
   * 作答 RPC 在途（审①竞态：follow 的 approval/decided 可能先于 $events/result 返回到
   * ——在途与终态同样不是「等待中」，删除/待答判定一律排除）。
   */
  outcome?: 'always' | 'allow-once' | 'skipped' | 'answering' }

// B19: 0.78.1 n$n=200 翻页对齐（原 40 是 dsh session/events 小页；dsh 侧 maxMessages 上限以内）
const HISTORY_PAGE = 200
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
  wire(push: { agents(): void; transcript(agentId: string): void; sections?(): void; transport?(state: 'down' | 'connected'): void }): void
  /** P6-15：desktop.agent.getSidebarSections 的实底（无 worker → null）。 */
  sections(): SectionRecord[] | null
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
  readonly state: { order: string[]; meta: { mainBotId: string | null; createdBy: Record<string, string> }; views: Record<string, SessionView> }
  /** T36：侧栏 sections 快照（Workers/Done 分组——测试断言面；sectionsOf 的派生结果）。 */
  readonly sections: SectionRecord[] | null
  /** T26：重载 roster（onboarding 完成/skip 后——首启未建 main，seen 落盘后此调用补建）。 */
  reloadRoster(): Promise<void>
  /** T26b：发 onboarding 延后的 kickstart 介绍（生产调用——onboarding-view 的 finish 链，非仅测试）。 */
  finishKickstart(sid?: string): Promise<void>
  newSocket(): DevSocketHandle
  openStream(endpoint: string, args?: unknown): MuxStream
  muxStreams(): Array<{ streamId: string; endpoint: string }>
  /** D4 注入：关掉 boot $events 流（模拟 renderer 离场）。 */
  closeEvents(): void
  /** 故障注入：下一次 method 调用直接返回该错误（一次性）。 */
  failNext(method: string, code?: string, message?: string): void
  /** B39-A 测试口：模拟 carrier 断链（触发 socket close → transport down 推送）。 */
  dropCarrier(): void
  /** T40 测试口：直灌一条 $events 帧给 onEventsItem（生产走 socket feed；单测环境无 carrier）。 */
  testFeedEvent(item: unknown): void
  /** T40c 测试口：直灌一条 follow 帧给 onFollowItem（生产走 session/follow 流；单测无 mux）。 */
  testFollowItem(agentId: string, item: unknown): void
  /** B17b 调试口：真实 feed 输出（entriesOf = serialize 后条目），e2e 排查 url 注入。 */
  debugEntries(agentId: string): RawEntry[]
  /** B2.1 测试口：草稿发送失败状态机（生产走 coordinator sendDraft/discardDraft）。 */
  sendDraft(agentId: string, text: string, opts?: { inFlightUntilMs?: number }): Promise<{ ok: boolean; nonce?: string; error?: string }>
  discardDraft(agentId: string): void
  retryDraft(agentId: string): Promise<{ ok: boolean; error?: string }>
  draftSendState(agentId: string): import('./draft-send').DraftSendState | undefined
}

export function createShimData(opts: ShimDataOptions): ShimData {
  const log = opts.log ?? (() => {})
  const push: { agents(): void; transcript(agentId: string): void; outline?(agentId: string): void; transport?(state: 'down' | 'connected'): void } = { agents: () => {}, transcript: () => {} }

  let order: string[] = []
  let summaries: Record<string, Summary> = {}
  let mainBotId: string | null = null
  let recipes: Record<string, Recipe> = {}
  let createdBy: Record<string, string> = {} // workerId → creatorId（M3 bots[id].createdBy）
  let helpersOfMain: Record<string, string> = {} // T36：主 bot 的 subagent helperId → parentId（session/list 顶层 origin/parentSessionId）
  let active: string | null = null // chat-header 当前打开的 bot（worker 打开即已读）
  // T41：侧栏隐藏（localStorage pbots.shim.hidden-agents，坏值回 []——UI 偏好丢了不致命，不进 M3）
  const hiddenKey = 'pbots.shim.hidden-agents'
  const readHidden = (): Set<string> => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(hiddenKey) ?? '[]')
      return new Set(Array.isArray(raw) && raw.every((v: unknown) => typeof v === 'string') ? raw : [])
    } catch { return new Set() }
  }
  let hidden = readHidden()
  const writeHidden = (next: Set<string>): void => { try { window.localStorage.setItem(hiddenKey, JSON.stringify([...next])) } catch { /* 私有模式等：静默 */ } }
  // B1.A：已删除集（软删持久——reloadRoster 过滤防复活；上游 DSH 无删除路由前的本地语义）
  const archivedKey = 'pbots.shim.archived-agents'
  const readArchived = (): Set<string> => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(archivedKey) ?? '[]')
      return new Set(Array.isArray(raw) && raw.every((v: unknown) => typeof v === 'string') ? raw : [])
    } catch { return new Set() }
  }
  const archived = readArchived()
  let held: string | null = null // T39：被 hold 的 worker（打开时在 Workers rank<4，或经回报卡 focus 打开）——sections 用它而非 active（点 Done 行不跳组）
  let focusedFrom: string | null = null // T39：最近一次 pbotsUi.focus 的 id（回报卡 Open/Messaging——GU-P6-15-r1 f1 语义）
  const peers = new Map<string, PeerMeta>() // 编排条目 entryId → 元数据（pbotsUi.peer）
  // T40：提问批 eventId → 批状态。answered 结构化（review 中3：dismiss 不再用用户可输入的哨兵串）；
  // entryIndex 提供不拆字符串的 entryId→(批,题) 路由（review 高：qid 含 '-' 时 regex 贪婪拆错）。
  type QAnswer = { kind: 'answer'; value: string } | { kind: 'dismiss' }
  interface QuestionBatch { agentId: string; ids: string[]; widgets: WidgetQ[]; answered: Map<string, QAnswer>; dismissed: boolean; sent: boolean; arrivedMs: number } // T40c：到达时刻一次定（timestampMs 不再每次投影变+按位插序的锚）
  const questionBatches = new Map<string, QuestionBatch>()
  const questionEntryIndex = new Map<string, { eventId: string; qid: string }>()
  const unknownTried = new Set<string>() // 触发过一次 roster 重拉的未知 sid（其他 bot 的 helper 不进 list 消费面，不反复拉）
  const models = new Map<string, string>() // #5 成功后的本地值（快照下一轮才投影）
  const uiListeners = new Set<() => void>()
  let uiVersion = 0
  const uiChanged = (): void => { uiVersion += 1; for (const l of [...uiListeners]) l() }
  const views = new Map<string, SessionView>()
  const unread = new Set<string>()
  const asks = new Map<string, Ask>()
 // eventId → pending 审批
  const pendingNonce = new Map<string, string>() // agentId → 待补记 clientNonce（按消息身份 source.rpcId 绑定，L-7 R4 f2）
  // T91：消息 reaction 状态（内存；sessionId → entryId → {reactions, myReactions}）
  const reactionsByEntry = new Map<string, Map<string, { reactions: string[]; myReactions: Set<string> }>>()
  const acceptedNonce = new Map<string, string>() // agentId → 最近一次受理成功的 nonce（T81a 审中①：重试同 nonce 不再 cancel——重试是补发不是新消息，cancel 会误杀已受理 turn）
  const createNotices = new Map<string, string>() // agentId → 新建 bot 的非致命失败通知（首条用户消息前展示，L-7 O4）
  /** T26b #4：onboarding create 步登记的延后介绍（seen 落盘后由 finishKickstart 发）。 */
  const pendingKickstart = new Map<string, string>() // T28b：按 sid 存（原单槽——模板 bot 会同时挂多个）
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

  // B2.1：草稿发送失败状态机（RE-DRAFT-SEND-1.1.0.md）——per-agent 本地态，不进 view entries
  const draftSend = createDraftSend(api)
  const agentName = (id: string): string => {
    const s = summaries[id]
    if (s !== undefined && s.title !== null && s.title !== '') return s.title
    return helpersOfMain[id] !== undefined ? 'Subagent' : NEW_CHAT // T36 review 中3：helper 无名回落 Subagent（不冒充 New chat）
  }

  const configOf = (id: string) => (summaries[id] === undefined && !views.has(id) ? null : botConfigOf({
    rawPreset: views.get(id)?.preset ?? summaries[id]?.preset ?? null,
    recipes,
    model: models.get(id) ?? views.get(id)?.model ?? null,
    isMain: id === mainBotId,
    running: views.get(id)?.running ?? summaries[id]?.running === true,
  }))

  // ---- P6-15 worker 投影 ----
  /** T36：创建者统一判定——M3 createdBy（create_bot 的 worker）或主 bot 的 subagent helper。 */
  const creatorOf = (id: string): string | undefined => createdBy[id] ?? helpersOfMain[id]
  const isWorker = (id: string): boolean => creatorOf(id) !== undefined && summaries[id] !== undefined
  const workersOf = (creatorId: string): string[] => order.filter((id) => creatorOf(id) === creatorId && summaries[id] !== undefined)
  const askReason = (ask: Ask): string => {
    const tool = views.get(ask.agentId)?.items.find((i) => i.kind === 'tool' && i.callId === ask.callId)
    return askText(ask, tool?.kind === 'tool' ? tool.args : undefined)
  }
  const factsOf = (id: string): WorkerFacts => {
    const ask = [...asks.values()].find((a) => a.agentId === id && a.outcome === undefined) // 三审②：直接过滤——旧终态不遮新待答
    return {
      id,
      blockedReason: ask === undefined || ask.outcome !== undefined ? null : askReason(ask), // 审③：终态不作待答
      running: views.get(id)?.running ?? summaries[id]?.running === true,
      unread: unread.has(id),
      ...viewFacts(views.get(id)),
      updatedAt: summaries[id]?.updatedAt ?? 0,
    }
  }
  /** 创建者次序：当前主 bot 在前，其余（换主之前的旧主）按 roster 顺序。 */
  const creators = (): string[] => {
    const all = [...new Set(order.filter(isWorker).map((id) => creatorOf(id)!))]
    return mainBotId !== null && all.includes(mainBotId) ? [mainBotId, ...all.filter((c) => c !== mainBotId)] : all
  }
  const sections = (): SectionRecord[] | null => sectionsOf(creators().map((creatorId) => ({ creatorId, workers: workersOf(creatorId).map(factsOf) })), held) // T39：传 held 不传 active——侧栏点 Done 行不换组；active 只影响已读语义
  let sectionsSig = 'null'
  let lastPet: { state: PetState; botId: string | null } = { state: 'idle', botId: null } // T45a 去重

  const workerOverlay = (id: string): { waitingReason?: string; preview?: string; unread?: boolean } => {
    if (isWorker(id)) {
      const f = factsOf(id)
      return { ...(f.blockedReason !== null ? { waitingReason: f.blockedReason } : {}), preview: previewOf(f) }
    }
    const mine = workersOf(id)
    if (mine.length === 0) return {}
    const agg = aggregateOf(mine.map(factsOf), agentName)
    return { ...(agg.reason !== null ? { waitingReason: agg.reason } : {}), ...(agg.unread ? { unread: true } : {}) }
  }

  const recordOf = (id: string): AnyRecord => {
    const overlay = workerOverlay(id)
    return toAgentRecord({
      sessionId: id,
      title: summaries[id]?.title ?? null,
      isMain: id === mainBotId,
      running: views.get(id)?.running ?? summaries[id]?.running === true,
      unread: unread.has(id) || overlay.unread === true,
      activity: views.has(id)
        ? activityOf(views.get(id)!)
        : (summaries[id]?.running === true ? { kind: 'thinking' } : null),
      updatedAt: summaries[id]?.updatedAt ?? Date.now(),
      awaitingApproval: [...asks.values()].some((a) => a.agentId === id && a.outcome === undefined), // 审③：终态不算等待
      ...(overlay.waitingReason !== undefined ? { waitingReason: overlay.waitingReason } : {}),
      // D10c 侧栏角标：失效 bot 的预览行（0.18 行内 lastMessagePreview 槽）；P6-15 worker 行的状态预览
      ...(configOf(id)?.readOnly === true ? { preview: CONNECTOR_UNAVAILABLE } : overlay.preview !== undefined ? { preview: overlay.preview } : {}),
      ...(avatarOf(id) !== null ? { avatarShape: avatarOf(id)!.shape, avatarColor: avatarOf(id)!.color } : {}), // T24
      isHidden: hidden.has(id), // T41：raw 带标记 → 上游 visibleAgents 过滤 + Hidden Bots 对话框
      // B13（A4）：subagent tab 数据源——本 bot 的 worker 会话投影成上游 outline 面板
      // 的 ConversationOutlineSubagent 形状（subagentId/subagentType/title/status）。
      ...(id === mainBotId || creatorOf(id) === id ? {
        subagents: order.filter((w) => creatorOf(w) === id && isWorker(w)).map((w) => ({
          subagentId: w,
          subagentType: 'Subagent',
          title: agentName(w),
          status: (views.get(w)?.running ?? summaries[w]?.running === true) ? 'running' : 'done',
        })),
      } : {}),
    })
  }

  /** 序列化结果里的编排条目元数据收进 peers（notice-view 覆盖层按 entryId 取）。 */
  const collectPeers = (raw: RawEntry[]): RawEntry[] => {
    for (const e of raw) if (e.pbotsPeer !== undefined) peers.set(e.id, e.pbotsPeer as PeerMeta)
    return raw
  }

  /** T40：整批发送（结构化答案→dsh；dismiss=selected 空无 custom——review 中3）。 */
  const sendBatch = async (eventId: string, batch: { ids: string[]; widgets: WidgetQ[]; answered: Map<string, { kind: 'answer'; value: string } | { kind: 'dismiss' }> }): Promise<{ ok: boolean; error?: { message?: string } }> => {
    const answers = batch.ids.map((id) => {
      const a = batch.answered.get(id)
      const widget = batch.widgets.find((w) => w.id === id)!
      if (a === undefined || a.kind === 'dismiss') return { id, selected: [] }
      return toAnswer(id, widget, a.value)
    })
    const res = await api('$events/result', { clientId: eventsClientId, eventId, outcome: { kind: 'result', value: { answers } } })
    return res
  }

  /** T40：该 bot 的提问 widget 卡（批内顺序，追加在 askEntries 同层）。 */
  const questionEntries = (agentId: string): RawEntry[] => {
    const out: RawEntry[] = []
    for (const [eventId, batch] of questionBatches) {
      if (batch.agentId !== agentId) continue
      for (const w of batch.widgets) {
        revision += 1
        const answered = batch.answered.get(w.id)
        const entry: RawEntry = {
          kind: 'send-message',
          id: `q-${eventId}-${w.id}`,
          timestampMs: batch.arrivedMs, // T40c：批到达时刻（稳定；曾 Date.now() 每次投影变）
          message: {
            type: 'widget',
            widget: { prompt: w.prompt, ...(w.helpText !== undefined ? { helpText: w.helpText } : {}), options: w.options.map((o) => ({ label: o.label, ...(o.description !== undefined ? { description: o.description } : {}), ...(o.value !== undefined ? { value: o.value } : {}) })), allowCustom: true },
          },
          // 0.18 契约：respondedValue/widgetDismissed 在 **entry 顶层**（protocol.ts:190-191；review 中2——
          // 原放 message 内被投影丢弃，成功提交后 UI 不显已答态）
          ...(answered?.kind === 'answer' ? { respondedValue: answered.value } : {}),
          // T40b F2：单题 dismiss 也关卡（adapter replaceEntries 每次推送重建——entry 不带就弹回）；
          // 整批 cancel 同。answered=answer 的题不盖（answered 态优先于 dismissed）。
          ...((batch.dismissed && answered?.kind !== 'answer') || answered?.kind === 'dismiss' ? { widgetDismissed: true } : {}),
        }
        out.push(entry)
      }
    }
    return out
  }

  const askEntries = (agentId: string): RawEntry[] => {
    const out: RawEntry[] = []
    for (const [eventId, ask] of asks) {
      if (ask.agentId !== agentId) continue
      revision += 1
      // 完整动作按同 callId 工具行实参现算（approval/request 先于工具行到达时退 reason，下一次推送补上）
      const tool = views.get(agentId)?.items.find((i) => i.kind === 'tool' && i.callId === ask.callId)
      const command = askText(ask, tool?.kind === 'tool' ? tool.args : undefined)
      // T73c：mcp 工具的卡带只读 connector 标注（bash/文件卡零变化）
      const isMcp = ask.toolName.startsWith('mcp__')
      const serverName = isMcp ? ask.toolName.split('__')[1] ?? null : null
      out.push(permissionEntry({
        id: `perm-${eventId}`, requestId: eventId, scope: opts.authId, revision, at: ask.at, command,
        status: ask.outcome === 'answering' ? undefined : ask.outcome, // 三审①：在途仍投影 pending（卡不消失）；终态照实
        ...(serverName !== null ? { connector: { serverName, displayName: connectorDisplayNameOf(serverName, connectorPicks()) } } : {}),
      }))
    }
    return out
  }

  /** L-7 O4：新建 bot 的非致命失败（selectModel 失败等）在空会话里以 notice 呈现，
   * 首条用户消息到达后撤下（对齐旧 renderer addCreated(sid, preset, notice) 的可见性）。 */
  const createNotice = (agentId: string): RawEntry[] => {
    const text = createNotices.get(agentId)
    if (text === undefined) return []
    const view = views.get(agentId)
    // T25（真 bug 预防，工单设计 4）：kickstart 提示也是 user 条目——撤除条件必须是
    // 「存在一条不是 kickstart 提示的 user 条目」，否则介绍提示会把 model 失败的 notice 顶掉。
    if (view !== undefined && view.items.some((i) => i.kind === 'user' && !isKickstartEntry(i.text, i.rpcId))) {
      createNotices.delete(agentId)
      return []
    }
    return [{ kind: 'notice', id: `create-notice-${agentId}`, timestampMs: Date.now(), content: text }]
  }

  const entriesOf = (agentId: string): RawEntry[] => {
    const view = views.get(agentId)
    if (view === undefined || !view.loaded) return [...createNotice(agentId), ...askEntries(agentId), ...questionEntries(agentId)]
    const pending = pendingNonce.get(agentId)
    const main = collectPeers(serialize({
      items: view.items, hasMore: view.hasMore, running: view.running, streaming: view.streaming,
      agentName: agentName(agentId),
      ...(pending !== undefined ? { clientNonce: pending } : {}),
    }))
    if (pending !== undefined && main.some((e) => e.clientNonce === pending)) pendingNonce.delete(agentId)
    // T91：message 条目 merge reaction 投影（ProductionRenderer :1155 读 reactions/myReactions）
    const withReactions = main.map((e) => {
      if (e.kind !== 'message') return e
      const r = reactionsByEntry.get(agentId)?.get(e.id)
      return r === undefined ? e : { ...e, reactions: r.reactions.map((emoji) => ({ emoji, by: 'me' })), myReactions: [...r.myReactions] } // T91：上游 TranscriptReaction={emoji,by}（string 数组 pills 不渲染——本轮根因）
    })
    // T40c：提问卡按批到达时刻插进 main（留在提问位置，不压对话底）——锚定插入：
    // 遍历已保序的 main，插进第一条 timestampMs 更晚的条目之前；全早则尾部（与未改造的
    // 视觉差异只在「晚到内容」场景：原实现恒拼尾把每个历史提问压在最底）。
    const questions = questionEntries(agentId)
    let merged = withReactions
    for (const q of questions) {
      const at = typeof q.timestampMs === 'number' ? q.timestampMs : 0
      const i = merged.findIndex((e) => typeof e.timestampMs === 'number' && e.timestampMs > at)
      merged = i < 0 ? [...merged, q] : [...merged.slice(0, i), q, ...merged.slice(i)]
    }
    return [...merged, ...createNotice(agentId), ...askEntries(agentId)]
  }

  // 首个 openAgentTail 回值之前不推该 bot 的 transcript 快照：上游 openAgent 见 entriesByAgent 已有条目就不再取 tail，
  // 而分页游标（nextBeforeSeq）只随 tail 回值安装——先推快照会让重入的 openAgent 抢掉游标，#11 永不翻页（P5-54 实测）。
  const tailed = new Set<string>()
  const pushTranscript = (agentId: string): void => {
    if (tailed.has(agentId)) push.transcript(agentId)
    // T21：outline 快照与 transcript 同时机推（provider 订阅 outline 事件族整体替换）
    push.outline?.(agentId)
  }

  const onFollowItem = (agentId: string, item: unknown): void => {
    const view = reduceFollow(views.get(agentId) ?? initView(agentId), item)
    views.set(agentId, view)
    // B2.1：用户消息帧到达（source.rpcId 命中 nonce）→ 草稿发送确认
    if (item !== null && typeof item === 'object') {
      const rec = item as { type?: string; event?: { type?: string; data?: { source?: { rpcId?: string } } } }
      const rpcId = rec.event?.data?.source?.rpcId
      if (typeof rpcId === 'string') draftSend.confirmFromRpcId(rpcId) // B2.2：确认后 push.agents 由下方统一触发
    }
    // 已在会话流里定局的审批（main deadline 代答 / 别处作答后 $events 不再发 cancel）从 dock 收掉——旧 store 同口径
    for (const [eventId, ask] of asks) {
      if (ask.agentId === agentId && ask.callId !== null
        && view.items.some((i) => i.kind === 'tool' && i.callId === ask.callId && (i.decision !== null || i.status !== 'running'))
        // T73c 审①：连接器终态保留（回显）——只在未作答（无 outcome）时收；bash/文件照删
        && ask.outcome === undefined) asks.delete(eventId)
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
    const label = typeof rec(values.subagent).label === 'string' && rec(values.subagent).label !== '' ? rec(values.subagent).label : null
    const title = typeof values.title === 'string' && values.title !== '' ? values.title : null
    return {
      sessionId: String(item.sessionId),
      // T60：label/title 吃了 kickstart 提示原文（dsh 自动标题=第一条 user 消息）→ 置 null（toAgentRecord 回落 New chat，agents.ts:30）
      title: label !== null && !isKickstartTitle(label) ? label // T36b：helper label 优先（description——主 bot 起的名；dsh 自动 title 是拼接串）
        : (title !== null && !isKickstartTitle(title) ? title : null),
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
    // T36：主 bot 的 subagent helper 也进 roster（Workers 分组）——仅 parent===mainBotId 的；
    // 嵌套 helper（parent 是 helper）、worker 的 helper、其他 bot 的 helper 一律仍滤（用户定案）。
    const helperCandidates: Array<Record<string, unknown>> = [] // T36b：helper 只收候选（全文件唯一 parent===mainBotId 判定在终值重筛处）
    const items = (rec(list.value).items as unknown[] | undefined ?? []).map(rec)
      .filter((i) => {
        if (typeof i.sessionId !== 'string') return false
        if (archived.has(i.sessionId)) return false // B1.A：软删集过滤（防 reload 复活）
        if (i.origin !== 'subagent' && i.parentSessionId === undefined) return true // 顶层会话照旧
        if (i.origin === 'subagent' && typeof i.parentSessionId === 'string') {
          helperCandidates.push(i) // 只收候选，资格在终值 mainBotId 定后判（一律不在此入 summaries）
        }
        return false
      })
      .map(summaryOf)
    const listed = rec(meta.value).mainBotId
    recipes = rec(rec(meta.value).recipes) as unknown as Record<string, Recipe>
    createdBy = createdByOf(meta.value)
    const nextSummaries: Record<string, Summary> = Object.fromEntries(items.map((s) => [s.sessionId, s]))
    // T26 review HIGH：真首启（onboarding 未 seen 且 roster 空）不自动建 main bot——
    // 否则 countAgents=1 触发 0.18 gate「老用户」语义，landing/六步在生产首启也不可达。
    // onboarding 完成/skip 后 onComplete 链走 ensureMainBot 补建（onboarding-view 调用）。
    const onboardingUnseen = (() => { try { return window.localStorage.getItem('pbots.shim.onboarding-seen') !== '1' } catch { return false } })()
    if (onboardingUnseen && items.length === 0) {
      summaries = {}
      order = []
      mainBotId = null
      push.agents()
      opts.boot?.('ready') // review HIGH 补丁：首启早退也要开 boot 门（否则遮罩拦 onboarding 交互）
      return
    }
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
    // T36b：helper 资格全文件唯一判定处——按终值 mainBotId 重筛候选：合格者 summary 入册，
    // 不合格者（换主后旧 main 的）从 summaries/order 双清（R9 merge 会把旧 order 并回）
    {
      const helperOf: Record<string, string> = {}
      for (const h of helperCandidates) {
        const parent = h.parentSessionId
        if (parent === mainBotId && mainBotId !== null) { // 唯一判定
          helperOf[String(h.sessionId)] = String(parent)
          nextSummaries[String(h.sessionId)] = summaryOf(h)
        }
      }
      helpersOfMain = helperOf
      const nowBad = helperCandidates.map((h) => String(h.sessionId)).filter((sid) => helperOf[sid] === undefined)
      for (const sid of nowBad) { delete nextSummaries[sid] }
      if (nowBad.length > 0) order = order.filter((id) => !nowBad.includes(id))
    }
    // 顺序首载定序后冻结（R9）：主 bot 置顶，其余按 updatedAt；后续只并入新 session（review 中1 改造时误删，复原）
    const rest = Object.values(nextSummaries).filter((s) => s.sessionId !== mainBotId).sort((a, b) => b.updatedAt - a.updatedAt)
    summaries = nextSummaries
    order = order.length === 0 ? [mainBotId!, ...rest.map((s) => s.sessionId)] : [...new Set([mainBotId!, ...order, ...rest.map((s) => s.sessionId)])]
    followed.add(mainBotId!)
    openFollow(mainBotId!)
    for (const id of order) if (isWorker(id)) { followed.add(id); openFollow(id) } // 状态 / 结果预览要视图
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
      // B10：per-tool ceiling 前置判定（1.1.0 LocalToolPermissionCeiling）——never 自动拒、
      // always 自动过，都不发卡；ask（缺省）照旧走审批卡。
      const toolName = String(req.toolName ?? 'tool')
      const ceiling = readCeiling(toolName)
      if (ceiling === 'never' || ceiling === 'always') {
        const dsh = ceiling === 'never' ? 'rejected' : 'allowed-once'
        void api('$events/result', { clientId: eventsClientId, eventId: it.eventId, outcome: { kind: 'result', value: dsh } })
          .catch(() => undefined) // 尽力；失败不重试（下一轮调用再判）
        return
      }
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
      const qb = questionBatches.get(it.eventId)
      if (qb !== undefined) { qb.dismissed = true; pushTranscript(qb.agentId) }
      push.agents()
      return
    }
    if (it.type === 'waterfall' && it.event === 'user-questions/request' && typeof it.eventId === 'string') {
      // T40：一批问题 → 每题一张 widget 卡（0.18 protocol projectWidget 形状）；作答走 respondToWidget
      const qs = Array.isArray(rec(it.request).questions) ? rec(it.request).questions as unknown[] : []
      const widgets = qs.map((q) => toWidget(rec(q))).filter((w) => w.id !== '')
      if (widgets.length > 0) {
        questionBatches.set(it.eventId, { agentId: String(it.agentId ?? ''), ids: widgets.map((w) => w.id), widgets, answered: new Map(), dismissed: false, sent: false, arrivedMs: Date.now() })
        for (const w of widgets) questionEntryIndex.set(`q-${it.eventId}-${w.id}`, { eventId: it.eventId, qid: w.id })
        pushTranscript(String(it.agentId ?? ''))
        push.agents()
      }
      return
    }
    if (it.type === 'emit' && Array.isArray(it.args)) {
      const [sid, value] = it.args as [unknown, unknown]
      const prev = typeof sid === 'string' ? summaries[sid] : undefined
      if (it.event !== 'api-session/status' || typeof value !== 'boolean') return
      if (prev === undefined) {
        // P6-15：main 建出的新 worker（createdBy 先落盘、再建会话、再投 Assignment → 开跑）→ 重拉 roster + meta
        if (typeof sid === 'string' && !unknownTried.has(sid)) {
          unknownTried.add(sid)
          void loadRoster().catch((e) => log(`[shim] roster refresh failed: ${String(e)}`))
        }
        return
      }
      const finished = prev.running && !value
      summaries = { ...summaries, [prev.sessionId]: { ...prev, running: value } }
      // 当前打开的 bot 由 setAgentUnread 清；P6-15：正打开着的 worker 结束不算未读
      if (finished && sid !== mainBotId && !(sid === active && isWorker(prev.sessionId))) unread.add(prev.sessionId)
      push.agents()
    }
  }

  let liveSocket: CarrierSocket | undefined // B39-A：e2e dropCarrier 断链注入的句柄
  const bootSession = (): void => {
    const socket = new CarrierSocket(pageEnv())
    liveSocket = socket
    socket.addEventListener('open', () => {
      dev.sessions += 1
      mux = new PageMux(socket)
      push.transport?.('connected') // B39-A：重连成功 → renderer 徽章/状态行恢复
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
      if (liveSocket === socket) liveSocket = undefined
      push.transport?.('down') // B39-A：断链 → renderer 徽章转 down + transcript reconnecting 行
      uiChanged()
      setTimeout(bootSession, 300) // 断链重开：follow 全部重挂，快照重建（未决审批由 gateway 补发，C §4）
    })
  }

  // ---- coordinator deps（13 RPC 实底） ----
  const deps: CoordinatorDeps = {
    listAgents: () => order.map(recordOf),
    // B14（A4）：getAsyncTasks——运行中 worker → AsyncTask 投影（上游面板只显 running；
    // label/subagentType 与 B13 outline tab 同源，id=worker sessionId 供 detail 展开定位）。
    getAsyncTasks: (id) => order
      .filter((w) => creatorOf(w) === id && isWorker(w) && (views.get(w)?.running ?? summaries[w]?.running === true))
      .map((w) => ({ kind: 'subagent', id: w, label: agentName(w), status: 'running', startedAtMs: summaries[w]?.updatedAt ?? Date.now(), subagentType: 'Subagent' })),
    // T91：toggle reaction（上游 source.call("reactToMessage", {entryId, emoji, agentId})；吞错=上游 swallowed-failure 口径）
    reactToMessage: (input) => {
      const { entryId, emoji } = input as { entryId: string; emoji: string; agentId: string }
      const sid = [...views.keys()].find((k) => (views.get(k)?.items ?? []).some((it) => it.id === entryId)) ?? null
      const key = sid ?? Object.keys(summaries)[0] ?? ''
      let byEntry = reactionsByEntry.get(key)
      if (byEntry === undefined) { byEntry = new Map(); reactionsByEntry.set(key, byEntry) }
      const cur = byEntry.get(entryId) ?? { reactions: [] as string[], myReactions: new Set<string>() }
      if (cur.myReactions.has(emoji)) cur.myReactions.delete(emoji)
      else cur.myReactions.add(emoji)
      cur.reactions = [...cur.myReactions]
      byEntry.set(entryId, cur)
      pushTranscript(key) // T91：pills 的源是 transcript snapshot（feed fanout 听这个 family）
      return Promise.resolve()
    },
    // B27a：composer skill 引用面——skills 投影为 workflow suggestion 行。0.78.1 hi() 消费形状
    // {id,name,description}（trigger 缺省 → Skill tag 非 Routine）；实底=main 的 skills list（同一 preload 桥）。
    // description → scheduleDescription：projectWorkflow 的 subtitle 只认 scheduleDescription（RE 对齐的
    // 消费字段），description 在该投影里没有落点。
    getAgentWorkflows: (id) => ui.skills({ op: 'list', botId: id }).then((res) => {
      if (!res.ok || !Array.isArray((res.value as { onBot?: unknown[] } | undefined)?.onBot)) return [] as unknown[]
      return ((res.value as { onBot: Array<{ name?: unknown; description?: unknown }> }).onBot)
        .filter((s) => typeof s.name === 'string' && s.name.length > 0)
        .map((s) => ({ id: s.name, name: s.name, scheduleDescription: typeof s.description === 'string' ? s.description : '' }))
    }),
    // T21b（review M1）：reload 后未先进聊天、直接开面板的 bot——views 尚无该 id，回值会是空。
    // 这里启动 follow（幂等）：快照到达 → onFollowItem → pushTranscript 同机推 outline 事件，面板活更新。
    outline: (id) => {
      if (!views.has(id)) openFollow(id)
      return toOutlineItems({ items: views.get(id)?.items ?? [], streaming: views.get(id)?.streaming })
    },
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
      // B3.1 outline 全量化：旧页按 id 去重前插进 view.items（上游 UI 本就按 id 合并显示，
      // 快照重推不冲掉分页条目；这里并入只为 outline（读 view.items）能看到全量历史）。
      // 不动 view.firstSeq/hasMore（分页游标，与 items 累积正交）。outline.ts:9-11 升级路径。
      if (view !== undefined && records.length > 0) {
        const older = olderItemsOf(records)
        const known = new Set(view.items.map((it) => it.id))
        const fresh = older.filter((it) => !known.has(it.id))
        if (fresh.length > 0) {
          view.items = [...fresh, ...view.items]
          push.outline?.(id)
        }
      }
      return {
        entries: collectPeers(serialize({ items: olderItemsOf(records), hasMore: page.hasMore === true, running: false, streaming: null, agentName: agentName(id) })),
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
      // T81a supersede（0.18 send-turn-dispatch:132 同语义）：发消息即顶掉运行中的 turn——
      // 先 session/cancel（上游 turn 级原语：打断 active turn、半截 interruptedBlocks 保留、
      // pending inbox 不丢）；idle 时幂等 no-op（accepted:true 实测）。catch 吞=通道异常不挡发送。
      // 审中①：重试（clientNonce===上次受理成功的 nonce）是补发，不 cancel——否则把已受理
      // 任务误杀且 prompt 被 requestId 去重回 accepted，无新 turn。
      const isRetry = typeof args.clientNonce === 'string' && acceptedNonce.get(agentId) === args.clientNonce
      if (!isRetry) await api('session/cancel', { request: { sessionId: agentId } }).catch(() => undefined)
      // B5 Reply：dsh 协议无 reply 字段——发送文本前置不可见标记（渲染层解析成引用块）。
      // \u2063 = INVISIBLE SEPARATOR（不污染可见文本；Copy 走 projectTranscriptCardCopy 已剥标记）。
      const replyToId = typeof args.replyToId === 'string' ? args.replyToId : null
      // B17 附件：dsh 协议无附件字段——名字/路径前置不可见标记行（渲染层 entries.ts 剥出→attachments 字段）。
      const attachPaths = Array.isArray(args.attachmentPaths) ? args.attachmentPaths.filter((v): v is string => typeof v === 'string') : []
      const attachNames = Array.isArray(args.attachmentNames) ? args.attachmentNames.filter((v): v is string => typeof v === 'string') : []
      const attachMarks = attachPaths.map((path, i) => `\u2063[attach:${encodeURIComponent(attachNames[i] ?? path)}@${path}]\u2063`).join('\n')
      // A9（0.78.1 markcode）：richText 里的 skill 引用节点 → 不可见标记行（B17 附件同构；
      // entries.ts 剥出重建 user 消息 richText，渲染层 workflowReference chip）。
      const skillMarks = extractSkillRefMarks(args.richText)
      const replyMark = replyToId === null ? '' : `\u2063[reply:${replyToId}]\u2063\n`
      const outbound = `${attachMarks}${attachMarks === '' ? '' : '\n'}${skillMarks}${skillMarks === '' ? '' : '\n'}${replyMark}${prompt}`
      // B31 SuperAgent 路由：主 bot 会话 + @Bot 动词 委派语法 → 改投目标 bot 会话。
      // 默认关（localStorage 开关）；worker 命名/relay 语义借自 dsh-superagent-prototype
      // executor/dsh.ts 的 worker-<ticketId> 约定。direct 不变。
      let targetSession = agentId
      let routedOutbound = outbound
      const superagentEnabled = (() => { try { return localStorage.getItem('pbots.shim.superagent-router') === '1' } catch { return false } })()
      // 无显式 mainBotId（e2e/直建会话绕过 createAgent）时回落 roster 第一个非 worker 会话——
      // 0.78.1 ensureDefaultMainAgent 语义。direct 不变。
      const effectiveMain = mainBotId ?? order.find((id) => !isWorker(id) && summaries[id] !== undefined) ?? null
      if (superagentEnabled && agentId === effectiveMain) {
        const route = routeMainBotPrompt({ enabled: true, mainBotId: effectiveMain, targetId: agentId, text: prompt })
        if (route.kind === 'delegate') {
          const hit = Object.entries(summaries).find(([, s]) => (s.title ?? '').trim().toLowerCase() === route.targetBotId.trim().toLowerCase())
          if (hit) {
            targetSession = hit[0]
            routedOutbound = `\u2063[delegated-by:${agentId}]\u2063\n${route.text}`
          }
        }
      }
      const res = await api('session/prompt', { request: { requestId: nonce, sessionId: targetSession, mode: 'queue', content: [{ type: 'text', text: routedOutbound }] } })
      // B2.2：桥接草稿失败状态机（RE-DRAFT-SEND-1.1.0.md）——生产 sendPrompt 失败即 refused、
      // 成功即 unconfirmed（follow 帧 rpcId 命中自动确认，onFollowItem 已接）。UI 失败卡经
      // pbotsUi.draftSendState 读态。走 sendDraft 直发路径时 draftSend 内部已维护，此处不重复。
      const wireNonce = typeof args.clientNonce === 'string' ? args.clientNonce : nonce
      if (!res.ok) {
        draftSend.markRefused(agentId, wireNonce, res.error?.message ?? 'session/prompt failed', prompt)
        throw new Error(res.error?.message ?? 'session/prompt failed')
      }
      draftSend.markUnconfirmed(agentId, wireNonce, prompt)
      if (typeof args.clientNonce === 'string') acceptedNonce.set(agentId, args.clientNonce)
      return { accepted: true }
    },
    respondToWidget: async (input) => {
      // T40：entryId→批/题经 questionEntryIndex（review 高：不拆字符串——qid 含 '-' 时 regex 贪婪拆错）
      const route = questionEntryIndex.get(input.entryId)
      if (route === undefined) throw new Error(`not a question card: ${input.entryId}`)
      const { eventId, qid } = route
      const batch = questionBatches.get(eventId)
      if (batch === undefined) throw new Error(`question batch gone: ${eventId}`)
      if (batch.dismissed || batch.sent) throw new Error('question already settled')
      const widget = batch.widgets.find((w) => w.id === qid)
      if (widget === undefined) throw new Error(`unknown question: ${qid}`)
      batch.answered.set(qid, { kind: 'answer', value: input.value })
      pushTranscript(batch.agentId)
      if (batchComplete(batch.ids, batch.answered)) {
        const res = await sendBatch(eventId, batch)
        if (!res.ok) { // M1 失败不吞：回滚本题+重推 transcript（卡回可作答——review 中4）+向调用方上抛
          batch.answered.delete(qid)
          pushTranscript(batch.agentId)
          throw new Error(res.error?.message ?? '$events/result failed')
        }
        batch.sent = true
      }
      push.agents()
      return { accepted: true } // review 中2：0.18 adapter 要求 accepted===true（null 会 rollback）
    },
    dismissWidget: async (input) => {
      const route = questionEntryIndex.get(input.entryId)
      if (route === undefined) return
      const { eventId, qid } = route
      const batch = questionBatches.get(eventId)
      if (batch === undefined || batch.dismissed || batch.sent) return
      const widget = batch.widgets.find((w) => w.id === qid)
      if (widget === undefined) return
      batch.answered.set(qid, { kind: 'dismiss' })
      pushTranscript(batch.agentId)
      if (batchComplete(batch.ids, batch.answered)) {
        const res = await sendBatch(eventId, batch)
        if (!res.ok) { // review 中4：dismiss 末题失败同样回滚+上抛（不再吞）
          batch.answered.delete(qid)
          pushTranscript(batch.agentId)
          throw new Error(res.error?.message ?? '$events/result failed')
        }
        batch.sent = true
      }
      push.agents()
      return { accepted: true } // T40b：与 respondToWidget 同形（契约 record）
    },
    resolvePermission: async (input) => {
      answers.push({ eventId: input.requestId, value: input.dshValue })
      // 审①竞态：RPC 在途先标 answering（follow 的 approval/decided 可能先到——在途不可
      // 被「已定局」删除，也不算等待中）；失败回滚 pending（卡可再答）。
      const preAsk = asks.get(input.requestId)
      if (preAsk !== undefined && preAsk.toolName.startsWith('mcp__')) preAsk.outcome = 'answering'
      try {
        const res = await api('$events/result', { clientId: eventsClientId, eventId: input.requestId, outcome: { kind: 'result', value: input.dshValue } })
        if (!res.ok) throw new Error(res.error?.message ?? '$events/result failed')
        const ask = asks.get(input.requestId)
        // T73c：连接器卡答完留只读回显（内存态）；bash/文件卡照旧答完即删。
        if (ask !== undefined && ask.toolName.startsWith('mcp__')) {
          ask.outcome = connectorAlways.has(input.requestId) ? 'always' : input.dshValue === 'allowed-once' ? 'allow-once' : 'skipped'
          // B10：勾 always 即落档（后续同工具调用前置判定直接过；1.1.0 ceiling 是全工具语义非 mcp 专属）
          if (connectorAlways.has(input.requestId)) writeCeiling(ask.toolName, 'always')
          connectorAlways.delete(input.requestId)
        } else {
          asks.delete(input.requestId)
        }
        if (ask !== undefined) pushTranscript(ask.agentId)
      } catch (e) {
        if (preAsk !== undefined && preAsk.outcome === 'answering') {
          preAsk.outcome = undefined
          pushTranscript(preAsk.agentId) // 三审①：回滚后推送恢复——可重试的卡回到界面
          push.agents()
        }
        throw e
      }
      push.agents()
    },
    setAgentUnread: (id, value) => { if (value) unread.add(id); else unread.delete(id); push.agents() },
    // B1.A：0.78.1 批量删除（ProductionRenderer.tsx:3152 {ids}）。DSH 0.2.2-rc.* 网关无
    // session/delete 路由（probe 实证 404，rc.1/rc.3 同；Q-065 待上游）——本地软删：
    // running 先 session/cancel（尽力，失败不阻断），再本地清理 + archived 集（reloadRoster 过滤防复活）。
    deleteAgents: async (ids) => {
      // 主 bot 不可删（0.78.1 语义；shim 的 main bot 是 roster 头位——删了 loadRoster 会再建一只）
      const known = ids.filter((id) => id !== mainBotId && (summaries[id] !== undefined || views.has(id)))
      for (const id of known) {
        if (views.get(id)?.running === true || summaries[id]?.running === true) {
          await api('session/cancel', { request: { sessionId: id } }).catch(() => undefined) // 尽力打断
        }
        archived.add(id) // 软删持久（reloadRoster 过滤）
        try { window.localStorage.setItem(archivedKey, JSON.stringify([...archived])) } catch { /* 静默 */ }
        // 本地清理：roster/视图/偏好/附属索引（hidden/unread 是 localStorage/内存 UI 态，随行清）
        delete summaries[id]
        order = order.filter((x) => x !== id)
        views.delete(id)
        unread.delete(id)
        hidden.delete(id); writeHidden(hidden)
        delete createdBy[id]
        delete helpersOfMain[id]
        delete recipes[id]
        models.delete(id)
        createNotices.delete(id)
        pendingKickstart.delete(id)
        // B1.A：avatars 单键 JSON（saveAvatar 无按 id 删语义）——读改写滤掉被删 id，其余 bot 形象保留
        try {
          const raw = window.localStorage.getItem('pbots.shim.avatars')
          if (raw !== null) {
            const kept = Object.fromEntries(Object.entries(rec(JSON.parse(raw))).filter(([k]) => !known.includes(k)))
            window.localStorage.setItem('pbots.shim.avatars', JSON.stringify(kept))
          }
        } catch { /* 禁用/腐化：静默 */ }
      }
      if (known.length > 0) {
        if (active !== null && known.includes(active)) {
          active = order[0] ?? null
          if (active !== null) unread.delete(active)
        }
        if (held !== null && known.includes(held)) held = null
        push.agents()
        if (active !== null) push.transcript(active)
      }
      return { deleted: known.length }
    },
    setAgentHidden: (id, value) => { if (value) hidden.add(id); else hidden.delete(id); writeHidden(hidden); push.agents() }, // T41
    createAgent: async (args) => {
      // T26：onboarding create 步的实参（model.ts makeOnboardingCreateRequest：origin:'user'
      // + isKickstartRequested + name/avatarShape/avatarColor）——直建不走新建对话框（chooser
      // 是侧栏 New 的覆盖行为；onboarding 的 create 是内嵌表单）。isKickstartRequested:true 按
      // 0.18 语义发介绍（create 步建的是用户的第一个真 bot；B 段的编舞演示 bot 才 kickstart:false）。
      const a = rec(args)
      if (a.origin === 'user' && a.isKickstartRequested === true) {
        const res = await api('session/create', { request: {} })
        if (!res.ok || typeof rec(res.value).sessionId !== 'string') throw new Error(res.error?.message ?? 'session/create failed')
        const sid = rec(res.value).sessionId as string
        const name = typeof a.name === 'string' ? a.name : ''
        if (name !== '') await api('session/rename', { request: { sessionId: sid, title: name } })
        if (typeof a.avatarShape === 'string' && typeof a.avatarColor === 'string') saveAvatar(sid, { shape: a.avatarShape, color: a.avatarColor })
        // T30：setup 经 kickstartPrompt 进标签内（此前手拼在闭合标签后——提示会露出主聊天，:550 bug）
        summaries = { ...summaries, [sid]: { sessionId: sid, title: name !== '' ? name : null, preset: null, running: false, updatedAt: Date.now() } }
        order = [...order.filter((id) => id !== sid), sid]
        followed.add(sid)
        openFollow(sid)
        // T26b #3：onboarding 建的就是主 bot（0.79.3 语义）——patch meta，否则 finish 后
        // reloadRoster 会再建一个空 main（双 bot）。T28b：模板 bot（带 templateId）不设主。
        const isTemplate = typeof rec(args).templateId === 'string'
        if (mainBotId === null && !isTemplate) { const patched = await metaApi({ op: 'patch', mainBotId: sid }); if (patched.ok) mainBotId = sid }
        // T26b #4：介绍延后到 onboarding 结束（T25 工单:24/queue U5：等 markOnboardingSeen
        // 之后才发）——这里只登记，不发。pendingKickstart 由 desktop.setSeen 完成后经
        // finishKickstart 消费（onboarding-view 的 finish 链）。
        pendingKickstart.set(sid, kickstartPrompt({ name: name !== '' ? name : undefined, setup: typeof a.description === 'string' ? a.description : undefined })) // T28b：介绍带名字（主 bot 默认名空串→文本不变）
        push.agents()
        return recordOf(sid)
      }
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
    // T7b：renderer 不碰文件——skill list/enable/disable 全走 main（T7a 的 pbots:skills）
    skills(req) {
      const w = window as unknown as { pbots?: { skills?: (r: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> } }
      if (w.pbots?.skills === undefined) return Promise.resolve({ ok: false, error: { code: 'pbots/unavailable', message: 'preload skills bridge missing' } })
      return w.pbots.skills(req)
    },
    // B45b：per-tool MCP 四档——透传 main 文件面（pbots:mcp-permissions；与 sdk shell-ask 同文件）
    mcpPermissions(req) {
      const w = window as unknown as { pbots?: { mcpPermissions?: (r: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> } }
      if (w.pbots?.mcpPermissions === undefined) return Promise.resolve({ ok: false, error: { code: 'pbots/unavailable', message: 'preload mcpPermissions bridge missing' } })
      return w.pbots.mcpPermissions(req)
    },
    // D2（0.78.1 custom-mcp-form）：自定义 MCP server 存储——透传 main 文件面（pbots:mcp-servers）
    mcpServers(req) {
      const w = window as unknown as { pbots?: { mcpServers?: (r: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }> } }
      if (w.pbots?.mcpServers === undefined) return Promise.resolve({ ok: false, error: { code: 'pbots/unavailable', message: 'preload mcpServers bridge missing' } })
      return w.pbots.mcpServers(req)
    },
    subscribe(listener) { uiListeners.add(listener); return () => { uiListeners.delete(listener) } },
    online: () => mux !== undefined,
    config: configOf,
    api,
    // B2.2：草稿失败态投影 + 动作直调（coordinator RPC 帧 sendDraft/discardDraft/retryDraft 同底）
    draftSendState: (agentId: string) => draftSend.stateOf(agentId),
    retryDraft: async (agentId: string) => {
      const r = await draftSend.retry(agentId)
      push.agents()
      return r
    },
    discardDraft: (agentId: string) => { draftSend.discard(agentId); push.agents() },
    // B10：per-tool ceiling 档位（设置面 ToolsSection 读写）。
    toolCeiling: (): Record<string, 'always' | 'never'> => listCeilings(),
    setToolCeiling: (toolName: string, level: 'always' | 'never' | 'ask') => {
      if (level === 'ask') removeCeiling(toolName)
      else writeCeiling(toolName, level)
    },
    // B7.2：Routines onAsk 直调（coordinator RPC 帧 'sendPrompt' 同底——deps.sendPrompt）
    async sendPrompt(agentId: string, prompt: string) {
      try { await deps.sendPrompt({ agentId, prompt }); return { ok: true as const, value: undefined } } catch (error) { return { ok: false as const, error: { code: 'pbots/send-failed', message: error instanceof Error ? error.message : String(error) } } }
    },
    // B1.A：覆盖层直调（coordinator RPC 帧 'deleteAgents' 同底——deps.deleteAgents）
    async deleteAgents(ids) {
      try { await deps.deleteAgents(ids); return { ok: true as const, value: undefined } } catch (error) { return { ok: false, error: { code: 'pbots/delete-failed', message: error instanceof Error ? error.message : String(error) } } }
    },
    async createBot(req) {
      const res = req.connectors.length > 0
        ? await api('p2temp/session.createWithConnectors', { request: { connectors: req.connectors, agentPreset: req.preset } })
        : await api('session/create', { request: { agentPreset: req.preset } })
      const sid = rec(res.value).sessionId
      if (!res.ok || typeof sid !== 'string') return { ok: false, message: res.error?.message ?? 'unknown error' } // D7：不入列表
      let notice: string | null = null
      // T30：rename 在 selectModel/openFollow/kickstart 之前且 await（名字没存上就不往介绍写——
      // 否则侧栏默认名、bot 自称另一个名字）；失败不挡建 bot（notice 同 L-7 O4 模式）。
      const wantedName = req.name !== undefined ? req.name.trim() : ''
      let renamed = false
      if (wantedName !== '') {
        const rn = await api('session/rename', { request: { sessionId: sid, title: wantedName } })
        if (rn.ok) renamed = true
        else {
          const msg = `Bot created, but the name wasn't saved: ${rn.error?.message ?? ''}`
          notice = notice === null ? msg : `${notice}\n${msg}`
        }
      }
      if (req.model !== undefined) {
        const sel = await ui.selectModel(sid, req.model.provider, req.model.model)
        if (!sel.ok) notice = notice === null ? `Bot created, but the model wasn't changed: ${sel.error?.message ?? ''}` : `${notice}\nBot created, but the model wasn't changed: ${sel.error?.message ?? ''}`
      }
      // L-7 O4：非致命失败不能静默吞掉——落进空会话的 transcript notice（旧 renderer
      // 的 addCreated(sid, presetId, notice) 同一可见性，新架构的呈现位置是会话内）。
      if (notice !== null) createNotices.set(sid, notice)
      // #4 的 recipe 由 main 写入：重拉 M3，否则新 bot 被误判只读
      if (req.connectors.length > 0) {
        const meta = await metaApi('get')
        if (meta.ok) { recipes = rec(rec(meta.value).recipes) as unknown as Record<string, Recipe>; createdBy = createdByOf(meta.value) }
      }
      // 本地 preset 先记 p2temp 前缀未知：#4 的实际 preset id 由 follow header 给，#3 就是所选
      if (req.avatar !== undefined) saveAvatar(sid, req.avatar) // T24：形象（localStorage，丢不致命）
      summaries = { ...summaries, [sid]: { sessionId: sid, title: renamed ? wantedName : null, preset: req.connectors.length > 0 ? null : req.preset, running: false, updatedAt: Date.now() } }
      order = [...order.filter((id) => id !== sid), sid]
      followed.add(sid)
      openFollow(sid)
      // T25：创建成功选中新 bot 后立刻请它自我介绍（0.79.3 时序；失败不影响建 bot）
      if (req.kickstart !== false) {
        const intro = await api('session/prompt', { request: { requestId: `kickstart-${sid}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: kickstartPrompt({ name: renamed ? wantedName : undefined }) }] } })
        if (!intro.ok) {
          const msg = 'Your Bot couldn\'t introduce itself'
          createNotices.set(sid, createNotices.has(sid) ? `${createNotices.get(sid)!}\n${msg}` : msg) // 0.79.3 原文；多条都可见
        }
      }
      push.agents()
      return { ok: true, sessionId: sid, notice }
    },
    async setMain(id) {
      const res = await metaApi({ op: 'patch', mainBotId: id })
      if (res.ok) {
        mainBotId = id
        order = [id, ...order.filter((x) => x !== id)]
        push.agents()
        // T36b：换主后重拉 roster——新主的 helper 不在上次 summaries（且其 sid 可能已进 unknownTried
        // 不会再自动触发）；失败只记 log 不改 setMain 返回值（patch 已落盘）。await 让测试可等。
        await loadRoster().catch((e) => log(`[shim] setMain roster refresh failed: ${String(e)}`))
      }
      return res
    },
    async selectModel(id, provider, model) {
      const res = await api('session/selectModel', { request: { sessionId: id, provider, model } })
      if (res.ok) { models.set(id, `${provider}/${model}`); push.agents() }
      return res
    },
    cancel: (id) => api('session/cancel', { request: { sessionId: id } }),
    focus: (id) => { focusedFrom = id; opts.focus?.(id) }, // T39：记录来源（回报卡 Open 等——setActive 据此 hold）
    workerRank: (id) => (isWorker(id) ? rankOf(factsOf(id)) : null),
    peer: (id) => peers.get(id) ?? null,
    agentName: (id) => (summaries[id] === undefined ? null : agentName(id)),
    askPending(workerId, eventId) {
      // FINAL §2-5：$events eventId（gateway 生成）与 approval/asked.id（user-approval 生成）不同源，两种都认
      return askPendingOf(workerId, eventId, asks, views.get(workerId))
    },
    setActive(id) {
      const left = active
      // T39：hold 判定在清 unread 前——行换组只因自己状态变，不因被点。
      // hold 条件（工单定案）：打开那一刻它本来就在 Workers（rank<4），或经 pbotsUi.focus（回报卡 Open——
      // GU-P6-15-r1 f1：从折叠 Done 外打开已读 worker 时行别藏死）。侧栏点 Done 行：不 hold，留原位。
      held = isWorker(id) && (rankOf(factsOf(id)) < 4 || focusedFrom === id) ? id
        : (left !== null && held === left && isWorker(id) === false ? null : held)
      if (left !== null && held === left && left !== id) held = null // 离开被 hold 的 worker：解除（此刻归档）
      focusedFrom = null
      active = id
      if (isWorker(id)) unread.delete(id)
      if (isWorker(id) || (left !== null && left !== id && isWorker(left))) push.agents()
    },
  }

  const devSurface: DevSurface = {
    get events() { return dev.events },
    get clientIds() { return dev.clientIds },
    get sessions() { return dev.sessions },
    get sockets() { return dev.sockets },
    get bots() { return [...views.values()] },
    get state() { return { order: [...order], meta: { mainBotId, createdBy: { ...createdBy } }, views: Object.fromEntries(views) } },
    get sections() { return sections() },
    reloadRoster: () => loadRoster(), // T26：onboarding 完成/skip 后补建 main bot 的入口（onboarding-view 生产调用，非仅测试）
    testFeedEvent: (item: unknown) => { onEventsItem(item) },
    testFollowItem: (agentId: string, item: unknown) => { onFollowItem(agentId, item) },
    debugEntries: (agentId: string): RawEntry[] => entriesOf(agentId),
    // B2.1/B2.2：草稿发送失败状态机（生产走 coordinator sendDraft/discardDraft/retryDraft）
    sendDraft: async (agentId: string, text: string, opts?: { inFlightUntilMs?: number }) => {
      const r = await draftSend.send(agentId, text, opts)
      push.agents() // 失败态变化驱动 UI 重渲（useSyncExternalStore version）
      return r
    },
    discardDraft: (agentId: string) => { draftSend.discard(agentId); push.agents() },
    retryDraft: async (agentId: string) => {
      const r = await draftSend.retry(agentId)
      push.agents()
      return r
    },
    draftSendState: (agentId: string) => draftSend.stateOf(agentId),
    finishKickstart: async (sid?: string) => {
      // T28b：按 sid 消费（0.79.3 kickstartAwaitingFirstMessage(agentId)）——无参取全部（向后兼容旧 dev 面）
      const targets = sid === undefined ? [...pendingKickstart.keys()] : [sid]
      for (const target of targets) {
        const prompt = pendingKickstart.get(target)
        if (prompt === undefined) continue
        pendingKickstart.delete(target)
        const intro = await api('session/prompt', { request: { requestId: `kickstart-${target}`, sessionId: target, mode: 'queue', content: [{ type: 'text', text: prompt }] } })
        if (!intro.ok) {
          createNotices.set(target, "Your Bot couldn't introduce itself")
          throw new Error(`kickstart prompt failed for ${target}`) // T28b review M：失败抛错——完成链停建后续模板（工单「任一步失败停止循环」）
        }
      }
    },
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
    dropCarrier() { liveSocket?.close() },
  }

  return {
    deps,
    answers,
    dev: devSurface,
    ui,
    debugItems: (agentId) => [...(views.get(agentId)?.items ?? [])],
    reactionDebug: () => Object.fromEntries([...reactionsByEntry.entries()].map(([k, m]) => [k, [...m.entries()]])),
    wire(target) {
      push.agents = () => {
        target.agents()
        uiChanged()
        // FINAL §2-3：上游只在收到 host-settings{fields:['sidebarSections']} 时重拉 sections——成员 / 档位变了才推
        const sig = JSON.stringify(sections())
        if (sig !== sectionsSig) { sectionsSig = sig; target.sections?.() }
        // T45a：桌宠状态（去重：同 (state,botId) 不重发；换 bot 的 success 再庆祝一次）
        const pet = petStateOf(order.map((id) => ({ id, facts: factsOf(id), view: { loaded: views.get(id)?.loaded === true, runningTool: views.get(id)?.items.some((i) => i.kind === 'tool' && i.status === 'running') === true } })))
        if (pet.state !== lastPet.state || pet.botId !== lastPet.botId) {
          lastPet = pet
          try { (window as unknown as { pbots?: { window?: { setPetState?(v: { state: PetState; botId: string | null }): void } } }).pbots?.window?.setPetState?.(pet) } catch { /* 宠物窗不在（PBOTS_PET=0）——静默 */ }
        }
      }
      push.transcript = target.transcript
      push.outline = target.outline
      push.transport = target.transport // B39-A：断链/重连状态推送（index.ts wire → server.emit）
    },
    sections,
    agentsPayload: () => order.map(recordOf),
    transcriptPayload: (agentId) => ({ type: 'snapshot', activeAgentId: agentId, entries: entriesOf(agentId) }),
    outlinePayload: (agentId) => ({ type: 'snapshot', agentId, items: deps.outline?.(agentId) ?? [] }),
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
