// P6-10 纯单测：容量计数（决策 9 / D9⑥）、身份读取（决策 4，fail closed）、
// ⑤ 通道请求簿记（决策 10 / 30，CONTRACT §2.4：错 Peer 拒、无订阅者立即
// main-unavailable、超时 outcome unknown 且迟到 respond 拒、断流作废在途）、
// assign 包装句（决策 11）、⑩ 导出面。真 Loader 用例在
// orchestration-create-live.test.ts。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'
import { Slots, sharedSlots, trackWorkerTurns, readWorkerIds } from '../../src/orchestration/slots.mjs'
import { orchDataDir, readMainBotId } from '../../src/orchestration/identity.mjs'
import { CreateChannel, DEFAULT_CREATE_TIMEOUT_MS } from '../../src/orchestration/main-channel.mjs'
import { relayText, registerCreateBot } from '../../src/orchestration/create.mjs'
import { Delivery } from '../../src/orchestration/delivery.mjs'
import * as orchestration from '../../src/orchestration/index.mjs'

process.env.HOME = tmkdir('bot-p610-home-')

// ---- Slots（决策 9：查 + 占位同 tick 无 await；create/send 共用；D9⑥ 上限 3） ----

describe('Slots', () => {
  it('reserves up to the limit within one tick (no await between check and occupy)', () => {
    const slots = new Slots(3)
    // 同 tick 连续 reserve：前 3 个成功、第 4 个失败——两步之间没有 await，
    // 并发单测即「同步连发」。
    expect([slots.reserve(), slots.reserve(), slots.reserve(), slots.reserve()]).toEqual([true, true, true, false])
  })

  it('defaults to capacity 3 (D9-6) and releases back a slot', () => {
    const slots = new Slots()
    expect(slots.reserve()).toBe(true)
    expect(slots.reserve()).toBe(true)
    expect(slots.reserve()).toBe(true)
    expect(slots.reserve()).toBe(false)
    slots.release()
    expect(slots.reserve()).toBe(true)
    expect(slots.used).toBe(3)
  })

  it('release never underflows', () => {
    const slots = new Slots(1)
    slots.release()
    expect(slots.used).toBe(0)
    expect(slots.reserve()).toBe(true)
  })

  it('sharedSlots hands one instance to every coordinator tool (P6-10 ⑩)', () => {
    expect(sharedSlots()).toBe(sharedSlots())
    expect(sharedSlots()).toBeInstanceOf(Slots)
  })
})

// ---- identity（决策 4：权威 mainBotId；读取失败 fail closed） ----

describe('readMainBotId', () => {
  const dir = tmkdir('bot-p610-id-')
  const file = join(dir, 'bots.json')

  it('reads the authoritative mainBotId from bots.json', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {} }))
    expect(await readMainBotId(dir)).toBe('session-main')
  })

  it('missing file → null (definitively no main bot)', async () => {
    rmSync(file, { force: true })
    expect(await readMainBotId(dir)).toBe(null)
  })

  it('corrupt payload or wrong version → undefined (unknown identity, fail closed)', async () => {
    writeFileSync(file, '{not json')
    expect(await readMainBotId(dir)).toBe(undefined)
    writeFileSync(file, JSON.stringify({ version: 2, mainBotId: 'x', recipes: {} }))
    expect(await readMainBotId(dir)).toBe(undefined)
  })

  it('bots field (决策 31) does not disturb the read', async () => {
    writeFileSync(file, JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {}, bots: { 'session-w': { createdBy: 'session-main' } } }))
    expect(await readMainBotId(dir)).toBe('session-main')
  })
})

describe('orchDataDir', () => {
  it('explicit SDK var wins, then PBOTS_DATA_DIR, then the HOME default layout', () => {
    expect(orchDataDir({ P2SDK_ORCH_DATA_DIR: '/d/orch', PBOTS_DATA_DIR: '/d/pbots', HOME: '/h' } as NodeJS.ProcessEnv)).toBe('/d/orch')
    expect(orchDataDir({ PBOTS_DATA_DIR: '/d/pbots', HOME: '/h' } as NodeJS.ProcessEnv)).toBe('/d/pbots')
    expect(orchDataDir({ HOME: '/h' } as NodeJS.ProcessEnv)).toBe(join('/h', '.config', 'pbots-ui'))
  })
})

