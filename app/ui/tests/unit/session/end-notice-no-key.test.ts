// T50a：缺 key 引导 endNotice——真帧喂测（不喂自编形状）。
// 真帧来源：receipts/T50a.receipt.md §0 探针（real 无 key、桩 0 请求，turn/end 原样）。
import { describe, expect, it } from 'vitest'
import { initView, reduceFollow, NO_KEY_NOTICE, type SessionView } from '../../../renderer/session/reduce'

// [T50a-raw] §0 探针 turn/end 原样（message 为上游原文，含引导语义；匹配只认 failure.code）：
const TURN_END_NO_KEY_RAW = { type: 'event', event: { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', failure: { message: 'llm-pi-ai: no credential for provider route "litellm"; its profile resolves P2SDK_LLM_API_KEY, which is not set — store P2SDK_LLM_API_KEY through the credentials service (the web Models page writes it) or export it, and remove apiKeyEnv only if this provider should authenticate from pi-ai\'s own environment discovery', code: 'MISSING_CREDENTIAL' } } } } }

const run = (frames: unknown[], v: SessionView = initView('s')): SessionView => frames.reduce<SessionView>((acc, f) => reduceFollow(acc, f), v)

describe('T50a 缺 key endNotice（真帧）', () => {
  it('真帧 turn/end（failure.code=MISSING_CREDENTIAL）→ NO_KEY_NOTICE + action open-models', () => {
    const v = run([TURN_END_NO_KEY_RAW])
    expect(v.items.at(-1)).toEqual({ kind: 'notice', id: 'end-1', tone: 'danger', text: NO_KEY_NOTICE, action: 'open-models' })
  })
  it('live 帧形状（error.code=MISSING_CREDENTIAL，t50a-no-key e2e 快照实证）→ 同样触发引导', () => {
    const v = run([{ type: 'event', event: { type: 'turn/end', data: { turn: 2, reason: { kind: 'error', error: { message: 'llm-pi-ai: no credential for provider route "litellm"', code: 'MISSING_CREDENTIAL' } } } } }])
    expect(v.items.at(-1)).toEqual({ kind: 'notice', id: 'end-2', tone: 'danger', text: NO_KEY_NOTICE, action: 'open-models' })
  })
  it('正对照：普通错误（error.message）→ 回复失败：… 且无 action', () => {
    const v = run([{ type: 'event', event: { type: 'turn/end', data: { turn: 3, reason: { kind: 'error', message: 'boom' } } } }])
    expect(v.items.at(-1)).toEqual({ kind: 'notice', id: 'end-3', tone: 'danger', text: '回复失败：boom' })
  })
  it('正对照：failure.code 是别的 code → 不触发引导（按 code 不按 message）', () => {
    const v = run([{ type: 'event', event: { type: 'turn/end', data: { turn: 4, reason: { kind: 'error', failure: { message: 'no credential for provider route "litellm"', code: 'OTHER' } } } } }])
    const last = v.items.at(-1)
    expect(last).toMatchObject({ kind: 'notice', tone: 'danger' })
    expect(last).not.toHaveProperty('action')
    expect((last as { text: string }).text).not.toBe(NO_KEY_NOTICE)
  })
})
