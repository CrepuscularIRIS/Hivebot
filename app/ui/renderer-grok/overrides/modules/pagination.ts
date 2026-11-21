// P5-W3.f1 覆盖（L-7 R3）：分页控制器按 scope 记忆已装页，回切时恢复。
// 上游 setScope 无条件清空页状态，而 ProductionRenderer.openAgent 对「已缓存条目」
// 的 bot 提前返回、不再 installInitialPage——A→B→A 后 A 的更早页丢失、游标回
// unprobed：hasOlder 谎报可加载、loadOlder 静默 no-op（L-7 R3 复现链）。本覆盖层
// 在切走前保存当前 scope 的 {entries, cursor}，切回已见 scope 时用 installInitialPage
// 恢复（游标语义不变：more→nextBeforeSeq，exhausted→无该键）；全新 scope 仍走
// 上游清空，fresh 抓取的首页作为权威覆盖记忆。上游其余方法原样透传。
import {
  createTranscriptPaginationController as upstreamCreate,
  type TranscriptHistoryPage,
  type TranscriptPaginationControllerOptions,
  type TranscriptPaginationRootHandoff,
} from '../../frontend/src/recovered/features/conversation/workspace/pagination'
import type { ConversationTranscriptEntry } from '../../frontend/src/recovered/features/conversation/workspace/model'

export * from '../../frontend/src/recovered/features/conversation/workspace/pagination'

export function createTranscriptPaginationController(
  options: TranscriptPaginationControllerOptions,
): TranscriptPaginationRootHandoff {
  const controller = upstreamCreate(options)
  const scopeKey = (slot: string | null, agent: string | null): string => `${slot ?? ''}::${agent ?? ''}`
  const saved = new Map<string, TranscriptHistoryPage>()

  const snapshotScope = (): { slot: string | null; agent: string | null; key: string } => {
    const snap = controller.getSnapshot()
    return { slot: snap.accountSlot, agent: snap.agentId, key: scopeKey(snap.accountSlot, snap.agentId) }
  }

  /** 把当前 scope 的页状态记进 saved（fresh 首页/翻页后调用；unprobed = 未装过，不记）。 */
  const remember = (): void => {
    const { key } = snapshotScope()
    const snap = controller.getSnapshot()
    if (snap.cursor.kind === 'unprobed') return
    const page: TranscriptHistoryPage = {
      entries: [...snap.entries] as readonly ConversationTranscriptEntry[],
      ...(snap.cursor.kind === 'more' ? { nextBeforeSeq: snap.cursor.beforeSeq } : {}),
    }
    saved.set(key, page)
  }

  return {
    ...controller,
    setScope(slot, agent) {
      const current = snapshotScope()
      if (current.slot === slot && current.agent === agent) return controller.setScope(slot, agent) // 同 scope 重入：上游自身 no-op
      remember() // 切走前保存
      controller.setScope(slot, agent)
      const restore = saved.get(scopeKey(slot, agent))
      if (restore !== undefined) controller.installInitialPage(restore) // 回切恢复：hasOlder/loadOlder 立即可用
    },
    installInitialPage(page) {
      const result = controller.installInitialPage(page) // fresh 抓取的首页是权威：覆盖记忆
      remember()
      return result
    },
    loadOlder() {
      return controller.loadOlder().then(() => { remember() }) // 翻页合并进记忆
    },
    reset() {
      const { key } = snapshotScope()
      saved.delete(key) // 会话删除：连同记忆丢弃
      controller.reset()
    },
  }
}
