// P6-11 纯单测：D9② 目标白名单（createdBy = 当前主 bot；自身/未知/他人 worker →
// forbidden 且目标 prompt 计数 0）、D9⑩ busy（running / inbox 待认领（含用户刚发
// 的消息）/ 已有 hold / 在途 send）、决策 9 容量（send 与 create 共用同一计数、
// 同 tick 原子、D9⑥′ 并发恰 limit 成功）、决策 11 包装句、决策 29 污染回合拒、
// UI 对接（实参别名 botId|bot|workerId|sessionId|id 与 prompt|message|text、
// 错误码 code: 前缀进 message）。真 Loader 用例在 orchestration-send-live.test.ts。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots } from '../../src/orchestration/slots.mjs'
import { registerCreateBot, relayText } from '../../src/orchestration/create.mjs'
import { registerSendToBot, SEND_TO_BOT_TOOL, sendRelayText } from '../../src/orchestration/send.mjs'
import * as orchestration from '../../src/orchestration/index.mjs'

process.env.HOME = tmkdir('bot-p611-home-')

/** fake worker agent：status + live inbox + followup 记录（prompt 计数即 sends）。 */
function fakeAgent(id: string, init: { status?: string, nextTurn?: object[] } = {}) {
  return {
    id,
    status: init.status ?? 'idle',
    inbox: { nextTurn: init.nextTurn ?? [], nextStep: [] },
    followups: [] as object[],
    followup(this: any, message: object) { this.followups.push(message) },
  }
}

/**
 * 最小宿主：真实 registerCreateBot + registerSendToBot 挂同一 orch 实例
 * （P6-10.f1 交接：turns / slotHolds 账本共用，勿另建）。delivery 默认记录 send。
 */
function rig(dataDir: string, opts: {
  limit?: number,
  agents?: Array<ReturnType<typeof fakeAgent>>,
  agentOf?: (id: string) => Promise<any>,
  failDelivery?: Error,
} = {}) {
  const tools = new Map<string, { definition: any, options: any }>()
  const handlers: Record<string, Array<(...args: any[]) => void>> = {}
  const off = (name: string, fn: any) => { handlers[name] = (handlers[name] ?? []).filter((f) => f !== fn) }
  const ctx = {
    tools: { register: (d: any, o: any) => { tools.set(d.name, { definition: d, options: o }) } },
    sessionPersistence: { flush: async () => {} },
    on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => off(name, fn) },
  }
  const agents = new Map((opts.agents ?? []).map((a) => [a.id, a]))
  const sends: Array<{ agentId: string, message: any }> = []
  const orch = {
    config: { dataDir },
    slots: new Slots(opts.limit ?? 3),
    agentOf: opts.agentOf ?? (async (id: string) => {
      const a = agents.get(id)
      if (a === undefined) {
        throw Object.assign(new Error(`worker session ${id} unresolvable: nope`), { code: 'pbots/orchestration-failed' })
      }
      return a
    }),
    delivery: {
      send: async (agent: any, message: any) => {
        if (opts.failDelivery) throw opts.failDelivery
        sends.push({ agentId: agent.id, message })
        return { skipped: false }
      },
    },
  }
  registerCreateBot(ctx as any, orch as any)
  registerSendToBot(ctx as any, orch as any)
  const send = tools.get(SEND_TO_BOT_TOOL)!
  const fireTurnEnd = (id: string) => { for (const fn of handlers['session/event'] ?? []) fn({ id }, { type: 'turn/end' }) }
  const claim = (agentId: string, turn: number, kind: unknown) => {
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: agentId }, message: { id: `m-${turn}`, source: typeof kind === 'string' ? { kind } : kind }, turn }, undefined)
    }
  }
  const call = (args: any, agent = { id: 'session-main' }) => send.definition.execute(args, { agent })
  const when = (agent: { id: string }) => send.options.when({ agent })
  return { orch, send, call, when, claim, fireTurnEnd, agents, sends }
}

const writeBots = (dir: string, mainBotId: string | null, bots?: Record<string, { createdBy: string }>) => {
  writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, ...(bots ? { bots } : {}) }))
}

// ---- D9②：目标白名单（只许 createdBy = 当前主 bot；prompt 计数 0） ----

