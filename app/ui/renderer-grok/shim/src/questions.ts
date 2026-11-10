// T40：dsh user-questions → 0.18 widget 卡（映射 + 攒答案纯函数）。
// 形状锚点：recovered protocol.ts:186-193/244-268（widget 要求 1-6 选项）；M1 作答
// （main/m1-api/index.ts:100-106）要求 answers 的 id 集合恰等于批内问题 id。
export interface DshQuestion { id?: unknown; question?: unknown; header?: unknown; multiSelect?: unknown; options?: unknown }
export interface WidgetOption { label: string; description?: string; value?: string }
export interface WidgetQ { id: string; prompt: string; helpText?: string; options: WidgetOption[]; allowCustom: true }

/** shim 私有哨兵：0 选项题补一个 Skip 钮（dsh 语义「skipped = selected 空 + 无 custom」）。 */
export const SKIP_SENTINEL = '__pbots_skip__'

/** dsh 问题 → widget 卡（0 选项补 Skip；>6 截断；multiSelect 降级单选——回执记）。 */
export function toWidget(q: DshQuestion): WidgetQ {
  const id = String(q.id ?? '')
  const rawOpts = Array.isArray(q.options) ? q.options.map((o) => rec(o)) : []
  const opts: WidgetOption[] = rawOpts
    .filter((o) => typeof o.label === 'string' && o.label !== '')
    .map((o) => ({ label: o.label as string, ...(typeof o.description === 'string' ? { description: o.description } : {}) }))
    .slice(0, 6)
  const final = opts.length === 0 ? [{ label: 'Skip', value: SKIP_SENTINEL }] : opts
  return {
    id,
    prompt: String(q.question ?? ''),
    ...(typeof q.header === 'string' && q.header !== '' ? { helpText: q.header } : {}),
    options: final,
    allowCustom: true,
  }
}

function rec(v: unknown): Record<string, unknown> { return typeof v === 'object' && v !== null ? v as Record<string, unknown> : {} }

/** 单题作答值 → dsh answer（选项命中→selected；Skip 哨兵/不命中→custom 或纯跳过）。 */
export function toAnswer(qid: string, widget: WidgetQ, value: string): { id: string; selected: string[]; custom?: string } {
  const hit = widget.options.find((o) => o.value === value && o.value !== undefined)
  if (hit !== undefined && hit.value !== SKIP_SENTINEL) return { id: qid, selected: [hit.label] }
  // 显式 value=选项 label 的命中（0.18 widget 回 value，缺省 value=label）
  const byLabel = widget.options.find((o) => (o.value ?? o.label) === value)
  if (byLabel !== undefined && byLabel.value !== SKIP_SENTINEL) return { id: qid, selected: [byLabel.label] }
  if (value === SKIP_SENTINEL) return { id: qid, selected: [] }
  return { id: qid, selected: [], custom: value }
}

/** 整批答案齐了？（M1 恰等 id 集合） */
export function batchComplete(ids: string[], answered: Map<string, unknown>): boolean {
  return ids.every((id) => answered.has(id))
}
