// P5-57 · bot 配置投影 + 覆盖层数据面（window.pbotsUi）的类型。
// 投影口径 = 旧 renderer Sidebar.botInfo（4500cd2^，CONTRACT §3.1）：header/summary 的 agentPreset 是 p2temp-* 时
// 查 M3 recipes 得基础 preset + 连接器；recipe 缺失或 live === false → 只读（D10c）。

import type { PeerMeta } from './workers'

export type { PeerMeta } from './workers'

export interface Recipe { agentPreset: string; connectors: string[]; live?: boolean }

export interface BotConfig {
  /** 基础 preset id；null = 还不知道（会话快照 / roster 未到）或 p2temp 配方丢失。 */
  preset: string | null
  connectors: string[]
  /** 连接器失效（D10c）：recipe 缺失或 live === false。 */
  readOnly: boolean
  /** p2temp-* 但 recipes 里没有：原配置无法完整恢复（「用此配置新建」要求重选）。 */
  unknownRecipe: boolean
  /** `provider/model`；null = 跟随 preset 默认（或未知）。 */
  model: string | null
  isMain: boolean
  running: boolean
}

export function botConfigOf(input: {
  rawPreset: string | null
  recipes: Record<string, Recipe>
  model: string | null
  isMain: boolean
  running: boolean
}): BotConfig {
  const { rawPreset, recipes } = input
  const temp = rawPreset?.startsWith('p2temp-') === true
  const recipe = temp ? recipes[rawPreset!] : undefined
  return {
    preset: temp ? (recipe?.agentPreset ?? null) : rawPreset,
    connectors: recipe?.connectors ?? [],
    readOnly: temp && (recipe === undefined || recipe.live === false),
    unknownRecipe: temp && recipe === undefined,
    model: input.model,
    isMain: input.isMain,
    running: input.running,
  }
}

export interface ApiResult { ok: boolean; value?: unknown; error?: { code: string; message: string } }

/** 新建对话框的预填（D13–D15）：只预填不提交。 */
export interface NewBotInit { title?: string; note?: string; preset?: string; connectors?: string[]; model?: string }

export type CreateResult = { ok: true; sessionId: string; notice: string | null } | { ok: false; message: string }

/** window.pbotsUi：覆盖模块（overrides/modules）唯一的数据入口。 */
export interface PbotsUi {
  /** 每次 roster / 会话 / meta 变化 +1（useSyncExternalStore 快照）。 */
  version(): number
  subscribe(listener: () => void): () => void
  online(): boolean
  config(agentId: string): BotConfig | null
  api(method: string, args?: unknown): Promise<ApiResult>
  /** #3 / #4 + 可选 #5；成功即插进 roster（主 bot 之后按创建顺序）并推 agents。 */
  createBot(req: { preset: string; connectors: string[]; model?: { provider: string; model: string } }): Promise<CreateResult>
  /** #20：成功才改 mainBotId 并置顶。 */
  setMain(agentId: string): Promise<ApiResult>
  /** #5：成功后本地记下（follow 快照下一轮才投影 modelSelection）。 */
  selectModel(agentId: string, provider: string, model: string): Promise<ApiResult>
  /** P5-27 同链路：session/cancel。 */
  cancel(agentId: string): Promise<ApiResult>
  /** 让 0.18 renderer 打开该 bot（desktop.onFocusAgent → openAgent）。 */
  focus(agentId: string): void
  // ---- P6-15 / P6-16（worker 分组与两侧 transcript）----
  /** worker 的状态档（0 blocked … 4 done，决策 21）；不是 worker → null。侧栏覆盖层按它给组内行排序。 */
  workerRank(agentId: string): number | null
  /** 编排条目元数据（Messaging 行 / 回报 / 任务）；不是编排条目 → null（覆盖层回落上游 notice）。 */
  peer(entryId: string): PeerMeta | null
  /** roster 里的显示名；不认识的 id → null。 */
  agentName(agentId: string): string | null
  /** 回报 ask 项的活状态：eventId 仍待决（无法对上时退回「worker 现在是否 blocked」）。 */
  askPending(workerId: string, eventId: string | null): boolean
  /** chat-header 覆盖层上报当前打开的 bot（worker 打开即已读）。 */
  setActive(agentId: string): void
  /** 覆盖层注册的新建对话框：resolve 新 bot 的 sessionId，取消 = null。未注册时 createAgent 直建（单测 / 无覆盖构建）。 */
  chooser?: (init: NewBotInit) => Promise<string | null>
}
