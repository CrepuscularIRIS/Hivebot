// P6-10 真 Loader 用例（PLAN 验收 ②③③′⑥⑦⑫）：orchestration.yml 挂生产插件，
// fake 模型驱动 create_bot；测试进程扮演 main（订阅 pbots/orchestration.requests
// + session/create + respond），复刻 S2 §4.2 已证实的往返。RT1：happy path /
// 工具表可见性 / 容量与释放 / 错 Peer / 换主失权 / 身份 fail closed；SIGKILL 后
// RT1b 验 worker session 与 pbots-assign 持久；RT2（createTimeoutMs 500 +
// crashAt after-create）验超时、占位释放、迟到 respond 拒与冷 session 崩溃窗口。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { connect } from '../../examples/lib/client.mjs'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')
process.env.HOME = tmkdir('bot-p610-live-home-')

const ORCH_YML = join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')
const PLUGIN_URL = pathToFileURL(join(PKG_ROOT, 'src', 'orchestration', 'main-channel.mjs')).href
const ORCH_ENDPOINT = 'pbots/orchestration.requests'
const ORCH_RESPOND = 'pbots/orchestration.respond'

const home = tmkdir('bot-p610-live-')
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(dataDir, { recursive: true })

/** RT1 overlay：fake provider + inspect 插件（工具表可见性 / 日志读取）。 */
const overlay1 = join(home, 'rt1.yml')
writeFileSync(overlay1, `\
# P6-10 RT1 overlay (orchestration-create-live.test.ts)
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

/** RT2 overlay：超时 500ms + crashAt（同 id 整行替换 orchestration.yml 的插件行）。 */
const overlay2 = join(home, 'rt2.yml')
writeFileSync(overlay2, `\
# P6-10 RT2 overlay: short timeout + after-create crash injection
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
    - id: pbots-orchestration
      name: '${PLUGIN_URL}'
      config:
        createTimeoutMs: 500
        crashAt: after-create
`)

/** RT2b overlay：crashAt 关（重启后正常）。 */
const overlay3 = join(home, 'rt2b.yml')
writeFileSync(overlay3, `\
# P6-10 RT2b overlay: no crash injection
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
    - id: pbots-orchestration
      name: '${PLUGIN_URL}'
      config:
        createTimeoutMs: 500
`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** paceMs 在 call 级（fake/plugin.mjs:158 逐 chunk 后 sleep call.paceMs）。 */
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

function writeScript(sessionId: string, calls: object[]) {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

/** 主 session 一回合：prompt → 等全部 tool/result + turn/end，返回 tool 结果。 */
async function runTurn(rt: Runtime, sessionId: string, label: string) {
  const { stream } = await rt.client.follow(sessionId, { awaitSnapshot: true })
  const frames: Array<Record<string, any>> = []
  const drain = (async () => { for await (const f of stream) frames.push(f as Record<string, any>) })()
  await rt.client.call('session/prompt', { request: { requestId: `p610-${Date.now()}-${Math.random().toString(16).slice(2)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: label }] } })
  const deadline = Date.now() + 60_000
  for (;;) {
    const ended = frames.some((f) => f.event?.type === 'turn/end')
    const results = frames.filter((f) => f.event?.type === 'tool/result').length
    const calls = frames.filter((f) => f.event?.type === 'tool/call').length
    if (ended && results >= calls) break
    if (Date.now() > deadline) throw new Error(`${label}: timed out; frames ${JSON.stringify(frames.map((f) => f.event?.type)).slice(0, 400)}`)
    await sleep(100)
  }
  stream.cancel()
  await drain
  return frames.filter((f) => f.event?.type === 'tool/result').map((f) => f.event.data as { message: { toolCallId: string, isError?: boolean }, error?: { message?: string } })
}

interface InspectEvent { seq: number, type: string, id?: string, sourceKind?: string, callId?: string, isError?: boolean, error?: { message?: string } | null, text?: string, reason?: string }