// ---- CreateChannel（CONTRACT §2.4 / 决策 30） ----

/** fake subscriber the stream generator would own: {peer, queue, wake}. */
function subscriber(peer: string) {
  return { peer, queue: [] as Array<Record<string, unknown>>, wake: undefined as undefined | (() => void) }
}

function channelError(error: unknown): { code: string; message: string; details: Record<string, unknown> } {
  const e = error as { code?: string; message?: string; details?: Record<string, unknown> }
  return { code: String(e?.code), message: String(e?.message), details: e?.details ?? {} }
}

describe('CreateChannel', () => {
  it('no subscriber → main-unavailable immediately, no queueing (CONTRACT §2.4)', async () => {
    const ch = new CreateChannel()
    const started = Date.now()
    await expect(ch.request({ kind: 'create-bot' })).rejects.toMatchObject({
      code: 'main-unavailable',
      details: { reason: 'no-subscriber', outcome: 'unknown' },
    })
    expect(Date.now() - started).toBeLessThan(100)
  })

  it('round trip: queued for the subscriber, resolved by the holding peer', async () => {
    const ch = new CreateChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request({ kind: 'create-bot', name: 'w', prompt: 'p' })
    expect(sub.queue.length).toBe(1)
    const item = sub.queue[0] as { requestId: string; kind: string }
    expect(item.kind).toBe('create-bot')
    ch.respond(item.requestId, { value: { sessionId: 'session-w' } }, 'peer-main')
    await expect(pending).resolves.toEqual({ sessionId: 'session-w' })
  })

  it('wrong-peer respond is rejected and the request stays pending (③)', async () => {
    const ch = new CreateChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request({ kind: 'create-bot' })
    const { requestId } = sub.queue[0] as { requestId: string }
    expect(() => ch.respond(requestId, { value: { sessionId: 'x' } }, 'peer-other')).toThrowError(/forbidden|peer/)
    // 仍 pending：正确 Peer 还能作答
    ch.respond(requestId, { value: { sessionId: 'session-w' } }, 'peer-main')
    await expect(pending).resolves.toEqual({ sessionId: 'session-w' })
  })

  it('respond with an error outcome rejects the caller with code and details passthrough (orchestration-failed)', async () => {
    const ch = new CreateChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request({ kind: 'create-bot' })
    const { requestId } = sub.queue[0] as { requestId: string }
    ch.respond(requestId, { error: { code: 'pbots/orchestration-failed', message: 'session/create failed', details: { step: 'session/create', code: 'gateway/internal' } } }, 'peer-main')
    await expect(pending).rejects.toMatchObject({
      code: 'pbots/orchestration-failed',
      details: { step: 'session/create', code: 'gateway/internal' },
    })
  })

  it('stale requestId (late respond after timeout) is rejected (③′ / 决策 30)', async () => {
    const ch = new CreateChannel({ timeoutMs: 30 })
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request({ kind: 'create-bot' })
    // P6-10.f2 D-3：超时会从背压队列回收载荷——先取 id 再等超时。
    const { requestId } = sub.queue[0] as { requestId: string }
    await expect(pending).rejects.toMatchObject({
      code: 'main-unavailable',
      details: { reason: 'timeout', outcome: 'unknown' },
    })
    expect(sub.queue.length).toBe(0)
    expect(() => ch.respond(requestId, { value: { sessionId: 'late' } }, 'peer-main')).toThrowError(/stale|forbidden/)
  })

  it('stream detach voids in-flight requests with outcome unknown; late respond rejected (③ 断流)', async () => {
    const ch = new CreateChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const a = ch.request({ kind: 'create-bot' })
    const b = ch.request({ kind: 'create-bot' })
    const ids = (sub.queue as Array<{ requestId: string }>).map((q) => q.requestId)
    ch.detach()
    for (const p of [a, b]) await expect(p).rejects.toMatchObject({ code: 'main-unavailable', details: { reason: 'stream-closed', outcome: 'unknown' } })
    for (const id of ids) expect(() => ch.respond(id, { value: { sessionId: 'late' } }, 'peer-main')).toThrowError(/stale|forbidden/)
  })

  it('default timeout is 30s (决策 30 createTimeoutMs default)', () => {
    expect(DEFAULT_CREATE_TIMEOUT_MS).toBe(30_000)
  })

  it('request ids are unique per request', () => {
    const ch = new CreateChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    void ch.request({ kind: 'create-bot' }).catch(() => {})
    void ch.request({ kind: 'create-bot' }).catch(() => {})
    const ids = (sub.queue as Array<{ requestId: string }>).map((q) => q.requestId)
    expect(new Set(ids).size).toBe(2)
  })
})

