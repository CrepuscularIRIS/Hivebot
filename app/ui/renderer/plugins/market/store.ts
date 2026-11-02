// P-C 市场数据层（U-23；裁决见 work/p4-ui/ui/PDC-final.md P1–P16）。数据全走 M1 #12–#16，renderer 不联网。
// - 模块级 store：离开市场页、切 bot 时安装照常进行（P7）；全局一个安装槽（串行）。
// - 搜索分页 limit 50 +「加载更多」；切源 / 改 query 重置分页；序号守卫丢弃迟到响应（P10）。
// - 三分类（P4）：已安装（entry.name ∈ #16 installed）> not-installable 标记（精确匹配，不被 install.spec 覆盖）> 有 install.spec。
// - 安装（P5/P6）：#15 固定 {enabled:false}；看业务 application，不凭 M1 ok；成功后重拉 #16 核实。
import { useSyncExternalStore } from 'react'
import { api } from '../../shell/store'
import { installedBundles, type Bundle } from '../settings/NewBotDialog'

export type Localized = string | Record<string, string> | undefined
export interface Version { version: string; install?: { spec?: string; registry?: string } }
export interface Entry {
  name: string; title?: Localized; description?: Localized
  metadata?: { keywords?: string[] }; versions?: Version[]; defaultVersion?: string
}
export interface Source { url: string; title?: Localized; error?: string }
/** 安装结局（按条目名记，本次会话有效）：failed = 业务拒绝；unconfirmed = 断链/响应丢失（C）。 */
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

let state: MarketState = {
  sources: null, sourcesError: null, url: null, query: '', entries: [], total: 0, nextOffset: null, loading: false, error: null,
  bundles: null, bundlesError: null, installing: null, outcomes: {}, detail: null,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<MarketState>): void => { state = { ...state, ...patch }; for (const l of [...listeners]) l() }
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getMarket = (): MarketState => state
export const useMarket = (): MarketState => useSyncExternalStore(subscribe, getMarket)

export function text(value: Localized): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return value['zh-CN'] ?? value.zh ?? value.en ?? Object.values(value)[0] ?? ''
}

/** 安装用的版本：defaultVersion 指向的那条，否则首条（versions 按 SemVer 降序）。 */
export function targetVersion(entry: Entry): Version | undefined {
  return entry.versions?.find((v) => v.version === entry.defaultVersion) ?? entry.versions?.[0]
}

/** 三分类（P4）；not-bundle 之后本会话记为 unsupported（P5：不再给按钮、不自动重试）。 */
export function classify(entry: Entry, installed: ReadonlySet<string>, outcome: Outcome | undefined): Kind {
  if (installed.has(entry.name)) return 'installed'
  if (entry.metadata?.keywords?.includes('not-installable') === true) return 'browse'
  if (targetVersion(entry)?.install?.spec === undefined) return 'browse'
  if (outcome?.kind === 'failed' && outcome.code === 'not-bundle') return 'unsupported'
  return 'installable'
}

/** 失败分类文案（P5）：not-bundle 走专门说明；其它给 code + 原因。 */
export function outcomeText(o: Outcome): string {
  if (o.kind === 'unconfirmed') return '安装结果尚未确认，已重新核对已安装列表'
  if (o.code === 'not-bundle') return '此包不是受支持的连接器包'
  if (o.code === 'incompatible-version') return '与当前引擎版本不兼容'
  return `${o.code}${o.message !== '' ? `：${o.message}` : ''}`
}

export const installedNames = (s: MarketState): Set<string> => new Set((s.bundles ?? []).map((b) => b.name))

let seq = 0

async function search(offset: number): Promise<void> {
  const url = state.url
  if (url === null) return
  const mine = ++seq
  set({ loading: true, error: null, ...(offset === 0 ? { entries: [], total: 0, nextOffset: null } : {}) })
  const res = await api('pluginMarket/search', { url, query: { sort: { kind: 'index' }, text: state.query, offset, limit: PAGE } })
  if (mine !== seq) return // 迟到响应：已切源或改 query
  if (!res.ok) { set({ loading: false, error: res.error?.message ?? '读取失败' }); return }
  const v = res.value as { title?: Localized; entries?: Entry[]; total?: number; nextOffset?: number | null }
  set({
    loading: false,
    // #12 只在该源读成功过后才带 title：用本次 search 的 title 补上（来源 caption / select 不再显示裸 URL）
    sources: state.sources?.map((x) => (x.url === url && x.title === undefined && v.title !== undefined ? { ...x, title: v.title } : x)) ?? null,
    entries: offset === 0 ? (v.entries ?? []) : [...state.entries, ...(v.entries ?? [])],
    total: v.total ?? 0, nextOffset: v.nextOffset ?? null,
  })
}

export async function refreshBundles(): Promise<void> {
  const res = await api('pluginManager/listBundles', {})
  set(res.ok ? { bundles: installedBundles(res.value), bundlesError: null } : { bundlesError: res.error?.message ?? '读取失败' })
}

/** 进入市场：首次拉 #12 + #16；之后保留上次的源 / query / 已加载结果（P12）。 */
export async function enterMarket(force = false): Promise<void> {
  void refreshBundles()
  if (state.sources !== null && !force) return
  set({ sources: null, sourcesError: null })
  const res = await api('pluginMarket/listIndexes', {})
  if (!res.ok) { set({ sourcesError: res.error?.message ?? '读取失败' }); return }
  const sources = Array.isArray(res.value) ? res.value as Source[] : []
  set({ sources, url: sources[0]?.url ?? null })
  await search(0)
}

export function setSource(url: string): void { set({ url, detail: null }); void search(0) }
export function setQuery(query: string): void { set({ query }); void search(0) }
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
