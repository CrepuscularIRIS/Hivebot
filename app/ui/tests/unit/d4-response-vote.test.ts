// D4 单测：Good/Bad response 本地投票。
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { readResponseVote, writeResponseVote } from '../../renderer-grok/frontend/src/recovered/features/conversation/workspace/response-vote'

describe('D4 response-vote', () => {
  beforeEach(() => localStorage.clear())

  it('写入后可读回；未投为 null', () => {
    expect(readResponseVote('e1')).toBeNull()
    writeResponseVote('e1', 'good')
    expect(readResponseVote('e1')).toBe('good')
    writeResponseVote('e2', 'bad')
    expect(readResponseVote('e2')).toBe('bad')
  })

  it('脏值容错回 null', () => {
    localStorage.setItem('pbots.shim.response-vote.e3', 'meh')
    expect(readResponseVote('e3')).toBeNull()
  })

  it('键隔离 per entry', () => {
    writeResponseVote('a', 'good')
    expect(readResponseVote('b')).toBeNull()
  })
})
