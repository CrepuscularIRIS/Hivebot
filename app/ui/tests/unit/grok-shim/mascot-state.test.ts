// T88b 验收 2：personaStateFromAgent 状态机单测——JZe 15 动词逐条 + hO 门（awaiting→blocked、
// null+running→working、composing→thinking、idle）+ lO 工具映射（含 Task→working 修正项）。
import { describe, expect, it } from 'vitest'
import { personaStateFromAgent } from '../../../renderer-grok/overrides/modules/agent-avatar'

const act = (v: unknown) => ({ currentActivity: v, isRunning: true, isComposingMessage: false, awaitingUserResponse: null })

describe('T88b mascot 状态机', () => {
  it('① JZe 15 动词逐条（activity.verb 路径）', () => {
    const JZE: Record<string, string> = {
      thinking: 'thinking', searching: 'searching', browsing: 'reading', reading: 'reading', connecting: 'orbit',
      writing: 'writing', coding: 'coding', generating: 'progress', 'running-commands': 'running', 'on-its-computer': 'computing',
      'on-your-computer': 'controlling', working: 'working', messaging: 'sending', sending: 'sending', waiting: 'waiting',
    }
    for (const [verb, state] of Object.entries(JZE)) {
      expect(personaStateFromAgent(act({ kind: 'tool', verb })), `verb ${verb}`).toBe(state)
    }
  })
  it('② kind:thinking 直达；lO 工具映射（Task→working 修正/Await→waiting/Bash→running/WebFetch→browsing→reading/browser_→browsing）', () => {
    expect(personaStateFromAgent(act({ kind: 'thinking' }))).toBe('thinking')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'Task' })), 'Task→working（0.78.1 lO 非分支默认）').toBe('working')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'Await' }))).toBe('waiting')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'Bash' }))).toBe('running')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'WebFetch' }))).toBe('reading')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'browser_click' }))).toBe('reading')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'WhateverNewTool' })), '未知工具→working').toBe('working')
    expect(personaStateFromAgent(act({ kind: 'tool', tool: 'Grep' })), 'Grep 无分支→working').toBe('working')
  })
  it('③ hO 门：awaiting→blocked（0.78.1，优先于一切）；composing→thinking；null+running→working；静止→idle', () => {
    expect(personaStateFromAgent({ awaitingUserResponse: { q: 1 }, currentActivity: { kind: 'thinking' }, isRunning: true, isComposingMessage: false })).toBe('blocked')
    expect(personaStateFromAgent({ awaitingUserResponse: null, currentActivity: null, isRunning: true, isComposingMessage: true })).toBe('thinking')
    expect(personaStateFromAgent(act(null))).toBe('working')
    expect(personaStateFromAgent({ awaitingUserResponse: null, currentActivity: null, isRunning: false, isComposingMessage: false })).toBe('idle')
  })
})
