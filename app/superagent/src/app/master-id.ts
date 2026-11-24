// 来源: B32 新增（plan Task 2）。masterSessionId 钉定：pin 优先、空串当未配置。
// pin 命中不回写 KV——换绑后清空 pin 即回退到已存值，不被 pin 污染存储。
// B41a：新增 discovered 来源（UI 主 bot 权威认定，m3 bots.json 的 mainBotId），
// 优先级 pin > discovered > stored > fallback——KV 里的 orchestrator-hash 是自造
// 值，UI 认定权高于它；pin 仍是运维显式钉定，永远最高。
import { readFileSync, watch, type FSWatcher } from 'node:fs'
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

/** goal-0acebfbf R5（UI 验收 B2 重写）：ds-bot 的主 bot 会话会换段/换人，masterId 必须跟着 DS-Bot 的认定走。
 * 旧实现按「updatedAt 最新者胜」接任，真实 DS-Bot 0.3.8 上两头都错：Chief 用原生 create_bot 新建的
 * Worker 会话最新 → masterId 绑到 Worker（编排工具挂错会话、监听离开 Chief）；bot-new-part 之后新段记在
 * bot 条目的 sessionId、旧段进 segments → 白名单只认 segments 时永远留在旧段。
 * store.js:507 `chatOf = botId => sessionIdOf(botOf(botId)?.sessionId) ?? botId`：bot 的 id 与其当前
 * 聊天段可以不同，权威映射全在 bot/state.json 的 bot 条目。 */
export interface BotIdentity {
  /** 该 bot 当前自有聊天段（条目 sessionId，缺省 = bot id）。 */
  current: string
  /** 该 bot 名下全部会话：bot id、当前段、openParts（忙碌时另开的段，含其旧段）、已归档 segments。 */
  owned: Set<string>
}

/** 读 DS-Bot 对一个 bot 的身份认定。state.json 未写、文件损坏或没有该 bot 的条目 → undefined（调用方保持现状）。 */
export function readDsBotBotIdentity(dataDir: string | undefined, botId: string | undefined): BotIdentity | undefined {
  if (!dataDir || !botId) return undefined
  try {
    type Part = { sessionId?: unknown; segments?: unknown }
    const raw = JSON.parse(readFileSync(join(dataDir, 'bot', 'state.json'), 'utf8')) as {
      bots?: Record<string, (Part & { openParts?: unknown }) | undefined>
    }
    const entry = raw.bots?.[botId]
    if (!entry || typeof entry !== 'object') return undefined
    const current = typeof entry.sessionId === 'string' && entry.sessionId.trim() !== '' ? entry.sessionId : botId
    const owned = new Set<string>([botId, current])
    const index = (part: Part | undefined) => {
      if (typeof part?.sessionId === 'string' && part.sessionId) owned.add(part.sessionId)
      if (!Array.isArray(part?.segments)) return
      for (const segment of part.segments as Part[]) if (typeof segment?.sessionId === 'string' && segment.sessionId) owned.add(segment.sessionId)
    }
    index(entry)
    if (Array.isArray(entry.openParts)) for (const part of entry.openParts as Part[]) index(part)
    return { current, owned }
  } catch { return undefined }
}

/** 主会话存活解析：candidate 是否仍是主 bot 的聊天段，不是则给出该绑到哪个会话。
 * 拿不到身份认定（state.json 未写 / 无条目 / 无 sessionController）一律保持 candidate——宁可暂不监听，
 * 也不按「谁最近被碰过谁当 Chief」猜。 */
