// B24 learnings 审核队列纯函数（0.78.1 chunk-bot-manage-knowledge 全解规格）
// 状态机 busy→decided / failed→回滚（0.78.1 Ue/Je 组件语义）

export interface LearningItem {
  readonly itemId: string
  readonly summary: string
  readonly kind: "skill" | "memory"
  readonly createdAtMs: number
  readonly proposedByUserId: number | null
  readonly reviewedByUserId: number | null
}

export type DecideOutcome = "busy" | "decided" | "failed"

/** 0.78.1 He(e)：busy|decided 时行处于终态/进行态（不可再点） */
export function learningRowLocked(outcome: DecideOutcome | undefined): boolean {
  return outcome === "busy" || outcome === "decided"
}

/** 0.78.1 Je 主体：pending 项 = 队列+乐观项合并，createdAtMs 倒序（Ye 排序），已 decided 的滤除 */
export function mergeLearningQueue(
  queue: readonly LearningItem[],
  optimistic: readonly LearningItem[],
  outcomes: ReadonlyMap<string, DecideOutcome>,
): LearningItem[] {
  const merged = new Map<string, LearningItem>()
  for (const item of queue) merged.set(item.itemId, item)
  for (const item of optimistic) if (!merged.has(item.itemId)) merged.set(item.itemId, item)
  return [...merged.values()]
    .filter((item) => outcomes.get(item.itemId) !== "decided")
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
}

/** 0.78.1 列表 We：初始 5 条，show more 增量 */
export const LEARNINGS_PAGE_SIZE = 5

/** 0.78.1 We：reviewedByUserId===self 文案，否则 Approved by {name} */
export function reviewedByLabel(item: LearningItem, selfUserId: number | null, rosterNames: ReadonlyMap<number, string>): string | null {
  if (item.reviewedByUserId === null) return null
  if (item.reviewedByUserId === selfUserId) return "Approved by you"
  return `Approved by ${rosterNames.get(item.reviewedByUserId) ?? "unknown"}`
}

/** 0.78.1 Ce 校验：name 至少一个字母/数字；new 时 key 冲突（no-key/taken） */
export function validateSkillDraft(name: string, takenKeys: ReadonlySet<string>): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "empty"
  if (!/[a-z0-9]/i.test(trimmed)) return "no-key"
  if (takenKeys.has(trimmed.toLowerCase())) return "taken"
  return null
}

/** 0.78.1 ye：Escape=cancel、Cmd/Ctrl+Enter=submit（isComposing 忽略） */
export function skillEditorKeyboardAction(e: { isComposing: boolean; key: string; metaKey: boolean; ctrlKey: boolean }): "cancel" | "submit" | null {
  if (e.isComposing) return null
  if (e.key === "Escape") return "cancel"
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return "submit"
  return null
}
