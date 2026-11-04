// P6-13 纯单测：目标白名单（只许 createdBy = 当前主 bot；自身 / 未知 / 他人
// worker → forbidden 且 cancel 零调用）、应用 session/cancel 同款语义
// （agent.cancel({kind:'user'},{keepInbox:true})，dsh-api-session-controller
// cancel）、空闲目标幂等成功（cancel 对 idle 是文档化 no-op，与应用口径一致，
// 返回 wasRunning:false）、两阶段（accepted ≠ 终态：本工具不占 / 不释容量，
// 释放由既有 turn/end 监听拥有——slots.used 不因 stop 变化）、决策 29 污染
// 回合拒、身份 fail closed、参数 {botId} 与 code: 前缀。真 Loader 用例在
// orchestration-stop-live.test.ts（D10）。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots } from '../../src/orchestration/slots.mjs'
import { registerCreateBot } from '../../src/orchestration/create.mjs'
import { registerStopBot, STOP_BOT_TOOL } from '../../src/orchestration/stop.mjs'
import * as orchestration from '../../src/orchestration/index.mjs'

process.env.HOME = tmkdir('bot-p613-home-')

/** fake worker agent：status + cancel 记录（cancel 调用即「已触达」）。 */
function fakeAgent(id: string, init: { status?: string } = {}) {
  return {
    id,
    status: init.status ?? 'idle',
    inbox: { nextTurn: [], nextStep: [] },
    cancels: [] as Array<[object, object | undefined]>,
    cancel(this: any, cause: object, options?: object) { this.cancels.push([cause, options]) },
  }
}

/**
 * 最小宿主：真实 registerCreateBot + registerStopBot 挂同一 orch 实例
 * （turns 账本由 create 建，stop 复用勿另建）。cancel 计数即触达计数。
 */
function rig(dataDir: string, opts: {
  limit?: number,
  agents?: Array<ReturnType<typeof fakeAgent>>,
  agentOf?: (id: string) => Promise<any>,
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
  }
  registerCreateBot(ctx as any, orch as any)
  registerStopBot(ctx as any, orch as any)
  const stop = tools.get(STOP_BOT_TOOL)!
  const claim = (agentId: string, turn: number, kind: unknown) => {
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: agentId }, message: { id: `m-${turn}`, source: typeof kind === 'string' ? { kind } : kind }, turn }, undefined)
    }
  }
  const call = (args: any, agent = { id: 'session-main' }) => stop.definition.execute(args, { agent })
  const when = (agent: { id: string }) => stop.options.when({ agent })
  return { orch, stop, call, when, claim, agents }
}

const writeBots = (dir: string, mainBotId: string | null, bots?: Record<string, { createdBy: string }>) => {
  writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, ...(bots ? { bots } : {}) }))
}

const allCancels = (rig: ReturnType<typeof rig>, id: string) =>
  ((rig.agents.get(id) as any)?.cancels ?? []) as Array<[object, object | undefined]>

// ---- 目标白名单（只许 createdBy = 当前主 bot；cancel 零调用） ----

describe('stop_bot target guard', () => {
  const dir = tmkdir('bot-p613-guard-')
  const bots = { 'session-w1': { createdBy: 'session-main' }, 'session-w2': { createdBy: 'session-other' } }

  it('own running worker → app-parity cancel {kind:user},{keepInbox:true}, accepted + wasRunning', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1', { status: 'running' })] })
    const out = await r.call({ botId: 'session-w1' })
    expect(out).toMatchObject({ sessionId: 'session-w1', accepted: true, wasRunning: true })
    expect(allCancels(r, 'session-w1')).toEqual([[{ kind: 'user' }, { keepInbox: true }]])
  })

  it('unknown id → forbidden, cancel 零调用', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir)
    await expect(r.call({ botId: 'session-nobody' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(r.agents.size).toBe(0)
  })

  it('plain bot (not a worker) → forbidden', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir)
    await expect(r.call({ botId: 'session-plain' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
  })

  it("another main's worker → forbidden", async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w2')] })
    await expect(r.call({ botId: 'session-w2' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(allCancels(r, 'session-w2')).toHaveLength(0)
  })

  it('self (main bot id) → forbidden', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir)
    await expect(r.call({ botId: 'session-main' })).rejects.toMatchObject({ code: 'pbots/forbidden' })
  })

  it('unreadable bots.json → fail closed at identity (pbots/unavailable，同 create/send 口径)', async () => {
    writeFileSync(join(dir, 'bots.json'), '{broken')
    const r = rig(dir)
    await expect(r.call({ botId: 'session-w1' })).rejects.toMatchObject({ code: 'pbots/unavailable' })
  })

  it('unresolvable worker session → orchestration-failed（白名单过了但 attach 失败）', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir) // agentOf：无该 agent → 抛 orchestration-failed
    await expect(r.call({ botId: 'session-w1' })).rejects.toMatchObject({ code: 'pbots/orchestration-failed' })
  })
})

// ---- 空闲目标语义（P6-13.f1：空闲分支短路，幂等成功且 cancel 零调用） ----

