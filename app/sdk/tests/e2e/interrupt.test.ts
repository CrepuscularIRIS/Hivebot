// P5-27 中途打断（PLAN p5-parity A12，验收 ①②③）：经真实 launcher + fake LLM
// 的 bash 长命令（第 2 步 `sleep 600 & wait`），用 UI cancelTurn 同款 RPC
// session/cancel（app/ui/renderer/shell/store.ts:375-377 → api('session/cancel',
// {request:{sessionId}})）打断，量测取消发起 → bash 进程树（含 bwrap 子进程，
// 经 P5-01 最终 wrapper：python3 -I bwrap-wrap.py 后 os.execv bwrap）全退出
// ≤5000ms（R4b reuse/r4b-interrupt.md 实测 4.5–6.3ms；5000ms 是验收阈值，不是
// 上游硬实时保证——TERM→KILL 宽限 3000ms 只是信号升级参数）。
// 进程只按自身 spawn 链记录的 PID 查 /proc（processTree(runtimeDshPid)），不用
// pkill；teardown 只结束自己 spawn 的子进程（launchRuntime.stop 自管）。
// ② 取消后 0 新工具调用（tool/call 恒 2、该会话模型请求恒 2）；③ 同一 session
// 续发收到回复（fake 游标第 3 条文本）。测试 HOME 按决策 8 = 主仓 .test-homes/p5-27。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { uniqueTestHome } from '../support/sandbox-home.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import {
  clearRealKeys,
  processTree,
  runtimeDshPid,
  waitFor,
  waitForDelta,
  waitForTurnEnd,
  type FakeRequest,
  type Frame,
} from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = uniqueTestHome('p5-27') // 决策 8 父目录 + P5-H3 运行级唯一后缀
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const CANCEL_BUDGET_MS = 5_000 // R4b 验收阈值（PLAN P5-27 ①）

/** 实测数据（报告表来源）：cancel 发起 → 进程树全退 ms，在用例内打印（vitest 5 不显示 afterAll stdout）。 */
const report = (label: string, exitMs: number): void => {
  console.log(`[P5-27 实测] ${label}: cancel 发起 → 进程树全退 ${Math.round(exitMs * 100) / 100} ms（阈值 5000）`)
}

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
}

interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

interface InterruptRuntime extends Runtime {
  writeScriptCalls(sessionId: string, calls: object[]): void
  readRequests(): FakeRequest[]
  feed: Feed
}

const runtimes: InterruptRuntime[] = []

/** fake LLM overlay（sandbox-hardened.test.ts 同款）。 */
function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-27-patch-'))
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
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
`)
  return overlay
}

/** 默认档即含 P5-01 最终 wrapper（writeRuntimePatch 的 id:sandbox 行）+ guard/shell-ask。 */
async function launchInterrupt(): Promise<InterruptRuntime> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_PATCH: fakeOverlay(),
      PBOTS_DATA_DIR: DATA_DIR,
    },
  })
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as EventsFrame) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  const feed: Feed = {
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() {
      stream.cancel()
      void drained
      client.close()
    },
  }
  const sandbox: InterruptRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId: string, calls: object[]): void {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    readRequests(): FakeRequest[] {
      let raw: string
      try {
        raw = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8')
      } catch {
        return []
      }
      return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as FakeRequest)
    },
  }
  runtimes.push(sandbox)
  return sandbox
}

function bashCall(command: string): object {
  const id = `p5-27-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'P5-27 interrupt acceptance probe' })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

function textCall(text: string): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function cmdlineOf(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
  } catch {
    return ''
  }
}

/** /proc/<pid>/stat 的 PPid（comm 可含空格/括号，从最后一个 ')' 后取第 2 个字段）。 */
function ppidOf(pid: number): number {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  return Number(after[1])
}

/**
 * 等 needle（如 'sleep 600'，匹配 bash 的 -c 参数文本）进程出现并记录整棵作业
 * 树：从命中 pid 沿 PPid 上溯到 dsh runtime 为止的链 + 链根的整棵子树（含
 * bwrap 外/内层、bash、sleep——PID namespace 内进程在宿主 /proc 仍可见）。
 */
