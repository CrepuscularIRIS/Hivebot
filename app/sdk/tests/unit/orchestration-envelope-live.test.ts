// P6-14 真 Loader 用例（PLAN P6-14 验收；BRIEF D9③④⑤⑦）。orchestration.yml 挂
// 生产插件（含 envelope），fake 模型驱动 worker 会话（bots.json createdBy + 显式
// cwd 复刻 main 建的 workspaces/<id> 布局）：
//  ① 工具表：worker 无协调者工具（D9③）+ 入口清单从已装注册表枚举（visible 逐名
//     探测 → enumerateInstalledEntries 全集）；
//  ② 再委派 7 入口全拒、新增子会话 0（D9④）；
//  ③ 后台作业（run_in_background / schedule_* / job_*）拒（D9⑤）+ 顺序差分格：
//     同名 bash 仅 run_in_background 翻转 → 信封字面串 + asked===0 vs shell-ask
//     出卡 asked≥1（envelope prepend 在 shell-ask 之前，LEARNINGS P5-04.f1）；
//  ④ direct execute：worker 强调 create_bot / send_to_bot / stop_bot → 信封字面
//     串（工具表隐藏之外的第二道，且区分于 create.mjs 自身的 main 校验文案；
//     stop_bot 自 944afa0（P6-13）起注册，本格为真检查）；
//  ⑤ D9⑦ P5-06 矩阵子集在 worker 会话复跑（NEVER 路径拒读 / 工作区互不可见 /
//     自己工作区可写），基线含 W3.f1 后的 main。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import {
  COORDINATOR_TOOLS, DELEGATION_TOOLS, JOB_TOOLS, RESTRICT_TOOLS, enumerateInstalledEntries,
} from '../../src/orchestration/envelope.mjs'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')
// HOME 软遮蔽根（P5 guard 的 homes）：工作区互不可见格用它派生两棵 ws。
process.env.HOME = tmkdir('bot-p614-live-home-')

const home = tmkdir('bot-p614-live-') // P2SDK_HOME（dsh 子进程，硬 NEVER 根）
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(dataDir, { recursive: true })
const WS_MAIN = join(process.env.HOME, 'ws', 'main')
const WS_W = join(process.env.HOME, 'ws', 'w1')
const WS_OTHER = join(process.env.HOME, 'ws', 'other')
for (const ws of [WS_MAIN, WS_W, WS_OTHER]) mkdirSync(ws, { recursive: true })

