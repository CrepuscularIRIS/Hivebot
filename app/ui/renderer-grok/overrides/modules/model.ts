// P5-W3.f1 覆盖（L-7 R2）：projectTranscriptEntry 给 tool-call 投影附带 ToolResultCard
// 快照。上游投影只带 name/status/summary（≤120 字预览），shim 序列化里的完整
// args/result（entries.ts L-7 R2 起原样带出）在此转成快照——上游 transcript.tsx 的
// 展开区本来就渲染 entry.toolResult（TranscriptToolCall.toolResult?: ToolResultCardSnapshot），
// 只是 0.18 重建树里没有任何喂它的路径。快照 kind 按工具名映射，超出的两档
// （file-read/connector）是对上游三档（file-edit/file-write/shell）的扩展：卡片视图
// 只把 kind 当字符串用（标题回退 + aria-label），运行时无影响，故在 attach 处单点收窄类型。
import { projectTranscriptEntry as upstream, isRecord, type ProductionTranscriptEntry, type ProjectedTranscriptPage } from '../../frontend/src/production/model'
import type { TranscriptThreadSummary } from '../../frontend/src/recovered/features/conversation/cards/transcript-card/thread-summary-controller'
import type { ToolResultCardSnapshot, ToolResultCardStatus } from '../../frontend/src/recovered/features/conversation/tool-results/model'

export * from '../../frontend/src/production/model'

/** 工具名 → 卡片档；读类与连接器是扩展档（见文件头）。 */
function resultCardKind(name: string): 'shell' | 'file-write' | 'file-edit' | 'file-read' | 'connector' {
  if (name === 'bash') return 'shell'
  if (name === 'write') return 'file-write'
  if (name === 'edit') return 'file-edit'
  if (name === 'read' || name === 'read_image' || name === 'glob' || name === 'grep' || name === 'present') return 'file-read'
  return 'connector'
}

function resultCardStatus(status: string): ToolResultCardStatus {
  if (status === 'done') return 'success'
  if (status === 'failed' || status === 'error') return 'error'
  if (status === 'aborted') return 'cancelled'
  return 'running' // pending | running
}

/** shim tool-call raw entry（args/result 由 entries.ts 附带）→ 卡片快照；无可展示内容 → null。 */
function toolResultOf(value: Record<string, unknown>, entry: { kind: 'tool-call'; id: string; status: string }): ToolResultCardSnapshot | null {
  const result = typeof value.result === 'string' ? value.result : null
  const decision = typeof value.decision === 'string' && value.decision !== '' ? value.decision : null
  if ((result === null || result === '') && decision === null) return null
  let args: Record<string, unknown> = {}
  if (typeof value.args === 'string' && value.args !== '') {
    try { args = JSON.parse(value.args) as Record<string, unknown> } catch { /* 原样（非 JSON 实参） */ }
  }
  const kind = resultCardKind(typeof value.name === 'string' ? value.name : '')
  const argString = (key: string): string | null => (typeof args[key] === 'string' && args[key] !== '' ? args[key] as string : null)
  const card = {
    kind,
    toolCallId: entry.id,
    status: resultCardStatus(entry.status),
    path: kind === 'shell' ? null : argString('path') ?? argString('file_path'),
    command: kind === 'shell' ? argString('command') : null,
    workingDirectory: null,
    summary: decision ?? '', // 卡片 detail 按 summary || diff || output 取，置空让 output 全文呈现
    output: result ?? '',
    diff: '',
    isStreaming: false,
    isBackground: false,
  }
  return card as ToolResultCardSnapshot // kind 含扩展档：见文件头（视图只当字符串用）
}

export function projectTranscriptEntry(value: unknown, index: number, agentName: string, agentId?: string | null): ProductionTranscriptEntry | null {
  const entry = upstream(value, index, agentName, agentId)
  if (entry === null || entry.kind !== 'tool-call') return entry
  const toolResult = toolResultOf(value as Record<string, unknown>, entry)
  return toolResult === null ? entry : { ...entry, toolResult }
}

// P5-W3.f2 R2：聚合投影也走附卡投影。上游 projectTranscriptFeedEntries /
// projectTranscriptPageResult 内部绑定的还是上游模块内的 projectTranscriptEntry——
// `export *` 原样透传时 feed（回基线）与 tail/page（刷新、装首页）两条路拿到的都是
// 无卡投影（f1 验收：直接投影有卡、聚合投影 null）。这里按上游形状重建两个聚合
// 入口，逐条走本模块的 projectTranscriptEntry；sentWhileOfflineAtMs / threadSummaries
// 上游未导出，按其实现原样本地复刻（语义见各自断言：page 的 composedAtMs 补记与
// nextBeforeSeq / threadCounts 透传）。
function sentWhileOfflineAtMs(value: Record<string, unknown>, entryId: string): number | undefined {
  const byId = value.sentWhileOfflineAtMsByEntryId
  if (!isRecord(byId)) return undefined
  const candidate = byId[entryId]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}

function threadSummariesOf(value: Record<string, unknown>): TranscriptThreadSummary[] | undefined {
  if (!isRecord(value.threadCounts)) return undefined
  const summaries: TranscriptThreadSummary[] = []
  for (const [rootId, count] of Object.entries(value.threadCounts)) {
    if (rootId.length === 0 || typeof count !== 'number' || !Number.isInteger(count) || count <= 0) continue
    summaries.push({ rootId, count })
  }
  return summaries
}

export function projectTranscriptFeedEntries(values: readonly unknown[], agentName: string, agentId: string): ProductionTranscriptEntry[] {
  return values.flatMap((value, index) => {
    const projected = projectTranscriptEntry(value, index, agentName, agentId)
    return projected == null ? [] : [projected]
  })
}

export function projectTranscriptPageResult(value: unknown, agentName: string, agentId?: string | null): ProjectedTranscriptPage {
  if (!isRecord(value) || !Array.isArray(value.entries)) return { entries: [] }
  const entries = (value.entries as unknown[])
    .map((entry, index) => projectTranscriptEntry(entry, index, agentName, agentId))
    .filter((entry): entry is ProductionTranscriptEntry => entry != null)
    .map((entry) => {
      if (entry.kind !== 'message' || entry.composedAtMs != null) return entry
      const composedAtMs = sentWhileOfflineAtMs(value, entry.id)
      return composedAtMs == null ? entry : { ...entry, composedAtMs }
    })
  const nextBeforeSeq = typeof value.nextBeforeSeq === 'number' && Number.isFinite(value.nextBeforeSeq) ? value.nextBeforeSeq : undefined
  const threadSummaries = threadSummariesOf(value)
  return {
    entries,
    ...(nextBeforeSeq == null ? {} : { nextBeforeSeq }),
    ...(threadSummaries === undefined ? {} : { threadSummaries }),
  }
}

export function projectTranscriptPage(value: unknown, agentName: string): ProductionTranscriptEntry[] {
  return projectTranscriptPageResult(value, agentName).entries
}
