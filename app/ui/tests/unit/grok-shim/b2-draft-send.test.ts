// B2.1 单测：sendDraft 失败状态机（RE-DRAFT-SEND-1.1.0.md 规格——1s tick / refused / unconfirmed 超时）。
// rig 照 b1a-delete-agents.test.ts（createShimData + mock api + 内存 store + stubGlobal window）。
import { afterEach, describe, expect, it, vi } from 'vitest'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v != null ? v as Record<string, unknown> : {})

describe('B2.1 sendDraft 失败状态机', () => {
  afterEach(() => vi.unstubAllGlobals())

  const mkData = async (apiImpl?: (m: string, a?: unknown) => unknown) => {
    const m = new Map<string, string>()
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) },
    } as unknown as Storage
    vi.stubGlobal('window', { localStorage: store })
    const calls: Array<{ method: string; args?: unknown }> = []
    const api = async (method: string, args?: unknown) => {
      calls.push({ method, args })
      if (apiImpl) return apiImpl(method, args)
      if (method === 'session/prompt') return { ok: true, value: {} }
      return { ok: true, value: {} }
    }
    const { createShimData } = await import('../../../renderer-grok/shim/src/data')
    const data = createShimData({
      authId: 't',
      api,
      metaApi: () => Promise.resolve({ ok: true, value: { mainBotId: 'main' } }),
    } as never)
    return { data, calls, store }
  }

  it('① session/prompt 失败 → entry 进 refused 态（文案锚：Didn\'t go through）', async () => {
    const { data } = await mkData((method) => method === 'session/prompt' ? { ok: false, error: { message: 'boom' } } : { ok: true, value: {} })
    const r = await data.dev.sendDraft('bot-1', 'hello')
    expect(r.ok).toBe(false)
    const st = data.dev.draftSendState('bot-1')
    expect(st?.state).toBe('refused')
    expect(st?.error).toBe('boom')
  })

  it('② 无回执（unconfirmed）超时 → tick 判定转 timed-out（文案锚：Unconfirmed/Not delivered yet）', async () => {
    vi.useFakeTimers()
    try {
      const { data } = await mkData()
      // prompt ok 但 SDK 不回执（fake：不产生 follow 帧）
      const r = await data.dev.sendDraft('bot-1', 'hello', { inFlightUntilMs: Date.now() + 2_000 })
      expect(r.ok).toBe(true)
      expect(data.dev.draftSendState('bot-1')?.state).toBe('unconfirmed')
      await vi.advanceTimersByTimeAsync(2_100)
      expect(data.dev.draftSendState('bot-1')?.state).toBe('timed-out')
    } finally { vi.useRealTimers() }
  })

  it('③ discardDraft → 状态清空（文案锚：Discarded）', async () => {
    const { data } = await mkData((method) => method === 'session/prompt' ? { ok: false, error: { message: 'x' } } : { ok: true, value: {} })
    await data.dev.sendDraft('bot-1', 'hello')
    expect(data.dev.draftSendState('bot-1')?.state).toBe('refused')
    data.dev.discardDraft('bot-1')
    expect(data.dev.draftSendState('bot-1')).toBeUndefined()
  })

  it('④ retry：refused 后重发成功 → 状态清空（文案锚：Failed to send → Retry）', async () => {
    let fail = true
    const { data, calls } = await mkData((method) => method === 'session/prompt' ? (fail ? { ok: false, error: { message: 'offline' } } : { ok: true, value: {} }) : { ok: true, value: {} })
    const r1 = await data.dev.sendDraft('bot-1', 'hello')
    expect(r1.ok).toBe(false)
    fail = false
    const r2 = await data.dev.retryDraft('bot-1')
    expect(r2.ok).toBe(true)
    // 1.1.0 语义：发送成功→unconfirmed（等 follow 帧确认，非立即清空）
    expect(data.dev.draftSendState('bot-1')?.state).toBe('unconfirmed')
    // 回执到达 → 清空
    data.dev.testFollowItem('bot-1', { type: 'event', event: { type: 'user/message', data: { source: { kind: 'user', rpcId: (r2 as { nonce?: string }).nonce }, content: [{ type: 'text', text: 'hello' }] } } })
    expect(data.dev.draftSendState('bot-1')).toBeUndefined()
    expect(calls.filter((c) => c.method === 'session/prompt').length).toBe(2)
  })

  it('⑤ follow 帧到达（nonce 命中）→ unconfirmed 确认转清空', async () => {
    const { data } = await mkData()
    const r = await data.dev.sendDraft('bot-1', 'hello')
    expect(r.ok).toBe(true)
    const nonce = (r as { nonce?: string }).nonce
    expect(data.dev.draftSendState('bot-1')?.state).toBe('unconfirmed')
    // 用户消息帧到达（source.rpcId = nonce——L-7 R4 同源）
    data.dev.testFollowItem('bot-1', { type: 'event', event: { type: 'user/message', data: { source: { kind: 'user', rpcId: nonce }, content: [{ type: 'text', text: 'hello' }] } } })
    expect(data.dev.draftSendState('bot-1')).toBeUndefined()
  })
})
