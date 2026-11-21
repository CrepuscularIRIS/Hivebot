// T-taint verifier live 探针（验收项 6「可见」口径 + 验收项 7 坏路径记录）。
// rig 抄自 orchestration-create-live.test.ts f1 describe（ORCH_YML + fake provider
// + p610-inspect）。验收临时探针：复制到 tests/unit/ 跑，跑完删除，不进 git。
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')
process.env.HOME = tmkdir('bot-ttaint-vfy-live-home-')

const ORCH_YML = join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')

const home = tmkdir('bot-ttaint-vfy-live-')
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(dataDir, { recursive: true })

const PROBE_LOG = process.env.TTAINT_VFY_LOG ?? '/tmp/bot-ttaint-vfy/probe-live.jsonl'
const probeLog = (obj: object) => { appendFileSync(PROBE_LOG, JSON.stringify({ t: new Date().toISOString(), ...obj }) + '\n') }

const overlay = join(home, 'vfy.yml')
writeFileSync(overlay, `\
# T-taint vfy probe overlay
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
`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const text = (t: string, paceMs = 5) => ({ paceMs, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: t },
  { type: 'block-end', index: 0, block: { type: 'text', text: t } },
  { type: 'finish', reason: { kind: 'stop' } },
] })

const createCall = (id: string, name: string, prompt: string) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: 0, id, name: 'create_bot', argumentsDelta: JSON.stringify({ name, prompt }) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'create_bot', arguments: JSON.stringify({ name, prompt }) } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })

interface InspectEvent { seq: number, type: string, sourceKind?: string, isError?: boolean, error?: { message?: string } | null, text?: string }

