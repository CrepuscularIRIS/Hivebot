// P6-13 真 Loader 用例（PLAN P6-13 验收 / BRIEF D10）：orchestration.yml 挂生产
// 插件，fake 模型驱动。覆盖：①Assignment 回合停止 → 恰 1 项 end:stopped（不与
// aborted 双发、无失效 ask）、bash 进程树按自身 spawn 记录查 /proc 退出（P5-27
// 口径，不用 pkill）、之后 0 新工具调用 / 0 新模型请求；②用户自发回合被停 →
// 0 项、工具结果告知已停止；⑤空闲目标 → 幂等成功 wasRunning:false；③两阶段：
// accepted 之后、turn/end 之前第 4 次 create → pbots/capacity，turn/end 落盘后
// create 成功（占位释放只绑终态，决策 26）；④受污染回合调 stop_bot → 拒且目标
// 零触达（execute 层 forbidden 由单测覆盖，此处验 when 隐藏的端到端效果）。
// 清理：跑长命令的 worker 全部经应用 session/cancel（测试进程扮演用户）停掉并
// 等 turn/end；结束时无 sleep 600 残留（结束前另有 bot-reap 自查）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { processTree, runtimeDshPid } from '../support/fake/harness.ts'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')
const ORCH_ENDPOINT = 'pbots/orchestration.requests'
const ORCH_RESPOND = 'pbots/orchestration.respond'

const home = tmkdir('bot-p613-live-')
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(dataDir, { recursive: true })
const workspace = join(home, 'workspace')
mkdirSync(workspace, { recursive: true })

