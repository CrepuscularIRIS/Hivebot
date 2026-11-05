// P6-11 真 Loader 用例（PLAN 验收）：orchestration.yml 挂生产插件（含 send_to_bot
// 注册），fake 模型驱动。D7 SDK 部分（目标 transcript 落一条 pbots-main 消息并起
// 回合）、D9② 白名单（非 createdBy / 他人 worker / 自身 → forbidden、prompt 计数
// 0）、D9⑩ busy（目标 running → pbots/busy 恰一次不重试）、D9⑥′ 并发容量（一个
// 响应 4 个 tool-call 块 + isConcurrencySafe → 宿主真并发批，恰 3 投出）、D9⑧ 手动
// worker 占容不拒、决策 29 污染回合（when 隐藏 → UNKNOWN_TOOL，目标零触达）、幂等
// （同 assignmentId 经 delivery 两次恰一条）。
// 口径（P6-09 (c′)、P5-03）：worker 日志里 agent-instructions / runtime-context /
// time-context 等宿主内部 user/message 不算投递——只认 sourceKind='pbots-main'；
// 每个用例独立 main session（fake 游标 per-session 连续，不随覆盖重置）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')

const home = tmkdir('bot-p611-live-')
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(dataDir, { recursive: true })

const overlay = join(home, 'p611.yml')
writeFileSync(overlay, `\
# P6-11 overlay (orchestration-send-live.test.ts)
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
    - id: p610-inspect
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')).href}'
    - id: p611-inspect
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-send-inspect.mjs')).href}'
`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const text = (t: string, paceMs = 5) => ({ paceMs, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: t },
  { type: 'block-end', index: 0, block: { type: 'text', text: t } },
  { type: 'finish', reason: { kind: 'stop' } },
] })
/** 单模型响应一个 tool-call（串行步进，结果按序）。 */
const sendCall = (id: string, botId: string, prompt: string) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: 0, id, name: 'send_to_bot', argumentsDelta: JSON.stringify({ botId, prompt }) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'send_to_bot', arguments: JSON.stringify({ botId, prompt }) } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })
/** 单响应多 tool-call 块 → 一个并发批（isConcurrencySafe 的宿主并行路径）。 */
const sendBurst = (pairs: Array<{ id: string, botId: string, prompt: string }>) => ({ chunks: [
  ...pairs.flatMap(({ id, botId, prompt }, i) => [
    { type: 'block-start', index: i, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: i, id, name: 'send_to_bot', argumentsDelta: JSON.stringify({ botId, prompt }) },
    { type: 'block-end', index: i, block: { type: 'tool-call', id, name: 'send_to_bot', arguments: JSON.stringify({ botId, prompt }) } },
  ]),
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })

const writeScript = (sessionId: string, calls: object[]) => {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

/** 主 session 一回合：prompt → 等全部 tool/result + turn/end，返回 tool 结果。 */
async function runTurn(rt: Runtime, sessionId: string, label: string) {
  const { stream } = await rt.client.follow(sessionId, { awaitSnapshot: true })
  const frames: Array<Record<string, any>> = []
  const drain = (async () => { for await (const f of stream) frames.push(f as Record<string, any>) })()
  await rt.client.call('session/prompt', { request: { requestId: `p611-${Date.now()}-${Math.random().toString(16).slice(2)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: label }] } })
  const deadline = Date.now() + 120_000
  for (;;) {
    const ended = frames.some((f) => f.event?.type === 'turn/end')
    const results = frames.filter((f) => f.event?.type === 'tool/result').length
    const calls = frames.filter((f) => f.event?.type === 'tool/call').length
    if (ended && results >= calls && calls > 0) break
    if (Date.now() > deadline) throw new Error(`${label}: timed out; frames ${JSON.stringify(frames.map((f) => f.event?.type)).slice(0, 400)}`)
    await sleep(100)
  }
  stream.cancel()
  await drain
  return frames.filter((f) => f.event?.type === 'tool/result').map((f) => f.event.data as { message: { toolCallId: string, isError?: boolean }, error?: { message?: string } })
}

interface InspectEvent { seq: number, type: string, id?: string, sourceKind?: string, isError?: boolean, error?: { message?: string } | null, text?: string, reason?: string }

const readLog = async (rt: Runtime, sessionId: string): Promise<InspectEvent[]> =>
  ((await rt.client.call('p610/control', { request: { op: 'read', sessionId } })) as { events: InspectEvent[] }).events

const until = async (pred: () => Promise<boolean>, label: string, ms = 60_000) => {
  const deadline = Date.now() + ms
  for (;;) {
    if (await pred()) return
    if (Date.now() > deadline) throw new Error(`${label}: timed out`)
    await sleep(150)
  }
}

/** until 的取值版：probe 返回非 null 即返回该值。 */
const waitFor = async <T>(probe: () => Promise<T | null>, label: string, ms = 60_000): Promise<T> => {
  const deadline = Date.now() + ms
  for (;;) {
    const value = await probe()
    if (value !== null) return value
    if (Date.now() > deadline) throw new Error(`${label}: timed out`)
    await sleep(150)
  }
}

const slotsUsed = async (rt: Runtime): Promise<number> =>
  ((await rt.client.call('p610/control', { request: { op: 'slots' } })) as { used: number }).used

const visible = async (rt: Runtime, sessionId: string, tool: string): Promise<boolean> =>
  ((await rt.client.call('p610/control', { request: { op: 'visible', sessionId, tool } })) as { visible: boolean }).visible

/** 只数 pbots-main 来源的 user/message（宿主内部来源不算投递，见文件头口径）。 */
const assignsOf = (log: InspectEvent[]) =>
  log.filter((e) => e.type === 'user/message' && (e.id ?? '').startsWith('pbots-assign:') && e.sourceKind === 'pbots-main')

/**
 * 活动事件（回合 / 投递 / 回答）。session/create 即落 permission/preset 等 3 个
 * 静态 header 事件，与触达无关——「零触达」断言只看活动。
 */
const activityOf = (log: InspectEvent[]) =>
  log.filter((e) => ['user/message', 'agent/inbox/spliced', 'turn/start', 'turn/end', 'step/start', 'assistant/message', 'tool/call'].includes(e.type))

describe('P6-11 live (real Loader)', () => {
  let rt: Runtime

  const newSession = async (): Promise<string> =>
    ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId)
  const writeBots = (mainBotId: string | null, bots: Record<string, { createdBy: string }> = {}) => {
    // f3：零 worker = 省略 bots 键（生产 store 形状，CONTRACT v1.5 §3.1 决策 31）
    writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, ...(Object.keys(bots).length === 0 ? {} : { bots }) }))
  }

  beforeAll(async () => {
    writeBots('p611-boot') // f2 fail closed：首个会话建立前 bots.json 健康
    rt = await launchRuntime({ env: {
      P2SDK_PATCH: `${join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')}:${overlay}`,
      P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir,
    } })
  }, 120_000)

  afterAll(async () => { await rt?.stop() })

  it('D7 SDK + D9②：own worker 落一条 pbots-main assign 并起回合；非 createdBy / 他人 worker / 自身 → forbidden 且 prompt 计数 0', { timeout: 240_000 }, async () => {
    const M = await newSession()
    const plainBot = await newSession()
    const own = await newSession()
    const alien = await newSession()
    writeBots(M, { [own]: { createdBy: M }, [alien]: { createdBy: 'session-other-main' } })
    writeScript(own, [text('收到，继续处理', 5)])
    writeScript(M, [
      sendCall('s1', own, '把刚才的结果再核对一遍'),
      sendCall('s2', 'session-nobody', 'p'),
      sendCall('s3', plainBot, 'p'),
      sendCall('s4', alien, 'p'),
      sendCall('s5', M, 'p'),
      text('派完了'),
    ])
    const results = await runTurn(rt, M, 'd7-d9b')
    expect(results).toHaveLength(5)
    expect(results[0].message.isError ?? false).toBe(false)
    for (const r of results.slice(1)) {
      expect(r.message.isError).toBe(true)
      expect(JSON.stringify(r.error ?? r.message)).toContain('pbots/forbidden:')
    }
    // D7：目标 transcript 一条 pbots-assign:*（source pbots-main，先于 worker 回答）并起一回合
    await until(async () => (await readLog(rt, own)).some((e) => e.type === 'turn/end'), 'own worker turn ends')
    const ownLog = await readLog(rt, own)
    expect(assignsOf(ownLog)).toHaveLength(1)
    expect(ownLog.filter((e) => e.type === 'turn/end').length).toBeGreaterThanOrEqual(1)
    const firstUser = ownLog.filter((e) => e.type === 'user/message' && !['agent-instructions', 'runtime-context', 'time-context'].includes(e.sourceKind ?? ''))[0]
    expect(firstUser?.id?.startsWith('pbots-assign:')).toBe(true)
    // prompt 计数 === 0：拒绝的目标一条 assign 都没有、全程无回合（只剩 create 时的静态 header）
    expect(activityOf(await readLog(rt, plainBot))).toHaveLength(0)
    expect(activityOf(await readLog(rt, alien))).toHaveLength(0)
    // 可见性：干净回合主 bot 有 send_to_bot；worker / 非主 bot 没有
    expect(await visible(rt, M, 'send_to_bot')).toBe(true)
    expect(await visible(rt, own, 'send_to_bot')).toBe(false)
    // 占位随 worker turn/end 释放
    await until(async () => (await slotsUsed(rt)) === 0, 'slot released after worker turn')
  })

  it('D9⑩：目标回合进行中 → pbots/busy 恰一次不重试，prompt 计数 0', { timeout: 240_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [text('慢慢干', 2_000)]) // 回合持续跨过主 bot 的 send
    writeScript(M, [sendCall('b1', W, '追加一件事'), text('done')])
    await rt.client.call('session/prompt', { request: { requestId: `p611-busy-${Date.now()}`, sessionId: W, mode: 'queue', content: [{ type: 'text', text: '手动跑' }] } })
    await until(async () => (await slotsUsed(rt)) === 1, 'worker adopted and running')
    const results = await runTurn(rt, M, 'busy')
    expect(results).toHaveLength(1)
    expect(results[0].message.isError).toBe(true)
    expect(JSON.stringify(results[0].error ?? results[0].message)).toContain('pbots/busy:')
    const log = await readLog(rt, M)
    expect(log.filter((e) => e.type === 'tool/call').length).toBe(1) // 工具只被调一次（不重试）
    expect(assignsOf(await readLog(rt, W))).toHaveLength(0) // prompt 计数 0：没有 assign 落进目标
    await until(async () => (await slotsUsed(rt)) === 0, 'busy worker turn ends')
  })

  it('D9⑥′：4 空闲 worker 一个并发批 4 次 send → 恰 3 条 assign、1 个 pbots/capacity（计数 0）', { timeout: 240_000 }, async () => {
    await until(async () => (await slotsUsed(rt)) === 0, 'slots drained before burst') // 前用例残留排干
    const M = await newSession()
    const workers: string[] = []
    for (let i = 0; i < 4; i++) workers.push(await newSession())
    writeBots(M, Object.fromEntries(workers.map((w) => [w, { createdBy: M }])))
    workers.forEach((w) => writeScript(w, [text('干活', 2_000)])) // 回合不早于批内第 4 次 send 结束
    writeScript(M, [
      sendBurst(workers.map((w, i) => ({ id: `c${i}`, botId: w, prompt: `task ${i}` }))),
      text('done'),
    ])
    const results = await runTurn(rt, M, 'capacity-burst')
    expect(results).toHaveLength(4)
    expect(results.filter((r) => r.message.isError !== true)).toHaveLength(3)
    const failed = results.filter((r) => r.message.isError === true)
    expect(failed).toHaveLength(1)
    expect(JSON.stringify(failed[0].error ?? failed[0].message)).toContain('pbots/capacity:')
    await until(async () => (await slotsUsed(rt)) === 0, 'three delivered turns finish', 120_000)
    let assignTotal = 0
    let untouched = 0
    for (const w of workers) {
      const log = await readLog(rt, w)
      const assigns = assignsOf(log).length
      expect(assigns).toBeLessThanOrEqual(1)
      assignTotal += assigns
      if (assigns === 0) untouched += 1
    }
    expect(assignTotal).toBe(3) // 恰 3 条投出
    expect(untouched).toBe(1) // 被拒的那个计数 0
    for (const w of workers) if (assignsOf((await readLog(rt, w))).length === 0) {
      expect(activityOf(await readLog(rt, w))).toHaveLength(0) // 从未被唤醒（只剩 create 静态 header）
    }
  })

  it('D9⑧：用户手动跑 W1 占 1 格不被拒；主 bot 并发 send W2–W4 → 恰 2 成功 1 容量错', { timeout: 240_000 }, async () => {
    await until(async () => (await slotsUsed(rt)) === 0, 'slots drained before manual-mixed')
    const M = await newSession()
    const ws: string[] = []
    for (let i = 0; i < 4; i++) ws.push(await newSession())
    writeBots(M, Object.fromEntries(ws.map((w) => [w, { createdBy: M }])))
    ws.forEach((w) => writeScript(w, [text('干活', 2_000)]))
    await rt.client.call('session/prompt', { request: { requestId: `p611-man-w1-${Date.now()}`, sessionId: ws[0], mode: 'queue', content: [{ type: 'text', text: '手动跑' }] } })
    await until(async () => (await slotsUsed(rt)) === 1, 'manual W1 adopted (占容但不拒)')
    writeScript(M, [
      sendBurst(ws.slice(1).map((w, i) => ({ id: `m${i}`, botId: w, prompt: `task ${i}` }))),
      text('done'),
    ])
    const results = await runTurn(rt, M, 'manual-mixed')
    expect(results).toHaveLength(3)
    expect(results.filter((r) => r.message.isError !== true)).toHaveLength(2)
    const failed = results.filter((r) => r.message.isError === true)
    expect(failed).toHaveLength(1)
    expect(JSON.stringify(failed[0].error ?? failed[0].message)).toContain('pbots/capacity:')
    // 用户那条消息不被拒：W1 完整跑完自己的回合（有回答、无 assign）
    await until(async () => (await readLog(rt, ws[0])).some((e) => e.type === 'turn/end'), 'manual W1 finishes its turn', 120_000)
    const w1Log = await readLog(rt, ws[0])
    expect(assignsOf(w1Log)).toHaveLength(0)
    expect(w1Log.some((e) => e.type === 'assistant/message')).toBe(true)
    await until(async () => (await slotsUsed(rt)) === 0, 'all turns finish', 120_000)
  })

  it('决策 29：受污染回合调 send_to_bot → when 隐藏（UNKNOWN_TOOL）、worker 零触达', { timeout: 240_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(M, [sendCall('t1', W, '不该投出去'), text('done')])
    writeScript(W, [text('空闲', 5)])
    await rt.client.call('p610/control', { request: { op: 'inject', sessionId: M } }) // 投一条 pbots-worker 回报唤醒回合
    const log = await waitFor(async () => {
      const events = await readLog(rt, M)
      const calls = events.filter((e) => e.type === 'tool/call').length
      if (events.some((e) => e.type === 'turn/end') && calls > 0 && events.filter((e) => e.type === 'tool/result').length >= calls) return events
      return null
    }, 'tainted turn finishes')
    const results = log.filter((e) => e.type === 'tool/result')
    expect(results).toHaveLength(1)
    expect(results[0].isError).toBe(true) // when 隐藏：调用落空（execute 层 forbidden 由单测覆盖）
    expect(JSON.stringify(results[0].error ?? results[0].text)).not.toContain('assignmentId') // 从未投出
    expect(activityOf(await readLog(rt, W))).toHaveLength(0) // worker 零触达：prompt 计数 0
    expect(await visible(rt, M, 'send_to_bot')).toBe(false) // 污染回合内不可见
  })

  it('幂等：同 assignmentId 经 delivery 再投一次 → skipped，目标恰一条 user/message', { timeout: 240_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [text('收到', 5)])
    writeScript(M, [sendCall('idem1', W, '第一件'), text('done')])
    const results = await runTurn(rt, M, 'idem-setup')
    expect(results[0].message.isError ?? false).toBe(false)
    const okText = (await readLog(rt, M)).filter((e) => e.type === 'tool/result' && e.isError !== true).map((e) => e.text ?? '').join('')
    const { assignmentId } = JSON.parse(okText) as { sessionId: string, assignmentId: string }
    await until(async () => (await readLog(rt, W)).some((e) => e.type === 'turn/end'), 'worker turn ends')
    const before = await readLog(rt, W)
    const turnsBefore = before.filter((e) => e.type === 'turn/end').length
    const out = (await rt.client.call('p611/control', { request: { op: 'redeliver', sessionId: W, assignmentId, mainBotId: M } })) as { skipped: boolean }
    expect(out.skipped).toBe(true) // history 已持有该 id → 不再插入
    const after = await readLog(rt, W)
    expect(assignsOf(after)).toHaveLength(1) // 同 assignmentId 两次恰一条
    expect(after.filter((e) => e.type === 'turn/end').length).toBe(turnsBefore) // 未被唤醒起新回合
  })
})
