import { describe, it, expect } from 'vitest'
import { allowedSender, settingsPolicy } from '../src/policy.ts'
import type { Settings } from '../src/settings.ts'

// 纠错轮二（Codex 复测 #6）：本地 owner 默认放行——本地源无外部信任边界，
// 默认 not_a_member 挡掉用户最常走的路径（主 bot 会话消息全被拒）。
const base: Settings = {
  paused: false,
  eval: { mode: 'observe', timeoutSeconds: 120 },
  policy: { rules: [], sources: {} },
} as unknown as Settings

describe('policy local 源默认准入（Codex 复测 #6）', () => {
  it('local 源未显式配置时 owner 默认放行', () => {
    const r = allowedSender(base, { source: 'local', id: 'person' })
    expect(r?.id).toBe('person')
  })
  it('local 源显式配置后按显式表走（不注入默认）', () => {
    const s = { ...base, policy: { rules: [], sources: { local: { allowed: [{ id: 'alice', name: 'Alice' }] } } } } as unknown as Settings
    expect(allowedSender(s, { source: 'local', id: 'person' })).toBeUndefined()   // 显式表没这个人=不放行
    expect(allowedSender(s, { source: 'local', id: 'alice' })?.id).toBe('alice')
  })
  it('非 local 源不受默认放行影响', () => {
    expect(allowedSender(base, { source: 'github', id: 'person' })).toBeUndefined()
  })
})
