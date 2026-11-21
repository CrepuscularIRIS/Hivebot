// @vitest-environment happy-dom
// B19: transcript 分页细化（work/b19-transcript-paging/BRIEF.md 规格锚）
// 规格锚（0.78.1 实锤）：
//   - Jyn(e) 行状态机：hasOlder ? (isLoadingOlder?'loading' : isOlderPageFailed?'failed' : 'loadable') : 'exhausted'
//   - 触发器：sentinel div（sand-jm9jq1, aria-hidden）+ IntersectionObserver；loadable|loading 可触发；重试环上限 10
//   - 页大小：翻页 200（n$n 常量）
import { describe, expect, it, vi } from 'vitest'
import { olderHistoryState, shouldTriggerLoadOlder, LOAD_OLDER_RETRY_LIMIT, DEFAULT_LOAD_OLDER_PAGE_LIMIT } from '../../renderer-grok/frontend/src/recovered/features/conversation/workspace/pagination'

describe('B19 分页状态机（0.78.1 Jyn 同款）', () => {
  it('hasOlder=false → exhausted', () => {
    expect(olderHistoryState({ hasOlder: false })).toBe('exhausted')
  })
  it('hasOlder + loading → loading', () => {
    expect(olderHistoryState({ hasOlder: true, isLoadingOlder: true })).toBe('loading')
  })
  it('hasOlder + failed → failed', () => {
    expect(olderHistoryState({ hasOlder: true, isOlderPageFailed: true })).toBe('failed')
  })
  it('hasOlder + 无进行中 → loadable', () => {
    expect(olderHistoryState({ hasOlder: true })).toBe('loadable')
  })
  it('shouldTriggerLoadOlder：loadable|loading → true；exhausted|failed → false', () => {
    expect(shouldTriggerLoadOlder('loadable')).toBe(true)
    expect(shouldTriggerLoadOlder('loading')).toBe(true)
    expect(shouldTriggerLoadOlder('exhausted')).toBe(false)
    expect(shouldTriggerLoadOlder('failed')).toBe(false)
  })
  it('0.78.1 常量：重试上限 10、翻页 200', () => {
    expect(LOAD_OLDER_RETRY_LIMIT).toBe(10)
    expect(DEFAULT_LOAD_OLDER_PAGE_LIMIT).toBe(200)
  })
})