export async function resolveLiveMasterId(
  candidate: string,
  controller: unknown,
  /** DS-Bot 认定的主 bot 身份；见 readDsBotBotIdentity。 */
  identity: BotIdentity | undefined,
): Promise<string> {
  const c = controller as { list?: (...args: unknown[]) => Promise<{ items?: Array<{ sessionId?: string; id?: string; updatedAt?: number | string }> }> }
  const list = c.list?.bind(c)
  try {
    if (!list || !identity) return candidate
    const at = new Map<string, number>()
    for (const item of (await list({})).items ?? []) at.set(item.sessionId ?? item.id ?? '', Number(item.updatedAt ?? 0))
    // ① DS-Bot 认定的当前段存活 → 就是它（candidate 已是当前段时原样返回，不触发重挂）。
    if (at.has(identity.current)) return identity.current
    // ② 当前段未列出（尚未建成/已不可用）：candidate 仍属该 bot → 不动。等新段进了列表，下一次重算由 ① 跟上
    //   （重算时机：DS-Bot 的 state.json 落盘即触发，见 dsBotStateWatcher / createRebindScheduler）。
    if (identity.owned.has(candidate)) return candidate
    // ③ 换主或 candidate 已不属于该 bot：取该 bot 仍存活段里最新的；没有则保持，下轮巡检再试。
    const live = [...at].filter(([id]) => identity.owned.has(id)).sort((a, b) => b[1] - a[1])[0]?.[0]
    return live || candidate
  } catch { /* controller unavailable — keep candidate */ }
  return candidate
}

/** UI 验收 B2 残余（顾问 F1）：只靠 60s 巡检时，换段后到下一次巡检之间监听还留在旧段，用户在新段里立刻发的
 * 消息不进 trigger 表（复测 #2 的「轮转后新消息未进 trigger 表」就是这条窗口）。DS-Bot 每次落盘都是原子替换
 * bot/state.json（store.js:416–456：先写 `${statePath}.${pid}.tmp` 再 replace），watch 文件本身在第一次替换后
 * 就跟丢了，所以 watch 的是 bot/ 目录；换段（parts.js:2036–2057）在 save 之前已把新会话建好，回调时重算即能看到新段。
 * 只认 state.json 及其临时文件，state.lock 等不触发；filename 为 null（平台不报名字）时保守当作可能变了。
 * ensure() 可重复调用：目录还不存在 / 上次装失败时静默跳过，由调用方的巡检再试；close() 之后不再装。 */
export function dsBotStateWatcher(dataDir: string | undefined, onChange: () => void): { ensure: () => void; close: () => void } {
  let watcher: FSWatcher | undefined
  let closed = false
  const ensure = () => {
    if (closed || watcher || !dataDir) return
    try {
      watcher = watch(join(dataDir, 'bot'), { persistent: false }, (_event, filename) => {
        if (filename === null || filename === 'state.json' || filename.startsWith('state.json.')) onChange()
      })
    } catch {
      watcher = undefined // 目录还不存在等：下次 ensure 再试
    }
  }
  return {
    ensure,
    close: () => { closed = true; watcher?.close(); watcher = undefined },
  }
}

/** UI 验收 B2 残余（顾问 F1）：重算节流。state.json 落盘 → soon()：firstMs 后重算一次（等 DS-Bot 把新段建完、
 * 会话列表能看到它），settleMs 再补算一次兜底（落盘与替换之间有锁等待时，第一次可能读到旧内容）。连续落盘合并成
 * 一轮。所有重算串行（上一轮没结束不叠新轮）；run 拒绝不破链，now() 等到的是自己这一轮；定时器 unref，不拖住退出。 */
export function createRebindScheduler(run: () => Promise<void>, opts: { firstMs: number; settleMs: number }): {
  now: () => Promise<void>
  soon: () => void
  stop: () => void
} {
  let soon: ReturnType<typeof setTimeout> | undefined
  let settle: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let chain: Promise<void> = Promise.resolve() // 记吞错后的版本，链上每一轮都等到上一轮结束
  const now = () => {
    if (stopped) return Promise.resolve()
    const mine = chain.then(run, run)
    chain = mine.catch(() => {})
    return mine
  }
  const clear = () => {
    clearTimeout(soon); clearTimeout(settle)
    soon = settle = undefined
  }
  return {
    now,
    soon: () => {
      if (stopped) return
      clear()
      soon = setTimeout(() => { soon = undefined; void now().catch(() => {}) }, opts.firstMs)
      settle = setTimeout(() => { settle = undefined; void now().catch(() => {}) }, opts.settleMs)
      soon.unref?.()
      settle.unref?.()
    },
    stop: () => { stopped = true; clear() },
  }
}