describe('send_to_bot target guard (D9②)', () => {
  const dir = tmkdir('bot-p611-guard-')
  const bots = { 'session-w1': { createdBy: 'session-main' }, 'session-w2': { createdBy: 'session-other' } }

  it('happy: own worker gets one pbots-assign with relay text (D7 SDK 前半)', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir, { agents: [fakeAgent('session-w1')] })
    const out = await call({ botId: 'session-w1', prompt: '把结果再核对一遍' })
    expect(sends).toHaveLength(1)
    expect(sends[0].agentId).toBe('session-w1')
    expect(String(sends[0].message.id).startsWith('pbots-assign:')).toBe(true)
    expect(sends[0].message.source.kind).toBe('pbots-main')
    expect(sends[0].message.source.assignmentId).toBe(out.assignmentId)
    expect(sends[0].message.source.mainBotId).toBe('session-main')
    expect(sends[0].message.content[0].text).toBe(sendRelayText('把结果再核对一遍'))
    expect(out.sessionId).toBe('session-w1')
  })

  it('unknown id → forbidden, prompt 计数 0', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir)
    await expect(call({ botId: 'session-nobody', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(sends).toHaveLength(0)
  })

  it('plain bot (not a worker) → forbidden', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir)
    await expect(call({ botId: 'session-plain', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(sends).toHaveLength(0)
  })

  it("another main's worker → forbidden", async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir, { agents: [fakeAgent('session-w2')] })
    await expect(call({ botId: 'session-w2', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(sends).toHaveLength(0)
  })

  it('self (main bot id) → forbidden', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir)
    await expect(call({ botId: 'session-main', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(sends).toHaveLength(0)
  })

  it('unreadable bots.json → fail closed at identity (pbots/unavailable，同 create 口径)', async () => {
    writeFileSync(join(dir, 'bots.json'), '{broken')
    const { call, sends } = rig(dir)
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/unavailable' })
    expect(sends).toHaveLength(0)
  })
})

// ---- D9⑩ / 决策 13：目标忙 → pbots/busy，不排队、不 steer ----

describe('send_to_bot busy (D9⑩)', () => {
  const dir = tmkdir('bot-p611-busy-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('target turn running → busy, prompt 计数 0, slot released', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends, orch } = rig(dir, { agents: [fakeAgent('session-w1', { status: 'running' })] })
    const error = await call({ botId: 'session-w1', prompt: 'p' }).then(() => undefined, (e: any) => e)
    expect(error?.code).toBe('pbots/busy')
    expect(String(error?.message).startsWith('pbots/busy: ')).toBe(true) // UI 对接：code: 前缀
    expect(sends).toHaveLength(0)
    expect(orch.slots.used).toBe(0)
  })

  it('user just messaged the worker (input pending in next-turn, agent still idle) → busy', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir, { agents: [fakeAgent('session-w1', { nextTurn: [{ id: 'user-msg' }] })] })
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/busy' })
    expect(sends).toHaveLength(0)
  })

  it('an existing slot hold (manual run / in-flight create) → busy without touching the agent', async () => {
    writeBots(dir, 'session-main', bots)
    let resolved = 0
    const { call, sends, orch } = rig(dir, {
      agentOf: async (id: string) => { resolved += 1; return fakeAgent(id) },
    })
    orch.slotHolds.set('session-w1', 'turn') // 手动跑起来的 worker：trackWorkerTurns 的 hold
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/busy' })
    expect(sends).toHaveLength(0)
    expect(resolved).toBe(0) // 同步段即拒，未触达目标
    expect(orch.slots.used).toBe(0) // 未额外占位
  })

  it('a second concurrent send to the same target while the first is in flight → busy (恰一次投递)', async () => {
    writeBots(dir, 'session-main', bots)
    let gate: () => void = () => {}
    const blocked = new Promise<void>((resolve) => { gate = resolve })
    const { call, sends } = rig(dir, {
      agentOf: async (id: string) => { await blocked; return fakeAgent(id) },
    })
    const first = call({ botId: 'session-w1', prompt: '第一件' })
    await new Promise((resolve) => setTimeout(resolve, 0)) // 让 first 走到 agentOf 的 await
    await expect(call({ botId: 'session-w1', prompt: '第二件' })).rejects.toMatchObject({ code: 'pbots/busy' })
    gate()
    await expect(first).resolves.toMatchObject({ sessionId: 'session-w1' })
    expect(sends).toHaveLength(1) // 同目标在途只允许一条
    expect(sends[0].message.content[0].text).toContain('第一件')
  })
})

// ---- 决策 9 / D9⑥′：与 create 共用容量，同 tick 查 + 占位 ----