const readLog = async (rt: Runtime, sessionId: string): Promise<InspectEvent[]> => {
  const r = (await rt.client.call('p610/control', { request: { op: 'read', sessionId } })) as { events: InspectEvent[] }
  return r.events
}

const until = async (pred: () => Promise<boolean>, label: string, ms = 30_000) => {
  const deadline = Date.now() + ms
  for (;;) {
    if (await pred()) return
    if (Date.now() > deadline) throw new Error(`${label}: timed out`)
    await sleep(150)
  }
}

/** main 角色订阅者：等 ready 帧（订阅已在 SDK 侧 attach）后逐请求回调。 */
async function subscribe(rt: Runtime, onRequest: (item: Record<string, any>) => void) {
  const requests = await rt.client.socket.open(ORCH_ENDPOINT, {})
  const iterator = requests[Symbol.asyncIterator]()
  const first = await iterator.next()
  if (first.done || (first.value as Record<string, any>)?.ready !== true) {
    throw new Error(`orch stream not ready: ${JSON.stringify(first.value)}`)
  }
  const pump = (async () => {
    try {
      for (;;) {
        const next = await iterator.next()
        if (next.done) return
        const item = next.value as Record<string, any>
        if (item.ready === true) continue
        onRequest(item)
      }
    } catch {
      // SDK 崩溃 / 流断开时 iterator 拒绝属预期，不外抛（unhandled rejection）
    }
  })()
  return { cancel: () => { requests.cancel(); void pump } }
}

const writeBotsJson = (mainBotId: string | null, bots?: Record<string, { createdBy: string }>) => {
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, ...(bots ? { bots } : {}) }))
}

