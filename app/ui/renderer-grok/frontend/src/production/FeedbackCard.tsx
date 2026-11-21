// B9（1.1.0 re-feedback）：消息级 Good/Bad 反馈卡。原版由服务端下发 feedback entry +
// gRPC VoteGrokBotFeedback；HiveBot 无后端——shim 每轮 assistant 终答后插卡（entries.ts），
// 投票本地持久（localStorage pbots-feedback-v1：entryId→'voted'|'improve'）。
// 文案键：q09Ig0 "How was this response?" / VIfUjY "Good response" / if+kEf "Bad response"
// / LvdLef "Thanks for the feedback!" / KSgnPO "Couldn't send feedback. Try again."。
import { useEffect, useState } from 'react'
import { SandIconButton } from '../recovered/ui/sand-kit-primitives'

const STORE_KEY = 'pbots-feedback-v1'

function readVote(entryId: string): 'voted' | 'improve' | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw === null) return null
    const map = JSON.parse(raw) as Record<string, 'voted' | 'improve'>
    return map[entryId] ?? null
  } catch { return null }
}

function writeVote(entryId: string, v: 'voted' | 'improve'): void {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const map = raw === null ? {} : JSON.parse(raw) as Record<string, 'voted' | 'improve'>
    map[entryId] = v
    localStorage.setItem(STORE_KEY, JSON.stringify(map))
  } catch { /* 读失败降级内存态（不 crash——Review Focus 2） */ }
}

export function FeedbackCard({ entryId }: { entryId: string }) {
  const [vote, setVote] = useState<'voted' | 'improve' | null>(null)
  useEffect(() => { setVote(readVote(entryId)) }, [entryId])
  if (vote !== null) {
    return <div className="sand-feedback-card" data-feedback-card="done" data-feedback-state={vote}>Thanks for the feedback!</div>
  }
  return (
    <div className="sand-feedback-card" data-feedback-card="prompt" role="group" aria-label="How was this response?">
      <span className="sand-feedback-card__label">How was this response?</span>
      <span role="group">
        <SandIconButton aria-label="Good response" icon="thumbs-up" iconVariant="filled" shape="circle" size="sm" variant="ghost"
          onClick={() => { writeVote(entryId, 'voted'); setVote('voted') }} />
        <SandIconButton aria-label="Bad response" icon="thumbs-down" iconVariant="filled" shape="circle" size="sm" variant="ghost"
          onClick={() => { writeVote(entryId, 'improve'); setVote('improve') }} />
      </span>
    </div>
  )
}