async function recordJobTree(dshPid: number, needle: string, ms: number): Promise<number[]> {
  const deadline = Date.now() + ms
  for (;;) {
    for (const pid of processTree(dshPid)) {
      if (pid !== dshPid && cmdlineOf(pid).includes(needle)) {
        const chain: number[] = []
        let cur = pid
        while (cur !== dshPid && cur > 1) {
          chain.push(cur)
          cur = ppidOf(cur)
        }
        const root = chain[chain.length - 1] ?? pid
        return [...new Set([...chain, ...processTree(root)])]
      }
    }
    if (Date.now() > deadline) throw new Error(`no descendant cmdline matches ${JSON.stringify(needle)} after ${ms}ms`)
    await sleep(10)
  }
}

/** 自 t0 起轮询 /proc，直到记录的 PID 全部消失（zombie 也有 /proc/<pid>，故含防僵尸）；返回耗时 ms。 */
async function waitForTreeExit(pids: number[], t0: number, budgetMs: number): Promise<number> {
  for (;;) {
    const alive = pids.filter((p) => existsSync(`/proc/${p}`))
    const elapsed = performance.now() - t0
    if (alive.length === 0) return elapsed
    if (elapsed > budgetMs) throw new Error(`process tree still alive after ${Math.round(elapsed)}ms (budget ${budgetMs}ms): pids ${alive.join(',')}`)
    await sleep(5)
  }
}

/** 后台审批代答器：本会话每张 approval/request 即答 allowed-once（不放宽真实审批默认值）。 */
function startAnswerer(rt: InterruptRuntime, sessionId: string): { answered: Set<string>; stop(): Promise<void> } {
  const answered = new Set<string>()
  let running = true
  const loop = (async () => {
    while (running) {
      for (const f of [...rt.feed.frames]) {
        if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && f.eventId && !answered.has(f.eventId)) {
          answered.add(f.eventId)
          await rt.feed.answer(f, 'allowed-once').catch(() => {})
        }
      }
      await sleep(25)
    }
  })()
  return { answered, async stop() { running = false; await loop.catch(() => {}) } }
}

const toolCallCount = (frames: Frame[]): number =>
  frames.filter((f) => f.type === 'event' && f.event?.type === 'tool/call').length

const sessionRequests = (rt: InterruptRuntime, sessionId: string): number =>
  rt.readRequests().filter((r) => r.sessionId === sessionId).length

