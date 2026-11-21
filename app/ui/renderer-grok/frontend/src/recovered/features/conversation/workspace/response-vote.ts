// D4（1.1.0 锚）：Good/Bad response 反馈。原版锚 chunk-view-bFEl__f6.js：
// S{downLabel:if+kEf(Bad response),onVote,upLabel:VIfUjY(Good response)}；仅 type==='prompt' 渲染；
// state==='voted' → 已投文案（c(n)）。云端 voteFeedback 管道无后端可接——本地持久化（shortcut 标注）。

export type ResponseVote = 'good' | 'bad'

const KEY_PREFIX = 'pbots.shim.response-vote.'

/** 读某条消息的已投状态（无=未投）。 */
export function readResponseVote(entryId: string, storage: Pick<Storage, 'getItem'> = localStorage): ResponseVote | null {
  const raw = storage.getItem(KEY_PREFIX + entryId)
  return raw === 'good' || raw === 'bad' ? raw : null
}

/** 写入投票。 */
export function writeResponseVote(entryId: string, vote: ResponseVote, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(KEY_PREFIX + entryId, vote)
}

/** 已投播报（announce 用）。 */
export function voteAnnouncement(): string {
  return 'Thanks for your feedback'
}
