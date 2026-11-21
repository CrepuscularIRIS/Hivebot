// B32 Task 2（plan Task 2）：masterSessionId 钉定——pin 优先/已存值/回落/空串当未配置。
import { describe, expect, it } from 'vitest'
import { resolveMasterId } from '../src/app/master-id.js'

describe('B32 主 bot 会话钉定', () => {
  it('pin 优先于已存值与默认值', () => {
    expect(resolveMasterId('main-bot', undefined, 'orchestrator-old', 'orchestrator-fb')).toBe('main-bot')
  })
  it('无 pin 时用已存值（重启不换会话）', () => {
    expect(resolveMasterId(undefined, undefined, 'orchestrator-old', 'orchestrator-fb')).toBe('orchestrator-old')
  })
  it('两者皆缺回落默认', () => {
    expect(resolveMasterId(undefined, undefined, undefined, 'orchestrator-fb')).toBe('orchestrator-fb')
  })
  it('空串 pin 视为未配置（换绑后清空即回退）', () => {
    expect(resolveMasterId('', undefined, 'orchestrator-old', 'orchestrator-fb')).toBe('orchestrator-old')
  })
})