describe('P6-10 live (real Loader)', () => {
  let rt: Runtime
  let B = ''

  /** 每用例独立 main session（P5-03：fake 游标 per-session 不随覆盖重置）。 */
  const newMain = async (): Promise<string> => {
    const id = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
    writeBotsJson(id)
    return id
  }

  beforeAll(async () => {
    rt = await launchRuntime({ env: { P2SDK_PATCH: `${ORCH_YML}:${overlay1}`, P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir } })
    B = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
  }, 120_000)

  afterAll(async () => { await rt?.stop() })

  it('③ no subscriber → immediate main-unavailable, slot untouched', { timeout: 120_000 }, async () => {
    const M = await newMain()
    writeScript(M, [createCall('c0', 'w0', '没人订阅'), text('done')])
    const started = Date.now()
    const results = await runTurn(rt, M, 'no-subscriber')
    expect(Date.now() - started).toBeLessThan(30_000)
    expect(results).toHaveLength(1)
    expect(results[0].message.isError).toBe(true)
    expect(JSON.stringify(results[0].error ?? results[0].message)).toContain('main-unavailable')
  })

  it('② happy path: channel round trip, assign lands first, visibility gated', { timeout: 180_000 }, async () => {
    const M = await newMain()
    let worker = ''
    const sub = await subscribe(rt, async (item) => {
      expect(item.kind).toBe('create-bot')
      expect(item.mainBotId).toBe(M)
      const w = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
      worker = w
      writeScript(w, [text('干完了', 5)])
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, value: { sessionId: w } } })
    })
    try {
      writeScript(M, [createCall('c1', '调研员', '帮我看下X'), text('派完了')])
      const results = await runTurn(rt, M, 'happy')
      expect(results[0].message.isError ?? false).toBe(false)
      // 工具结果文本携带 {sessionId}（P6-15 Messaging 行对接约束）
      const log = await readLog(rt, M)
      const createResult = log.filter((e) => e.type === 'tool/result').map((e) => e.text ?? '').join('')
      expect(createResult).toContain(worker)
      // worker 首条 user/message = pbots-assign:*（source.kind = pbots-main），且在回答前
      await until(async () => (await readLog(rt, worker)).some((e) => e.type === 'user/message'), 'assign lands')
      const wlog = await readLog(rt, worker)
      const firstUser = wlog.find((e) => e.type === 'user/message')!
      expect(firstUser.id!.startsWith('pbots-assign:')).toBe(true)
      expect(firstUser.sourceKind).toBe('pbots-main')
      // D4：非主 bot 工具表无 create_bot；主 bot 有。P6-10.f2a 顺序无关：非主
      // 对照用本例的 worker（其 assign 回合刚跑过，必为 live agent）——beforeAll
      // 的 B 在 ⑫ 重启后只剩盘上 session，无 live agent，p610/not-found 假红。
      const visible = async (sessionId: string) => ((await rt.client.call('p610/control', { request: { op: 'visible', sessionId, tool: 'create_bot' } })) as { visible: boolean }).visible
      expect(await visible(M)).toBe(true)
      expect(await visible(worker)).toBe(false)
    } finally {
      sub.cancel()
    }
  })

  it('⑦⑥ D9-6: 3 running workers → 4th create rejects with pbots/capacity; released slots recycle', { timeout: 180_000 }, async () => {
    const M = await newMain()
    // P6-10.f2a 顺序无关：前序用例的占位在其 worker turn/end 后释放（毫秒级），
    // 这里显式等清零再开——本例断言精确的 3 满 + 4 拒，任何残留占位都会假红。
    await until(async () => ((await rt.client.call('p610/control', { request: { op: 'slots' } })) as { used: number }).used === 0, 'slots drained before capacity case', 30_000)
    const created: string[] = []
    const sub = await subscribe(rt, async (item) => {
      const w = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
      created.push(w)
      writeScript(w, [text('慢慢干', 2_000)]) // 回合持续运行（4 chunk × 2s），跨过第 4 次 create 即可
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, value: { sessionId: w } } })
    })
    writeScript(M, [createCall('k1', 'w1', 'p1'), createCall('k2', 'w2', 'p2'), createCall('k3', 'w3', 'p3'), createCall('k4', 'w4', 'p4'), text('done')])
    const results = await runTurn(rt, M, 'capacity')
    expect(results).toHaveLength(4)
    // 前 3 个成功（此前 happy path 的占位已在 worker turn/end 释放）
    expect(results.slice(0, 3).every((r) => r.message.isError !== true)).toBe(true)
    const fourth = results[3]
    expect(fourth.message.isError).toBe(true)
    expect(JSON.stringify(fourth.error ?? fourth.message)).toContain('pbots/capacity')
    sub.cancel()
    // 等占位 worker 的 turn/end（占位释放）再放行后续用例
    await until(async () => {
      for (const w of created) {
        const log = await readLog(rt, w)
        if (!log.some((e) => e.type === 'turn/end')) return false
      }
      return true
    }, 'capacity workers finish their turns', 60_000)
  })

  it('③ wrong-peer respond is rejected; the holding peer can still answer', { timeout: 180_000 }, async () => {
    const M = await newMain()
    const client2 = await connect({ baseUrl: rt.baseUrl, token: rt.token })
    let sawRequest = false
    let item: Record<string, any> | undefined
    const sub = await subscribe(rt, (got) => { sawRequest = true; item = got })
    let turnDone: Promise<unknown> = Promise.resolve()
    const guard = async () => {
      // 等请求出现 → 错 Peer 先答（被拒）→ 持流 Peer 再答
      await until(async () => sawRequest, 'request arrives')
      await expect(client2.call(ORCH_RESPOND, { request: { requestId: item!.requestId, value: { sessionId: 'hijack' } } })).rejects.toThrow()
      const w = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
      writeScript(w, [text('ok')])
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item!.requestId, value: { sessionId: w } } })
    }
    writeScript(M, [createCall('p1', 'w5', 'p'), text('done')])
    turnDone = runTurn(rt, M, 'wrong-peer')
    await guard()
    const results = (await turnDone) as Awaited<ReturnType<typeof runTurn>>
    expect(results[0].message.isError ?? false).toBe(false)
    sub.cancel()
    client2.close()
  })

  it('⑥ 换主后旧主失权 + 身份读取失败 fail closed', { timeout: 180_000 }, async () => {
    const M = await newMain()
    // 同 session 两回合，整段脚本一次写全（fake 游标 per-session 连续，P5-03）
    writeScript(M, [createCall('x1', 'w6', 'p'), text('done1'), createCall('x2', 'w7', 'p'), text('done2')])
    // 换主：B 成为主 bot → M 的 create_bot 调用被拒（when 隐藏 + execute 拒）
    writeBotsJson(B)
    let results = await runTurn(rt, M, 'demoted')
    expect(results[0].message.isError).toBe(true)
    // 身份读取失败（坏 JSON）→ fail closed
    writeFileSync(join(dataDir, 'bots.json'), '{broken')
    results = await runTurn(rt, M, 'identity-broken')
    expect(results[0].message.isError).toBe(true)
  })

  it('⑫ durability: SIGKILL + restart keeps the worker session with its pbots-assign first message', { timeout: 240_000 }, async () => {
    // P6-10.f2a 顺序无关：自建 worker（原实现复用 ② 的 happyWorker，② 未先跑则
    // 空路径红）；结束时把重启后的 runtime 留作本 describe 的 rt（原实现杀掉共享
    // runtime 后不补，后续任何用例 ECONNREFUSED）。
    const M = await newMain()
    let worker = ''
    const sub = await subscribe(rt, async (item) => {
      const w = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
      worker = w
      writeScript(w, [text('干完了', 5)])
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, value: { sessionId: w } } })
    })
    try {
      writeScript(M, [createCall('dur', 'w-dur', '帮我看下X'), text('派完了')])
      const results = await runTurn(rt, M, 'durability-create')
      expect(results[0].message.isError ?? false).toBe(false)
    } finally {
      sub.cancel()
    }
    // 杀掉自己 spawn 的 dsh（孙进程，字面 PID——锁文件第 2 行；launcher 会转发
    // SIGTERM，故不能杀 launcher 模拟崩溃，CLAUDE.md §5 允许清理自己 spawn 的子进程）
    const dshPid = Number(readFileSync(join(home, 'launcher.lock'), 'utf8').trim().split('\n')[1].split(':')[0])
    process.kill(dshPid, 'SIGKILL')
    await new Promise<void>((resolve) => { rt.child.once('exit', () => resolve()) })
    rt.client.close()
    const rt2 = await launchRuntime({ env: { P2SDK_PATCH: `${ORCH_YML}:${overlay1}`, P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir } })
    let kept = false
    try {
      const wlog = await readLog(rt2, worker)
      const firstUser = wlog.find((e) => e.type === 'user/message')
      expect(firstUser?.id?.startsWith('pbots-assign:')).toBe(true)
      expect(firstUser?.sourceKind).toBe('pbots-main')
      // D4：重启后 worker 仍可写（非只读）：prompt → 完成 a turn
      writeScript(worker, [text('重启后继续', 5)])
      await rt2.client.call('session/prompt', { request: { requestId: `p610-re-${Date.now()}`, sessionId: worker, mode: 'queue', content: [{ type: 'text', text: '继续' }] } })
      await until(async () => (await readLog(rt2, worker)).filter((e) => e.type === 'turn/end').length >= 2, 'worker writable after restart')
      kept = true
    } finally {
      if (kept) rt = rt2
      else await rt2.stop()
    }
  })
})

