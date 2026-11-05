// P5-21 验收 ①–⑤（PLAN p5-parity P5-21，Q-013 全表确认）：SDK 档位策略。
// ① A2：policy-state {paused:false, instance:<本实例>} 下，bash echo/cat、
//    write/read 工作区文件 → 全程 0 张卡（asked === 0），文件存在。
// ② 决策 16：同一脚本在五种无效状态（缺失/非法 JSON/paused/fault/instance 不符）
//    下每次 ALWAYS 调用出卡；会话进行中改文件 → 下一次调用即出卡（逐调用重读，
//    不重启）；恢复后回到不出卡。
// ③ A9 ①②③⑤：档位表坏 → ALWAYS/ASK 全部退 ASK 且有日志行，NEVER（guard）不
//    降级不出卡、对 NEVER 无卡可批无副作用；wrapper 不可执行 → 第 1 行不出卡
//    但命令失败（无「无卡且裸跑」路径）；NEVER 档不出卡带原因（guard 承担）。
// ④ A3 后半：read 工作区外非凭证文件 → 出卡（toolName=read），重复同一调用再出
//    卡（SDK 侧无 always 资格的机械证明：无任何常驻授权路径）。
// ⑤ A9 ⑦：子会话（never）里 ALWAYS 类（bash）照常执行且在 wrapper 内（遮蔽不可
//    见），ASK 类（区外 read）拒绝，NEVER 类（凭证 read）guard 拒。
// 全部经真实 launcher + fake LLM；HOME=主仓 .test-homes/p5-21（决策 8），工作区
// 在数据根 workspaces/ 下（/tmp 会被沙箱 --tmpfs 遮掉，P5-06 同法）。测试只结束
// 自己 spawn 的子进程（launchRuntime.stop 自管），不用 pkill。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { uniqueTestHome } from '../support/sandbox-home.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = uniqueTestHome('p5-21') // P5-H3：运行级唯一（防并行全量互踩哨兵）
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const WS = join(DATA_DIR, 'workspaces', 'x')

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  request?: { toolName?: string; callId?: string; reason?: string }
}

interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

interface TierRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
  readRequests(): Array<{ sessionId: string | null; toolResults?: Array<{ toolCallId: string | null; isError: boolean; text: string }> }>
}

const runtimes: TierRuntime[] = []

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-21-patch-'))
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

async function openFeed(rt: Runtime): Promise<Feed> {
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as EventsFrame) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
}

/** 预创建的 handoff 目录（launch 前 path 已知，供 ③ 的 overlay 重述 config 用）。 */
interface LaunchOpts { extraPatch?: string; env?: Record<string, string> }

async function launchTier(opts: LaunchOpts = {}): Promise<TierRuntime> {
  clearRealKeys()
  const patches = [fakeOverlay(), ...(opts.extraPatch ? [opts.extraPatch] : [])]
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_HOME: join(TEST_HOME, 'dsh-' + Math.random().toString(16).slice(2, 8)),
      P2SDK_PATCH: patches.join(':'),
      PBOTS_DATA_DIR: DATA_DIR,
      ...opts.env,
    },
  })
  const feed = await openFeed(rt)
  const t: TierRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    readRequests() {
      let raw: string
      try { raw = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return [] }
      return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    },
  }
  runtimes.push(t)
  return t
}

/** 模拟 main（P5-29 落地前的测试替身）：写 instance = sha256(launch-token)。 */
function provision(rt: Runtime, state: Record<string, unknown> = {}): void {
  const token = readFileSync(join(rt.handoff, 'launch-token'), 'utf8').trim()
  const instance = createHash('sha256').update(token).digest('hex')
  writeFileSync(join(DATA_DIR, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance, ...state }))
}

/**
 * 一个会话 + 一次性写全整段脚本（fake 的游标按会话持有内存态，二次覆盖脚本会脱
 * 同步——P5-03 实测，见 work/LEARNINGS 2026-11-03）。`next()` 逐 turn 推进：
 * 发一次 prompt，等 turn/end，期间按 `answer` 应答本会话新出现的卡（默认
 * rejected，让「不该出卡」的失败快速显形；'none' 表示断言零卡、出卡即超时）。
 * 每 turn 消耗脚本里的下一段（工具调用 + 收尾 text）。
 */
