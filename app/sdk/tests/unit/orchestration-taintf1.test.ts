// T-taint.f1（PLAN p6-orchestration）：send_to_bot / stop_bot 的 when/execute
// 从 .tainted 改读 coordinatorTainted（与 create.mjs 同一双读 fail-closed 模式，
// 口径 = pbots-worker ∪ goal / schedule，Q-021）；turn-origin.mjs classify 无
// claim 早返回补齐 coordinatorTainted / coordinatorTaintKinds 字段（契约一致）。
// RED 基线复用 T-taint verifier 探针（vfy-probe-send-avail.test.ts）实证：未修
// 时 goal 回合 send execute 直达 delivery、schedule 回合 when=true。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots } from '../../src/orchestration/slots.mjs'
import { registerCreateBot } from '../../src/orchestration/create.mjs'
import { registerSendToBot, SEND_TO_BOT_TOOL } from '../../src/orchestration/send.mjs'
import { registerStopBot, STOP_BOT_TOOL } from '../../src/orchestration/stop.mjs'
import { TurnOrigin } from '../../src/orchestration/turn-origin.mjs'

process.env.HOME = tmkdir('bot-ttaintf1-home-')

/** fake worker agent：status + delivery/cancel 记录。 */
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

/** 最小宿主：create + send + stop 同一 orch（turns 账本共用）。 */
function rig(dataDir: string, agents: Array<ReturnType<typeof fakeAgent>>) {
  const tools = new Map<string, { definition: any, options: any }>()
  const handlers: Record<string, Array<(...args: any[]) => void>> = {}
  const ctx = {
    tools: { register: (d: any, o: any) => { tools.set(d.name, { definition: d, options: o }) } },
    sessionPersistence: { flush: async () => {} },
    on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
  }
  const agentMap = new Map(agents.map((a) => [a.id, a]))
  const sends: Array<{ agentId: string }> = []
  const orch = {
    config: { dataDir },
    slots: new Slots(3),
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
  const send = tools.get(SEND_TO_BOT_TOOL)!
  const stop = tools.get(STOP_BOT_TOOL)!
  const claim = (agentId: string, turn: number, kind: string) => {
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: agentId }, message: { id: `m-${turn}`, source: { kind } }, turn }, undefined)
    }
  }
  const main = { id: 'session-main' }
  return {
    sends,
    claim,
    whenSend: () => send.options.when({ agent: main }),
    callSend: (args: any) => send.definition.execute(args, { agent: main }),
    whenStop: () => stop.options.when({ agent: main }),
    callStop: (args: any) => stop.definition.execute(args, { agent: main }),
  }
}

const dir = tmkdir('bot-ttaintf1-')
const writeBots = () => {
  writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {}, bots: { 'session-w1': { createdBy: 'session-main' } } }))
}

// ---- T-taint.f1：goal / schedule 回合 send_to_bot 隐藏且拒（接 coordinatorTainted） ----

describe('T-taint.f1: send_to_bot hides and rejects in goal/schedule rounds', () => {
  it('goal round: when=false and execute rejects before delivery', async () => {
    writeBots()
    const r = rig(dir, [fakeAgent('session-w1')])
    expect(await r.whenSend()).toBe(true) // 干净回合可见（对照）
    r.claim('session-main', 1, 'goal')
    expect(await r.whenSend()).toBe(false) // RED 基线：未修时为 true（vfy-probe-send-avail 用例 1）
    await expect(r.callSend({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({
      code: 'pbots/forbidden',
      details: { taintKinds: ['goal'] },
    })
    expect(r.sends).toHaveLength(0) // RED 基线：未修时直达 delivery（sends=1）
  })

  it('schedule round: when=false and execute rejects', async () => {
    writeBots()
    const r = rig(dir, [fakeAgent('session-w1')])
    r.claim('session-main', 2, 'schedule')
    expect(await r.whenSend()).toBe(false) // RED 基线：未修时为 true（vfy-probe-send-avail 用例 2）
    await expect(r.callSend({ botId: 'session-w1', prompt: 'p' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(r.sends).toHaveLength(0)
  })
})

// ---- T-taint.f1：goal / schedule 回合 stop_bot 隐藏且拒 ----

describe('T-taint.f1: stop_bot hides and rejects in goal/schedule rounds', () => {
  it('goal round: when=false, execute rejects, cancel 零调用', async () => {
    writeBots()
    const w = fakeAgent('session-w1', { status: 'running' })
    const r = rig(dir, [w])
    r.claim('session-main', 1, 'goal')
    expect(await r.whenStop()).toBe(false) // RED 基线：未修时为 true
    await expect(r.callStop({ botId: 'session-w1' })).rejects.toMatchObject({
      code: 'pbots/forbidden',
      details: { taintKinds: ['goal'] },
    })
    expect(w.cancels).toHaveLength(0)
  })

  it('schedule round: when=false and execute rejects', async () => {
    writeBots()
    const w = fakeAgent('session-w1', { status: 'running' })
    const r = rig(dir, [w])
    r.claim('session-main', 2, 'schedule')
    expect(await r.whenStop()).toBe(false) // RED 基线：未修时为 true
    await expect(r.callStop({ botId: 'session-w1' })).rejects.toMatchObject({
      code: 'pbots/forbidden',
      details: { taintKinds: ['schedule'] },
    })
    expect(w.cancels).toHaveLength(0)
  })
})

// ---- T-taint.f1：干净用户回合语义零变化（正常路径仍可用） ----

describe('T-taint.f1: clean user turns keep both tools working', () => {
  it('no claims / user claim: when=true and send reaches delivery', async () => {
    writeBots()
    const r = rig(dir, [fakeAgent('session-w1')])
    expect(await r.whenSend()).toBe(true)
    expect(await r.whenStop()).toBe(true)
    r.claim('session-main', 1, 'user')
    expect(await r.whenSend()).toBe(true)
    const out: any = await r.callSend({ botId: 'session-w1', prompt: 'p' })
    expect(out).toMatchObject({ sessionId: 'session-w1' })
    expect(r.sends).toHaveLength(1)
  })

  it('host-internal kinds (user-approval) do not hide coordinator tools', async () => {
    writeBots()
    const r = rig(dir, [fakeAgent('session-w1')])
    r.claim('session-main', 1, 'user-approval')
    expect(await r.whenSend()).toBe(true)
    expect(await r.whenStop()).toBe(true)
  })

  it('next clean turn resets (schedule 污染回合后的下一干净回合恢复)', async () => {
    writeBots()
    const r = rig(dir, [fakeAgent('session-w1')])
    r.claim('session-main', 1, 'schedule')
    r.claim('session-main', 2, 'user')
    expect(await r.whenSend()).toBe(true)
    expect(await r.whenStop()).toBe(true)
  })
})

// ---- T-taint.f1：classify 无 claim 早返回补齐 coordinatorTainted 字段 ----

describe('T-taint.f1: classify() no-claim early return carries the full contract', () => {
  it('agent with no recorded claims returns all four fields (toStrictEqual)', () => {
    const origin = new TurnOrigin()
    // RED 基线：早返回只有 { tainted, auditKinds }，缺 coordinatorTainted /
    // coordinatorTaintKinds（undefined falsy 恰安全但契约不一致）。toEqual 会
    // 忽略 undefined 键，故用 toStrictEqual 锁字段存在性。
    expect(origin.classify('nobody')).toStrictEqual({
      tainted: false,
      coordinatorTainted: false,
      coordinatorTaintKinds: [],
      auditKinds: [],
    })
  })
})