describe('P6-10 live RT2 (timeout + crash window)', () => {
  // P6-10.f2a 顺序无关：独立 home/dataDir——与 RT1 共 home 时随机顺序下两个
  // runtime 会抢 launcher.lock、bots.json 互相踩；隔离后与 f1 describe 同构。
  const home2 = tmkdir('bot-p610-live-rt2-')
  const dataDir2 = join(home2, 'data')
  let rt: Runtime
  let M = ''

  const writeScript2 = (sessionId: string, calls: object[]) => {
    writeFileSync(join(home2, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
  }
  const writeBotsJson2 = (mainBotId: string | null) => {
    writeFileSync(join(dataDir2, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {} }))
  }

  beforeAll(async () => {
    mkdirSync(join(home2, 'fake', 'scripts'), { recursive: true })
    mkdirSync(dataDir2, { recursive: true })
    rt = await launchRuntime({ env: { P2SDK_PATCH: overlay2, P2SDK_HOME: home2, PBOTS_DATA_DIR: dataDir2, P2SDK_ORCH_DATA_DIR: dataDir2 } })
    M = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
    writeBotsJson2(M)
  }, 120_000)

  afterAll(async () => { await rt?.stop() })

  it("③′ timeout: ≤1.5s main-unavailable + outcome unknown; slots released (no capacity on 3 more); late respond rejected", { timeout: 240_000 }, async () => {
    // P6-10.f2a 顺序无关：crash 例若先跑已改写 bots.json（其自有 main），此处重申本例的 main。
    writeBotsJson2(M)
    const requests: Record<string, any>[] = []
    const sub = await subscribe(rt, (item) => { requests.push(item) })
    writeScript2(M, [createCall('t1', 'w', 'p'), createCall('t2', 'w', 'p'), createCall('t3', 'w', 'p'), createCall('t4', 'w', 'p'), text('done')])
    const started = Date.now()
    const results = await runTurn(rt, M, 'timeouts')
    const elapsed = Date.now() - started
    expect(results).toHaveLength(4)
    for (const r of results) {
      expect(r.message.isError).toBe(true)
      const blob = JSON.stringify(r.error ?? r.message)
      expect(blob).toContain('main-unavailable')
      expect(blob).not.toContain('pbots/capacity')
    }
    expect(elapsed).toBeLessThan(4 * 1_500 + 10_000)
    await until(async () => requests.length >= 4, 'all four requests queued')
    sub.cancel()
    // 迟到 respond 被拒（超时条目已删）
    await expect(rt.client.call(ORCH_RESPOND, { request: { requestId: requests[0].requestId, value: { sessionId: 'late' } } })).rejects.toThrow()
  })

  it('⑫ crash window: crashAt after-create exits before delivery; restart is clean and the orphan worker has no assign', { timeout: 240_000 }, async () => {
    const M = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
    writeBotsJson2(M)
    let worker = ''
    const sub = await subscribe(rt, async (item) => {
      const w = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId
      worker = w
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, value: { sessionId: w } } })
    })
    writeScript2(M, [createCall('z1', 'wz', 'p'), text('done')])
    // 发起回合；SDK 在 #3 返回后、投递前 process.exit(86)（dsh 进程内）。
    // prompt 调用可能赶上进程退出（socket 先断），失败不算错。
    await rt.client.call('session/prompt', { request: { requestId: `p610-crash-${Date.now()}`, sessionId: M, mode: 'queue', content: [{ type: 'text', text: '派一个' }] } }).catch(() => {})
    await new Promise<void>((resolve) => { rt.child.once('exit', () => resolve()) })
    rt.client.close()
    expect(rt.child.exitCode).not.toBe(0)
    // 重启（crashAt 关）：main 与 SDK 都不报错；worker 已 flush（session 在）但无 assign
    const rt2 = await launchRuntime({ env: { P2SDK_PATCH: overlay3, P2SDK_HOME: home2, PBOTS_DATA_DIR: dataDir2, P2SDK_ORCH_DATA_DIR: dataDir2 } })
    // P6-10.f2a 顺序无关：断言通过则把重启后的 runtime 留作本 describe 的 rt
    // （overlay3 同为 500ms 超时、无 crashAt，③′ 在本例之后跑语义不变）。
    let kept = false
    try {
      const listed = (await rt2.client.call('session/list', { _request: {} }) as { items: Array<{ sessionId: string }> }).items
      expect(listed.some((s) => s.sessionId === worker)).toBe(true)
      const wlog = await readLog(rt2, worker)
      expect(wlog.some((e) => e.type === 'user/message' && (e.id ?? '').startsWith('pbots-assign:'))).toBe(false)
      kept = true
    } finally {
      if (kept) rt = rt2
      else await rt2.stop()
    }
  })
})