const overlay = join(home, 'p614.yml')
writeFileSync(overlay, `\
# P6-14 overlay (orchestration-envelope-live.test.ts)
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
const toolCall = (callId: string, name: string, args: object) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args).slice(0, 5) },
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args).slice(5) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })
/** 一个并发批多枚工具调用（report-live 同款）。 */
const batchCall = (calls: Array<{ id: string, name: string, args: object }>) => ({ chunks: calls.flatMap((c, i) => [
  { type: 'block-start', index: i, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: i, id: c.id, name: c.name, argumentsDelta: JSON.stringify(c.args) },
  { type: 'block-end', index: i, block: { type: 'tool-call', id: c.id, name: c.name, arguments: JSON.stringify(c.args) } },
]).concat([{ type: 'finish', reason: { kind: 'tool-calls' } }]) })

interface LogEvent { seq: number; type: string; isError?: boolean; text?: string; callId?: string; id?: string }
const writeScript = (sessionId: string, calls: object[]) => {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

describe('P6-14 live (real Loader)', () => {
  let rt: Runtime
  let answerer: DshClient
  let eventsFrames: any[] = []
  const answeredIds = new Set<string>()

  const control = (request: object) => rt.client.call('p610/control', { request })
  const readLog = async (sessionId: string): Promise<LogEvent[]> =>
    ((await control({ op: 'read', sessionId })) as { events: LogEvent[] }).events
  const writeBots = (mainBotId: string, bots: Record<string, { createdBy: string }>) => {
    writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, bots }))
  }
  const newSession = async (cwd: string): Promise<string> =>
    ((await rt.client.call('session/create', { request: { agentPreset: 'standard', cwd } }) as { sessionId: string }).sessionId)
  const warm = async (sessionId: string, label: string) => {
    writeScript(sessionId, [text(`warm ${label}`)])
    await runTurn(sessionId, `warm ${label}`)
  }
  const prompt = (sessionId: string, t: string) =>
    rt.client.call('session/prompt', { request: { requestId: `p614-${Date.now()}-${Math.random().toString(16).slice(2)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: t }] } })

  /** 跑完一回合：prompt → 全部 tool/result + turn/end；返回回合内日志（含 tool/result 文本与 approval/asked）。 */
  async function runTurn(sessionId: string, label: string): Promise<LogEvent[]> {
    const before = (await readLog(sessionId)).length
    await prompt(sessionId, label)
    const deadline = Date.now() + 90_000
    for (;;) {
      const log = await readLog(sessionId)
      const ended = log.some((e) => e.type === 'turn/end')
      const calls = log.filter((e) => e.type === 'tool/call').length
      const results = log.filter((e) => e.type === 'tool/result').length
      if (ended && results >= calls) return log.slice(before)
      if (Date.now() > deadline) throw new Error(`${label}: turn timed out; tail ${JSON.stringify(log.slice(-6))}`)
      await sleep(150)
    }
  }

  /** 自动应答 worker 的 bash 审批卡（approval.test.ts openEvents 模式）；deny 格不应产生卡。 */
  const approveAll = async (sessionId: string) => {
    const frame = eventsFrames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answeredIds.has(f.eventId))
    if (!frame) return
    answeredIds.add(frame.eventId)
    const ready = eventsFrames.find((f) => f.type === 'ready')
    await answerer.call('$events/result', { clientId: ready?.clientId ?? '', eventId: frame.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
  }

  const visible = async (sessionId: string, tool: string): Promise<boolean> =>
    ((await control({ op: 'visible', sessionId, tool })) as { visible: boolean }).visible

  beforeAll(async () => {
    rt = await launchRuntime({ env: {
      P2SDK_PATCH: `${join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')}:${overlay}`,
      P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir,
    } })
    answerer = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
    const stream = await answerer.socket.open('$events', {})
    void (async () => { for await (const f of stream as any) eventsFrames.push(f as any) })().catch(() => {})
    await sleep(300)
  }, 120_000)

  afterAll(async () => {
    try { answerer?.close() } catch { /* already gone */ }
    await rt?.stop()
  })

  it('① D9③ 工具表：worker 无协调者工具；入口清单从已装注册表枚举为全集', { timeout: 240_000 }, async () => {
    const M = await newSession(WS_MAIN)
    writeBots(M, {})
    await warm(M, 'main')
    const W = await newSession(WS_W)
    writeBots(M, { [W]: { createdBy: M } })
    await warm(W, 'worker')
    // D9③：主 bot 有全部三件协调者工具，worker 一件都没有
    // （stop_bot 于 944afa0（P6-13）起注册，本格是真检查）
    expect(await visible(M, 'create_bot')).toBe(true)
    expect(await visible(M, 'send_to_bot')).toBe(true)
    expect(await visible(M, 'stop_bot')).toBe(true)
    for (const tool of COORDINATOR_TOOLS) expect(await visible(W, tool), `${tool} hidden in worker`).toBe(false)
    // 清单从已装注册表枚举：standard preset 的 delegation/jobs 入口在主 bot 工具表
    // 逐名探测（= 已装注册表的可见投影），再经 enumerateInstalledEntries 取交集
    const probeNames = [...DELEGATION_TOOLS, ...JOB_TOOLS, 'bash']
    const installed = new Set<string>()
    for (const name of probeNames) if (await visible(M, name)) installed.add(name)
    const entries = enumerateInstalledEntries(installed)
    // linux 上 pwsh 不注册（approval.yml disabled 行），其余应全数在册
    expect(entries.delegation).toEqual([...DELEGATION_TOOLS])
    expect(entries.jobs).toEqual([...JOB_TOOLS])
  })

  it('② D9④ worker 再委派 7 入口全拒，新增子会话 0', { timeout: 240_000 }, async () => {
    const M = await newSession(WS_MAIN)
    const W = await newSession(WS_W)
    writeBots(M, { [W]: { createdBy: M } })
    const before = ((await rt.client.call("session/list", { _request: {} })) as { items: unknown[] }).items.length
    writeScript(W, [
      batchCall([
        { id: 'd1', name: 'subagent', args: { description: 'P6-14', prompt: 'do something' } },
        { id: 'd2', name: 'subagent_fork', args: { description: 'P6-14', prompt: 'fork me' } },
        { id: 'd3', name: 'workflow', args: { script: 'return await agent("x")', meta: { name: 'p614', description: 'P6-14' } } },
        { id: 'd4', name: 'send_message', args: { agent_id: 'x', content: 'hi' } },
        { id: 'd5', name: 'interrupt_agent', args: { agent_id: 'x' } },
        { id: 'd6', name: 'list_agents', args: {} },
        { id: 'd7', name: 'list_subagent_models', args: {} },
      ]),
      text('被拒后收尾'),
    ])
    const log = await runTurn(W, '委派探针')
    const denied = log.filter((e) => e.type === 'tool/result' && e.isError)
    expect(denied, '7 deny results').toHaveLength(7)
    for (const r of denied) {
      expect(r.text).toContain('pbots/forbidden')
      expect(r.text).toContain('delegate')
    }
    const after = ((await rt.client.call("session/list", { _request: {} })) as { items: unknown[] }).items.length
    expect(after, '新增子会话 0').toBe(before)
  })

  it('③ D9⑤ 后台作业拒 + 顺序差分格（envelope 在 shell-ask 之前）', { timeout: 240_000 }, async () => {
    const M = await newSession(WS_MAIN)
    const W = await newSession(WS_W)
    writeBots(M, { [W]: { createdBy: M } })
    // 回合 A：后台入口三枚（参数级 run_in_background + schedule + job 管理）——全部
    // 在信封被拒：envelope 字面串 + asked===0（若顺序回归、先落 shell-ask，会出卡）。
    // 脚本一次写全两回合（fake 游标 per-session，二次覆盖不重置，LEARNINGS P5-03）。
    writeScript(W, [
      batchCall([
        { id: 'b1', name: 'bash', args: { command: 'sleep 30', description: 'P6-14 bg', run_in_background: true } },
        { id: 'b2', name: 'schedule_create', args: { title: 'p614', prompt: 'later', after_seconds: 3600 } },
        { id: 'b3', name: 'job_list', args: {} },
      ]),
      text('后台被拒'),
      toolCall('b4', 'bash', { command: 'echo p614-ok', description: 'P6-14 fg' }),
      text('前台跑完'),
    ])
    const turnA = await runTurn(W, '后台探针')
    const resultsA = turnA.filter((e) => e.type === 'tool/result' && e.isError)
    expect(resultsA).toHaveLength(3)
    for (const r of resultsA) expect(r.text).toContain('pbots/forbidden')
    expect(turnA.filter((e) => e.type === 'tool/result' && e.callId === 'b1').at(0)?.text).toContain('run_in_background')
    expect(turnA.filter((e) => e.type === 'approval/asked'), 'deny 先于出卡，回合 A 零审批卡').toHaveLength(0)
    // 回合 B（差分对照）：同名 bash 不带 run_in_background → 穿过信封落到 shell-ask
    // 出卡（asked≥1），批准后正常执行 —— 同名工具、仅参数翻转、拦截者不同
    const turnBPump = (async () => { for (;;) { await approveAll(W); await sleep(120) } })()
    const logAll = await readLog(W)
    const beforeB = logAll.length
    const turnB = await (async () => {
      await prompt(W, '前台 bash')
      const deadline = Date.now() + 90_000
      for (;;) {
        await approveAll(W)
        const log = await readLog(W)
        const seg = log.slice(beforeB)
        if (seg.some((e) => e.type === 'turn/end')) {
          void turnBPump
          return seg
        }
        if (Date.now() > deadline) throw new Error('前台 bash 回合超时')
        await sleep(150)
      }
    })()
    expect(turnB.filter((e) => e.type === 'approval/asked'), 'shell-ask 出卡（差分对照）').not.toHaveLength(0)
    const fg = turnB.filter((e) => e.type === 'tool/result' && e.callId === 'b4').at(0)
    expect(fg?.isError ?? true, '批准后前台 bash 正常执行').toBe(false)
  })

  it('④ direct execute：worker 强调协调者工具 → 信封字面串（隐藏之外的第二道）', { timeout: 240_000 }, async () => {
    const M = await newSession(WS_MAIN)
    const W = await newSession(WS_W)
    writeBots(M, { [W]: { createdBy: M } })
    const before = ((await rt.client.call("session/list", { _request: {} })) as { items: unknown[] }).items.length
    writeScript(W, [
      batchCall([
        { id: 'c1', name: 'create_bot', args: { name: 'x', prompt: 'y' } },
        { id: 'c2', name: 'send_to_bot', args: { botId: 'nope', prompt: 'y' } },
        { id: 'c3', name: 'stop_bot', args: { botId: 'nope' } },
      ]),
      text('协调者被拒'),
    ])
    const log = await runTurn(W, 'direct execute 探针')
    const denied = log.filter((e) => e.type === 'tool/result' && e.isError)
    expect(denied).toHaveLength(3)
    for (const r of denied) {
      expect(r.text).toContain('pbots/forbidden')
      expect(r.text).toContain('coordinator') // 信封文案，非 create.mjs 的 main 校验文案
    }
    const after = ((await rt.client.call("session/list", { _request: {} })) as { items: unknown[] }).items.length
    expect(after, 'worker prompt 计数 0（无新会话）').toBe(before)
  })

  it('⑤ D9⑦ P5-06 矩阵子集（worker 会话复跑，基线含 W3.f1 的 main）：NEVER 拒读 / 工作区互不可见 / 自区可写', { timeout: 240_000 }, async () => {
    const M = await newSession(WS_MAIN)
    const W = await newSession(WS_W)
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [
      batchCall([
        { id: 'g1', name: 'read', args: { file_path: '/proc/self/environ' } },
        { id: 'g2', name: 'write', args: { file_path: join(WS_OTHER, 'pwn.txt'), content: 'p614' } },
        { id: 'g3', name: 'write', args: { file_path: join(WS_W, 'ok.txt'), content: 'p614-ok' } },
        { id: 'g4', name: 'read', args: { file_path: join(WS_OTHER, 'secret.txt') } },
      ]),
      text('矩阵子集跑完'),
    ])
    const log = await runTurn(W, '矩阵子集')
    const at = (id: string) => log.filter((e) => e.type === 'tool/result' && e.callId === id).at(0)!
    // NEVER 路径拒读（/proc 整棵硬 NEVER，guard ①）
    expect(at('g1').isError).toBe(true)
    expect(at('g1').text).toContain('p2sdk-fs-guard')
    expect(at('g1').text).toContain('hard-denied')
    // 工作区互不可见：写 / 读别的 bot 工作区 → 软遮蔽拒（guard ③，workspaceRoot 例外只放自区）
    expect(at('g2').isError).toBe(true)
    expect(at('g2').text).toContain('masked')
    expect(at('g4').isError).toBe(true)
    expect(at('g4').text).toContain('masked')
    // 自己工作区可写（worker 仍能干活）
    expect(at('g3').isError ?? true).toBe(false)
  })

  it('⑥ f1 per-agent restrict：生产顺序（createdBy 先落盘 → session/create 预铸 id）worker 工具表收窄，主 bot 工具表不受影响', { timeout: 240_000 }, async () => {
    // 生产链路顺序（main 侧 orchestrate.ts createWorkerBot 第 3/4 步）：createdBy
    // 先写 bots.json，再以预铸 botId session/create —— agent/created 触发时 worker
    // 已在册，registerWorkerRestriction 在会话建立点挂 per-agent restrict。
    const M = await newSession(WS_MAIN)
    writeBots(M, {})
    await warm(M, 'main')
    const WS_W2 = join(process.env.HOME, 'ws', 'w2')
    mkdirSync(WS_W2, { recursive: true })
    const W = `session-${crypto.randomUUID()}`
    writeBots(M, { [W]: { createdBy: M } })
    await rt.client.call('session/create', { request: { sessionId: W, cwd: WS_W2, agentPreset: 'standard' } })
    await warm(W, 'worker restrict')
    // restrict 生效：worker 工具表无再委派 / 后台作业 / 协调者入口（不只协调者三件）
    for (const name of RESTRICT_TOOLS) expect(await visible(W, name), `${name} restricted in worker`).toBe(false)
    // 不误伤：worker 的普通工具照常
    for (const name of ['bash', 'read', 'write', 'edit']) expect(await visible(W, name), `${name} still visible`).toBe(true)
    // 主 bot 不受限：三族入口（含协调者三件）全数在表
    for (const name of RESTRICT_TOOLS) expect(await visible(M, name), `${name} untouched on main`).toBe(true)
    expect(await visible(M, 'bash')).toBe(true)
  })

  it('⑦ f1 拒绝面不降级：restrict 已挂的 worker（生产顺序）调 7 再委派入口 + 后台作业 + 协调者三件仍全拒（守卫字面串先于 UNKNOWN_TOOL）', { timeout: 240_000 }, async () => {
    const M = await newSession(WS_MAIN)
    writeBots(M, {})
    await warm(M, 'main')
    const WS_W3 = join(process.env.HOME, 'ws', 'w3')
    mkdirSync(WS_W3, { recursive: true })
    const W = `session-${crypto.randomUUID()}`
    writeBots(M, { [W]: { createdBy: M } })
    await rt.client.call('session/create', { request: { sessionId: W, cwd: WS_W3, agentPreset: 'standard' } })
    // restrict 已在 agent/created 挂上（⑥ 同序）；直接验证模型可见面收窄
    for (const name of ['subagent', 'workflow', 'job_list']) expect(await visible(W, name)).toBe(false)
    const before = ((await rt.client.call('session/list', { _request: {} })) as { items: unknown[] }).items.length
    writeScript(W, [
      batchCall([
        { id: 'r1', name: 'subagent', args: { description: 'P6-14f1', prompt: 'x' } },
        { id: 'r2', name: 'subagent_fork', args: { description: 'P6-14f1', prompt: 'x' } },
        { id: 'r3', name: 'workflow', args: { script: 'return 1', meta: { name: 'p614f1', description: 'x' } } },
        { id: 'r4', name: 'send_message', args: { agent_id: 'x', content: 'hi' } },
        { id: 'r5', name: 'interrupt_agent', args: { agent_id: 'x' } },
        { id: 'r6', name: 'list_agents', args: {} },
        { id: 'r7', name: 'list_subagent_models', args: {} },
        { id: 'r8', name: 'schedule_create', args: { title: 'p614f1', prompt: 'later', after_seconds: 3600 } },
        { id: 'r9', name: 'job_list', args: {} },
        { id: 'r10', name: 'bash', args: { command: 'sleep 30', description: 'P6-14f1 bg', run_in_background: true } },
        { id: 'r11', name: 'create_bot', args: { name: 'x', prompt: 'y' } },
        { id: 'r12', name: 'send_to_bot', args: { botId: 'nope', prompt: 'y' } },
        { id: 'r13', name: 'stop_bot', args: { botId: 'nope' } },
      ]),
      text('全拒后收尾'),
    ])
    const log = await runTurn(W, '拒绝面复跑')
    const results = log.filter((e) => e.type === 'tool/result')
    expect(results, '13 deny results').toHaveLength(13)
    for (const r of results) {
      expect(r.isError, `${r.callId} denied`).toBe(true)
      expect(r.text, `${r.callId} guard literal fires before UNKNOWN_TOOL`).toContain('pbots/forbidden')
    }
    expect(log.filter((e) => e.type === 'approval/asked'), '零审批卡（后台入口先于 shell-ask 拒）').toHaveLength(0)
    const after = ((await rt.client.call('session/list', { _request: {} })) as { items: unknown[] }).items.length
    expect(after, '新增子会话 0').toBe(before)
  })
})