// ---- 包装句（决策 11：create = 用户原话 + ≤30 字路由备注；投给 worker 前包一层主 bot 归属） ----

describe('relayText', () => {
  it('wraps the user words with a main-bot attribution marker', () => {
    const text = relayText('帮我查一下今天的天气')
    expect(text).toContain('帮我查一下今天的天气')
    expect(text).toContain('主 bot')
  })
})

// ---- P6-10.f1 ①：受污染回合拒 create_bot（when/execute 接 P6-21 turn-origin） ----

/** registerCreateBot 最小宿主：捕获工具定义 + when 选项 + 两类事件监听（claimed / session/event）。 */
function registeredTool(dataDir: string, slotsLimit = 1) {
  let definition: any
  let options: any
  const handlers: Record<string, Array<(a: any, b: any) => void>> = {}
  const ctx = {
    tools: { register: (d: any, o: any) => { definition = d; options = o } },
    sessionPersistence: { flush: async () => {} },
    on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} },
  }
  const slots = new Slots(slotsLimit)
  const channel = new CreateChannel()
  const sub = subscriber('peer-main')
  channel.attach(sub)
  registerCreateBot(ctx as any, { config: { dataDir }, slots, channel } as any)
  const claim = (agentId: string, turn: number, kind: unknown) => {
    for (const fn of handlers['agent/inbox/claimed'] ?? []) {
      fn({ agent: { id: agentId }, message: { id: `m-${agentId}-${turn}`, source: typeof kind === 'string' ? { kind } : kind }, turn }, undefined)
    }
  }
  return { definition, when: (agent: { id: string }) => options.when({ agent }), slots, sub, claim }
}

