// P5-57 · P-C 市场数据层（复制改造自旧 renderer plugins/market/store.ts @4500cd2^；裁决 work/p4-ui/ui/PDC-final.md P1–P16，
// 定稿 work/p5-parity/ui/P5-57-final.md ①）。数据全走 M1 #12–#16，renderer 不联网。
// - 模块级 store：关掉市场、切 bot 时安装照常进行（P7）；全局一个安装槽（串行）。
// - 搜索分页 limit 50 +「Load more」；切源 / 改 query 重置分页；序号守卫丢弃迟到响应（P10）。
// - 三分类（P4）：已安装（源名或 wrapper 名 ∈ #16）> not-installable / 无 install.spec（仅浏览）> 本会话 not-bundle > 可装。
// - 安装（P5/P6）：#15 固定 {enabled:false}；看业务 application，不凭 M1 ok；完成后重拉 #16 核实。
import { useSyncExternalStore } from 'react'
import { BUILTIN_PICKS_TITLE, BUILTIN_PICKS_URL, isBuiltin, searchPicks } from './market-picks'
import { wrapperNameOf } from '../../../../sdk/src/market/wrapper-name.mjs'
import { api, installedBundles, type Bundle, type Localized } from './pbots-ui'

export interface Version { version: string; install?: { spec?: string; registry?: string } }
export interface Entry {
  name: string; title?: Localized; description?: Localized
  metadata?: { keywords?: string[] }; versions?: Version[]; defaultVersion?: string
}
export interface Source { url: string; title?: Localized; error?: string }
/** 安装结局（按条目名记，本次会话有效）：failed = 业务拒绝；unconfirmed = 断链/响应丢失。 */
export interface Outcome { kind: 'failed' | 'unconfirmed'; code: string; message: string }
export type Kind = 'installed' | 'browse' | 'installable' | 'unsupported'

export const PAGE = 50

export interface MarketState {
  sources: Source[] | null
  sourcesError: string | null
  url: string | null
  query: string
  entries: Entry[]
  total: number
  nextOffset: number | null
  loading: boolean
  error: string | null
  bundles: Bundle[] | null
  bundlesError: string | null
  installing: string | null
  outcomes: Record<string, Outcome>
  detail: string | null
}

const INITIAL: MarketState = {
  sources: null, sourcesError: null, url: null, query: '', entries: [], total: 0, nextOffset: null, loading: false, error: null,
  bundles: null, bundlesError: null, installing: null, outcomes: {}, detail: null,
}
let state: MarketState = INITIAL
const listeners = new Set<() => void>()
const set = (patch: Partial<MarketState>): void => { state = { ...state, ...patch }; for (const l of [...listeners]) l() }
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getMarket = (): MarketState => state
export const useMarket = (): MarketState => useSyncExternalStore(subscribe, getMarket, getMarket)

/** 安装用的版本：defaultVersion 指向的那条，否则首条（versions 按 SemVer 降序）。 */
export function targetVersion(entry: Entry): Version | undefined {
  return entry.versions?.find((v) => v.version === entry.defaultVersion) ?? entry.versions?.[0]
}

/** 该条目实际已装的 bundle 名（源名或 U-25 wrapper 名）；null = 未装。「New bot with this app」预勾它（#4 要 bundle 名）。 */
export function installedNameOf(entry: Entry, installed: ReadonlySet<string>): string | null {
  if (installed.has(entry.name)) return entry.name
  const wrapper = wrapperNameOf(entry.name)
  return installed.has(wrapper) ? wrapper : null
}

/** 三分类（P4）；not-bundle 之后本会话记为 unsupported（P5：不再给按钮、不自动重试）。 */
export function classify(entry: Entry, installed: ReadonlySet<string>, outcome: Outcome | undefined): Kind {
  if (installedNameOf(entry, installed) !== null) return 'installed'
  if (entry.metadata?.keywords?.includes('not-installable') === true) return 'browse'
  if (targetVersion(entry)?.install?.spec === undefined) return 'browse'
  if (outcome?.kind === 'failed' && outcome.code === 'not-bundle') return 'unsupported'
  return 'installable'
}

