// T29（2026-11-07）：L-7 R2 的 tool-call 附 ToolResultCard 死路径已删——T22 后主聊天
// 不再产 tool-call raw（entries.ts 不序列化），attach 永不触发。projectTranscriptEntry
// 回归上游投影原样透传；本覆盖层保留的实功能 = 聚合入口重建（feed/page 逐条隔离，
// 见下）与 page 的 composedAtMs / nextBeforeSeq / threadCounts 复刻。
import { projectTranscriptEntry as upstream, isRecord, type ProductionTranscriptEntry, type ProjectedTranscriptPage } from '../../frontend/src/production/model'
import type { TranscriptThreadSummary } from '../../frontend/src/recovered/features/conversation/cards/transcript-card/thread-summary-controller'

export * from '../../frontend/src/production/model'

/** T29：attach 已删——与上游投影等价，保留命名导出供聚合入口与既有 import 使用。 */
export const projectTranscriptEntry: typeof upstream = upstream

/** 聚合的单条入口（L-8 R2）：连上游投影自身都抛错的条目也隔离掉（跳过）。 */
function projectOne(value: unknown, index: number, agentName: string, agentId?: string | null): ProductionTranscriptEntry | null {
  try {
    return projectTranscriptEntry(value, index, agentName, agentId)
  } catch {
    return null
  }
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
    const projected = projectOne(value, index, agentName, agentId)
    return projected == null ? [] : [projected]
  })
}

export function projectTranscriptPageResult(value: unknown, agentName: string, agentId?: string | null): ProjectedTranscriptPage {
  if (!isRecord(value) || !Array.isArray(value.entries)) return { entries: [] }
  const entries = (value.entries as unknown[])
    .map((entry, index) => projectOne(entry, index, agentName, agentId))
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