describe('create_bot taint guard (P6-10.f1 ①)', () => {
  const dir = tmkdir('bot-p610f1-taint-')

  it('a turn that claimed pbots-worker hides the tool and execute rejects before the channel (0 create requests, no slot eaten)', async () => {
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {} }))
    const { definition, when, slots, sub, claim } = registeredTool(dir)
    // 干净回合可见
    expect(await when({ id: 'session-main' })).toBe(true)
    // 本回合认领了 pbots-worker 来源（决策 29 / R2-1 唯一污染源）
    claim('session-main', 3, 'pbots-worker')
    expect(await when({ id: 'session-main' })).toBe(false)
    await expect(definition.execute({ name: 'w', prompt: 'p' }, { agent: { id: 'session-main' } }))
      .rejects.toMatchObject({ code: 'pbots/forbidden', details: { taintKind: 'pbots-worker' } })
    expect(sub.queue.length).toBe(0) // 0 次建 bot 请求
    expect(slots.used).toBe(0) // 拒绝不占容量
  })

  it('host-internal and unknown kinds do not taint (R2-1); the next clean user turn restores visibility', async () => {
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {} }))
    const { definition, when, claim } = registeredTool(dir)
    claim('session-main', 1, 'user-approval')
    // T-taint（2026-11-05 定案）：schedule 不再在本组——goal / schedule 对协调者
    // 工具算污染，移到下一条用例；user-approval / 未知 kind 仍不污染。
    claim('session-main', 1, 'mystery-kind')
    expect(await when({ id: 'session-main' })).toBe(true)
    claim('session-main', 1, 'pbots-worker') // 同回合出现污染源 → 污染（回合内单调）
    expect(await when({ id: 'session-main' })).toBe(false)
    claim('session-main', 2, undefined) // 新回合只认领了纯用户消息（无 source）
    expect(await when({ id: 'session-main' })).toBe(true)
  })

  // T-taint（G1-r2 A 席 R2-1 发现 / Q-021 定稿）：goal / schedule 来源回合对
  // 协调者工具算污染——create_bot 不可见、execute 拒（0 次 建 bot 请求、不占容量）。
  it('goal / schedule rounds hide create_bot and execute rejects before the channel; monotonic within the turn', async () => {
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {} }))
    const { definition, when, slots, sub, claim } = registeredTool(dir)
    expect(await when({ id: 'session-main' })).toBe(true) // 干净回合可见
    claim('session-main', 5, 'goal')
    expect(await when({ id: 'session-main' })).toBe(false)
    claim('session-main', 5, 'user-approval') // 同回合后到的宿主内部来源不解除污染（回合内单调）
    expect(await when({ id: 'session-main' })).toBe(false)
    await expect(definition.execute({ name: 'w', prompt: 'p' }, { agent: { id: 'session-main' } }))
      .rejects.toMatchObject({ code: 'pbots/forbidden' })
    claim('session-main', 6, 'schedule') // schedule 同口径
    expect(await when({ id: 'session-main' })).toBe(false)
    claim('session-main', 7, undefined) // 下一干净回合恢复可见
    expect(await when({ id: 'session-main' })).toBe(true)
    expect(sub.queue.length).toBe(0) // 0 次建 bot 请求
    expect(slots.used).toBe(0) // 拒绝不占容量
  })
})

// ---- P6-10.f1 ②：人工启动的 worker 回合收养进共享容量 ----