/** 失败分类文案（P5）：not-bundle 走专门说明；其它给 code + 原因。 */
export function outcomeText(o: Outcome): string {
  if (o.kind === 'unconfirmed') return "Couldn't confirm the connection. Rechecked your plugins."
  if (o.code === 'not-bundle') return "This package isn't a supported connector bundle."
  if (o.code === 'incompatible-version') return "Not compatible with this engine version."
  return `${o.code}${o.message !== '' ? `: ${o.message}` : ''}`
}

export const installedNames = (s: MarketState): Set<string> => new Set((s.bundles ?? []).map((b) => b.name))

let seq = 0

async function search(offset: number): Promise<void> {
  const url = state.url
  if (url === null) return
  const mine = ++seq
  set({ loading: true, error: null, ...(offset === 0 ? { entries: [], total: 0, nextOffset: null } : {}) })
  if (isBuiltin(url)) { // T69：内置源本地检索（静态模块，无网络）
    const r = searchPicks({ text: state.query, offset, limit: PAGE })
    if (mine !== seq) return
    set({ loading: false, entries: offset === 0 ? r.entries : [...state.entries, ...r.entries], total: r.total, nextOffset: r.nextOffset })
    return
  }
  const res = await api('pluginMarket/search', { url, query: { sort: { kind: 'index' }, text: state.query, offset, limit: PAGE } })
  if (mine !== seq) return // 迟到响应：已切源或改 query
  if (!res.ok) { set({ loading: false, error: res.error?.message ?? "Couldn't load" }); return }
  const v = res.value as { title?: Localized; entries?: Entry[]; total?: number; nextOffset?: number | null }
  set({
    loading: false,
    // #12 只在该源读成功过后才带 title：用本次 search 的 title 补上（caption / select 不显示裸 URL）
    sources: state.sources?.map((x) => (x.url === url && x.title === undefined && v.title !== undefined ? { ...x, title: v.title } : x)) ?? null,
    entries: offset === 0 ? (v.entries ?? []) : [...state.entries, ...(v.entries ?? [])],
    total: v.total ?? 0, nextOffset: v.nextOffset ?? null,
  })
}

export async function refreshBundles(): Promise<void> {
  const res = await api('pluginManager/listBundles', {})
  set(res.ok ? { bundles: installedBundles(res.value), bundlesError: null } : { bundlesError: res.error?.message ?? "Couldn't load" })
}

/** 进入市场：首次拉 #12 + #16；之后保留上次的源 / query / 已加载结果（P12）。 */
export async function enterMarket(force = false): Promise<void> {
  void refreshBundles()
  if (state.sources !== null && !force) return
  set({ sources: null, sourcesError: null })
  const res = await api('pluginMarket/listIndexes', {})
  // profile 没挂 market 插件时 dsh 无此端点（main connect.ts：pbots/upstream「HTTP 404 from …」）= 没配目录源，走空态而非报错
  // T69：内置 picks 源恒置顶（dsh 的源列表永不包含它——builtin: 不是合法 http 索引）
  const BUILTIN: Source = { url: BUILTIN_PICKS_URL, title: BUILTIN_PICKS_TITLE }
  if (!res.ok && res.error?.code === 'pbots/upstream' && res.error.message.startsWith('HTTP 404')) { set({ sources: [BUILTIN], url: BUILTIN_PICKS_URL }); await search(0); return }
  if (!res.ok) { set({ sourcesError: res.error?.message ?? "Couldn't load" }); return }
  const userSources = Array.isArray(res.value) ? res.value as Source[] : []
  const sources = [BUILTIN, ...userSources]
  // 默认浏览尊重用户源（配过源打开看到自己的目录）；无用户源才落内置 picks（T69 语义）
  set({ sources, url: state.url ?? userSources[0]?.url ?? BUILTIN_PICKS_URL })
  await search(0)
}

export function setSource(url: string): void { set({ url, detail: null }); void search(0) }
export function setQuery(query: string): void { set({ query }); void search(0) }