describe('send_to_bot capacity (决策 9 / D9⑥′)', () => {
  const dir = tmkdir('bot-p611-cap-')
  const bots = Object.fromEntries(['w1', 'w2', 'w3', 'w4'].map((w) => [`session-${w}`, { createdBy: 'session-main' }]))

  it('at limit → pbots/capacity, prompt 计数 0', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends, orch } = rig(dir, { agents: [fakeAgent('session-w1')], limit: 1 })
    expect(orch.slots.reserve()).toBe(true) // 一个 running worker 占满
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/capacity' })
    expect(String(await call({ botId: 'session-w1', prompt: 'p' }).then(() => '', (e: any) => e.message)).startsWith('pbots/capacity: ')).toBe(true)
    expect(sends).toHaveLength(0)
  })

  it('shares the counter with create (a create hold leaves no room for send)', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends, orch } = rig(dir, { agents: [fakeAgent('session-w2')], limit: 1 })
    // 模拟 create 流程的占位（create.mjs：reserve + slotHolds 'create'）
    expect(orch.slots.reserve()).toBe(true)
    orch.slotHolds.set('session-w1', 'create')
    await expect(call({ botId: 'session-w2', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/capacity' })
    expect(sends).toHaveLength(0)
  })

  it('D9⑥′: four concurrent sends to four idle workers, capacity 3 → exactly 3 delivered, 1 capacity error', async () => {
    writeBots(dir, 'session-main', bots)
    const ids = ['session-w1', 'session-w2', 'session-w3', 'session-w4']
    const { call, sends, orch } = rig(dir, { agents: ids.map((id) => fakeAgent(id)), limit: 3 })
    const settled = await Promise.allSettled(ids.map((id) => call({ botId: id, prompt: `task ${id}` })))
    const fulfilled = settled.filter((s) => s.status === 'fulfilled')
    const rejected = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[]
    expect(fulfilled).toHaveLength(3)
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as any).code).toBe('pbots/capacity')
    expect(sends).toHaveLength(3)
    const sentTo = new Set(sends.map((s) => s.agentId))
    expect(sentTo.size).toBe(3)
    expect(orch.slots.used).toBe(3) // 3 个占位等各 worker turn/end
  })
})

// ---- 占位生命周期（绑 worker turn/end，决策 26） ----

describe('send_to_bot slot lifecycle', () => {
  const dir = tmkdir('bot-p611-life-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('holds one slot from delivery until the worker turn ends', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, orch, fireTurnEnd } = rig(dir, { agents: [fakeAgent('session-w1')] })
    await call({ botId: 'session-w1', prompt: 'p' })
    expect(orch.slots.used).toBe(1)
    expect(orch.slotHolds.get('session-w1')).toBe('send')
    fireTurnEnd('session-w1')
    expect(orch.slots.used).toBe(0)
    expect(orch.slotHolds.has('session-w1')).toBe(false)
    fireTurnEnd('session-w1') // 重复 end 不下溢
    expect(orch.slots.used).toBe(0)
  })

  it('delivery failure → pbots/orchestration-failed with sessionId, slot released', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, orch } = rig(dir, { agents: [fakeAgent('session-w1')], failDelivery: new Error('splice rejected') })
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({
      code: 'pbots/orchestration-failed',
      details: { sessionId: 'session-w1' },
    })
    expect(orch.slots.used).toBe(0)
  })

  it('unresolvable worker session → orchestration-failed passthrough, slot released', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, orch } = rig(dir) // agentOf：无该 agent → 抛 orchestration-failed
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/orchestration-failed' })
    expect(orch.slots.used).toBe(0)
  })
})

// ---- 决策 29：受污染回合拒（认领过 pbots-worker 即拒，R2-1 唯一污染源） ----

describe('send_to_bot taint guard (决策 29)', () => {
  const dir = tmkdir('bot-p611-taint-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('a turn that claimed pbots-worker hides the tool and execute rejects, prompt 计数 0', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, when, claim, sends, orch } = rig(dir, { agents: [fakeAgent('session-w1')] })
    expect(await when({ id: 'session-main' })).toBe(true)
    claim('session-main', 3, 'pbots-worker')
    expect(await when({ id: 'session-main' })).toBe(false)
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({
      code: 'pbots/forbidden',
      details: { taintKind: 'pbots-worker' },
    })
    expect(sends).toHaveLength(0)
    expect(orch.slots.used).toBe(0)
  })

  it('host-internal and unknown kinds do not taint (R2-1); a mixed user+report turn still rejects', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, when, claim } = rig(dir, { agents: [fakeAgent('session-w1')] })
    claim('session-main', 1, 'user-approval')
    claim('session-main', 1, 'schedule')
    expect(await when({ id: 'session-main' })).toBe(true)
    claim('session-main', 1, 'pbots-worker') // 混合回合：回报与用户消息同回合
    expect(await when({ id: 'session-main' })).toBe(false)
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
  })
})

