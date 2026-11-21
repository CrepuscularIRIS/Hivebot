// T-taint.f1 verifier 探针（验收项 7 坏路径/可用性口径）：普通用户回合（claim
// 'user'）连发 create_bot → send_to_bot → stop_bot，三工具 when 全真、execute
// 全链成功（create 真实走通道拿 sessionId、send 直达 delivery、stop 真实 cancel）。
// rig 抄自 orchestration-taintf1.test.ts + create.test.ts f2Rig（通道带订阅者）。
// 验收临时探针：复制到 tests/unit/ 跑，跑完删除，不进 git。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots } from '../../src/orchestration/slots.mjs'
import { CreateChannel } from '../../src/orchestration/main-channel.mjs'
import { registerCreateBot } from '../../src/orchestration/create.mjs'
import { registerSendToBot, SEND_TO_BOT_TOOL } from '../../src/orchestration/send.mjs'
import { registerStopBot, STOP_BOT_TOOL } from '../../src/orchestration/stop.mjs'

process.env.HOME = tmkdir('bot-ttaintf1-chain-home-')

function fakeAgent(id: string, init: { status?: string } = {}) {
  return {
    id,
    status: init.status ?? 'idle',
    inbox: { nextTurn: [], nextStep: [] },
    followups: [] as object[],
    followup(this: any, message: object) { this.followups.push(message) },
    cancels: [] as Array<[object, object | undefined]>,
    cancel(this: any, cause: object, options?: object) { this.cancels.push([cause, options]) },
  }
}

describe('T-taint.f1 vfy probe: clean user turn full chain create→send→stop usable', () => {
  it('one user-claimed turn: all three when=true and executes succeed in order', async () => {
    const dir = tmkdir('bot-ttaintf1-chain-')
    // recipes 空、无 bots：create 经通道拿到 session-w1（fake main 应答）
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {}, bots: { 'session-w1': { createdBy: 'session-main' }, 'session-w2': { createdBy: 'session-main' } } }))
    const tools = new Map<string, { definition: any, options: any }>()
    const handlers: Record<string, Array<(...args: any[]) => void>> = {}
    const ctx = {
      tools: { register: (d: any, o: any) => { tools.set(d.name, { definition: d, options: o }) } },
      sessionPersistence: { flush: async () => {} },
      on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
    }
    const w = fakeAgent('session-w1', { status: 'running' })
    const w2 = fakeAgent('session-w2')
    const agentMap = new Map([['session-w1', w], ['session-w2', w2]])
    const sends: Array<{ agentId: string }> = []
    const channel = new CreateChannel({ timeoutMs: 5_000 })
    const sub = { peer: 'peer-main', queue: [] as Array<Record<string, unknown>>, wake: undefined as undefined | (() => void) }
    channel.attach(sub)
    const orch = {
      config: { dataDir: dir },
      slots: new Slots(3),
      slotHolds: new Map(),
      channel,
      agentOf: async (id: string) => {
        const a = agentMap.get(id)
        if (a === undefined) throw Object.assign(new Error('unresolvable'), { code: 'pbots/orchestration-failed' })
        return a
      },
      delivery: { send: async (agent: any, _message: any) => { sends.push({ agentId: agent.id }); return { skipped: false } } },
    }
    registerCreateBot(ctx as any, orch as any)
    registerSendToBot(ctx as any, orch as any)
    registerStopBot(ctx as any, orch as any)
    const create = tools.get('create_bot')!
    const send = tools.get(SEND_TO_BOT_TOOL)!
    const stop = tools.get(STOP_BOT_TOOL)!
    const main = { id: 'session-main' }

    // 普通用户回合：回合开始 claim 'user'（同一回合内连发三工具）
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: 'session-main' }, message: { id: 'm-1', source: { kind: 'user' } }, turn: 1 }, undefined)
    }

    // ① create_bot：when=true，execute 真实走通道（自动应答成功）→ assign 已投
    expect(await create.options.when({ agent: main })).toBe(true)
    const createP = create.definition.execute({ name: 'w1', prompt: 'task' }, { agent: main })
    const settled = () => new Promise((res) => setImmediate(res))
    while (sub.queue.length < 1) await settled()
    const req = sub.queue[0] as { requestId: string }
    channel.respond(req.requestId, { value: { sessionId: 'session-w1' } }, 'peer-main')
    const created: any = await createP
    expect(created).toMatchObject({ sessionId: 'session-w1' })
    expect(sends).toHaveLength(1) // assign 投递（create 第 6 步）

    // ② send_to_bot：when=true，execute 直达 delivery（assign 之后第 2 次 send）
    expect(await send.options.when({ agent: main })).toBe(true)
    const sent: any = await send.definition.execute({ botId: 'session-w2', prompt: 'hello' }, { agent: main })
    expect(sent).toMatchObject({ sessionId: 'session-w2' })
    expect(sends).toHaveLength(2)

    // ③ stop_bot：when=true，execute 真实 cancel（cancels=1）
    expect(await stop.options.when({ agent: main })).toBe(true)
    const stopped: any = await stop.definition.execute({ botId: 'session-w1' }, { agent: main })
    expect(stopped).toMatchObject({ accepted: true, wasRunning: true })
    expect(w.cancels).toHaveLength(1)
  })
})