describe('trackWorkerTurns (P6-10.f1 ②)', () => {
  const dir = tmkdir('bot-p610f1-adopt-')
  const writeBots = (bots?: Record<string, { createdBy: string }>) => {
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-main', recipes: {}, ...(bots ? { bots } : {}) }))
  }
  const rig = (limit = 1) => {
    const slots = new Slots(limit)
    const handlers: Record<string, Array<(a: any, b: any) => void>> = {}
    const ctx = { on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => {} } }
    const holds = trackWorkerTurns(ctx as any, slots, () => dir)
    const fire = (type: string, id: string) => { for (const fn of handlers['session/event'] ?? []) fn({ id }, { type }) }
    return { slots, holds, fire }
  }

  it('a manually started worker turn occupies a shared slot at turn/start and releases at turn/end', () => {
    writeBots({ 'session-w': { createdBy: 'session-main' } })
    const { slots, holds, fire } = rig()
    expect(holds.size).toBe(0)
    fire('turn/start', 'session-w')
    expect(slots.used).toBe(1)
    fire('turn/start', 'session-w') // 重复 start 不重复占
    fire('turn/start', 'session-main') // main 自己的回合不占
    fire('turn/start', 'session-plain') // 非 worker 不占
    expect(slots.used).toBe(1)
    fire('turn/end', 'session-w')
    expect(slots.used).toBe(0)
    fire('turn/end', 'session-w') // 重复 end 不下溢
    expect(slots.used).toBe(0)
  })

  it('at capacity an extra manual worker is not adopted and its turn/end does not steal a slot', () => {
    writeBots({ 'session-w': { createdBy: 'session-main' }, 'session-w2': { createdBy: 'session-main' } })
    const { slots, holds, fire } = rig()
    fire('turn/start', 'session-w')
    expect(slots.used).toBe(1)
    fire('turn/start', 'session-w2') // 满了：不收养、不记 hold
    expect(holds.has('session-w2')).toBe(false)
    expect(slots.used).toBe(1)
    fire('turn/end', 'session-w2') // 无 hold：不误放
    expect(slots.used).toBe(1)
  })

  // ---- P6-10.f1a：满额未收养的 worker 记 pending，释放后补收养 ----

  it('N 起跑 k 结束成对：4 起跑 1 结束 → slots 仍 3（满额 worker 被补收养，不虚报 2）', () => {
    writeBots(Object.fromEntries(['w1', 'w2', 'w3', 'w4'].map((w) => [`session-${w}`, { createdBy: 'session-main' }])))
    const { slots, holds, fire } = rig(3)
    for (const w of ['w1', 'w2', 'w3', 'w4']) fire('turn/start', `session-${w}`)
    expect(slots.used).toBe(3) // 满额：w4 收养不了但已 running
    fire('turn/end', 'session-w1') // 释放一格 → w4 补收养
    expect(slots.used).toBe(3) // f1a 修复点：修复前这里是 2
    expect(holds.has('session-w4')).toBe(true)
  })

  it('成对续：全部结束 → slots 归零；结束后新建占 1 再释放归零', () => {
    writeBots(Object.fromEntries(['w1', 'w2', 'w3', 'w4'].map((w) => [`session-${w}`, { createdBy: 'session-main' }])))
    const { slots, fire } = rig(3)
    for (const w of ['w1', 'w2', 'w3', 'w4']) fire('turn/start', `session-${w}`)
    fire('turn/end', 'session-w1')
    for (const w of ['w2', 'w3', 'w4']) fire('turn/end', `session-${w}`)
    expect(slots.used).toBe(0) // 全部结束归零（w4 的 end 不多释放）
    fire('turn/start', 'session-w1') // 结束后新建：能占上
    expect(slots.used).toBe(1)
    fire('turn/end', 'session-w1')
    expect(slots.used).toBe(0)
  })

  it('pending 中的 worker 先结束：不释放格子（没占过），持位者结束后不多扣', () => {
    writeBots({ 'session-w1': { createdBy: 'session-main' }, 'session-w2': { createdBy: 'session-main' } })
    const { slots, fire } = rig(1)
    fire('turn/start', 'session-w1')
    fire('turn/start', 'session-w2') // 满额 → pending
    fire('turn/end', 'session-w2') // 未收养即结束：不该释放
    expect(slots.used).toBe(1)
    fire('turn/end', 'session-w1')
    expect(slots.used).toBe(0) // 不能因 w2 的 end 多扣一格
  })

  it('create 流程释放占位（create.mjs 的 release 路径）同样补收养 pending worker', () => {
    writeBots(Object.fromEntries(['w1', 'w2', 'w3'].map((w) => [`session-${w}`, { createdBy: 'session-main' }])))
    const { slots, holds, fire } = rig(2)
    // 模拟 create.mjs：reserve 成功后登记 'create' hold
    expect(slots.reserve()).toBe(true)
    holds.set('session-w1', 'create')
    fire('turn/start', 'session-w2') // 收养
    fire('turn/start', 'session-w3') // 满额 → pending
    expect(slots.used).toBe(2)
    // 模拟 create.mjs 的 release()：delete hold + slots.release()
    holds.delete('session-w1')
    slots.release()
    expect(slots.used).toBe(2) // 释放后 w3 补收养，不虚报 1
    expect(holds.has('session-w3')).toBe(true)
  })

  it('a session already held by the create flow ("create" hold) is not double-counted; its release stays with create', () => {
    writeBots({ 'session-w': { createdBy: 'session-main' } })
    const { slots, holds, fire } = rig()
    holds.set('session-w', 'create')
    fire('turn/start', 'session-w')
    expect(slots.used).toBe(0)
    fire('turn/end', 'session-w') // tracker 不放（create 的一shot turn/end 监听负责）
    expect(slots.used).toBe(0)
    expect(holds.has('session-w')).toBe(true)
  })

  it('a worker deleted from bots.json mid-turn still releases at turn/end (release keyed by the hold, not a re-read)', () => {
    writeBots({ 'session-w': { createdBy: 'session-main' } })
    const { slots, fire } = rig()
    fire('turn/start', 'session-w')
    expect(slots.used).toBe(1)
    writeBots() // 回合中途 bots.json 不再登记该 worker
    fire('turn/end', 'session-w')
    expect(slots.used).toBe(0)
  })
})