// P6-10.f1：VERIFY-P6-10 两条 [major] 的真 Loader 复现（探针来自
// evidence/P6-10-vfy/probe-taint.test.ts / probe-manual.test.ts）。独立 home +
// 独立 runtime：sharedSlots 与 TurnOrigin 都是 SDK 进程内状态，与前两个 describe
// 的 bots.json / 容量互不污染。
describe('P6-10.f1 live (taint guard + manual worker adoption)', () => {
  const f1home = tmkdir('bot-p610f1-live-')
  const f1data = join(f1home, 'data')
  let rt: Runtime

  beforeAll(async () => {
    mkdirSync(join(f1home, 'fake', 'scripts'), { recursive: true })
    mkdirSync(f1data, { recursive: true })
    const overlay = join(f1home, 'f1.yml')
    writeFileSync(overlay, `\
# P6-10.f1 overlay (orchestration-create-live.test.ts)
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
    rt = await launchRuntime({ env: { P2SDK_PATCH: `${ORCH_YML}:${overlay}`, P2SDK_HOME: f1home, PBOTS_DATA_DIR: f1data, P2SDK_ORCH_DATA_DIR: f1data } })
  }, 120_000)

  afterAll(async () => { await rt?.stop() })

  const newSession = async (): Promise<string> =>
    ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } }) as { sessionId: string }).sessionId)
  const writeLocalScript = (sessionId: string, calls: object[]) => {
    writeFileSync(join(f1home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
  }
  const slotsUsed = async (): Promise<number> =>
    ((await rt.client.call('p610/control', { request: { op: 'slots' } })) as { used: number }).used
  /** until 的取值版：probe 返回非 null 即返回该值。 */
  const waitFor = async <T>(probe: () => Promise<T | null>, label: string, ms = 30_000): Promise<T> => {
    const deadline = Date.now() + ms
    for (;;) {
      const value = await probe()
      if (value !== null) return value
      if (Date.now() > deadline) throw new Error(`${label}: timed out`)
      await sleep(150)
    }
  }

  it('① 污染回合：认领 pbots-worker 后 create_bot 不可见、execute 拒；0 次建 bot请求', { timeout: 180_000 }, async () => {
    const M = await newSession()
    writeFileSync(join(f1data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {} }))
    writeLocalScript(M, [createCall('f1-taint', 'bad', 'p'), text('done')])
    let requests = 0
    const sub = await subscribe(rt, async (item) => {
      requests += 1
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, error: { code: 'test/reached-main', message: 'must not reach main' } } }).catch(() => {})
    })
    try {
      // 注入一条 pbots-worker 来源的回报（决策 27④ followup 形态），由它唤醒回合
      await rt.client.call('p610/control', { request: { op: 'inject', sessionId: M } })
      const log = await waitFor(async () => {
        const events = await readLog(rt, M)
        const calls = events.filter((e) => e.type === 'tool/call').length
        const ended = events.some((e) => e.type === 'turn/end')
        return ended && calls > 0 && events.filter((e) => e.type === 'tool/result').length >= calls ? events : null
      }, 'tainted turn finishes')
      const results = log.filter((e) => e.type === 'tool/result')
      expect(results).toHaveLength(1)
      expect(results[0].isError).toBe(true)
      expect(results[0].text).not.toContain('reached-main') // 不是「main 答了错误」，是根本没到 main
      await sleep(300) // 让订阅 pump 走完
      expect(requests).toBe(0) // 验收：0 次建 bot 请求
      // when 已接 turn-origin：受污染回合内工具表不可见
      const visible = ((await rt.client.call('p610/control', { request: { op: 'visible', sessionId: M, tool: 'create_bot' } })) as { visible: boolean }).visible
      expect(visible).toBe(false)
      expect(await slotsUsed()).toBe(0)
    } finally {
      sub.cancel()
    }
  })

  it('② 人工启动的 worker：running 时共享容量收养为 1，turn/end 释放', { timeout: 180_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeFileSync(join(f1data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: { [W]: { createdBy: M } } }))
    writeLocalScript(W, [text('working', 2_000)]) // 4 chunk × 2s，跨过容量断言
    expect(await slotsUsed()).toBe(0)
    await rt.client.call('session/prompt', { request: { requestId: `p610f1-manual-${Date.now()}`, sessionId: W, mode: 'queue', content: [{ type: 'text', text: '手动跑' }] } })
    await until(async () => {
      const list = (await rt.client.call('session/list', { _request: {} }) as { items: Array<{ sessionId: string, running: boolean }> })
      return list.items.find((s) => s.sessionId === W)?.running === true
    }, 'manual worker running')
    expect(await slotsUsed()).toBe(1) // 验收：人工 running worker 容量 ≥1
    await until(async () => (await readLog(rt, W)).some((e) => e.type === 'turn/end'), 'manual worker turn ends', 60_000)
    expect(await slotsUsed()).toBe(0)
  })

  // P6-10.f1a：VERIFY-P6-10f1 [FIX] major 场景复测——4 人工 worker 起跑、1 个先
  // 结束，剩 3 个 running 时容量必须仍满（修复前虚报 2，第 4 个 create 突破保护）。
  it('②′ 容量溢出补收养：4 人工 worker 起跑、1 个先结束 → slots 仍 3，第 4 个 create 被拒；全部结束归零、结束后新建占 1', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const workers: string[] = []
    for (let i = 0; i < 4; i++) workers.push(await newSession())
    writeFileSync(join(f1data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: Object.fromEntries(workers.map((w) => [w, { createdBy: M }])) }))
    const runningCount = async () =>
      ((await rt.client.call('session/list', { _request: {} }) as { items: Array<{ sessionId: string, running: boolean }> })
        .items.filter((s) => workers.includes(s.sessionId) && s.running)).length
    const promptWorker = (W: string, tag: string) =>
      rt.client.call('session/prompt', { request: { requestId: `p610f1a-${tag}-${Date.now()}`, sessionId: W, mode: 'queue', content: [{ type: 'text', text: '手动跑' }] } })
    // 首个 worker 快结束（4 chunk × 700ms），其余慢（4 chunk × 6s）跨过断言窗口
    workers.forEach((W, i) => writeLocalScript(W, [text('working', i === 0 ? 700 : 6_000)]))
    for (const [i, W] of workers.entries()) await promptWorker(W, `w${i}`)
    await until(async () => (await runningCount()) === 4, 'all four workers running', 60_000)
    expect(await slotsUsed()).toBe(3)
    await until(async () => (await runningCount()) === 3, 'first worker ended', 60_000)
    expect(await slotsUsed()).toBe(3) // f1a 修复点：释放后补收养满额 worker，不虚报 2
    let requests = 0
    const sub = await subscribe(rt, async (item) => {
      requests += 1
      await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, error: { code: 'test/overflow-reached-main', message: 'must be capacity rejected' } } }).catch(() => {})
    })
    try {
      writeLocalScript(M, [createCall('f1a-overflow', 'w5', '再派一个'), text('派完了')])
      const results = await runTurn(rt, M, 'overflow-create')
      expect(requests).toBe(0) // 3 个 running 时第 4 个 create 被拒：0 次建 bot 请求
      expect(results).toHaveLength(1)
      expect(results[0].message.isError).toBe(true)
      expect(JSON.stringify(results[0].error ?? results[0].message)).toContain('pbots/capacity')
    } finally {
      sub.cancel()
    }
    await until(async () => (await runningCount()) === 0, 'all workers ended', 120_000)
    expect(await slotsUsed()).toBe(0) // 全部结束归零
    writeLocalScript(workers[0], [text('again', 300)]) // 结束后新建：能占上
    await promptWorker(workers[0], 'again')
    await until(async () => (await slotsUsed()) === 1, 're-created worker occupies 1', 60_000)
    await until(async () => (await runningCount()) === 0, 're-created worker ended', 60_000)
    expect(await slotsUsed()).toBe(0)
  })
})