/** T51：Index sources 管理（DSH Discover 同款）——setIndexes 全量提交；新加源自动成为当前源。返回错误文案或 null。 */
export async function addIndex(url: string): Promise<string | null> {
  const trimmed = url.trim()
  const cur = (state.sources ?? []).map((s) => s.url).filter((u) => !u.startsWith('builtin:')) // 提交给 dsh 的永不含内置源
  // T69b：任何 builtin: 前缀输入都在提交前拒绝（不只本尊 URL）——dsh 现在会拒 invalid-index-url，
  // 但「urls 不含 builtin:」是本层承诺，不押注上游校验永远在。
  if (trimmed.startsWith('builtin:')) return 'Index source listed twice'
  if (trimmed === '' || cur.includes(trimmed)) return cur.includes(trimmed) ? 'Index source listed twice' : 'Enter an index URL'
  const next = [...cur, trimmed]
  const res = await api('pluginMarket/setIndexes', { urls: next })
  if (!res.ok) return res.error?.message ?? "Couldn't save"
  await enterMarket(true)
  // T51c R2: 上游会把 URL 规范化（大小写/端口/.. 折叠）——从刷新后的 sources 里选
  // 本次新增的那一项；拿用户原样输入 setSource 会选中不存在的地址（Index is not configured）。
  const fresh = (getMarket().sources ?? []).map((x) => x.url).filter((u) => !u.startsWith('builtin:')) // T69：内置源恒在 sources[0]，不是「本次新增」
  const added = fresh.find((u) => !cur.includes(u)) ?? fresh[0]
  if (added !== undefined) setSource(added)
  return null
}

/** T51：删源——删后剩源自动选首个；全删回空态。 */
export async function removeIndex(url: string): Promise<string | null> {
  if (url.trim().startsWith('builtin:')) return null // 内置源（任意 builtin: 前缀，含带空白输入）不可删（UI 也不给删除钮——双保险）
  const next = (state.sources ?? []).map((s) => s.url).filter((u) => u !== url && !u.startsWith('builtin:'))
  const res = await api('pluginMarket/setIndexes', { urls: next })
  if (!res.ok) return res.error?.message ?? "Couldn't save"
  // T69：删的是当前源 → 回落：下一个用户源，否则内置 picks（内置恒在，不再有「无源可看」态）
  const keep = state.url === url ? next[0] ?? BUILTIN_PICKS_URL : state.url
  await enterMarket(true)
  setSource(keep)
  return null
}
export function loadMore(): void { if (state.nextOffset !== null && !state.loading) void search(state.nextOffset) }
export function retrySearch(): void { void search(0) }
export function openDetail(name: string | null): void { set({ detail: name }) }

/** #15（P5–P7）：全局串行；enabled 永远 false（代码里不存在 true 路径，main §2.2 照样强制）。 */
export async function install(entry: Entry): Promise<void> {
  const target = targetVersion(entry)?.install
  if (state.installing !== null || target?.spec === undefined) return
  const { [entry.name]: _old, ...outcomes } = state.outcomes
  set({ installing: entry.name, outcomes })
  const res = await api('pluginManager/installBundle', {
    spec: target.spec,
    options: { enabled: false, ...(target.registry !== undefined ? { registry: target.registry } : {}) },
  })
  let outcome: Outcome | undefined
  if (!res.ok) {
    outcome = res.error?.code === 'pbots/unavailable'
      ? { kind: 'unconfirmed', code: res.error.code, message: res.error.message }
      : { kind: 'failed', code: res.error?.code ?? 'unknown', message: res.error?.message ?? '' }
  } else {
    const v = res.value as { application?: string; error?: { code?: string; diagnostic?: string } }
    if (v.application === 'failed' || v.application === 'cancelled') {
      outcome = { kind: 'failed', code: v.error?.code ?? v.application, message: v.error?.diagnostic ?? '' }
    }
  }
  await refreshBundles() // 成功与「未确认」都以 #16 为准（P6）
  set({ installing: null, outcomes: outcome === undefined ? state.outcomes : { ...state.outcomes, [entry.name]: outcome } })
}