describe('readWorkerIds (P6-10.f1 ②)', () => {
  const dir = tmkdir('bot-p610f1-wids-')

  it('lists createdBy workers; missing file / no bots key / corrupt → empty', () => {
    rmSync(join(dir, 'bots.json'), { force: true })
    expect(readWorkerIds(dir)).toEqual([])
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm', recipes: {} }))
    expect(readWorkerIds(dir)).toEqual([])
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'm', recipes: {}, bots: { w1: { createdBy: 'm' }, w2: { createdBy: 'm' }, bad: {} } }))
    expect(readWorkerIds(dir).sort()).toEqual(['w1', 'w2'])
    writeFileSync(join(dir, 'bots.json'), '{broken')
    expect(readWorkerIds(dir)).toEqual([])
  })
})

// ---- ⑩ 导出面（P6-11/12/13 复用，不各写一份） ----

describe('orchestration barrel exports (P6-10 ⑩)', () => {
  it('exports slots, identity, channel and create pieces', () => {
    expect(orchestration.Slots).toBe(Slots)
    expect(orchestration.sharedSlots).toBe(sharedSlots)
    expect(orchestration.readMainBotId).toBe(readMainBotId)
    expect(orchestration.orchDataDir).toBe(orchDataDir)
    expect(orchestration.CreateChannel).toBe(CreateChannel)
    expect(orchestration.DEFAULT_CREATE_TIMEOUT_MS).toBe(DEFAULT_CREATE_TIMEOUT_MS)
    expect(orchestration.relayText).toBe(relayText)
    expect(orchestration.CREATE_BOT_TOOL).toBe('create_bot')
  })
})

// ---- P6-10.f2：REVIEW-P6-10 合批修复（A2 无效应答收敛 / C-1 路径脱敏 /
// D-3 超时载荷回收 / B-1 收养归并 / B-2 未确认启动不放容量） ----

/** f2 rig：真实 registerCreateBot + CreateChannel + Slots + trackWorkerTurns（B 向探针 slots-channel.mjs 的 vitest 化）。 */
function f2Rig(limit = 3, options: { timeoutMs?: number } = {}) {
  const dir = tmkdir('bot-p610f2-')
  writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'main', recipes: {}, bots: { w: { createdBy: 'main' } } }))
  const handlers: Record<string, Array<(a: unknown, b: unknown) => void>> = {}
  let definition: any
  const ctx = {
    tools: { register: (d: any) => { definition = d } },
    sessionPersistence: { flush: async () => {} },
    on: (name: string, fn: any) => { (handlers[name] ??= []).push(fn); return () => { const list = handlers[name] ?? []; const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1) } },
  }
  const slots = new Slots(limit)
  const channel = new CreateChannel({ timeoutMs: options.timeoutMs ?? 10_000 })
  const sub = subscriber('peer-main')
  channel.attach(sub)
  const orch: any = { config: { dataDir: dir }, slots, channel, agentOf: async () => ({ id: 'w' }), delivery: { send: async () => {} } }
  registerCreateBot(ctx as never, orch)
  const fire = (id: string, type: string) => { for (const fn of [...(handlers['session/event'] ?? [])]) fn({ id }, { type }) }
  const start = () => definition.execute({ name: 'worker', prompt: 'task' }, { agent: { id: 'main' } })
  const respondAt = (i: number, outcome: Record<string, unknown>) => channel.respond((sub.queue[i] as { requestId: string }).requestId, outcome, 'peer-main')
  const settled = () => new Promise((res) => setImmediate(res))
  return { ctx, orch, slots, channel, sub, fire, start, respondAt, settled }
}

