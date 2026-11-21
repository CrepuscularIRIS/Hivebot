// B35：engine 完整循环引擎级证据——local Trigger → receive → decide(accept) → executor.start。
// e2e 层已由 b34 覆盖（intake 激活不炸）；本测试证 mock 下 accept 后 worker assignment 真实启动。
import { expect, it, vi } from 'vitest'
import { localTrigger } from '../src/sources/local-trigger.ts'
import { Engine, MemoryRepositories, type Executor, type Policy, type Trigger } from '../src/core/index.ts'

function setup(strength: 'explicit' | 'inferred' = 'explicit') {
  const repo = new MemoryRepositories()
  let engine!: Engine
  const start = vi.fn(async () => {})
  const deliver = vi.fn(async () => {})
  const executor: Executor = { start, deliver, stop: async () => {} }
  const policy: Policy = { version: 'v1', paused: false, evalTimeoutMs: 600_000,
    gate: () => ({ admissible: true, strength, basis: { via: 'followup' } }),
    revalidate: () => true, admitsInferred: () => true }
  const assessor = { request: () => {}, read: async () => {}, decide: async () => {} }
  engine = new Engine({ repo, policy: () => policy, scope: { scope: () => ({ listened: true as const, observed: true }) },
    assessor, executor, outbox: { send: () => {}, status: () => undefined, withdraw: () => {} } })
  return { engine, repo, start, deliver }
}

it('local trigger → accept → executor.start 启动 worker assignment', () => {
  const { engine, repo, start } = setup()
  const trigger = localTrigger({ sessionId: 's-main', messageId: 'm-1', text: '帮我整理 inbox 里的三份情报', at: new Date().toISOString() })
  const result = engine.receive(trigger)
  expect(result).toBe('stored')
  // 直接 accept（绕过 assessor LLM——e2e 场景里这一步由主会话决策）
  const decision = engine.decide(trigger.id, { kind: 'accept', title: '整理 inbox 情报', scope: 'inbox', reason: 'explicit user request' })
  expect(decision.kind).toBe('accept')
  // ticket 已建
  expect(decision.ticketId).toBeTruthy()
  // executor 被要求启动 assignment（worker 会话由此创建）
  expect(start).toHaveBeenCalled()
  const ticket = repo.tickets.get(decision.ticketId!)
  expect(ticket?.title).toBe('整理 inbox 情报')
})

it('非 admissible gate 的 trigger 不产生 ticket', () => {
  const repo = new MemoryRepositories()
  let engine!: Engine
  const start = vi.fn(async () => {})
  const executor: Executor = { start, deliver: async () => {}, stop: async () => {} }
  const policy: Policy = { version: 'v1', paused: false, evalTimeoutMs: 600_000,
    gate: () => ({ admissible: false as const, reason: 'not listened' }),
    revalidate: () => true, admitsInferred: () => true }
  engine = new Engine({ repo, policy: () => policy, scope: { scope: () => ({ listened: false as const, reason: 'not listened' }) },
    assessor: { request: () => {} }, executor,
    outbox: { send: () => {}, status: () => undefined, withdraw: () => {} } })
  const trigger = localTrigger({ sessionId: 's-main', messageId: 'm-2', text: 'spam', at: new Date().toISOString() })
  engine.receive(trigger)
  expect(start).not.toHaveBeenCalled()
})
