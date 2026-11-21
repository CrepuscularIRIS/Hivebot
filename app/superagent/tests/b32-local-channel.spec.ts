// B32 Task 4（plan Task 4）：local channel 回写——inject notice，不伪造 user 消息。
import { describe, expect, it, vi } from 'vitest'
import { sendLocal } from '../src/sources/local-channel.js'
import type { OutboundMessage } from '../src/core/index.js'

const message = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
  id: 'reply-1', kind: 'reply', text: 'PR 已提，等 review',
  channel: { source: 'local', thread: 'local:main-1', address: { session: 'main-1' } }, ...over,
}) as OutboundMessage

describe('B32 local 回写', () => {
  it('投到会话，requestId = 消息 id（重投幂等）', async () => {
    const deliver = vi.fn(async () => {})
    await expect(sendLocal(deliver)({}, message())).resolves.toBe('sent')
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith({ sessionId: 'main-1', requestId: 'reply-1', text: 'PR 已提，等 review' })
  })
  it('地址缺 session → gone，不投', async () => {
    const deliver = vi.fn(async () => {})
    await expect(sendLocal(deliver)({}, message({ channel: { source: 'local', thread: 'x', address: {} } } as Partial<OutboundMessage>))).resolves.toBe('gone')
    expect(deliver).not.toHaveBeenCalled()
  })
  it('投递失败向上抛（Outbox 重试），不吞', async () => {
    const deliver = vi.fn(async () => { throw new Error('boom') })
    await expect(sendLocal(deliver)({}, message())).rejects.toThrow('boom')
  })
})
