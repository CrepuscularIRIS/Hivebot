// T-taint verifier 探针（验收项 6「可用」口径）：goal 来源回合内 send_to_bot
// 的 execute 是否仍可用（未被 coordinatorTainted 拒）。rig 抄自
// orchestration-send.test.ts 最小宿主（真实 registerCreateBot+registerSendToBot）。
// 此文件为验收临时探针：复制到 tests/unit/ 跑，跑完删除，不进 git。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots } from '../../src/orchestration/slots.mjs'
import { registerCreateBot } from '../../src/orchestration/create.mjs'
import { registerSendToBot, SEND_TO_BOT_TOOL } from '../../src/orchestration/send.mjs'

process.env.HOME = tmkdir('bot-ttaint-vfy-send-home-')

function fakeAgent(id: string, init: { status?: string } = {}) {
  return {
    id,
    status: init.status ?? 'idle',
    inbox: { nextTurn: [], nextStep: [] },
    followups: [] as object[],
    followup(this: any, message: object) { this.followups.push(message) },
  }
}

describe('T-taint vfy probe: goal round send_to_bot still usable (残留事实实证)', () => {
  const dir = tmkdir('bot-ttaint-vfy-send-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('goal-claimed turn: send execute NOT rejected by coordinator taint (goes through to delivery)', async () => {
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {}, bots }))
    const tools = new Map<string, { definition: any, options: any }>()
    const handlers: Record<string, Array<(...args: any[]) => void>> = {}
    const ctx = {
      tools: { register: (d: any, o: any) => { tools.set(d.name, { definition: d, options: o }) } },
      sessionPersistence: { flush: async () => {} },
      on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
    }
    const agents = new Map([['session-w1', fakeAgent('session-w1')]])
    const sends: Array<{ agentId: string }> = []
    const orch = {
      config: { dataDir: dir },
      slots: new Slots(3),
      agentOf: async (id: string) => {
        const a = agents.get(id)
        if (a === undefined) throw Object.assign(new Error('unresolvable'), { code: 'pbots/orchestration-failed' })
        return a
      },
      delivery: { send: async (agent: any, _message: any) => { sends.push({ agentId: agent.id }); return { skipped: false } } },
    }
    registerCreateBot(ctx as any, orch as any)
    registerSendToBot(ctx as any, orch as any)
    const send = tools.get(SEND_TO_BOT_TOOL)!
    const when = (agent: { id: string }) => send.options.when({ agent })
    const call = (args: any, agent = { id: 'session-main' }) => send.definition.execute(args, { agent })

    // goal 来源回合（T-taint 后对 create_bot 是污染，对 send 应仍按 .tainted 判定=不拒）
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: 'session-main' }, message: { id: 'm-1', source: { kind: 'goal' } }, turn: 1 }, undefined)
    }
    expect(await when({ id: 'session-main' })).toBe(true) // 可见（残留：未接 coordinatorTainted）
    const result: any = await call({ botId: 'session-w1', prompt: 'p' })
    expect(result).toMatchObject({ sessionId: 'session-w1' }) // 可用：execute 未被污染拒，直达 delivery（返回 assignment 形态）
    expect(sends).toHaveLength(1)
  })

  it('schedule-claimed turn: send when still true (对照既有 R2-1 口径)', async () => {
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {}, bots }))
    const tools = new Map<string, { definition: any, options: any }>()
    const handlers: Record<string, Array<(...args: any[]) => void>> = {}
    const ctx = {
      tools: { register: (d: any, o: any) => { tools.set(d.name, { definition: d, options: o }) } },
      sessionPersistence: { flush: async () => {} },
      on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
    }
    const agents = new Map([['session-w1', fakeAgent('session-w1')]])
    const orch = {
      config: { dataDir: dir },
      slots: new Slots(3),
      agentOf: async (id: string) => agents.get(id)!,
      delivery: { send: async () => ({ skipped: false }) },
    }
    registerCreateBot(ctx as any, orch as any)
    registerSendToBot(ctx as any, orch as any)
    const send = tools.get(SEND_TO_BOT_TOOL)!
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: 'session-main' }, message: { id: 'm-2', source: { kind: 'schedule' } }, turn: 2 }, undefined)
    }
    expect(await send.options.when({ agent: { id: 'session-main' } })).toBe(true)
  })
})