// ---- 身份（决策 4：execute 每次读权威 mainBotId，fail closed） ----

describe('send_to_bot identity', () => {
  const dir = tmkdir('bot-p611-id-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('non-main caller → forbidden; unreadable identity → pbots/unavailable (fail closed)', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, when } = rig(dir, { agents: [fakeAgent('session-w1')] })
    await expect(call({ botId: 'session-w1', prompt: 'p' }, { agent: { id: 'session-other' } })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(await when({ id: 'session-main' })).toBe(true)
    expect(await when({ id: 'session-other' })).toBe(false)
    writeFileSync(join(dir, 'bots.json'), '{broken')
    await expect(call({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/unavailable' })
    expect(await when({ id: 'session-main' })).toBe(false)
  })
})

// ---- 参数与 UI 对接（REPORT-P6-15：实参别名 + code: 前缀） ----

describe('send_to_bot args (UI 对接)', () => {
  const dir = tmkdir('bot-p611-args-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('accepts the UI alias sets: target botId|bot|workerId|sessionId|id, prompt prompt|message|text', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends, fireTurnEnd } = rig(dir, { agents: [fakeAgent('session-w1')] })
    // 每次投递后 worker 回合结束、占位释放，下一次才不 busy（同目标串行派活）
    await call({ botId: 'session-w1', prompt: 'a' }); fireTurnEnd('session-w1')
    await call({ bot: 'session-w1', message: 'b' }); fireTurnEnd('session-w1')
    await call({ workerId: 'session-w1', text: 'c' }); fireTurnEnd('session-w1')
    await call({ sessionId: 'session-w1', prompt: 'd' }); fireTurnEnd('session-w1')
    await call({ id: 'session-w1', prompt: 'e' })
    expect(sends).toHaveLength(5)
    for (const s of sends) expect(s.agentId).toBe('session-w1')
    expect(sends.map((s) => s.message.content[0].text)).toEqual(['a', 'b', 'c', 'd', 'e'].map((p) => sendRelayText(p)))
  })

  it('unknown extra fields → pbots/invalid-args with code: prefix', async () => {
    writeBots(dir, 'session-main', bots)
    const { call, sends } = rig(dir, { agents: [fakeAgent('session-w1')] })
    const error = await call({ botId: 'session-w1', prompt: 'p', preset: 'standard', cwd: '/x' }).then(() => undefined, (e: any) => e)
    expect(error?.code).toBe('pbots/invalid-args')
    expect(String(error?.message).startsWith('pbots/invalid-args: ')).toBe(true)
    expect(sends).toHaveLength(0)
  })

  it('missing / blank target or prompt → invalid-args; non-object args → invalid-args', async () => {
    writeBots(dir, 'session-main', bots)
    const { call } = rig(dir, { agents: [fakeAgent('session-w1')] })
    await expect(call({ prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(call({ botId: '  ', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(call({ botId: 'session-w1', prompt: '   ' })).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(call(undefined as any)).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(call('do it' as any)).rejects.toMatchObject({ code: 'pbots/invalid-args' })
  })
})

// ---- 包装句（决策 11：send = 用户明确指向某 worker）与导出面 ----

describe('relay text and barrel (决策 11 / PLAN 接线)', () => {
  it('sendRelayText wraps the user words with a main-bot attribution marker, distinct from create', () => {
    const text = sendRelayText('继续刚才那件事')
    expect(text).toContain('继续刚才那件事')
    expect(text).toContain('主 bot')
    expect(text).not.toBe(relayText('继续刚才那件事'))
  })

  it('index.mjs registers the send exports (P6-11 追加 1 行)', () => {
    expect(orchestration.SEND_TO_BOT_TOOL).toBe('send_to_bot')
    expect(orchestration.SEND_TO_BOT_TOOL).toBe(SEND_TO_BOT_TOOL)
    expect(orchestration.sendRelayText).toBe(sendRelayText)
    expect(typeof orchestration.registerSendToBot).toBe('function')
  })
})