const overlay = join(home, 'p613.yml')
writeFileSync(overlay, `\
# P6-13 overlay (orchestration-stop-live.test.ts)
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
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })
/** 一个模型响应里两个工具调用（同批；stop 与 create 都默认 exclusive，顺序串行）。 */
const dualCall = (a: [string, string, object], b: [string, string, object]) => ({ chunks: [
  ...[a, b].flatMap(([callId, name, args], i) => [
    { type: 'block-start', index: i, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: i, id: callId, name, argumentsDelta: JSON.stringify(args) },
    { type: 'block-end', index: i, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } },
  ]),
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })
const stopCall = (callId: string, botId: string) => toolCall(callId, 'stop_bot', { botId })
const sendCall = (callId: string, botId: string, prompt: string) => toolCall(callId, 'send_to_bot', { botId, prompt })
const createCall = (callId: string, name: string, prompt: string) => toolCall(callId, 'create_bot', { name, prompt })
const bashCall = (callId: string, command: string) => toolCall(callId, 'bash', { command, description: 'P6-13 stop acceptance probe' })
/** 长命令（P5-27 口径：& wait 保住显式 bash 父进程与 sleep 子进程；marker 供 /proc 认树）。 */
const longBash = (callId: string, marker: string) => bashCall(callId, `sleep 600 & wait # ${marker}`)

interface LogEvent {
  seq: number; type: string; id?: string; callId?: string; isError?: boolean
  error?: { message?: string } | null; text?: string; reason?: string
  sourceKind?: string; items?: any[]
}

const writeScript = (sessionId: string, calls: object[]) => {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

const cmdlineOf = (pid: number): string => {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8') } catch { return '' }
}

/** /proc/<pid>/stat 的 PPid（comm 可含空格/括号，从最后一个 ')' 后取第 2 个字段）。 */
const ppidOf = (pid: number): number => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
}

/**
 * 等 marker（如 sleep 600 行的 `# p613w1`，匹配 bash 的 -c 参数文本）出现并记录
 * 整棵作业树：命中 pid 沿 PPid 上溯到 dsh runtime 的链 + 链根的整棵子树（含
 * bwrap 外/内层、bash、sleep；P5-27 recordJobTree 同法，按自身 spawn 链查 /proc）。
 */
async function recordTree(dshPid: number, marker: string, ms = 30_000): Promise<number[]> {
  const deadline = Date.now() + ms
  for (;;) {
    for (const pid of processTree(dshPid)) {
      if (pid === dshPid || !cmdlineOf(pid).includes(marker)) continue
      const chain: number[] = []
      let cur = pid
      while (cur !== dshPid && cur > 1) {
        chain.push(cur)
        cur = ppidOf(cur)
      }
      const root = chain[chain.length - 1] ?? pid
      const tree = [...new Set([...chain, ...processTree(root)])]
      if (tree.length >= 2) return tree // 等 sleep 子进程 fork 出来（marker 只匹配 bash 的 -c 参数）
      // 否则继续轮询（bash 刚起、sleep 未 fork）
    }
    if (Date.now() > deadline) throw new Error(`no descendant cmdline matches ${marker} after ${ms}ms`)
    await sleep(20)
  }
}

/** 等记录的 PID 全部退出（P5-27 waitForTreeExit 同法，不用 pkill）。 */
async function waitForTreeExit(pids: number[], ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms
  for (;;) {
    if (pids.every((p) => !existsSync(`/proc/${p}`))) return
    if (Date.now() > deadline) throw new Error(`process tree still alive: ${pids.filter((p) => existsSync(`/proc/${p}`)).join(',')}`)
    await sleep(10)
  }
}

interface Feed { frames: any[]; answer(frame: any, value: string): Promise<unknown> }

describe('P6-13 live (real Loader)', () => {
  let rt: Runtime
  let answerer: DshClient
  let feed: Feed
  let dshPid = 0

  const control = (request: object) => rt.client.call('p610/control', { request })
  const newSession = async (): Promise<string> =>
    ((await rt.client.call('session/create', { request: { agentPreset: 'standard', cwd: workspace } }) as { sessionId: string }).sessionId)
  const writeBots = (mainBotId: string, bots: Record<string, { createdBy: string }>) => {
    writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId, recipes: {}, bots }))
  }
  const readLog = async (sessionId: string): Promise<LogEvent[]> =>
    ((await control({ op: 'read', sessionId })) as { events: LogEvent[] }).events
  const prompt = (sessionId: string, t: string, mode = 'queue') =>
    rt.client.call('session/prompt', { request: { requestId: `p613-${Date.now()}-${Math.random().toString(16).slice(2)}`, sessionId, mode, content: [{ type: 'text', text: t }] } })
  const untilTrue = async (pred: () => Promise<boolean> | boolean, label: string, ms = 60_000) => {
    const deadline = Date.now() + ms
    for (;;) {
      if (await pred()) return
      if (Date.now() > deadline) throw new Error(`${label}: timed out`)
      await sleep(150)
    }
  }
  const reports = (log: LogEvent[]) => log.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')
  const toolResults = (log: LogEvent[], callId: string) => log.filter((e) => e.type === 'tool/result' && e.callId === callId)
  const turnEnded = async (sessionId: string, reason?: string) =>
    (await readLog(sessionId)).some((e) => e.type === 'turn/end' && (reason === undefined || e.reason === reason))
  /** 会话的模型请求数（fake requests.jsonl，P5-27 同口径）。 */
  const requestCount = (sessionId: string): number => {
    try {
      return readFileSync(join(home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
        .filter((line) => { try { return (JSON.parse(line) as { sessionId?: string }).sessionId === sessionId } catch { return false } }).length
    } catch { return 0 }
  }
  /** 已批过的 approval eventId（approveNextBash 去重——waterfall 帧可能重播）。 */
  const answeredIds = new Set<string>()
  const approveNextBash = async (sessionId: string) => {
    for (;;) {
      const frame = feed.frames.find((f: any) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && f.eventId && !answeredIds.has(f.eventId))
      if (frame) { answeredIds.add(frame.eventId); await feed.answer(frame, 'allowed-once'); return }
      await sleep(100)
    }
  }
  /** 跑完主 bot 一回合（prompt → turn/end 且 tool/result 齐），返回增量日志。 */
  const runTurn = async (sessionId: string, t: string, label: string): Promise<LogEvent[]> => {
    const before = (await readLog(sessionId)).length
    await prompt(sessionId, t)
    await untilTrue(async () => {
      const log = await readLog(sessionId)
      const inc = log.slice(before)
      const calls = inc.filter((e) => e.type === 'tool/call').length
      return inc.some((e) => e.type === 'turn/end') && inc.filter((e) => e.type === 'tool/result').length >= calls
    }, `${label}: turn/end`)
    return (await readLog(sessionId)).slice(before)
  }
  /** main 角色订阅者（P6-10 create-live 同款）：session/create 后 respond。 */
  const subscribe = async () => {
    const requests = await rt.client.socket.open(ORCH_ENDPOINT, {})
    const iterator = requests[Symbol.asyncIterator]()
    const first = await iterator.next()
    if (first.done || (first.value as any)?.ready !== true) throw new Error(`orch stream not ready: ${JSON.stringify(first.value)}`)
    const created: string[] = []
    const pump = (async () => {
      try {
        for (;;) {
          const next = await iterator.next()
          if (next.done) return
          const item = next.value as Record<string, any>
          if (item.ready === true) continue
          const w = (await rt.client.call('session/create', { request: { agentPreset: 'standard', cwd: workspace } }) as { sessionId: string }).sessionId
          created.push(w)
          writeScript(w, [text('补位完成', 5)])
          await rt.client.call(ORCH_RESPOND, { request: { requestId: item.requestId, value: { sessionId: w } } })
        }
      } catch { /* 流断开属预期 */ }
    })()
    return { created, cancel: () => { requests.cancel(); void pump } }
  }

  beforeAll(async () => {
    rt = await launchRuntime({ env: {
      P2SDK_PATCH: `${join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')}:${overlay}`,
      P2SDK_HOME: home, PBOTS_DATA_DIR: dataDir, P2SDK_ORCH_DATA_DIR: dataDir,
    } })
    dshPid = runtimeDshPid(rt.child.pid ?? 0)
    answerer = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
    const stream = await answerer.socket.open('$events', {})
    const frames: any[] = []
    void (async () => { for await (const f of stream as any) frames.push(f as any) })().catch(() => {})
    const ready = () => frames.some((f) => f.type === 'ready')
    await untilTrue(ready, '$events ready', 10_000)
    const clientId = () => frames.find((f) => f.type === 'ready')?.clientId ?? ''
    feed = {
      frames,
      answer: (frame, value) => answerer.call('$events/result', { clientId: clientId(), eventId: frame.eventId, outcome: { kind: 'result', value } }),
    }
  }, 120_000)

  afterAll(async () => {
    try { answerer?.close() } catch { /* already gone */ }
    await rt?.stop()
  })

  it('① Assignment 回合停止：恰 1 项 end:stopped（不双发、无失效 ask）；进程树退出；之后 0 新工具调用', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [longBash('b1', 'p613w1'), text('不该跑')])
    writeScript(M, [
      sendCall('s0', W, '长活'), text('派出去了'),
      stopCall('t0', W), text('收到停止'),
      text('收到 stopped 报告'),
    ])
    const approve = approveNextBash(W)
    await prompt(M, '派件')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/start'), 'worker turn starts')
    await approve
    const tree = await recordTree(dshPid, 'p613w1')
    expect(tree.length).toBeGreaterThan(1) // bash + sleep（含 bwrap 层）
    await untilTrue(async () => (await readLog(M)).filter((e) => e.type === 'turn/end').length >= 1, 'main turn1 ends')

    const stopLog = await runTurn(M, '停掉那个', 'stop turn')
    const stopResult = toolResults(stopLog, 't0')[0]
    expect(stopResult?.isError).not.toBe(true)
    expect(stopResult?.text).toContain('"accepted":true')
    expect(stopResult?.text).toContain('"wasRunning":true')

    // D10：worker turn/end = aborted（user）；进程树（自身 spawn 记录查 /proc）退出
    await untilTrue(() => turnEnded(W, 'aborted'), 'worker turn ends aborted')
    await waitForTreeExit(tree)
    // 之后 0 新工具调用 / 0 新模型请求（stop 前各恰 1）
    const wEndLog = await readLog(W)
    const callsAtEnd = wEndLog.filter((e) => e.type === 'tool/call').length
    const requestsAtEnd = requestCount(W)
    expect(callsAtEnd).toBe(1)
    await sleep(1_000)
    const wLate = await readLog(W)
    expect(wLate.filter((e) => e.type === 'tool/call').length, '0 新工具调用').toBe(callsAtEnd)
    expect(requestCount(W), '0 新模型请求').toBe(requestsAtEnd)

    // 恰 1 项 end:stopped（与 aborted 共用 end 键，不双发）；无 ask 项
    await untilTrue(async () => reports(await readLog(M)).length === 1, 'stopped report lands')
    await untilTrue(async () => (await readLog(M)).filter((e) => e.type === 'turn/end').length >= 3, 'report turn consumed')
    await sleep(3_000) // 双发 / 迟到投递观察窗
    const log = await readLog(M)
    expect(reports(log).length, '恰 1 条回报消息').toBe(1)
    const items = reports(log)[0].items ?? []
    expect(items.length, '恰 1 项，不与 aborted 双发').toBe(1)
    expect(items[0]).toMatchObject({ kind: 'end', outcome: 'stopped' })
    expect(String(items[0].key)).toMatch(/^[0-9a-f-]+:end$/)
    expect(items.some((i: any) => i.kind === 'ask'), '无失效 ask 项').toBe(false)
    // 占位随 turn/end 释放（决策 26：stop 不自己释放）
    await untilTrue(async () => ((await control({ op: 'slots' })) as { used: number }).used === 0, 'slot released at turn/end')
  })

  it('② 用户自发回合被停 → 0 项；工具结果告知已停止', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [longBash('b2', 'p613usr')])
    writeScript(M, [stopCall('t2', W), text('收到')])
    const approve = approveNextBash(W)
    await prompt(W, '用户直接派的活')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/start'), 'worker turn starts')
    await approve
    await recordTree(dshPid, 'p613usr')

    const log = await runTurn(M, '停掉', 'stop user turn')
    const stopResult = toolResults(log, 't2')[0]
    expect(stopResult?.isError).not.toBe(true)
    expect(stopResult?.text).toContain('"accepted":true')
    await untilTrue(() => turnEnded(W, 'aborted'), 'worker turn ends aborted')
    await sleep(4_000) // 2s 收齐窗口 + 余量：确认 0 项
    expect(reports(await readLog(M)).length, '非 Assignment 回合 → 0 项').toBe(0)
  })

  it('⑤ 空闲目标 → 幂等成功 wasRunning:false', { timeout: 180_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(M, [stopCall('t5', W), text('收到')])
    const log = await runTurn(M, '停那个空闲的', 'idle stop')
    const stopResult = toolResults(log, 't5')[0]
    expect(stopResult?.isError).not.toBe(true)
    expect(stopResult?.text).toContain('"wasRunning":false')
    expect(stopResult?.text).toContain('idle')
  })

  it('③ 两阶段：accepted 后、turn/end 前第 4 次 create → pbots/capacity；turn/end 后 create 成功', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const ws = [await newSession(), await newSession(), await newSession()]
    writeBots(M, Object.fromEntries(ws.map((w) => [w, { createdBy: M }])))
    // w1 的回合挂在 fake 模型的 pace 长睡上（pace sleep 不看 abort，fake 只在
    // chunk 边界查——cancel 后 turn/end 在 pace 期内确定性不落）：占位窗口可控。
    writeScript(ws[0], [text('慢慢想', 300_000)])
    // w2/w3 走真 bash 长命令（stop / session/cancel → TERM → 快速 turn/end）。
    writeScript(ws[1], [longBash('b31', 'p613c1')])
    writeScript(ws[2], [longBash('b32', 'p613c2')])
    writeScript(M, [
      dualCall(['cs1', 'stop_bot', { botId: ws[0] }], ['cc1', 'create_bot', { name: '补位', prompt: '顶上' }]),
      text('第一次结束'),
      stopCall('cs2', ws[1]), text('停了第二个'),
      createCall('cc2', '再补', '再顶一个'),
      text('done'),
    ])
    await untilTrue(async () => ((await control({ op: 'slots' })) as { used: number }).used === 0, 'slots drained', 30_000)
    const approves = [approveNextBash(ws[1]), approveNextBash(ws[2])]
    // 三个 worker 直接起跑（trackWorkerTurns 收养占位，P6-10.f1 ②——无需 Assignment）
    for (const w of ws) await prompt(w, '跑')
    await Promise.all(approves)
    await untilTrue(async () => ((await control({ op: 'slots' })) as { used: number }).used === 3, 'three workers hold all slots')
    const trees = await Promise.all([recordTree(dshPid, 'p613c1'), recordTree(dshPid, 'p613c2')])

    const sub = await subscribe()
    try {
      const log1 = await runTurn(M, '停一个再补一个', 'batch turn')
      const stopResult = toolResults(log1, 'cs1')[0]
      const createResult = toolResults(log1, 'cc1')[0]
      expect(stopResult?.isError, 'stop accepted').not.toBe(true)
      expect(stopResult?.text).toContain('"accepted":true')
      expect((await readLog(ws[0])).some((e) => e.type === 'turn/end'), 'pace 期内 w1 turn/end 未落（窗口成立）').toBe(false)
      expect(createResult?.isError, 'turn/end 未落 → 第 4 个 create 仍 capacity').toBe(true)
      expect(`${JSON.stringify(createResult?.error ?? {})} ${createResult?.text ?? ''}`).toContain('pbots/capacity')
      expect(sub.created, 'capacity 拒绝不触达通道').toHaveLength(0)

      // 释放只绑 turn/end：停掉 bash 型 w2 → turn/end 落盘 → 占位归还 → create 成功
      const log2 = await runTurn(M, '停第二个', 'stop w2')
      expect(toolResults(log2, 'cs2')[0]?.isError).not.toBe(true)
      await untilTrue(() => turnEnded(ws[1], 'aborted'), 'w2 turn ends aborted')
      const log3 = await runTurn(M, '再补', 'create after release')
      const create2 = toolResults(log3, 'cc2')[0]
      expect(create2?.isError, '占位释放后可再 create').not.toBe(true)
      expect(sub.created).toHaveLength(1)
      expect(`${create2?.text ?? ''}`).toContain(sub.created[0])
      // 新 worker 的 assign 回合自然结束（responder 已写 quick 脚本）
      await untilTrue(async () => (await readLog(sub.created[0])).some((e) => e.type === 'turn/end'), 'new worker finishes')
    } finally {
      sub.cancel()
    }
    // 清理：w3 的长命令回合经应用 session/cancel 停掉（w1 的 pace 睡在 dsh 进程内，
    // 随 runtime 结束回收，无子进程残留）
    await rt.client.call('session/cancel', { request: { sessionId: ws[2] } })
    await untilTrue(() => turnEnded(ws[2], 'aborted'), 'w3 aborted')
    await waitForTreeExit(trees[1])
  })

  it('④ 受污染回合调 stop_bot → 拒（when 隐藏）且目标零触达', { timeout: 300_000 }, async () => {
    const M = await newSession()
    const W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    writeScript(W, [longBash('b4', 'p613t6')])
    writeScript(M, [stopCall('t4', W), text('done')])
    const approve = approveNextBash(W)
    await prompt(W, '先跑着')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'turn/start'), 'worker turn starts')
    await approve
    const tree = await recordTree(dshPid, 'p613t6')
    await untilTrue(async () => (await readLog(W)).some((e) => e.type === 'tool/call'), 'worker bash running')

    await control({ op: 'inject', sessionId: M }) // 投一条 pbots-worker 回报唤醒回合（认领即污染）
    await untilTrue(async () => {
      const log = await readLog(M)
      return log.some((e) => e.type === 'turn/end') && log.some((e) => e.type === 'tool/result')
    }, 'tainted turn finishes')
    const log = await readLog(M)
    const result = log.filter((e) => e.type === 'tool/result')[0]
    expect(result?.isError, '受污染回合 stop_bot 落空/被拒').toBe(true)
    expect(`${JSON.stringify(result?.error ?? {})} ${result?.text ?? ''}`).not.toContain('"accepted":true')
    // 目标零触达：worker 回合未被 cancel（无 turn/end，作业树仍在）
    expect((await readLog(W)).some((e) => e.type === 'turn/end'), 'worker 未被停止').toBe(false)
    expect(tree.every((p) => existsSync(`/proc/${p}`)), 'worker 作业树仍存活').toBe(true)
    // 清理
    await rt.client.call('session/cancel', { request: { sessionId: W } })
    await untilTrue(() => turnEnded(W, 'aborted'), 'taint-case worker aborted')
    await waitForTreeExit(tree)
  })
})