async function scriptedSession(h: TierRuntime, cwd: string, calls: object[]): Promise<{
  sessionId: string
  next(answer?: 'rejected' | 'allowed-once' | 'none'): Promise<Frame[]>
}> {
  const sessionId = await newSession(h, cwd)
  h.writeScriptCalls(sessionId, calls.flatMap((c) => [c, textCall('P5-21 完成')]))
  const answered = new Set<string>()
  return {
    sessionId,
    async next(answer = 'rejected'): Promise<Frame[]> {
      const stream = await h.client.follow(sessionId)
      const frames: Frame[] = []
      const drained = (async () => { for await (const f of stream) frames.push(f) })()
      await h.client.call('session/prompt', {
        request: { requestId: `p5-21-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-21 探针' }] },
      })
      const deadline = Date.now() + 60_000
      for (;;) {
        if (answer !== 'none') {
          for (const f of h.feed.frames) {
            if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
              answered.add(f.eventId ?? '')
              await h.feed.answer(f, answer)
            }
          }
        }
        if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
        if (Date.now() > deadline) {
          throw new Error(`turn/end 未到；answered=${answered.size}；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 400)}`)
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      stream.cancel()
      void drained
      return frames
    },
  }
}

function toolTurnCall(name: string, args: object): object {
  const id = `p5-21-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

function bashTurnCall(command: string): object {
  return toolTurnCall('bash', { command, description: 'P5-21 tier probe' })
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

async function newSession(h: TierRuntime, cwd = WS): Promise<string> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  expect(sessionId, 'session/create returned a sessionId').toBeTypeOf('string')
  return sessionId
}

function askedCount(h: TierRuntime, sessionId: string): number {
  return h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
}

/** 本会话的 tool/result 文本（isError 一并返回）。 */
function toolResults(frames: Frame[]): Array<{ isError: boolean; text: string }> {
  const out: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    out.push({
      isError: data.message?.isError === true,
      text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n'),
    })
  }
  return out
}

function setupTestHome(): void {
  rmSync(TEST_HOME, { recursive: true, force: true })
  mkdirSync(WS, { recursive: true })
  writeFileSync(join(WS, 'f.txt'), 'p521-ws')
  mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel-key'), 'p521-sentinel')
}

let RT: TierRuntime

beforeAll(() => {
  setupTestHome()
}, 30_000)

afterAll(async () => {
  for (const rt of runtimes) {
    try { rt.feed.close() } catch { /* 已关 */ }
    try { await rt.stop() } catch { /* 已停 */ }
  }
  rmSync(TEST_HOME, { recursive: true, force: true })
})

// ── ① + ②：同一 runtime、同一会话（② 的逐调用重读证明不需要重启）──

it('① A2: validated policy-state → bash + workspace file tools run with ZERO approval cards', { timeout: 300_000 }, async () => {
  RT = await launchTier()
  provision(RT)
  const aTxt = join(WS, 'a.txt')
  const bTxt = join(WS, 'b.txt')
  // 整段脚本一次写全（fake 游标按会话持有，覆盖脚本会脱同步——P5-03 实测）
  const sess = await scriptedSession(RT, WS, [
    bashTurnCall(`echo hi > '${aTxt}'`),
    toolTurnCall('write', { file_path: bTxt, content: 'p521-written' }),
    bashTurnCall(`cat '${aTxt}'`),
    toolTurnCall('read', { file_path: 'f.txt' }),
  ])
  await sess.next('none')
  await sess.next('none')
  const catFrames = await sess.next('none')
  const readFrames = await sess.next('none')
  expect(askedCount(RT, sess.sessionId), 'A2：全程 0 张卡').toBe(0)
  expect(readFileSync(aTxt, 'utf8').trim(), 'bash 写入经 wrapper 落宿主').toBe('hi')
  expect(readFileSync(bTxt, 'utf8'), 'write 工具写入成功').toBe('p521-written')
  expect(toolResults(catFrames)[0]?.text, 'bash 读回（wrapper 内可见工作区）').toContain('hi')
  const reads = toolResults(readFrames)
  expect(reads[0]?.isError, 'read 工作区文件成功').toBe(false)
  expect(reads[0]?.text).toContain('p521-ws')
})

it('② 五种无效状态逐个出卡、逐调用重读不重启、恢复后回静默', { timeout: 420_000 }, async () => {
  const statePath = join(DATA_DIR, 'policy-state.json')
  const marker = join(WS, 'state-marker')
  const probe = `echo x > '${marker}'`
  const sess = await scriptedSession(RT, WS, [
    // 6 段：五状态各一 + 恢复后一段；状态文件由测试在 turn 之间改写
    ...Array.from({ length: 6 }, () => bashTurnCall(probe)),
  ])
  let expectedCards = 0

  const states: Array<{ label: string; write: () => void }> = [
    { label: '文件缺失', write: () => rmSync(statePath, { force: true }) },
    { label: '非法 JSON', write: () => writeFileSync(statePath, '{not json') },
    { label: 'paused:true', write: () => provision(RT, { paused: true }) },
    { label: "fault:'grants-corrupt'", write: () => provision(RT, { fault: 'grants-corrupt' }) },
    { label: 'instance 不匹配（另一实例）', write: () => writeFileSync(statePath, JSON.stringify({ version: 1, paused: false, instance: 'deadbeef' })) },
  ]
  for (const st of states) {
    st.write()
    const frames = await sess.next('rejected')
    expectedCards += 1
    expect(askedCount(RT, sess.sessionId), `${st.label}：下一次 ALWAYS 调用出卡（不重启）`).toBe(expectedCards)
    expect(existsSync(marker), `${st.label}：拒绝后无副作用`).toBe(false)
    expect(toolResults(frames)[0]?.isError, `${st.label}：tool/result 为错误`).toBe(true)
  }

  // 恢复合法状态（同一会话继续）→ 回到不出卡
  provision(RT)
  await sess.next('none')
  expect(askedCount(RT, sess.sessionId), '恢复后无新卡').toBe(expectedCards)
  expect(existsSync(marker), '恢复后命令经 wrapper 执行').toBe(true)
})

// ── ④：区外读出卡（与门控无关）；重复调用再出卡（无 always 路径）──

it('④ A3 后半: read 工作区外非凭证文件出卡，重复同一调用再出卡（无 always 资格）', { timeout: 180_000 }, async () => {
  // runtime ① 的合法 policy-state 仍在：出卡只能来自「区外」（第 4 行），不是门关
  const sess = await scriptedSession(RT, WS, [
    toolTurnCall('read', { file_path: '/etc/hostname' }),
    toolTurnCall('read', { file_path: '/etc/hostname' }),
  ])
  const okFrames = await sess.next('allowed-once')
  const first = toolResults(okFrames)[0]
  expect(first?.isError, '批准 allowed-once 后读到').toBe(false)
  expect(askedCount(RT, sess.sessionId), '第一次区外读出卡').toBe(1)
  const card = RT.feed.frames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sess.sessionId)
  expect(card?.request?.toolName, '卡按工具名标识').toBe('read')

  const denyFrames = await sess.next('rejected')
  expect(toolResults(denyFrames)[0]?.isError, '拒绝后读失败').toBe(true)
  expect(askedCount(RT, sess.sessionId), 'SDK 侧无任何 always 通道：同一调用再次出卡').toBe(2)
})

// ── ③：档位表坏（A9 ①②③）+ wrapper 不可执行（A9 ⑤）──

it('③a A9 ①②③: 档位表坏 → ALWAYS/ASK 全退 ASK + 日志行；NEVER（guard）不降级、无卡可批、无副作用', { timeout: 300_000 }, async () => {
  // overlay 的 config 整键替换 runtime patch 行（同 id）。坏表分支在门控之前短路，
  // handoff 缺失（instance 算不出 → 门关）不影响「全退 ASK」的判定，无需重述。
  const dir = mkdtempSync(join(tmpdir(), 'p5-21-corrupt-'))
  const overlay = join(dir, 'corrupt-tiers.yml')
  writeFileSync(overlay, `\
# P5-21 ③：注入坏档位表（config.tiers 覆盖文件表；A9 ② 用非法值）
- id: p2sdk-shell-ask
  config:
    policyStatePaths:
      - '${join(DATA_DIR, 'policy-state.json')}'
    tiers: 'garbage-not-a-table'
`)
  const rt = await launchTier({ extraPatch: overlay })
  provision(rt) // policy-state 本身合法——出卡只能来自「表坏」（坏表分支先于门控）
  const bashMarker = join(WS, 'corrupt-bash-marker')
  const credPath = join(TEST_HOME, '.ssh', 'sentinel-key')
  const before = createHash('sha256').update(readFileSync(credPath)).digest('hex')
  const sess = await scriptedSession(rt, WS, [
    bashTurnCall(`echo x > '${bashMarker}'`),
    toolTurnCall('read', { file_path: 'f.txt' }),
    toolTurnCall('read', { file_path: credPath }),
  ])

  const bashFrames = await sess.next('rejected')
  expect(askedCount(rt, sess.sessionId), '表坏：bash（第 1 行 ALWAYS）退 ASK 出卡').toBe(1)
  expect(toolResults(bashFrames)[0]?.isError).toBe(true)
  expect(existsSync(bashMarker), '表坏：拒绝后无副作用').toBe(false)

  const readFrames = await sess.next('rejected')
  expect(askedCount(rt, sess.sessionId), '表坏：工作区内 read 退 ASK 出卡').toBe(2)
  expect(toolResults(readFrames)[0]?.isError).toBe(true)

  // NEVER 类（凭证 read，guard 承担）：表坏不降级——不出卡、结果带 guard 原因、哨兵不变
  const credFrames = await sess.next('none')
  expect(askedCount(rt, sess.sessionId), 'NEVER 不出卡（无卡可批——对 NEVER 尝试 allowed-once 没有作用对象）').toBe(2)
  const cred = toolResults(credFrames)[0]
  expect(cred?.isError, 'NEVER 仍 deny').toBe(true)
  expect(cred?.text, '原因来自 guard（NEVER 不降级、不换人）').toContain('p2sdk-fs-guard')
  expect(createHash('sha256').update(readFileSync(credPath)).digest('hex'), '哨兵内容不变').toBe(before)

  // 日志行（A9 ②「记日志」）：插件在加载时打一行，经 launcher stderr 转发
  expect(rt.readStderr(), 'stderr 有档位表损坏日志行').toContain('failing closed to per-call approval')
})

it('③b A9 ⑤: wrapper 不可执行 → 第 1 行不出卡（asked 0）且命令失败，无「无卡且裸跑」路径', { timeout: 300_000 }, async () => {
  const broken = join(TEST_HOME, 'broken-wrap.py')
  copyFileSync(join(PKG_ROOT, 'sandbox', 'bwrap-wrap.py'), broken)
  chmodSync(broken, 0o000) // 不可读：python3 -I 在加载脚本前即失败（[Errno 13]）
  const dir = mkdtempSync(join(tmpdir(), 'p5-21-runner-'))
  const overlay = join(dir, 'runner.yml')
  const q = (s: string): string => `'${s.replaceAll("'", "''")}'`
  writeFileSync(overlay, `\
# P5-21 ③b：runnerCommand 指向不可执行的 wrapper 副本（sandbox-hardened ⑤ 同法）
- id: sandbox
  config:
    runnerCommand: [${['/usr/bin/python3', '-I', broken].map(q).join(', ')}]
    runnerFailureSignatures: ['bwrap: ']
`)
  const rt = await launchTier({ extraPatch: overlay })
  provision(rt) // 门开 → 第 1 行 ALWAYS 生效（不出卡）；wrapper 坏 → 执行失败
  const marker = join(WS, 'broken-marker')
  const sess = await scriptedSession(rt, WS, [bashTurnCall(`echo pwn > '${marker}'`)])
  const frames = await sess.next('none')
  expect(askedCount(rt, sess.sessionId), '第 1 行生效：不出卡（自主已批）').toBe(0)
  const all = JSON.stringify(frames)
  expect(all, 'bash 失败（写死：python 加载失败 Permission denied）').toContain('Permission denied')
  expect(existsSync(marker), '命令没有执行（没有静默裸跑）').toBe(false)
})

// ── ⑤（A9 ⑦）：子会话 ALWAYS 照常执行且在 wrapper 内；ASK 拒；NEVER 拒 ──

/** 已装 ptc worker bootstrap（P5-05 同法：/tmp worktree 下须复制进工作区）。 */
function ptcBootstrapSource(): string {
  const store = join(PKG_ROOT, 'node_modules', '.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))
  if (!hit) throw new Error('dsh-ptc-runtime-node not found in the pnpm store')
  return join(store, hit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js')
}

it('⑤ A9 ⑦: 子会话（never）ALWAYS 类照常执行且在 wrapper 内，ASK 类拒，NEVER 类拒', { timeout: 420_000 }, async () => {
  const bootstrap = join(WS, '.p521-ptc-boot.mjs')
  copyFileSync(ptcBootstrapSource(), bootstrap)
  const dir = mkdtempSync(join(tmpdir(), 'p5-21-sub-'))
  const overlay = join(dir, 'sub.yml')
  writeFileSync(overlay, `\
# P5-21 ⑤：fake provider + ptc worker 覆盖（subagent-policy.test.ts 同法）
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
- id: ptc-runtime
  config:
    launch:
      kind: node-script
      executable: /usr/bin/node
      bootstrapPath: ${bootstrap}
`)
  const rt = await launchTier({ extraPatch: overlay })
  provision(rt)
  const root = await newSession(rt)
  const m = join(WS, 'm-child')
  rmSync(m, { force: true })
  // 子会话脚本（default.json fallback）：4 个工具 turn + 收尾
  const childScriptDir = join(rt.home, 'fake', 'scripts')
  mkdirSync(childScriptDir, { recursive: true })
  writeFileSync(join(childScriptDir, 'default.json'), JSON.stringify({
    calls: [
      bashTurnCall(`echo p521-child > '${m}'`),
      bashTurnCall('test -e "$HOME/.ssh/sentinel-key" && echo SEEN || echo NOTSEEN'),
      toolTurnCall('read', { file_path: '/etc/hostname' }),
      toolTurnCall('read', { file_path: join(TEST_HOME, '.ssh', 'sentinel-key') }),
      textCall('子会话完成'),
    ],
  }))
  rt.writeScriptCalls(root, [
    toolTurnCall('subagent', { description: 'P5-21 probe', prompt: 'run the P5-21 child tier probes' }),
    textCall('已委派'),
    textCall('通知一'),
    textCall('通知二'),
    textCall('通知三'),
  ])
  await rt.client.call('session/prompt', {
    request: { requestId: `p5-21-${Date.now()}`, sessionId: root, mode: 'queue', content: [{ type: 'text', text: 'P5-21 委派' }] },
  })

  // 等子会话吃完 5 段脚本（P5-06 识别法：prompt 标记）
  const deadline = Date.now() + 120_000
  let child = ''
  for (;;) {
    const hit = rt.readRequests().find((r) => r.sessionId !== null && r.sessionId !== root)
    if (hit) { child = hit.sessionId as string; break }
    if (Date.now() > deadline) throw new Error('120s 内没观察到子会话模型调用')
    await new Promise((r) => setTimeout(r, 50))
  }
  for (;;) {
    const calls = rt.readRequests().filter((r) => r.sessionId === child).length
    if (calls >= 5) break
    if (Date.now() > deadline + 120_000) throw new Error(`子会话只完成 ${calls}/5 段`)
    await new Promise((r) => setTimeout(r, 50))
  }

  // ALWAYS 类：子会话 bash 执行（m 落宿主），且在 wrapper 内（HOME 哨兵不可见）
  expect(existsSync(m), 'A9⑦：子会话 ALWAYS 类 bash 照常执行').toBe(true)
  expect(readFileSync(m, 'utf8').trim()).toBe('p521-child')
  const childResults = rt.readRequests()
    .filter((r) => r.sessionId === child)
    .flatMap((r) => r.toolResults ?? [])
  expect(
    childResults.some((t) => t.text.includes('NOTSEEN')),
    'ALWAYS 类执行仍在 wrapper 内：HOME 下凭证哨兵不可见',
  ).toBe(true)
  expect(
    childResults.some((t) => t.isError && t.text.includes('approval unavailable in this session')),
    'ASK 类（区外 read）在 never 子会话被拒',
  ).toBe(true)
  expect(
    childResults.some((t) => t.isError && t.text.includes('p2sdk-fs-guard')),
    'NEVER 类（凭证 read）由 guard 拒',
  ).toBe(true)
  // 子会话与根会话都没出卡：ALWAYS/委派自主，拒的都是本地拒
  expect(askedCount(rt, root), '根会话委派调用本身不出卡（default 档 = 现状）').toBe(0)
  const childCards = rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === child)
  expect(childCards, '子会话（never）0 张卡').toHaveLength(0)
})