describe('T-taint vfy live probe (验收项 6/7)', () => {
  let rt: Runtime

  const newSession = async (): Promise<string> =>
    ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId)
  const writeLocalScript = (sessionId: string, calls: object[]) => {
    writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
  }
  const writeBots = (mainBotId: string) => {
    writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {} }))
  }
  const readLog = async (sessionId: string): Promise<InspectEvent[]> =>
    ((await rt.client.call('p610/control', { request: { op: 'read', sessionId } })) as { events: InspectEvent[] }).events
  const inject = (sessionId: string, kind: string) =>
    rt.client.call('p610/control', { request: { op: 'inject', sessionId, kind, id: `ttaint-vfy-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}` } })
  const visibleTool = async (sessionId: string, tool: string): Promise<boolean> =>
    ((await rt.client.call('p610/control', { request: { op: 'visible', sessionId, tool } })) as { visible: boolean }).visible

  beforeAll(async () => {
    writeBots('ttaint-vfy-boot')
    rt = await launchRuntime({ env: { P2SDK_PATCH: `${ORCH_YML}:${overlay}`, P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir } })
  }, 120_000)

  afterAll(async () => { await rt?.stop() })

  // 验收项 7 对照变体 C：goal 回合（when 隐藏 create_bot）内 fake 调 create_bot，
  // 记录实际 tool/result 文本——区分「when 隐藏→UNKNOWN_TOOL」与「followup 一律 UNKNOWN_TOOL」。
  it('C: goal round (tool hidden) calling create_bot — record actual tool result', { timeout: 180_000 }, async () => {
    const M = await newSession()
    writeBots(M)
    writeLocalScript(M, [createCall('ttaint-vfy-goal', 'bad', 'p'), text('done')])
    await inject(M, 'goal')
    const events = await (async (): Promise<InspectEvent[]> => {
      const deadline = Date.now() + 60_000
      for (;;) {
        const all = await readLog(M)
        const goal = all.some((e) => e.type === 'user/message' && e.sourceKind === 'goal')
        const results = all.filter((e) => e.type === 'tool/result').length
        const calls = all.filter((e) => e.type === 'tool/call').length
        const ended = all.some((e) => e.type === 'turn/end')
        if (goal && ended && calls > 0 && results >= calls) return all
        if (Date.now() > deadline) throw new Error('goal turn did not finish')
        await sleep(150)
      }
    })()
    const results = events.filter((e) => e.type === 'tool/result')
    expect(results).toHaveLength(1)
    expect(results[0].isError).toBe(true)
    probeLog({ case: 'C', toolResult: { isError: results[0].isError, error: results[0].error, text: results[0].text } })
  })

  // 验收项 6（残留事实记录）：goal / schedule 回合 send_to_bot / stop_bot 仍可见，
  // create_bot 隐藏（对照，证明回合确实进入了 coordinatorTainted 状态）。
  it('A: goal/schedule rounds — send_to_bot & stop_bot visible=true (残留), create_bot visible=false (对照)', { timeout: 180_000 }, async () => {
    const M = await newSession()
    writeBots(M)
    writeLocalScript(M, [text('ok')])

    // goal 回合
    await inject(M, 'goal')
    await (async () => {
      const deadline = Date.now() + 60_000
      for (;;) {
        const events = await readLog(M)
        const goal = events.some((e) => e.type === 'user/message' && e.sourceKind === 'goal')
        const ended = events.some((e) => e.type === 'turn/end')
        if (ended && goal) return
        if (Date.now() > deadline) throw new Error('goal turn did not finish')
        await sleep(150)
      }
    })()
    const goalSend = await visibleTool(M, 'send_to_bot')
    const goalStop = await visibleTool(M, 'stop_bot')
    const goalCreate = await visibleTool(M, 'create_bot')

    // schedule 回合（下一 turn）
    await inject(M, 'schedule')
    await (async () => {
      const deadline = Date.now() + 60_000
      const before = (await readLog(M)).length
      for (;;) {
        const events = await readLog(M)
        const sched = events.slice(before).some((e) => e.type === 'user/message' && e.sourceKind === 'schedule')
        const ended = events.filter((e) => e.type === 'turn/end').length >= 2
        if (ended && sched) return
        if (Date.now() > deadline) throw new Error('schedule turn did not finish')
        await sleep(150)
      }
    })()
    const schedSend = await visibleTool(M, 'send_to_bot')
    const schedStop = await visibleTool(M, 'stop_bot')
    const schedCreate = await visibleTool(M, 'create_bot')

    probeLog({ case: 'A', goalSend, goalStop, goalCreate, schedSend, schedStop, schedCreate })
    // 残留事实（记录口径）：send/stop 可见 = true；对照：create 不可见 = false
    expect({ goalSend, goalStop, goalCreate, schedSend, schedStop, schedCreate }).toEqual({
      goalSend: true, goalStop: true, goalCreate: false,
      schedSend: true, schedStop: true, schedCreate: false,
    })
  })

  // 验收项 7（坏路径记录）：user-approval 来源（不污染任何口径）唤醒的回合里，
  // fake 模型调 create_bot → 记录实际 tool/result（作者申报为 UNKNOWN_TOOL 现象）。
  it('B: user-approval round calling create_bot — record actual tool result (UNKNOWN_TOOL 线索)', { timeout: 180_000 }, async () => {
    const M = await newSession()
    writeBots(M)
    writeLocalScript(M, [createCall('ttaint-vfy-ua', 'bad', 'p'), text('done')])

    await inject(M, 'user-approval')
    const events = await (async (): Promise<InspectEvent[]> => {
      const deadline = Date.now() + 60_000
      for (;;) {
        const all = await readLog(M)
        const ua = all.some((e) => e.type === 'user/message' && e.sourceKind === 'user-approval')
        const results = all.filter((e) => e.type === 'tool/result').length
        const calls = all.filter((e) => e.type === 'tool/call').length
        const ended = all.some((e) => e.type === 'turn/end')
        if (ua && ended && calls > 0 && results >= calls) return all
        if (Date.now() > deadline) throw new Error('user-approval turn did not finish')
        await sleep(150)
      }
    })()

    const results = events.filter((e) => e.type === 'tool/result')
    expect(results).toHaveLength(1)
    // 记录现象（不展开根因）：isError 且文本实际内容写入日志；断言只锚定 isError
    expect(results[0].isError).toBe(true)
    probeLog({ case: 'B', toolResult: { isError: results[0].isError, error: results[0].error, text: results[0].text } })
    // 对照：回合结束后（无污染）create_bot 应可见——证明 UNKNOWN_TOOL 非污染隐藏所致
    expect(await visibleTool(M, 'create_bot')).toBe(true)
  })
})
