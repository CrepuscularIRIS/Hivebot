// 来源: B32 新增（plan Task 2）。masterSessionId 钉定：pin 优先、空串当未配置。
// pin 命中不回写 KV——换绑后清空 pin 即回退到已存值，不被 pin 污染存储。
// B41a：新增 discovered 来源（UI 主 bot 权威认定，m3 bots.json 的 mainBotId），
// 优先级 pin > discovered > stored > fallback——KV 里的 orchestrator-hash 是自造
// 值，UI 认定权高于它；pin 仍是运维显式钉定，永远最高。
import { readFileSync, watch } from 'node:fs'
import { join } from 'node:path'

export function resolveMasterId(pin: string | undefined, discovered: string | undefined, stored: string | undefined, fallback: string): string {
  const trimmed = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '')
  if (trimmed(pin) !== '') return trimmed(pin)
  if (trimmed(discovered) !== '') return trimmed(discovered)
  if (trimmed(stored) !== '') return trimmed(stored)
  return fallback
}

/** 读 ds-bot 的 $dataDir/bot/state.json 的 mainBotIds[0]（DS-Bot 基底的目标 0acebfbf 接缝）。 */
export function readDsBotMainBotId(dataDir: string | undefined): string | undefined {
  try {
    if (!dataDir) return undefined
    const meta = JSON.parse(readFileSync(join(dataDir, 'bot', 'state.json'), 'utf8')) as { mainBotIds?: unknown }
    const first = Array.isArray(meta.mainBotIds) ? meta.mainBotIds[0] : undefined
    return typeof first === 'string' && first.trim() !== '' ? first : undefined
  } catch {
    return undefined
  }
}

/** 读 $dataDir/bots.json 的 mainBotId（m3 bots-meta 落盘，UI setMain 后即在此）。
 * 任何缺失/损坏都返回 undefined——发现失败静默回退到 stored/fallback。 */
export function readDiscoveredMasterId(dataDir: string | undefined): string | undefined {
  if (!dataDir) return undefined
  try {
    const meta = JSON.parse(readFileSync(join(dataDir, 'bots.json'), 'utf8')) as { mainBotId?: unknown }
    return typeof meta.mainBotId === 'string' && meta.mainBotId.trim() !== '' ? meta.mainBotId : undefined
  } catch {
    return undefined
  }
}

/** B41a：监听 bots.json 变更，mainBotId 换人时回调 onRepin（runtime 用它触发 restart 重订）。
 * 返回停止函数。目录/文件不存在不 throw（watch 在文件创建后才开始收事件，冷启动发现已覆盖空窗）。 */
export function watchBotsMeta(dataDir: string, current: string, onRepin: () => void): () => void {
  try {
    const watcher = watch(join(dataDir, 'bots.json'), { persistent: false }, () => {
      const next = readDiscoveredMasterId(dataDir)
      if (next && next !== current) onRepin()
    })
    return () => watcher.close()
  } catch {
    return () => {}
  }
}

/** goal-0acebfbf R5：ds-bot 重启会重建 Chief 会话（新 session id）但 bot/state.json 的 mainBotIds 不更新——
 * 解析出的 id 可能指向孤儿会话。用 sessionController 校验存活；不存活时回退到 session/list 里 title=Chief 的最新会话。 */
export async function resolveLiveMasterId(
  candidate: string,
  controller: unknown,
  excludeRoomIds: readonly string[] = [],
): Promise<string> {
  const c = controller as { list?: (...args: unknown[]) => Promise<{ items?: Array<{ sessionId?: string; id?: string; updatedAt?: number | string }> }> }
  const list = c.list?.bind(c)
  try {
    if (!list) return candidate
    const listed = await list({})
    const items = listed.items ?? []
    // ds-bot 会话段轮转后 mainBotIds 不更新；活跃 Chief 段=updatedAt 最新的会话。
    // 排除群聊（rooms keys）与死 candidate 自身；title 不在 list 回包（R5 实测 undefined）。
    const excluded = new Set<string>([candidate, ...excludeRoomIds])
    const candAt = Number(items.find(item => (item.sessionId ?? item.id) === candidate)?.updatedAt ?? 0)
    const ranked = items
      .map(item => ({ id: item.sessionId ?? item.id ?? '', at: Number(item.updatedAt ?? 0) }))
      .filter(item => typeof item.id === 'string' && item.id && !excluded.has(item.id) && item.at > candAt)
      .sort((a, b) => b.at - a.at)
    const found = ranked[0]?.id
    return typeof found === 'string' && found ? found : candidate
  } catch { /* controller unavailable — keep candidate */ }
  return candidate
}

/** goal-0acebfbf R5：ds-bot rooms dict 的 key 集（群聊会话排除清单）。文件缺失回空。 */
export function readDsBotRoomIds(dataDir: string | undefined): string[] {
  if (!dataDir) return []
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, 'bot', 'state.json'), 'utf8')) as { rooms?: Record<string, unknown> }
    return Object.keys(raw.rooms ?? {})
  } catch { return [] }
}