describe('CreateChannel respond shape validation (P6-10.f2 A2)', () => {
  it('invalid outcomes ({error:null}, {value:null}, {}, error without string code) reject as invalid-response and never hang', async () => {
    for (const outcome of [{ error: null }, { value: null }, {}, { error: 'boom' }, { error: { code: 7, message: 'x' } }]) {
      const ch = new CreateChannel({ timeoutMs: 60_000 })
      const sub = subscriber('peer-main')
      ch.attach(sub)
      const pending = ch.request({ kind: 'create-bot' })
      const { requestId } = sub.queue[0] as { requestId: string }
      ch.respond(requestId, outcome as never, 'peer-main')
      await expect(pending).rejects.toMatchObject({ code: 'main-unavailable', details: { reason: 'invalid-response', outcome: 'unknown' } })
      expect(ch.pending.size).toBe(0)
    }
  })

  it('respond {error:null} three times does not exhaust create capacity (A2 容量)', async () => {
    const r = f2Rig(3, { timeoutMs: 5_000 })
    const codes: string[] = []
    for (let i = 0; i < 3; i++) {
      const p = r.start().then(() => 'resolved', (e: any) => e.code)
      while (r.sub.queue.length <= i) await r.settled()
      r.respondAt(i, { error: null })
      codes.push(await p)
    }
    expect(codes).toEqual(['main-unavailable', 'main-unavailable', 'main-unavailable'])
    expect(r.slots.used).toBe(0)
    expect(r.orch.slotHolds.size).toBe(0)
    // 第 4 个 create 不被 capacity 卡住（仍能进通道排队）
    const queued = r.sub.queue.length
    const p4 = r.start().then(() => 'resolved', (e: any) => e.code)
    while (r.sub.queue.length === queued) await r.settled()
    expect(r.sub.queue.length).toBe(queued + 1)
    r.channel.detach()
    expect(await p4).toBe('main-unavailable')
  })

  it('invalid-response rejects carry outcome unknown details (契约 §2.4 收敛语义)', async () => {
    const ch = new CreateChannel({ timeoutMs: 60_000 })
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request({ kind: 'create-bot' })
    const { requestId } = sub.queue[0] as { requestId: string }
    ch.respond(requestId, { error: null }, 'peer-main')
    const err = await pending.then(() => undefined, (e: any) => e)
    expect(err.details).toMatchObject({ reason: 'invalid-response', outcome: 'unknown' })
    expect(err.message).toContain('main-unavailable')
  })
})

describe('error text redaction at the wire boundary (P6-10.f2 C-1)', () => {
  it('internal absolute paths in main error text become a relative hint before reaching the tool', async () => {
    const r = f2Rig(1)
    const p = r.start().then(() => undefined, (e: any) => e)
    while (r.sub.queue.length === 0) await r.settled()
    const abs = '/tmp/bot-p610f2-internal/data/workspaces/session-x1'
    r.respondAt(0, { error: { code: 'pbots/storage', message: `workspace mkdir failed for "${abs}": Error: ENOTDIR: not a directory, mkdir '${abs}'` } })
    const err = await p
    expect(err.code).toBe('pbots/storage')
    expect(err.message).toContain('ENOTDIR')
    expect(err.message).not.toContain('/tmp/bot-p610f2-internal')
    expect(err.message).toContain('<path>/workspaces/session-x1')
    expect(r.slots.used).toBe(0)
  })

  // P6-10.f2a C-1：verifier vfy-extra.mjs 确认的两处漏点——error.details 嵌套
  // 字符串与成功 value 的 warn 文本均直达模型可见面，必须同样脱敏。
  it('nested details string values are redacted recursively (P6-10.f2a C-1)', async () => {
    const r = f2Rig(1)
    const p = r.start().then(() => undefined, (e: any) => e)
    while (r.sub.queue.length === 0) await r.settled()
    const abs = '/tmp/bot-p610f2-internal/private-data/sessions/w.json'
    r.respondAt(0, { error: { code: 'pbots/storage', message: `read failed ${abs}`, details: { path: abs, nested: { cause: `ENOTDIR ${abs}` }, peers: [abs] } } })
    const err = await p
    const blob = JSON.stringify(err.details)
    expect(blob).not.toContain('/tmp/bot-p610f2-internal')
    expect(blob).toContain('<path>/sessions/w.json')
  })

  it('warn text in the success value is redacted before reaching the tool result (P6-10.f2a C-1)', async () => {
    const r = f2Rig(1)
    const p = r.start()
    while (r.sub.queue.length === 0) await r.settled()
    const abs = '/tmp/bot-p610f2-internal/private-data/sessions/w.json'
    r.respondAt(0, { value: { sessionId: 'w', warn: `rename failed: ENOTDIR: rename '${abs}'` } })
    const out = await p
    expect(out.warn).not.toContain('/tmp/bot-p610f2-internal')
    expect(out.warn).toContain('<path>/sessions/w.json')
  })
})