describe('stop_bot idle target (语义定稿：幂等成功)', () => {
  const dir = tmkdir('bot-p613-idle-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('idle worker → accepted + wasRunning:false, cancel 零调用（空闲分支短路）', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1')] })
    const out = await r.call({ botId: 'session-w1' })
    expect(out).toMatchObject({ sessionId: 'session-w1', accepted: true, wasRunning: false })
    expect(String(out.note)).toContain('idle')
    expect(allCancels(r, 'session-w1')).toHaveLength(0) // P6-13.f1：无进行中回合不触 cancel RPC
  })

  it('idle 短路不留状态：同一目标随后 running 停止仍恰 1 次 cancel（P6-13.f1）', async () => {
    writeBots(dir, 'session-main', bots)
    const w = fakeAgent('session-w1')
    const r = rig(dir, { agents: [w] })
    await r.call({ botId: 'session-w1' }) // idle：零 cancel
    expect(allCancels(r, 'session-w1')).toHaveLength(0)
    w.status = 'running'
    const out = await r.call({ botId: 'session-w1' })
    expect(out).toMatchObject({ accepted: true, wasRunning: true })
    expect(allCancels(r, 'session-w1')).toHaveLength(1) // 只来自 running 那次
  })

  it('stop never touches the shared slot counter (两阶段：释放只归 turn/end 监听)', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1', { status: 'running' })] })
    expect(r.orch.slots.reserve()).toBe(true) // 一个 running worker 占位（模拟 create/trackWorkerTurns）
    await r.call({ botId: 'session-w1' })
    expect(r.orch.slots.used).toBe(1) // stop 不占、不释：accepted ≠ 资源回收
  })
})

// ---- 决策 29：受污染回合拒（认领过 pbots-worker 即拒，R2-1 唯一污染源） ----

describe('stop_bot taint guard (决策 29)', () => {
  const dir = tmkdir('bot-p613-taint-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('a turn that claimed pbots-worker hides the tool and execute rejects, cancel 零调用', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1', { status: 'running' })] })
    expect(await r.when({ id: 'session-main' })).toBe(true)
    r.claim('session-main', 3, 'pbots-worker')
    expect(await r.when({ id: 'session-main' })).toBe(false)
    const error = await r.call({ botId: 'session-w1' }).then(() => undefined, (e: any) => e)
    expect(error?.code).toBe('pbots/forbidden')
    expect(String(error?.message).startsWith('pbots/forbidden: ')).toBe(true) // code: 前缀
    expect(error?.details).toMatchObject({ taintKind: 'pbots-worker' })
    expect(allCancels(r, 'session-w1')).toHaveLength(0)
  })

  it('host-internal and unknown kinds do not taint (R2-1)', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1', { status: 'running' })] })
    r.claim('session-main', 1, 'user-approval')
    r.claim('session-main', 1, 'schedule')
    expect(await r.when({ id: 'session-main' })).toBe(true)
    await expect(r.call({ botId: 'session-w1' })).resolves.toMatchObject({ accepted: true })
  })
})

// ---- 身份（决策 4：execute 每次读权威 mainBotId，fail closed） ----

describe('stop_bot identity', () => {
  const dir = tmkdir('bot-p613-id-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('non-main caller → forbidden; unreadable identity → pbots/unavailable; when 只认主 bot', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1')] })
    await expect(r.call({ botId: 'session-w1' }, { agent: { id: 'session-other' } })).rejects.toMatchObject({ code: 'pbots/forbidden' })
    expect(await r.when({ id: 'session-main' })).toBe(true)
    expect(await r.when({ id: 'session-other' })).toBe(false)
    writeFileSync(join(dir, 'bots.json'), '{broken')
    await expect(r.call({ botId: 'session-w1' })).rejects.toMatchObject({ code: 'pbots/unavailable' })
    expect(await r.when({ id: 'session-main' })).toBe(false)
  })
})

// ---- 参数（{botId} 之外一律拒）与导出面 ----

describe('stop_bot args and barrel', () => {
  const dir = tmkdir('bot-p613-args-')
  const bots = { 'session-w1': { createdBy: 'session-main' } }

  it('extra fields → pbots/invalid-args with code: prefix', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1')] })
    const error = await r.call({ botId: 'session-w1', prompt: 'x', force: true }).then(() => undefined, (e: any) => e)
    expect(error?.code).toBe('pbots/invalid-args')
    expect(String(error?.message).startsWith('pbots/invalid-args: ')).toBe(true)
    expect(allCancels(r, 'session-w1')).toHaveLength(0)
  })

  it('missing / blank / non-string botId → invalid-args; non-object args → invalid-args', async () => {
    writeBots(dir, 'session-main', bots)
    const r = rig(dir, { agents: [fakeAgent('session-w1')] })
    await expect(r.call({})).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(r.call({ botId: '  ' })).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(r.call({ botId: 42 })).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(r.call(undefined as any)).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    await expect(r.call('stop it' as any)).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    expect(allCancels(r, 'session-w1')).toHaveLength(0)
  })

  it('index.mjs registers the stop exports (P6-13 追加 1 行)', () => {
    expect(orchestration.STOP_BOT_TOOL).toBe('stop_bot')
    expect(orchestration.STOP_BOT_TOOL).toBe(STOP_BOT_TOOL)
    expect(typeof orchestration.registerStopBot).toBe('function')
    expect(orchestration.STOP_BOT_DESCRIPTION).toContain('Stop a worker bot')
  })
})
