// P5-51 · shim agent 投影单测：dsh roster/会话态 → 0.18 agent 记录（production/model.ts
// projectRendererAgent 消费）+ persona currentActivity 推导（agent-avatar.tsx activityState 消费）。
import { describe, expect, it } from 'vitest'
import { initView } from '../../../renderer/plugins/session/reduce'
import { activityOf, toAgentRecord } from '../../../renderer-grok/shim/src/agents'
import { personaStateFromAgent } from '../../../renderer-grok/frontend/src/recovered/features/conversation/workspace/agent-avatar'

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

  // P5-56：dsh 工具名 → 0.78.1 原版 activity（sand-activity.ts deriveToolCallActivity 的 {kind:'tool',tool}）
  // → 上游 agent-avatar personaStateFromAgent 的 persona 态。全表对照 R4 dsh 工具名单。
  const running = (name: string): ReturnType<typeof initView> => {
    const v = initView('s')
    v.running = true
    v.items = [{ kind: 'tool', id: `tool-${name}`, callId: name, name, args: '{}', status: 'running', result: null, awaiting: false, decision: null }]
    return v
  }
  it.each([
    ['bash', 'Shell', 'working'], ['read', 'Read', 'working'], ['read_image', 'Read', 'working'],
    ['write', 'write', 'working'], ['edit', 'edit', 'working'], ['glob', 'glob', 'working'], ['grep', 'grep', 'working'],
    ['web_fetch', 'WebFetch', 'searching'], ['web_search', 'WebSearch', 'searching'],
    ['subagent', 'Task', 'orbit'], ['subagent_fork', 'Task', 'orbit'], ['workflow', 'Task', 'orbit'],
    ['send_message', 'SendToAgent', 'sending'], ['todo_write', 'todo_write', 'working'],
  ])('%s 运行中 → tool=%s（persona %s）', (name, tool, state) => {
    const activity = activityOf(running(name))
    expect(activity).toEqual({ kind: 'tool', tool })
    expect(personaStateFromAgent({ currentActivity: activity, isRunning: true, awaitingUserResponse: null })).toBe(state)
  })

  it('并行工具：最后一个已 done、前一个仍 running → 取仍在跑的那个', () => {
    const v = running('web_fetch')
    v.items = [...v.items, { kind: 'tool', id: 'tool-b', callId: 'b', name: 'bash', args: '{}', status: 'done', result: 'x', awaiting: false, decision: null }]
    expect(activityOf(v)).toEqual({ kind: 'tool', tool: 'WebFetch' })
  })

  it('前回合遗留的 running 工具（被打断未收尾）不串进本回合 → thinking', () => {
    const v = running('bash')
    v.items = [...v.items, { kind: 'user', id: 'u2', text: '下一句' }]
    expect(activityOf(v)).toEqual({ kind: 'thinking' })
  })

  it('待决审批：awaitingUserResponse 压过活动 → idle；回合结束 → idle', () => {
    expect(personaStateFromAgent({ currentActivity: activityOf(running('bash')), isRunning: true, awaitingUserResponse: { reason: 'local-tool-permission' } })).toBe('idle')
    expect(personaStateFromAgent({ currentActivity: activityOf(initView('s')), isRunning: false, awaitingUserResponse: null })).toBe('idle')
  })

  it('工具都已 done → 回到 thinking（仍有正文要写）', () => {
    const v = initView('s')
    v.running = true
    v.items = [{ kind: 'tool', id: 'tool-c1', callId: 'c1', name: 'bash', args: '{}', status: 'done', result: 'x', awaiting: false, decision: null }]
    expect(activityOf(v)).toEqual({ kind: 'thinking' })
  })
})
