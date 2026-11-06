// P5-57 · 覆盖模块的数据入口：shim 挂在 window.pbotsUi 上的数据面（shim/src/bots.ts PbotsUi）。
// 无 shim（纯上游构建 / 单测）时 ui() 为 null，各覆盖模块退回上游行为。
import { useSyncExternalStore } from 'react'
import type { ApiResult, BotConfig, PbotsUi } from '../../shim/src/bots'

export type { ApiResult, BotConfig, NewBotInit, PbotsUi, PeerMeta } from '../../shim/src/bots'

export type { SkillsApiResult, SkillsReq, SkillEntry, CandidateEntry } from './shim/src/bots'

export const ui = (): PbotsUi | null => (typeof window === 'undefined' ? null : (window as unknown as { pbotsUi?: PbotsUi }).pbotsUi ?? null)

const noop = (): (() => void) => () => {}
const zero = (): number => 0

/** 订阅数据面版本号：roster / 会话 / meta / 在线态任一变化即重渲。 */
export function useUiVersion(): number {
  const u = ui()
  return useSyncExternalStore(u?.subscribe ?? noop, u?.version ?? zero, u?.version ?? zero)
}

export function useBotConfig(agentId: string | null | undefined): BotConfig | null {
  useUiVersion()
  return agentId == null ? null : ui()?.config(agentId) ?? null
}

export function useOnline(): boolean {
  useUiVersion()
  return ui()?.online() ?? false
}

const NO_UI: ApiResult = { ok: false, error: { code: 'pbots/unavailable', message: 'pbotsUi missing' } }
export const api = (method: string, args?: unknown): Promise<ApiResult> => ui()?.api(method, args) ?? Promise.resolve(NO_UI)

/** 本地化字段（目录条目 title / description）取一个可显示的串：en 优先（壳为英文），再 zh。 */
export type Localized = string | Record<string, string> | undefined
export function text(value: Localized): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return value.en ?? value['en-US'] ?? value['zh-CN'] ?? value.zh ?? Object.values(value)[0] ?? ''
}

export interface ModelOption { value: string; label: string; provider: string; model: string }

/** #2 模型目录投影（旧 InfoPane / NewBotDialog 同款）。 */
export function modelOptions(value: unknown): { options: ModelOption[]; fallback: string } {
  const cat = (value ?? {}) as { default?: { model?: string }; groups?: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> }
  return {
    fallback: cat.default?.model ?? '',
    options: (cat.groups ?? []).flatMap((g) => g.models.map((m) => ({ value: `${g.id}/${m.id}`, label: `${g.name} · ${m.name}`, provider: g.id, model: m.id }))),
  }
}

export interface Bundle { name: string; description?: string; installed?: boolean; availability?: string }

/** #16 返回 BundleInfo[]；连接器候选 = installed === true 且文件可读（availability !== 'missing'）。 */
export function installedBundles(value: unknown): Bundle[] {
  return (Array.isArray(value) ? value as Bundle[] : [])
    .filter((b) => b.installed === true && b.availability !== 'missing' && typeof b.name === 'string')
}

/** monogram 字（市场条目 / 连接器，PDC P13：不拉远程 logo）：去 scope 后首字。 */
export const monogram = (name: string): string => Array.from(name.replace(/^@[^/]*\//, ''))[0]?.toUpperCase() ?? '?'