async function sendPrompt(client: DshClient, sessionId: string, text: string): Promise<unknown> {
  const requestId = `p5-27-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return client.call('session/prompt', {
    request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }] },
  })
}

/** 一轮打断量测：等长命令作业树成形 → session/cancel（UI cancelTurn 同款）→ 等全树退出。 */
async function cancelRound(rt: InterruptRuntime, label: string, sessionId: string): Promise<{ tree: number[]; exitMs: number; cancelAck: unknown }> {
  const dshPid = runtimeDshPid(rt.child.pid ?? 0)
  const tree = await recordJobTree(dshPid, 'sleep 600', 30_000)
  const cmds = tree.map(cmdlineOf)
  expect(cmds.some((c) => c.includes('bwrap')), `作业树含 bwrap（pids ${tree.join(',')}）：${JSON.stringify(cmds)}`).toBe(true)
  expect(cmds.some((c) => c.includes('sleep')), `作业树含 sleep（pids ${tree.join(',')}）`).toBe(true)

  // t0 取在 call 之前（R4b 同口径）；/proc 轮询与 ack 并行
  const t0 = performance.now()
  const ackPromise = Promise.resolve(rt.client.call('session/cancel', { request: { sessionId } }))
  const exitMs = await waitForTreeExit(tree, t0, 30_000)
  const cancelAck = await ackPromise
  report(label, exitMs)
  return { tree, exitMs, cancelAck }
}

afterAll(async () => {
  for (const rt of runtimes) {
    try { await rt.stop() } catch { /* 已停 */ }
    try { rt.feed.close() } catch { /* 已关 */ }
    rmSync(rt.handoff, { recursive: true, force: true })
  }
  rmSync(TEST_HOME, { recursive: true, force: true })
})

it('①②③ sleep 600 中途取消：进程树（含 bwrap）≤5000ms 全退；之后 0 新工具调用；同会话可续发收回复', async () => {
  const rt = await launchInterrupt()
  const ws = join(TEST_HOME, 'ws')
  mkdirSync(ws, { recursive: true })
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  expect(sessionId).toBeTypeOf('string')

  const stream = await rt.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })().catch(() => {})

  // 三条整段一次写全（LEARNINGS P5-03：同会话第二次 writeScriptCalls 不重置游标）
  rt.writeScriptCalls(sessionId, [
    bashCall('printf P527_STEP1'), // 第 1 步：快命令
    bashCall('sleep 600 & wait'), // 第 2 步：长命令（PLAN ①；& wait 保住显式 bash 父进程与 sleep 子进程）
    textCall('P527_CONTINUED'), // ③ 续发后的回复（游标第 3 条）
  ])

  const answerer = startAnswerer(rt, sessionId)
  await sendPrompt(rt.client, sessionId, 'P5-27 探针')

  // 第 1 步跑完（tool/result 输出含 P527_STEP1；不能只配文本——tool/call 的参数也含该串）
  await waitFor(
    frames,
    (f) => f.type === 'event' && f.event?.type === 'tool/result' && JSON.stringify(f).includes('P527_STEP1'),
    30_000,
    'step-1 tool/result P527_STEP1',
  )

  const { tree, exitMs, cancelAck } = await cancelRound(rt, 'sleep 600 & wait', sessionId)
  expect(cancelAck, 'session/cancel 同步返回 accepted:true（R4b：ACK 非全树退出承诺）')
    .toMatchObject({ accepted: true })
  expect(exitMs, `① cancel 发起 → 全树退出 ${exitMs}ms ≤ ${CANCEL_BUDGET_MS}ms`).toBeLessThanOrEqual(CANCEL_BUDGET_MS)

  // ② turn/end = aborted/user；取消后 1s 宽限内 0 新工具调用 / 0 新模型请求 / 0 新审批卡
  const abortedAt = await waitForTurnEnd(frames, 30_000)
  const endData = frames[abortedAt].event?.data as { reason?: { kind?: string; reason?: { kind?: string } } }
  expect(endData?.reason, 'turn/end reason = aborted(user)').toEqual({ kind: 'aborted', reason: { kind: 'user' } })
  await sleep(1000)
  await answerer.stop()
  expect(answerer.answered.size, '两条 bash 各出一张真实审批卡并已代答').toBe(2)
  expect(toolCallCount(frames), '② 全程 tool/call 恒 2（取消后无新调用）').toBe(2)
  expect(sessionRequests(rt, sessionId), '② 取消后模型请求恒 2').toBe(2)

  // ③ 同一 session 续发 → 收到第 3 条脚本的文字回复，且不再引入工具调用
  await sendPrompt(rt.client, sessionId, '继续')
  await waitForDelta(frames, 'P527_CONTINUED', 30_000)
  // 续发的 turn/end 在流收尾后才到（delta 先行），轮询取 aborted 之后的下一条
  let end2 = -1
  const deadline2 = Date.now() + 30_000
  while (end2 === -1) {
    for (let i = abortedAt + 1; i < frames.length; i++) {
      if (frames[i].type === 'event' && frames[i].event?.type === 'turn/end') { end2 = i; break }
    }
    if (end2 === -1) {
      if (Date.now() > deadline2) throw new Error('续发 turn/end 未到（30s）')
      await sleep(20)
    }
  }
  expect(sessionRequests(rt, sessionId), '③ 续发后模型请求恰 +1（=3）').toBe(3)
  expect(toolCallCount(frames), '③ 续发未引入新工具调用').toBe(2)
  expect(tree.every((p) => !existsSync(`/proc/${p}`)), '③ 记录的作业树 PID 未复活').toBe(true)

  stream.cancel()
  void drained
}, 180_000)

it('①-b 忽略 TERM 的变体（trap "" TERM）也在 ≤5000ms 内全退（PID namespace 清理，非 3s 宽限路径）', async () => {
  const rt = await launchInterrupt()
  const ws = join(TEST_HOME, 'ws-term')
  mkdirSync(ws, { recursive: true })
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  const stream = await rt.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })().catch(() => {})
  rt.writeScriptCalls(sessionId, [bashCall(`trap '' TERM; sleep 600 & wait`)])

  const answerer = startAnswerer(rt, sessionId)
  await sendPrompt(rt.client, sessionId, 'P5-27 trap 变体')

  const { exitMs } = await cancelRound(rt, `trap '' TERM; sleep 600 & wait`, sessionId)
  expect(exitMs, `①-b 忽略 TERM 树退出 ${exitMs}ms ≤ ${CANCEL_BUDGET_MS}ms`).toBeLessThanOrEqual(CANCEL_BUDGET_MS)
  const at = await waitForTurnEnd(frames, 30_000)
  const endData = frames[at].event?.data as { reason?: { kind?: string } }
  expect(endData?.reason, 'turn/end reason = aborted(user)').toEqual({ kind: 'aborted', reason: { kind: 'user' } })
  await answerer.stop()

  stream.cancel()
  void drained
}, 180_000)
