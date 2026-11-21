// T24：bot 形象持久化——localStorage（先例：shim/src/desktop.ts 置顶列表，同类按 bot
// 存的界面偏好，丢了不致命、按哈希回落）。
// ponytail: 不写 M3 bots.json——那要动 main 的严格 patch 校验/CONTRACT/存储格式，换来
// 的只是「清渲染存储后形象还在」；将来要跨设备或 avatar 编辑器写回时再迁。
const KEY = 'pbots.shim.avatars'

/** picker 面（与 overrides/modules/character.tsx 的 PICKER_* 一致——字面量重复两边都小，改一处记得同步）。 */
const SHAPES = ['blob', 'pebble', 'squircle', 'tablet', 'wedge', 'hex', 'cloud', 'teardrop', 'square', 'sparkle', 'clover', 'heart', 'flower', 'house', 'star']
const COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'gray']

export interface Avatar { readonly shape: string; readonly color: string }

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

function loadAll(): Record<string, Avatar> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return {}
    const out: Record<string, Avatar> = {}
    for (const [id, value] of Object.entries(rec(JSON.parse(raw)))) {
      const { shape, color } = rec(value)
      if (typeof shape === 'string' && SHAPES.includes(shape) && typeof color === 'string' && COLORS.includes(color)) out[id] = { shape, color }
    }
    return out
  } catch {
    return {} // 腐化/禁用 → 全部回落，不报错
  }
}

export function avatarOf(id: string): Avatar | null {
  return loadAll()[id] ?? null
}

export function saveAvatar(id: string, avatar: Avatar | null | undefined): void {
  if (avatar === null || avatar === undefined) return
  if (!SHAPES.includes(avatar.shape) || !COLORS.includes(avatar.color)) return
  try {
    const next = { ...loadAll(), [id]: avatar }
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* 配额/禁用 → 丢弃（仅本会话内存侧失效） */ }
}