describe('timeout reclaims the queued payload (P6-10.f2 D-3)', () => {
  it('a timed-out request removes its payload from a backpressured subscriber queue', async () => {
    const ch = new CreateChannel({ timeoutMs: 5 })
    const sub = subscriber('peer-main')
    ch.attach(sub)
    await ch.request({ kind: 'create-bot', name: 'w', prompt: 'x'.repeat(1000) }).catch(() => {})
    expect(ch.pending.size).toBe(0)
    expect(sub.queue.length).toBe(0) // 修复前：完整 prompt 滞留在无人消费的队列里
    ch.detach()
  })
})

describe('create hold merges with manual-turn adoption (P6-10.f2 B-1)', () => {
  it('manual start between reserve and respond: all turns ended → slots back to 0, no phantom hold', async () => {
    const r = f2Rig(3)
    const p = r.start()
    while (r.sub.queue.length === 0) await r.settled()
    r.fire('w', 'turn/start') // 用户从另一客户端启动同一 worker → trackWorkerTurns 收养另占一格
    expect(r.slots.used).toBe(2)
    r.respondAt(0, { value: { sessionId: 'w' } })
    await p
    expect(r.slots.used).toBe(1) // create 接管所有权：归并掉收养多占的一格
    expect(r.orch.slotHolds.get('w')).toBe('create')
    r.fire('w', 'turn/end') // 人工回合结束（create 的一shot监听释放）
    r.fire('w', 'turn/start') // assign 回合（tracker 重新收养）
    r.fire('w', 'turn/end')
    expect(r.slots.used).toBe(0) // 修复前：holds 空但 used=1，永久虚占
    expect(r.orch.slotHolds.size).toBe(0)
  })
})

describe('unconfirmed start keeps the slot held (P6-10.f2 B-2)', () => {
  it('flush failure after followup: worker still running → slot stays held, next create rejected, released at turn/end', async () => {
    const r = f2Rig(1)
    let flushes = 0
    const gate = Promise.withResolvers<void>()
    // 共享计数：ctx 的 flush#1（冷 session）+ Delivery readLog 的 flush#2 + followup 后的 flush#3（失败注入点）
    const persistence = {
      flush: async () => { flushes += 1; if (flushes === 3) await gate.promise },
      open: async () => ({ read: async () => ({ events: [] as unknown[] }), close: async () => {} }),
    }
    ;(r.ctx as any).sessionPersistence = persistence
    let followup = false
    const agent: any = { id: 'w', inbox: { nextTurn: [], nextStep: [] }, followup (_m: unknown) { followup = true; queueMicrotask(() => r.fire('w', 'turn/start')) } }
    r.orch.agentOf = async () => agent
    r.orch.delivery = new Delivery({ agents: { get: () => agent }, sessionPersistence: persistence } as never)
    const p = r.start().then(() => undefined, (e: any) => e)
    while (r.sub.queue.length === 0) await r.settled()
    r.respondAt(0, { value: { sessionId: 'w' } })
    for (let i = 0; !(followup && flushes === 3); i++) { if (i > 500) throw new Error('barrier timeout'); await r.settled() }
    expect(r.slots.used).toBe(1)
    gate.reject(new Error('injected durability failure'))
    const err = await p
    expect(err.code).toBe('pbots/orchestration-failed')
    expect(r.slots.used).toBe(1) // 修复前 0：worker 仍 running 却按未启动释放
    expect(r.orch.slotHolds.get('w')).toBe('turn')
    expect(r.slots.reserve()).toBe(false) // 同容量下不允许超额启动
    r.fire('w', 'turn/end') // worker 回合真正结束才归还
    expect(r.slots.used).toBe(0)
  })
})
