// P5-51 · shim agent 投影单测：dsh roster/会话态 → 0.18 agent 记录（production/model.ts
// projectRendererAgent 消费）+ persona currentActivity 推导（agent-avatar.tsx activityState 消费）。
import { describe, expect, it } from 'vitest'
import { initView } from '../../../renderer/plugins/session/reduce'
import { activityOf, toAgentRecord } from '../../../renderer-grok/shim/src/agents'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

describe('toAgentRecord · roster → 0.18 agent', () => {
  it('主 bot：id/name/isMain/currentActivity/hasUnread/isRunning 全字段', () => {
    const a = toAgentRecord({
      sessionId: 's1', title: 'Main', isMain: true, running: true, unread: false,
      activity: { kind: 'thinking' }, updatedAt: 1000,
    })
    expect(rec(a).id).toBe('s1')
    expect(rec(a).name).toBe('Main')
    expect(rec(a).isMain).toBe(true)
    expect(rec(a).currentActivity).toEqual({ kind: 'thinking' })
    expect(rec(a).isRunning).toBe(true)
    expect(rec(a).hasUnread).toBeUndefined() // 0.18 只在 true 时带（projectRendererAgent 同型）
  })

  it('无 title → New chat；unread=true 才带 hasUnread', () => {
    expect(rec(toAgentRecord({ sessionId: 's2', title: null, isMain: false, running: false, unread: true, activity: null, updatedAt: 1 })).name).toBe('New chat')
    expect(rec(toAgentRecord({ sessionId: 's2', title: null, isMain: false, running: false, unread: true, activity: null, updatedAt: 1 })).hasUnread).toBe(true)
  })

  it('待决审批 → awaitingUserResponse 非空（persona 转 idle 等待）', () => {
    const a = toAgentRecord({ sessionId: 's3', title: null, isMain: false, running: false, unread: false, activity: null, updatedAt: 1, awaitingApproval: true })
    expect(rec(a).awaitingUserResponse).toEqual({ reason: 'local-tool-permission' })
  })
})

describe('activityOf · view → currentActivity（persona 状态映射）', () => {
  it('空闲 → null；回合中无工具 → thinking', () => {
    expect(activityOf(initView('s'))).toBeNull()
    const thinking = initView('s')
    thinking.running = true
    expect(activityOf(thinking)).toEqual({ kind: 'thinking' })
  })

  it('bash 运行中 → running-commands（persona working）；web_fetch → WebFetch（searching）', () => {
    const v = initView('s')
    v.running = true
    v.items = [{ kind: 'tool', id: 'tool-c1', callId: 'c1', name: 'bash', args: '{}', status: 'running', result: null, awaiting: false, decision: null }]
    expect(activityOf(v)).toEqual({ verb: 'running-commands' })
    v.items = [{ kind: 'tool', id: 'tool-c2', callId: 'c2', name: 'web_fetch', args: '{}', status: 'running', result: null, awaiting: false, decision: null }]
    expect(activityOf(v)).toEqual({ tool: 'WebFetch' })
  })

  it('工具都已 done → 回到 thinking（仍有正文要写）', () => {
    const v = initView('s')
    v.running = true
    v.items = [{ kind: 'tool', id: 'tool-c1', callId: 'c1', name: 'bash', args: '{}', status: 'done', result: 'x', awaiting: false, decision: null }]
    expect(activityOf(v)).toEqual({ kind: 'thinking' })
  })
})
