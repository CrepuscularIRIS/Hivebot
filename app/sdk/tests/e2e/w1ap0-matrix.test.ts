// P5-06 · W1-AP-0 合并验收矩阵（PLAN p5-parity P5-06，验收 ①②④⑤⑥⑦；③ 在
// tests/e2e/security/w1ap0-scan.test.ts，⑧ 结论表落 evidence/P5-06/matrix.md）。
// P5-01–05 全部合入 main 后的跨入口收口：入口（bash cat/find/env、read、
// read_image、glob、grep、write、edit、present）× 会话（根 / subagent /
// subagent_fork / workflow）× 凭证（B A4 哨兵全集 + /run/user/$UID/bus +
// ~/.codex 型点目录 + HOME 外清单）。只加测试，不改产品代码。
//
// 每格写死期望：文件工具 → deny（isError + p2sdk-fs-guard 原因 + 哨兵路径）、
// asked === 0；bash → 不可见（test -e/-s/-S 退出码 1、cat 无内容）。
// stock 差分 = 后置 overlay 同时摘掉三层 P5 防线（sandbox 行复原 → 无
// runnerCommand、p2sdk-fs-guard 禁用、p2sdk-shell-ask 禁用）：bash 探针命中
// （哨兵可见）、文件工具读到哨兵内容 / 上游 fence 错误（无 guard 前缀）、
// 子会话 bash 真执行并读走哨兵（P5-05 ④ 红基线在本仓的等价复现）。/tmp 下的
// DSH_HOME 与 handoff 在 stock 侧仍被上游缺省沙箱的 --tmpfs /tmp 遮住（既有
// 防护命中，两侧同拦，标注不计入本 slug 防线——P5-01 ② 同款注记）。
//
// 顺序回归哨兵（REPORT-P5-04f1）：guard 已用 cordis prepend 钉在最外层。本
// 矩阵里设计上应落 guard 字面串的格是 ⑤ plugin_manager（四会话，含 never 子
// 会话——若落 'approval unavailable in this session' 即顺序回归，本文件立即红）。
// 子会话普通 bash 落 shell-ask 的 'approval unavailable in this session' 是
// P5-05 的设计行为（guard 对普通 bash 无路径规则，next() 放行给 shell-ask），
// 不判回归；bash 类 guard 先行的证明格在 P5-04 ⑤（dfa 组合会话）。
//
// fake 插件按会话持游标（LEARNINGS 2026-11-03）：根会话每 turn 新会话；子会话
// 走 default.json 整段脚本。测试只结束自己 spawn 的子进程（launchRuntime.stop
// 自管），不用 pkill。探针只报存在性 / rc / 内容标志，绝不回显真实凭证内容。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { uniqueTestHome } from '../support/sandbox-home.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = uniqueTestHome('p5-06') // 决策 8 父目录 + P5-H3 运行级唯一后缀
const DATA_DIR = join(TEST_HOME, 'pbots-data') // ⑦(a)：HOME 内非点目录
const DATA_DIR_B = uniqueTestHome('p5-06-data') // ⑦(b)：HOME 外（不同子树，仍在家外）
const DEFAULT_DATA_DIR = join(TEST_HOME, '.config', 'pbots-ui') // ⑦(c)：未设的缺省
const MASK_DIR = join(TEST_HOME, 'mask-extra') // ⑦：P2SDK_SANDBOX_MASK 追加根
const RUN_USER = `/run/user/${process.getuid()}`
/** M/STOCK 的 runtime env 哨兵（P2SDK_ 前缀经 childEnv 白名单透传，供 /proc 格）。 */
const X_AUTH_PROC = 'p506-proc-sentinel-xauth'
/** ② 的三枚 env 哨兵：X_AUTH/X_CREDENTIALS 靠 launcher 白名单挡（名字不匹配
 *  上游 scrub 正则），P2SDK_LLM_API_KEY 靠上游 scrubber 挡（仅 real 模式透传）。 */
const ENV_SENTINELS = {
  X_AUTH: 'p506-env-xauth-value',
  X_CREDENTIALS: 'p506-env-xcredentials-value',
  P2SDK_LLM_API_KEY: 'sk-canary-p2sdk-p506',
} as const
/** 1x1 透明 PNG（read_image 哨兵）。 */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

// --- 格记录（⑧ 结论表的数据源：断言全过才到达记录点，红则中途抛出） ---
const CELLS: Array<{ section: string; label: string; stock: boolean }> = []
function cell(section: string, label: string, stock = false): void {
  CELLS.push({ section, label, stock })
}
function sectionTally(section: string): string {
  const rows = CELLS.filter((c) => c.section === section)
  return `${section}: ${rows.length} 格（主格 ${rows.filter((r) => !r.stock).length} + 差分 ${rows.filter((r) => r.stock).length}）`
}

interface EventsFrame { type: string; event?: string; eventId?: string; agentId?: string }
interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}
interface MatrixRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
  readRequests(): Array<{ sessionId: string | null; userTexts?: string[]; toolResults?: Array<{ toolCallId: string | null; isError: boolean; text: string }> }>
}
const runtimes: MatrixRuntime[] = []

// --- overlay 组装 ---

/** ptc-runtime worker 覆盖（subagent-policy.test.ts 同款）：/tmp worktree 下
 *  pnpm 管的 node 与 bootstrap 落在沙箱 tmpfs 之后不可见，改用 /usr/bin/node +
 *  工作区内 bootstrap 副本。测试环境适配，不动被测的沙箱与委派本身。 */
function ptcBootstrap(): string {
  const store = join(PKG_ROOT, 'node_modules', '.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))
  if (!hit) throw new Error('dsh-ptc-runtime-node not found in the pnpm store')
  // 必须放进委派会话的工作区（cwd=WS）：沙箱只重新 bind 工作区，放 deleg/ 下
  // workflow 的 worker 看不到 bootstrap（P5-05 同款坑）
  mkdirSync(WS, { recursive: true })
  const bootstrap = join(WS, '.p506-ptc-boot.mjs')
  if (!existsSync(bootstrap)) copyFileSync(join(store, hit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js'), bootstrap)
  return bootstrap
}

/** 已装 dsh-web-app 的 presets 目录。 */
const WEBAPP_PRESETS = (() => {
  const hit = readdirSync(join(PKG_ROOT, 'node_modules', '.pnpm')).find((n) => n.startsWith('@deepseek-ai+dsh-web-app@'))
  if (!hit) throw new Error('dsh-web-app not found in the pnpm store')
  return join(PKG_ROOT, 'node_modules', '.pnpm', hit, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets')
})()

/**
 * ⑤ 用：按 id 整键覆盖 preset-standard，重新启用 tool-plugin-manager。与
 * P5-03 ② 的最小 config 不同——本矩阵同一 runtime 还要 read/bash/delegation，
 * 所以从已装 preset 文件原样取整块（上游一变这里跟着变，不会静默腐化），只把
 * tool-plugin-manager 的 disabled 翻成 false。
 */
function pmReenableInclude(): string {
  const source = readFileSync(join(WEBAPP_PRESETS, 'standard.patch.yml'), 'utf8').split('\n')
  const start = source.findIndex((l) => l === '    - id: preset-standard')
  expect(start, '已装 standard.patch.yml 含 preset-standard insert 行').toBeGreaterThanOrEqual(0)
  const lines = source.slice(start)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const dedented = lines.map((l) => (l === '' ? l : l.slice(4)))
  let flipped = 0
  for (let i = 0; i < dedented.length; i++) {
    if (dedented[i] === '      - id: tool-plugin-manager') {
      for (let j = i + 1; j < dedented.length && dedented[j].startsWith('        ') && !dedented[j].startsWith('      - '); j++) {
        if (dedented[j].startsWith('        disabled:')) {
          dedented[j] = '        disabled: false'
          flipped++
        }
      }
    }
  }
  expect(flipped, 'tool-plugin-manager 恰一处 disabled 翻转').toBe(1)
  const dir = tmkdir('p5-06-pm-')
  const include = join(dir, 'pm-enable.yml')
  writeFileSync(include, `# P5-06 ⑤：重新启用 plugin_manager（整块取自已装 preset，仅翻 disabled 一键）\n${dedented.join('\n')}\n`)
  return include
}

interface OverlayOpts { stock?: boolean; fake?: boolean }

/** 矩阵 overlay：fake LLM + ptc worker 覆盖 +（差分）摘三层防线。 */
function matrixOverlay(opts: OverlayOpts = {}): string {
  const dir = tmkdir('p5-06-patch-')
  const overlay = join(dir, 'matrix.yml')
  writeFileSync(overlay, `\
# P5-06 generated overlay (tests/e2e/w1ap0-matrix.test.ts)
${opts.fake === false ? '' : `\
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
      bootstrapPath: ${ptcBootstrap()}
`}\
${opts.stock === true ? `\
# P5-06 stock 差分：同时摘掉三层 P5 防线（wrapper / fs-guard / shell-ask）
- id: sandbox
  config:
    probeTimeoutMs: 5000
- id: p2sdk-fs-guard
  disabled: true
# P6-25.f1：stock 必须恢复上游 fs，而不是保留执行层防线。
- id: p2sdk-fs-zone
  disabled: true
- id: fs-sandbox
  disabled: false
- id: p2sdk-shell-ask
  disabled: true
` : ''}\
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

interface LaunchOpts {
  env?: Record<string, string>
  pmReenable?: boolean
  stock?: boolean
  noDataDir?: boolean
  fake?: boolean
}

async function launchMatrix(opts: LaunchOpts = {}): Promise<MatrixRuntime> {
  clearRealKeys()
  const patches = [matrixOverlay({ stock: opts.stock, fake: opts.fake })]
  if (opts.pmReenable === true) patches.push(pmReenableInclude()) // 独立 overlay 文件（冒号列表，后行覆盖前行；P5-03 ② 同法）
  const base: Record<string, string> = {
    HOME: TEST_HOME,
    P2SDK_PATCH: patches.join(':'),
    P2SDK_X_AUTH: X_AUTH_PROC, // /proc 格：runtime env 哨兵（名字不匹配上游 scrub 正则）
    X_AUTH: ENV_SENTINELS.X_AUTH, // ②：无前缀哨兵，靠 launcher 白名单挡
    X_CREDENTIALS: ENV_SENTINELS.X_CREDENTIALS,
  }
  if (!opts.noDataDir) base.PBOTS_DATA_DIR = DATA_DIR
  const env = { ...base, ...opts.env }
  const rt = await launchRuntime({ env })
  const feed = await openFeed(rt)
  const m: MatrixRuntime = {
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
  runtimes.push(m)
  return m
}

// --- turn 原语（guard-fs / sandbox-hardened 同款） ---

function multiToolCall(prefix: string, calls: Array<{ name: string; args: object }>): object {
  const blocks = calls.map((c, i) => {
    const id = `${prefix}-${Math.random().toString(16).slice(2, 8)}-${i}`
    const argumentsJson = JSON.stringify(c.args)
    return [
      { type: 'block-start', index: i, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: i, id, name: c.name, argumentsDelta: argumentsJson },
      { type: 'block-end', index: i, block: { type: 'tool-call', id, name: c.name, arguments: argumentsJson } },
    ]
  }).flat()
  return {
    chunks: [...blocks, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } }],
    paceMs: 10,
  }
}

function bashArgs(command: string, extra: object = {}): { name: string; args: object } {
  return { name: 'bash', args: { command, description: 'P5-06 矩阵探针', ...extra } }
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

interface ToolResultView { toolCallId: string; isError: boolean; text: string }

async function runTurn(
  h: MatrixRuntime,
  cwd: string,
  calls: object[],
  onApproval?: (frame: EventsFrame) => Promise<void>,
): Promise<{ sessionId: string; frames: Frame[]; results: Map<string, ToolResultView> }> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [...calls, textCall('P5-06 完成')])
  await h.client.call('session/prompt', {
    request: { requestId: `p5-06-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-06 矩阵探针' }] },
  })
  const deadline = Date.now() + 90_000
  for (;;) {
    if (onApproval !== undefined) {
      const f = h.feed.frames.find((fr) => fr.type === 'waterfall' && fr.event === 'approval/request' && fr.agentId === sessionId)
      if (f !== undefined) await onApproval(f)
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到；尾部：${JSON.stringify(frames.slice(-4))}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const results = new Map<string, ToolResultView>()
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { toolCallId?: string; isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    results.set(data.message?.toolCallId ?? '', {
      toolCallId: data.message?.toolCallId ?? '',
      isError: data.message?.isError === true,
      text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n'),
    })
  }
  return { sessionId, frames, results }
}

/** 纯文件工具 turn（无审批路径）：结果按 toolCallId 索引 + asked 数。 */
async function fileTurn(
  h: MatrixRuntime,
  cwd: string,
  calls: Array<{ name: string; args: object }>,
): Promise<{ sessionId: string; results: Map<string, ToolResultView>; asked: number }> {
  const { sessionId, results } = await runTurn(h, cwd, [multiToolCall('p5-06', calls)])
  const asked = h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
  return { sessionId, results, asked }
}

async function oneTool(h: MatrixRuntime, cwd: string, name: string, args: object): Promise<ToolResultView> {
  const { results } = await fileTurn(h, cwd, [{ name, args }])
  expect(results.size, `${name} 有一个结果`).toBe(1)
  return [...results.values()][0]
}

/** bash turn：加固侧出卡 → allowed-once → tool/result 文本；stock（shell-ask 摘掉）无卡直接执行。 */
async function bashTurn(h: MatrixRuntime, cwd: string, command: string, expectApproval = true): Promise<string> {
  let answered = false
  const { sessionId, results } = await runTurn(h, cwd, [multiToolCall('p5-06', [bashArgs(command)])], expectApproval ? async (frame) => {
    if (!answered) {
      answered = true
      await h.feed.answer(frame, 'allowed-once')
    }
  } : undefined)
  if (expectApproval) expect(answered, 'bash 出卡 1 次（根会话照旧问，P5-04 ④ 一致性）').toBe(true)
  else {
    const asked = h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
    expect(asked, 'stock（shell-ask 摘掉）bash 不出卡').toBe(0)
  }
  expect(results.size).toBe(1)
  return [...results.values()][0].text
}

/** RESULT name=value 探针输出 → 表（sandbox-hardened 同款）。 */
function probeResults(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/RESULT ([A-Za-z0-9_]+)=([^\\"\n]*)/g)) out[m[1]] = m[2]
  return out
}

function expectProbe(results: Record<string, string>, name: string, expected: string): void {
  expect(results[name], `探针 ${name}：期望 ${expected}，实际 ${results[name] ?? '<缺失>'}`).toBe(expected)
}

const sha256 = (p: string): string => {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex') } catch { return 'absent' }
}

function dshPidOf(rt: Runtime): number {
  const pid = rt.child.pid!
  const out = spawnSync('ps', ['-o', 'pid=', '--ppid', String(pid)], { encoding: 'utf8' }).stdout
  for (const line of out.split('\n')) {
    const p = line.trim()
    if (!p) continue
    try {
      const cmd = readFileSync(`/proc/${p}/cmdline`, 'utf8')
      if (cmd.includes('dsh/lib/bin.js') || cmd.includes('dsh')) return Number(p)
    } catch { /* gone */ }
  }
  return pid
}

// --- 凭证类别表（A4 哨兵全集 + bus + 点目录 + HOME 外） ---

interface Category {
  name: string
  textFile: string
  png: string
  dir: string
  grep?: { pattern: string; path: string }
  /** bash cat 探针期望（加固）：目录根遮蔽 → '1:empty'；文件根空普通文件覆盖（f2）→ '0:empty'；socket → null（只测存在性） */
  bashCat: string | null
  probe: 'e' | 's' | 'S'
  /** stock 差分读类：'content' 读到标记 / 'absent' 只断言无 guard 前缀（真实系统态） */
  stock: 'content' | 'absent'
  /** stock bash 存在性探针期望（dsh-home/handoff 是既有防护命中 → 1） */
  stockExist: string
  skipStockWrite?: boolean
}

const WS = join(TEST_HOME, 'ws')

/** M 启动后才有 DSH_HOME / handoff / dsh pid；CATS 在 beforeAll 之后调用。 */
let MAIN_DSH = ''
let MAIN_HANDOFF = ''
let MAIN_DSH_PID = 0

const CATS = (): Category[] => [
  { name: 'ssh', textFile: join(TEST_HOME, '.ssh', 'sentinel-key'), png: join(TEST_HOME, '.ssh', 'sentinel.png'), dir: join(TEST_HOME, '.ssh'), bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '0' },
  { name: 'config-cred', textFile: join(TEST_HOME, '.config', 'x', 'credentials-sentinel'), png: join(TEST_HOME, '.config', 'x', 'credentials-sentinel.png'), dir: join(TEST_HOME, '.config'), bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '0' },
  { name: 'dotdir', textFile: join(TEST_HOME, '.codex', 'token'), png: join(TEST_HOME, '.codex', 'token.png'), dir: join(TEST_HOME, '.codex'), bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '0' },
  { name: 'grants', textFile: join(DATA_DIR, 'standing-grants.json'), png: join(DATA_DIR, 'standing-grants.json.png'), dir: DATA_DIR, bashCat: '1:empty', probe: 's', stock: 'content', stockExist: '0' },
  { name: 'data-top', textFile: join(DATA_DIR, 'top-sentinel'), png: join(DATA_DIR, 'top-sentinel.png'), dir: DATA_DIR, bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '0' },
  { name: 'other-bot', textFile: join(DATA_DIR, 'workspaces', 'other-bot', 'wm'), png: join(DATA_DIR, 'workspaces', 'other-bot', 'wm.png'), dir: join(DATA_DIR, 'workspaces', 'other-bot'), bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '0' },
  // /tmp 下的 DSH_HOME 与 handoff：stock 侧被上游缺省沙箱 --tmpfs /tmp 遮住（既有防护，两侧同拦）
  { name: 'dsh-home', textFile: join(MAIN_DSH, 'sentinel-dsh'), png: join(MAIN_DSH, 'sentinel-dsh.png'), dir: MAIN_DSH, bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '1' },
  { name: 'handoff', textFile: join(MAIN_HANDOFF, 'sentinel-ho'), png: join(MAIN_HANDOFF, 'sentinel-ho.png'), dir: MAIN_HANDOFF, bashCat: '1:empty', probe: 'e', stock: 'content', stockExist: '1' },
  { name: 'proc', textFile: '/proc/self/environ', png: '/proc/self/environ', dir: '/proc', grep: { pattern: X_AUTH_PROC, path: `/proc/${MAIN_DSH_PID}/environ` }, bashCat: null, probe: 'e', stock: 'absent', stockExist: '0', skipStockWrite: true },
  { name: 'run-user', textFile: `${RUN_USER}/bus`, png: `${RUN_USER}/bus`, dir: RUN_USER, bashCat: null, probe: 'S', stock: 'absent', stockExist: '0', skipStockWrite: true },
  { name: 'ppp', textFile: '/etc/ppp/chap-secrets', png: '/etc/ppp/chap-secrets', dir: '/etc/ppp', bashCat: '0:empty', probe: 's', stock: 'absent', stockExist: '0', skipStockWrite: true },
]

const ENTRIES = ['read', 'read_image', 'glob', 'grep', 'write', 'edit', 'present'] as const
type Entry = typeof ENTRIES[number]

function entryCall(cat: Category, entry: Entry): { name: string; args: object } {
  switch (entry) {
    case 'read': return { name: 'read', args: { file_path: cat.textFile } }
    case 'read_image': return { name: 'read_image', args: { file_path: cat.png } }
    case 'glob': return { name: 'glob', args: { pattern: '*', path: cat.dir } }
    case 'grep': return { name: 'grep', args: cat.grep ?? { pattern: 'p506', path: cat.dir } }
    case 'write': return { name: 'write', args: { file_path: cat.textFile, content: 'p506-overwritten' } }
    case 'edit': return { name: 'edit', args: { file_path: cat.textFile, old_string: 'p506', new_string: 'p506-overwritten' } }
    case 'present': return { name: 'present', args: { files: [{ path: cat.textFile }] } }
  }
}

function setupTestHome(): void {
  rmSync(TEST_HOME, { recursive: true, force: true })
  rmSync(DATA_DIR_B, { recursive: true, force: true })
  for (const d of [
    join(TEST_HOME, '.ssh'), join(TEST_HOME, '.config', 'x'), join(TEST_HOME, '.codex'),
    join(DATA_DIR, 'workspaces', 'other-bot'), join(DATA_DIR, 'workspaces', 'x'),
    WS, join(TEST_HOME, 'deleg'),
    join(DATA_DIR_B, 'workspaces', 'x'), join(DATA_DIR_B, 'workspaces', 'other-bot'),
    join(DEFAULT_DATA_DIR, 'workspaces', 'x'), join(DEFAULT_DATA_DIR, 'workspaces', 'other-bot'),
    MASK_DIR,
  ]) mkdirSync(d, { recursive: true })
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel-key'), 'p506-sentinel-ssh')
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel.png'), PNG)
  writeFileSync(join(TEST_HOME, '.config', 'x', 'credentials-sentinel'), 'p506-sentinel-configcred')
  writeFileSync(join(TEST_HOME, '.config', 'x', 'credentials-sentinel.png'), PNG)
  writeFileSync(join(TEST_HOME, '.codex', 'token'), 'p506-sentinel-codex')
  writeFileSync(join(TEST_HOME, '.codex', 'token.png'), PNG)
  writeFileSync(join(DATA_DIR, 'standing-grants.json'), '{"p506":"grants"}')
  writeFileSync(join(DATA_DIR, 'standing-grants.json.png'), PNG)
  writeFileSync(join(DATA_DIR, 'top-sentinel'), 'p506-sentinel-top')
  writeFileSync(join(DATA_DIR, 'top-sentinel.png'), PNG)
  writeFileSync(join(DATA_DIR, 'policy-state.json'), '{"version":1,"paused":false,"instance":"other"}')
  writeFileSync(join(DATA_DIR, 'workspaces', 'other-bot', 'wm'), 'p506-sentinel-otherbot')
  writeFileSync(join(DATA_DIR, 'workspaces', 'other-bot', 'wm.png'), PNG)
  writeFileSync(join(WS, 'f.txt'), 'p506-ws')
  for (const root of [DATA_DIR_B, DEFAULT_DATA_DIR]) {
    writeFileSync(join(root, 'standing-grants.json'), '{"p506":"grants"}')
    writeFileSync(join(root, 'policy-state.json'), '{"version":1,"paused":false,"instance":"other"}')
    writeFileSync(join(root, 'workspaces', 'other-bot', 'wm'), 'p506-sentinel-y')
    writeFileSync(join(root, 'workspaces', 'x', 'f.txt'), 'p506-wsx')
  }
  writeFileSync(join(MASK_DIR, 'mask-sentinel'), 'p506-sentinel-mask')
}

let M: MatrixRuntime
let STOCK: MatrixRuntime

beforeAll(async () => {
  setupTestHome()
  M = await launchMatrix({ pmReenable: true })
  MAIN_DSH = M.home
  MAIN_HANDOFF = M.handoff
  MAIN_DSH_PID = dshPidOf(M)
  writeFileSync(join(M.home, 'sentinel-dsh'), 'p506-sentinel-dsh')
  writeFileSync(join(M.home, 'sentinel-dsh.png'), PNG)
  writeFileSync(join(M.handoff, 'sentinel-ho'), 'p506-sentinel-ho')
  writeFileSync(join(M.handoff, 'sentinel-ho.png'), PNG)
  STOCK = await launchMatrix({ pmReenable: true, stock: true, noDataDir: true })
  writeFileSync(join(STOCK.home, 'sentinel-dsh'), 'p506-sentinel-dsh')
  writeFileSync(join(STOCK.home, 'sentinel-dsh.png'), PNG)
  writeFileSync(join(STOCK.handoff, 'sentinel-ho'), 'p506-sentinel-ho')
  writeFileSync(join(STOCK.handoff, 'sentinel-ho.png'), PNG)
}, 180_000)

afterAll(async () => {
  for (const rt of runtimes) {
    try { rt.feed.close() } catch { /* 已关 */ }
    try { await rt.stop() } catch { /* 已停 */ }
    rmSync(rt.handoff, { recursive: true, force: true })
  }
  rmSync(TEST_HOME, { recursive: true, force: true })
  rmSync(DATA_DIR_B, { recursive: true, force: true })
  console.log(`P5-06 矩阵汇总：${CELLS.length} 格全部记录（断言全过才到达记录点）`)
  for (const s of ['①-file', '①-bash', '①-child', '①-stock', '②-env', '④-loopback', '⑤-plugin-manager', '⑥-exfil', '⑦-data-root']) {
    if (CELLS.some((c) => c.section === s)) console.log(`  ${sectionTally(s)}`)
  }
})

// --- ① 文件工具格：根会话 11 类 × 7 入口 ---

it('① 根会话：11 类凭证 × 7 文件入口逐格 deny（isError + guard 原因 + asked 0），写类哨兵 sha 不变', { timeout: 600_000 }, async () => {
  for (const cat of CATS()) {
    const before = cat.stock === 'content' ? sha256(cat.textFile) : undefined // 只打开临时哨兵，不读真实系统凭证
    const entries = ENTRIES.map((e) => entryCall(cat, e))
    const { results, asked } = await fileTurn(M, WS, entries)
    expect(asked, `${cat.name}：全部 deny，无审批`).toBe(0)
    expect(results.size, `${cat.name}：7 个结果`).toBe(7)
    for (const [id, r] of results) {
      expect(r.isError, `${cat.name}/${id} isError`).toBe(true)
      expect(r.text, `${cat.name}/${id} guard 原因`).toContain('p2sdk-fs-guard')
      expect(r.text, `${cat.name}/${id} 文件工具不经 shell-ask`).not.toContain('approval unavailable in this session')
    }
    if (cat.stock === 'content') expect(sha256(cat.textFile), `${cat.name} 写类哨兵不变`).toBe(before)
    for (const entry of ENTRIES) cell('①-file', `root/${cat.name}/${entry}`)
  }
  expect(CELLS.filter((c) => c.section === '①-file').length, '根会话文件格 11×7=77').toBe(77)
})

// --- ① bash 格：根会话 cat / find / env ---

/** 探针输出名：RESULT 名字正则是 [A-Za-z0-9_]+，类别名里的 - 换成 _。 */
const probeId = (name: string): string => name.replaceAll('-', '_')

/** cat 探针：rc + 内容标志（绝不回显内容本身）。目录根遮蔽 → 1:empty；ppp 被
 *  空普通文件覆盖（f2 --ro-bind-data）→ 0:empty（内容为空即不可见，P5-01 ② 的 test -s 同理）。 */
function bashCatScript(cats: Category[]): string {
  const catLines = cats.filter((c) => c.bashCat !== null).map((c) => `probe_cat ${probeId(c.name)} '${c.textFile}'`)
  const existLines = cats.map((c) => `probe_exist ${probeId(c.name)}_${c.probe} test -${c.probe} '${c.textFile}'`)
  return `probe_cat() { n=$1; p=$2; if out=$(cat "$p" 2>/dev/null); then rc=0; else rc=$?; fi; if [ -n "$out" ]; then e=content; else e=empty; fi; echo "RESULT cat_$n=$rc:$e"; }
probe_exist() { n=$1; shift; if "$@" >/dev/null 2>&1; then r=0; else r=1; fi; echo "RESULT $n=$r"; }
${catLines.join('\n')}
${existLines.join('\n')}`
}

function bashFindScript(): string {
  return `n=$( { find "$HOME" '${DATA_DIR}' '${MAIN_DSH}' '${MAIN_HANDOFF}' /etc/ppp -name '*sentinel*' 2>/dev/null; } | wc -l ); echo "RESULT find_hits=$n"
b=$( { find ~ -name '*sentinel*' -exec cat {} + 2>/dev/null; } | wc -c ); echo "RESULT find_exec_bytes=$b"`
}

const ENV_CAPTURE = join(WS, 'env-capture.txt')
function bashEnvScript(): string {
  // env 输出落工作区文件（宿主可读），不整段进模型上下文
  return `env > '${ENV_CAPTURE}' 2>&1; echo "RESULT env_rc=$?"`
}

it('① 根会话 bash：cat 逐目标 rc 写死、存在性探针全 1、find 0 命中、env 无哨兵值', { timeout: 300_000 }, async () => {
  const cats = CATS()
  const r = probeResults(await bashTurn(M, WS, bashCatScript(cats)))
  for (const cat of cats) {
    if (cat.bashCat !== null) {
      if (cat.name === 'ppp') {
        // P5-01.f2 已钉死：文件根遮蔽 = --ro-bind-data 空普通文件 0644，cat 恒 rc=0 且空
        // （旧原语 --ro-bind /dev/null 在 bwrap 用户 bind 强制 MS_NODEV 下 rc=1，跨版本漂移）
        expect(r[`cat_ppp`], `ppp cat rc=0 且空（f2 已钉死）：${r.cat_ppp ?? '<缺失>'}`).toMatch(/^0:empty$/)
      } else {
        expectProbe(r, `cat_${probeId(cat.name)}`, cat.bashCat)
      }
      cell('①-bash', `root/bash-cat/${cat.name}`)
    }
    if (cat.name !== 'proc') {
      expectProbe(r, `${probeId(cat.name)}_${cat.probe}`, '1')
      cell('①-bash', `root/bash-exist/${cat.name}`)
    } else {
      // proc：bash 侧 /proc 由设计保持可见（bwrap 需要 procfs；never-roots 只把
      // /proc 列进 guard 的文件工具硬根）。env 泄漏通道由上游 scrubber 挡（②）。
      expectProbe(r, `${probeId(cat.name)}_${cat.probe}`, '0')
    }
  }
  const rf = probeResults(await bashTurn(M, WS, bashFindScript()))
  expectProbe(rf, 'find_hits', '0')
  expectProbe(rf, 'find_exec_bytes', '0')
  cell('①-bash', 'root/bash-find')
  rmSync(ENV_CAPTURE, { force: true })
  await bashTurn(M, WS, bashEnvScript())
  const envOut = readFileSync(ENV_CAPTURE, 'utf8')
  expect(envOut, 'env 探针真跑（有 PATH）').toContain('PATH=')
  expect(envOut, 'launcher 白名单挡住无前缀哨兵 X_AUTH').not.toContain(ENV_SENTINELS.X_AUTH)
  expect(envOut, 'launcher 白名单挡住无前缀哨兵 X_CREDENTIALS').not.toContain(ENV_SENTINELS.X_CREDENTIALS)
  cell('①-bash', 'root/bash-env')
})

// --- ① 子会话列：subagent / subagent_fork / workflow ---

function delegationCall(kind: 'subagent' | 'subagent_fork' | 'workflow'): object {
  if (kind === 'workflow') {
    return multiToolCall('p5-06', [{
      name: 'workflow',
      args: { script: 'return await agent("run the P5-06 matrix probes and report")', meta: { name: 'p5-06-probe', description: 'P5-06 delegated matrix probe' } },
    }])
  }
  return multiToolCall('p5-06', [{ name: kind, args: { description: 'P5-06 矩阵探针', prompt: 'run the P5-06 matrix probes and report' } }])
}

/** 委派一格：根会话发 delegation，子会话按 default.json 整段脚本跑，等子会话吃完全部脚本。
 *  子会话 id 是裸 uuid（不带 session- 前缀），且历史根会话的请求早就在日志里——
 *  所以按「本次 prompt 之后新出现的、提示词带委派标记的会话」识别子会话。 */
async function runDelegation(h: MatrixRuntime, kind: 'subagent' | 'subagent_fork' | 'workflow', childCalls: object[]): Promise<string> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [delegationCall(kind), textCall('已委派'), textCall('通知一'), textCall('通知二'), textCall('通知三')])
  const dir = join(h.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'default.json'), JSON.stringify({ calls: [...childCalls, textCall('子会话完成')] }))
  const before = h.readRequests().length
  await h.client.call('session/prompt', {
    request: { requestId: `p5-06-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-06 委派探针' }] },
  })
  const deadline = Date.now() + 90_000
  const answered = new Set<string>()
  let child = ''
  for (;;) {
    // P6-26t: workflow is process execution, so approve only this root call.
    // Child permissions remain untouched; their NEVER/ASK denies are the subject.
    for (const f of h.feed.frames) {
      if (kind === 'workflow' && f.type === 'waterfall' && f.event === 'approval/request'
        && f.agentId === sessionId && f.request?.toolName === 'workflow' && !answered.has(f.eventId ?? '')) {
        answered.add(f.eventId ?? '')
        await h.feed.answer(f, 'allowed-once')
      }
    }
    const hit = h.readRequests()
      .slice(before)
      .find((q) => q.sessionId !== null && q.sessionId !== sessionId && (q.userTexts ?? []).some((t) => t.includes('P5-06 matrix probes')))
    if (hit) { child = hit.sessionId as string; break }
    if (Date.now() > deadline) throw new Error('90s 内没观察到子会话模型调用（委派标记未出现）')
    await new Promise((res) => setTimeout(res, 50))
  }
  const expected = childCalls.length + 1 // + 收尾 text
  const settleAt = Date.now() + 240_000
  for (;;) {
    const calls = h.readRequests().filter((q) => q.sessionId === child).length
    if (calls >= expected) break
    if (Date.now() > settleAt) throw new Error(`子会话 ${child} 只跑了 ${calls}/${expected} 次模型调用`)
    await new Promise((res) => setTimeout(res, 50))
  }
  const endAt = Date.now() + 90_000
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > endAt) throw new Error(`根会话 turn/end 未到；尾部：${JSON.stringify(frames.slice(-4))}`)
    await new Promise((res) => setTimeout(res, 50))
  }
  stream.cancel()
  void drained
  const childAsked = h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && (f.agentId === child || f.agentId === `session-${child}`)).length
  expect(childAsked, `${kind} 子会话 0 出卡`).toBe(0)
  return child
}

/** 子会话的全部工具结果（下一轮模型调用带回，P5-06 加的观测通道）。 */
function childToolTexts(h: MatrixRuntime, child: string): Array<{ isError: boolean; text: string }> {
  const out: Array<{ isError: boolean; text: string }> = []
  const seen = new Set<string>()
  for (const q of h.readRequests()) {
    if (q.sessionId !== child) continue
    for (const t of q.toolResults ?? []) {
      // toolResult 随消息历史在每次模型调用里累积——按 toolCallId 去重
      const key = t.toolCallId ?? `notext:${t.text}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ isError: t.isError, text: t.text })
    }
  }
  return out
}

it('① 子会话列 ×3：77 文件格逐格 deny 且与根会话相等；bash 三探针 deny（P5-05 设计行为）', { timeout: 600_000 }, async () => {
  const cats = CATS()
  for (const kind of ['subagent', 'subagent_fork', 'workflow'] as const) {
    const childCalls = [
      ...cats.map((cat) => multiToolCall(`p5-06-${kind}`, ENTRIES.map((e) => entryCall(cat, e)))),
      multiToolCall(`p5-06-${kind}`, [bashArgs(bashCatScript(cats))]),
      multiToolCall(`p5-06-${kind}`, [bashArgs(bashFindScript())]),
      multiToolCall(`p5-06-${kind}`, [bashArgs(bashEnvScript())]),
    ]
    const child = await runDelegation(M, kind, childCalls)
    const texts = childToolTexts(M, child)
    const denyTexts = texts.filter((t) => t.text.includes('p2sdk-fs-guard'))
    expect(denyTexts.length, `${kind}：77 个 guard deny 结果`).toBe(77)
    for (const t of denyTexts) {
      expect(t.isError, `${kind} deny 结果 isError`).toBe(true)
      expect(t.text, `${kind} 文件工具不经 shell-ask`).not.toContain('approval unavailable in this session')
    }
    // 子会话跑的是与根会话完全相同的 77 个调用（同一 CATS/entryCall 生成）；
    // 根会话侧的逐格 toolCallId 映射在 ①-file 已证。这里按类别核「该类格真跑
    // 过且被点名」：每类哨兵路径（proc 用 resolve 后的 environ 路径）至少出现
    // 在 4 个 deny 文本里（read/write/edit/present 的目标都 resolve 到它）。
    for (const cat of cats) {
      const needle = cat.name === 'proc' ? `/proc/${MAIN_DSH_PID}/environ` : cat.textFile
      const hits = denyTexts.filter((t) => t.text.includes(needle))
      expect(hits.length, `${kind}/${cat.name}：该类格被点名 ≥4`).toBeGreaterThanOrEqual(4)
      for (const entry of ENTRIES) cell('①-child', `${kind}/${cat.name}/${entry}`)
    }
    // bash 格：never 子会话普通 bash 被 shell-ask 拒（P5-05 设计行为；guard 对
    // 普通 bash 无路径规则）。哨兵内容与 env 哨兵不可能出现在任何子会话结果里。
    const bashDenies = texts.filter((t) => t.text.includes('approval unavailable in this session'))
    expect(bashDenies.length, `${kind}：三个 bash 探针都 deny`).toBe(3)
    for (const t of texts) {
      expect(t.text, `${kind}：结果不含哨兵标记`).not.toContain('p506-sentinel')
      expect(t.text, `${kind}：结果不含 env 哨兵值`).not.toContain(X_AUTH_PROC)
    }
    for (const probe of ['bash-cat', 'bash-find', 'bash-env']) cell('①-child', `${kind}/${probe}`)
  }
  // 四列相等：子会话与根会话跑完全相同的 77+3 个调用（同一生成函数），根会话
  // 侧逐格映射（toolCallId → 7 结果）在 ①-file 已证；这里核对每列 77 deny +
  // 类别点名，显式核对格数
  expect(CELLS.filter((c) => c.section === '①-child').length, '子会话格 3×(77+3)=240').toBe(240)
})

// --- ① stock 差分 ---

it('① stock 差分（摘三层 P5 防线）：根会话逐格读到哨兵/上游 fence 错；子会话 bash 真执行读到哨兵', { timeout: 600_000 }, async () => {
  const cats = CATS()
  for (const cat of cats) {
    const entries = ENTRIES.map((e) => entryCall(cat, e))
    for (const [idx, entry] of ENTRIES.entries()) {
      if (cat.name === 'ppp' || (cat.skipStockWrite && (entry === 'write' || entry === 'edit'))) {
        cell('①-stock', `stock-root/${cat.name}/${entry}(真实系统态跳过)`)
        continue
      }
      const r = await oneTool(STOCK, WS, entries[idx].name, entries[idx].args)
      expect(r.text, `stock/${cat.name}/${entry} 不被本 guard 拦`).not.toContain('p2sdk-fs-guard')
      if (cat.stock === 'content') {
        if (entry === 'read' || entry === 'present') {
          expect(r.isError, `stock/${cat.name}/${entry} 成功`).toBe(false)
          if (entry === 'read') expect(r.text, `stock/${cat.name}/read 读到哨兵`).toContain('p506')
        }
        if (entry === 'glob' || entry === 'grep') expect(r.isError, `stock/${cat.name}/${entry} 成功`).toBe(false)
        // write/edit：上游 workspace fence 本就拒工作区外写（既有防护，两侧同拦），
        // 差分只断言错误不来自本 guard——上方 not.toContain 已覆盖
      }
      // read_image 的 stock 结果受上游图像校验影响（r4 #4），成功或上游错误均可
      cell('①-stock', `stock-root/${cat.name}/${entry}`)
    }
  }
  // bash 差分：存在性探针按类别写死（dsh-home/handoff 是既有防护命中 → 1）
  const r = probeResults(await bashTurn(STOCK, WS, bashCatScript(cats), false))
  for (const cat of cats) {
    expectProbe(r, `${probeId(cat.name)}_${cat.probe}`, cat.stockExist)
    cell('①-stock', `stock-root/bash-exist/${cat.name}`)
  }
  const rf = probeResults(await bashTurn(STOCK, WS, bashFindScript(), false))
  expect(Number(rf.find_hits), 'stock find 命中 ≥1（差分命中）').toBeGreaterThanOrEqual(1)
  cell('①-stock', 'stock-root/bash-find')
  // 子会话差分：stock（shell-ask 摘掉）子会话 bash 真执行，哨兵真被读走
  for (const kind of ['subagent', 'subagent_fork', 'workflow'] as const) {
    const m = join(WS, `m-${kind}-stock`)
    rmSync(m, { force: true })
    const childCalls = [
      multiToolCall('p5-06-stock', [bashArgs(`cat '${join(TEST_HOME, '.ssh', 'sentinel-key')}' > '${m}'; echo rc=$?`)]),
      multiToolCall('p5-06-stock', [{ name: 'read', args: { file_path: join(TEST_HOME, '.codex', 'token') } }]),
    ]
    const child = await runDelegation(STOCK, kind, childCalls)
    const texts = childToolTexts(STOCK, child)
    expect(existsSync(m), `stock ${kind} 子会话 bash 真执行（P5-05 ④ 红基线等价）`).toBe(true)
    expect(readFileSync(m, 'utf8'), `stock ${kind} 子会话读到哨兵内容`).toContain('p506-sentinel-ssh')
    expect(texts.some((t) => t.text.includes('p506-sentinel-codex')), `stock ${kind} 子会话 read 读到哨兵`).toBe(true)
    cell('①-stock', `stock-${kind}/bash-cat-ssh`)
    cell('①-stock', `stock-${kind}/read-dotdir`)
  }
})

// --- real provider + loopback LLM stub（T-08 ⑥ 同法；② 与 ⑥ 共用） ---

interface StubServer {
  port: number
  bodies: string[]
  setToolCall(name: string, args: object): void
  close(): void
}

async function startLlmStub(): Promise<StubServer> {
  const bodies: string[] = []
  const state = { toolCall: null as { name: string; args: object } | null }
  const stub = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (req.method === 'GET' && req.url?.endsWith('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'glm-5.3-flash', object: 'model' }] }))
        return
      }
      if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
        const body = Buffer.concat(chunks).toString('utf8')
        bodies.push(body)
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
        let parsed: { messages?: Array<{ role: string }> } = {}
        try { parsed = JSON.parse(body) } catch { /* 按首轮处理 */ }
        const hasToolResult = (parsed.messages ?? []).some((m) => m.role === 'tool')
        if (!hasToolResult && state.toolCall !== null) {
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-p506', type: 'function', function: { name: state.toolCall.name, arguments: JSON.stringify(state.toolCall.args) } }] }, finish_reason: null }] })
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })
        } else {
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'P5-06 桩回复' }, finish_reason: null }] })
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
          sse({ id: 'chatcmpl-p506', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })
        }
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      res.writeHead(404)
      res.end('not found')
    })
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()))
  return { port: (stub.address() as AddressInfo).port, bodies, setToolCall(name, args) { state.toolCall = { name, args } }, close() { stub.close() } }
}

/** real provider runtime：不经 fake overlay（P2SDK_LLM_API_KEY 才会进 runtime env）。
 *  tests/support/runtime.ts 把 P2SDK_PROVIDER 硬编码为 'mock'（opts.env 在其后展开，
 *  可覆盖）——这里必须显式 'real'，否则走 replay、stub 收不到包（旧跑红根因）。 */
async function launchReal(stub: StubServer, opts: { stock?: boolean } = {}): Promise<MatrixRuntime> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      P2SDK_PROVIDER: 'real',
      HOME: TEST_HOME,
      P2SDK_LLM_BASE_URL: `http://127.0.0.1:${stub.port}`,
      P2SDK_LLM_API_KEY: ENV_SENTINELS.P2SDK_LLM_API_KEY,
      X_AUTH: ENV_SENTINELS.X_AUTH,
      X_CREDENTIALS: ENV_SENTINELS.X_CREDENTIALS,
      PBOTS_DATA_DIR: DATA_DIR,
      ...(opts.stock ? { P2SDK_PATCH: matrixOverlay({ stock: true, fake: false }) } : {}),
    },
  })
  const feed = await openFeed(rt)
  const m: MatrixRuntime = {
    ...rt,
    feed,
    writeScriptCalls() { throw new Error('real-provider 会话由 stub 驱动，不写脚本') },
    readRequests() { return [] },
  }
  runtimes.push(m)
  return m
}

/** real-provider 会话一轮工具探针：stub 首答 tool_call → 工具执行 → 次答文本收尾。 */
async function stubToolTurn(h: MatrixRuntime, stub: StubServer, toolName: string, args: object, approve = false): Promise<string> {
  stub.setToolCall(toolName, args)
  const { sessionId } = (await h.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await h.client.call('session/prompt', {
    request: { requestId: `p5-06-real-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-06 real-provider 探针' }] },
  })
  let answered = false
  const deadline = Date.now() + 120_000
  for (;;) {
    if (approve && !answered) {
      const f = h.feed.frames.find((fr) => fr.type === 'waterfall' && fr.event === 'approval/request' && fr.agentId === sessionId)
      if (f !== undefined) {
        answered = true
        await h.feed.answer(f, 'allowed-once')
      }
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`real-provider turn/end 未到；尾部：${JSON.stringify(frames.slice(-4))}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const result = frames.find((f) => f.type === 'event' && f.event?.type === 'tool/result')
  expect(result, 'tool/result 帧到达').toBeTruthy()
  const data = (result as unknown as { event: { data: { message: { content?: Array<{ type: string; text?: string }> } } } }).event.data
  return (data.message?.content ?? []).map((c) => c.text ?? '').join('\n')
}

it('② env 三哨兵不入 bash env；grep /proc/<runtime pid>/environ deny（stock 差分能 grep 到）', { timeout: 300_000 }, async () => {
  const stub = await startLlmStub()
  try {
    const rt = await launchReal(stub)
    const pid = dshPidOf(rt)
    const envText = await stubToolTurn(rt, stub, 'bash', { command: 'env; echo PROBE_DONE', description: 'P5-06 env 探针' }, true)
    expect(envText, 'env 探针真跑').toContain('PROBE_DONE')
    expect(envText, 'PATH 在 env 里（探针有效）').toContain('PATH=')
    expect(envText, 'X_AUTH 不入 bash env（launcher 白名单）').not.toContain(ENV_SENTINELS.X_AUTH)
    expect(envText, 'X_CREDENTIALS 不入 bash env（launcher 白名单）').not.toContain(ENV_SENTINELS.X_CREDENTIALS)
    expect(envText, 'P2SDK_LLM_API_KEY 不入 bash env（上游 scrubber）').not.toContain(ENV_SENTINELS.P2SDK_LLM_API_KEY)
    cell('②-env', 'env/X_AUTH')
    cell('②-env', 'env/X_CREDENTIALS')
    cell('②-env', 'env/P2SDK_LLM_API_KEY')

    const g = await stubToolTurn(rt, stub, 'grep', { pattern: ENV_SENTINELS.P2SDK_LLM_API_KEY, path: `/proc/${pid}/environ` })
    expect(g, 'grep /proc deny：guard 原因').toContain('p2sdk-fs-guard')
    cell('②-env', 'grep-proc-environ')

    const srt = await launchReal(stub, { stock: true })
    const spid = dshPidOf(srt)
    const s = await stubToolTurn(srt, stub, 'grep', { pattern: ENV_SENTINELS.P2SDK_LLM_API_KEY, path: `/proc/${spid}/environ` })
    expect(s, 'stock 差分：grep /proc 能 grep 到哨兵').toContain(ENV_SENTINELS.P2SDK_LLM_API_KEY)
    cell('②-env', 'grep-proc-environ-stock', true)
  } finally {
    stub.close()
  }
})

// --- ④ A4b：loopback 必须失败（同 P5-01 ①） ---

function netProbeScript(targets: Array<{ name: string; host: string; port: number }>): string {
  const cases = targets.map((t) => `  (False, "${t.name}", "${t.host}", ${t.port})`).join(',\n')
  return `/usr/bin/python3 -I -c '
import socket
import { tmkdir } from '../support/tmp-sweep.ts'
cases = [
${cases}
]
for dns, name, host, port in cases:
    try:
        socket.create_connection((host, port), timeout=3).close()
        print("RESULT %s=ok" % name)
    except OSError as e:
        print("RESULT %s=errno%d" % (name, e.errno if e.errno is not None else -99))
'`
}

it('④ A4b loopback：LiteLLM / gateway / 20000 / 探针 stub 全 errno 111；差分 stock stub 可连', { timeout: 300_000 }, async () => {
  const stub = createServer((req, res) => { res.writeHead(200); res.end('p506-stub') })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()))
  const stubPort = (stub.address() as AddressInfo).port
  try {
    const gw = Number(new URL(M.baseUrl).port)
    const r = probeResults(await bashTurn(M, WS, netProbeScript([
      { name: 'lo_litellm', host: '127.0.0.1', port: 4001 },
      { name: 'lo_gateway', host: '127.0.0.1', port: gw },
      { name: 'lo_20000', host: '127.0.0.1', port: 20000 },
      { name: 'lo_stub', host: '127.0.0.1', port: stubPort },
    ])))
    expectProbe(r, 'lo_litellm', 'errno111')
    expectProbe(r, 'lo_gateway', 'errno111')
    expectProbe(r, 'lo_20000', 'errno111')
    expectProbe(r, 'lo_stub', 'errno111')
    for (const name of ['lo_litellm', 'lo_gateway', 'lo_20000', 'lo_stub']) cell('④-loopback', name)

    const sr = probeResults(await bashTurn(STOCK, WS, netProbeScript([{ name: 'lo_stub', host: '127.0.0.1', port: stubPort }]), false))
    expectProbe(sr, 'lo_stub', 'ok')
    cell('④-loopback', 'lo_stub-stock', true)
  } finally {
    stub.close()
  }
})

// --- ⑤ A10 plugin_manager：三 action × 四会话 ---

/** $DSH_HOME/profiles 树 + runtime-patch.yml 的内容快照（guard-plugin-manager 同款）。 */
function snapshotHome(home: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.set(p, createHash('sha256').update(readFileSync(p)).digest('hex'))
    }
  }
  const profiles = join(home, 'profiles')
  if (existsSync(profiles)) walk(profiles)
  const patch = join(home, 'runtime-patch.yml')
  out.set(patch, existsSync(patch) ? createHash('sha256').update(readFileSync(patch)).digest('hex') : 'absent')
  return out
}

const PM_ACTIONS: Array<{ name: string; args: object }> = [
  { name: 'plugin_manager', args: { action: 'list_plugins' } },
  { name: 'plugin_manager', args: { action: 'set_plugin', target: 'p2sdk-shell-ask', enabled: false } },
  { name: 'plugin_manager', args: { action: 'install_bundle', target: 'left-pad' } },
]

it('⑤ plugin_manager 三 action 四会话全拒（guard 字面串——顺序回归哨兵），profile 哈希不变', { timeout: 600_000 }, async () => {
  const before = snapshotHome(M.home)
  // 根会话：三 action 一轮并发 → guard NEVER_TOOLS 拒，asked 0
  const root = await runTurn(M, WS, [multiToolCall('p5-06-pm', PM_ACTIONS)])
  const rootAsked = M.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === root.sessionId).length
  expect(rootAsked, '根会话三 action 都不出卡').toBe(0)
  expect(root.results.size, '三个 tool result').toBe(3)
  for (const r of root.results.values()) {
    expect(r.isError, 'plugin_manager deny 时 isError').toBe(true)
    expect(r.text, '原因带 guard 前缀').toContain('p2sdk-fs-guard')
    expect(r.text, '原因点名 plugin_manager').toContain('plugin_manager')
  }
  for (const a of ['list_plugins', 'set_plugin', 'install_bundle']) cell('⑤-plugin-manager', `root/${a}`)

  // 子会话列 ×3：顺序回归哨兵——never 子会话里 plugin_manager 必须落 guard 字面串，
  // 落 'approval unavailable in this session' 即 guard 不在最外层（REPORT-P5-04f1）
  for (const kind of ['subagent', 'subagent_fork', 'workflow'] as const) {
    const child = await runDelegation(M, kind, [multiToolCall(`p5-06-pm-${kind}`, PM_ACTIONS)])
    const texts = childToolTexts(M, child)
    const denies = texts.filter((t) => t.text.includes('plugin_manager'))
    expect(denies.length, `${kind}：三个 action 结果`).toBe(3)
    for (const t of denies) {
      expect(t.isError, `${kind} plugin_manager isError`).toBe(true)
      expect(t.text, `${kind} 原因带 guard 前缀`).toContain('p2sdk-fs-guard')
      expect(t.text, `${kind} 不落 shell-ask 字面串（顺序回归哨兵）`).not.toContain('approval unavailable in this session')
    }
    for (const a of ['list_plugins', 'set_plugin', 'install_bundle']) cell('⑤-plugin-manager', `${kind}/${a}`)
  }
  const after = snapshotHome(M.home)
  expect([...after.entries()].sort().toString(), 'profile 树与 runtime-patch.yml 不变').toBe([...before.entries()].sort().toString())
})

// --- ⑥ 外发链：read 哨兵 → 下一轮回复；loopback LLM stub 收包 0 命中 ---

it('⑥ 外发链：read 哨兵 deny 后 stub 收到的全部请求体哨兵值 0 次；stock 差分 ≥1 次', { timeout: 300_000 }, async () => {
  const stub = await startLlmStub()
  try {
    const sentinelPath = join(TEST_HOME, '.ssh', 'sentinel-key')
    const sentinelValue = 'p506-sentinel-ssh'
    const rt = await launchReal(stub)
    stub.bodies.length = 0
    const text = await stubToolTurn(rt, stub, 'read', { file_path: sentinelPath })
    expect(text, 'read 被 guard deny（外发链第一环）').toContain('p2sdk-fs-guard')
    const hits = stub.bodies.filter((b) => b.includes(sentinelValue)).length
    expect(hits, '加固侧：全部请求体哨兵值出现 0 次').toBe(0)
    expect(stub.bodies.length, 'stub 至少收到两轮请求（tool_call + 带结果的收尾）').toBeGreaterThanOrEqual(2)
    cell('⑥-exfil', 'read-deny-bodies-0')

    const srt = await launchReal(stub, { stock: true })
    stub.bodies.length = 0
    const stext = await stubToolTurn(srt, stub, 'read', { file_path: sentinelPath })
    expect(stext, 'stock 差分：read 成功读到哨兵').toContain(sentinelValue)
    expect(stub.bodies.filter((b) => b.includes(sentinelValue)).length, 'stock 差分：请求体哨兵值 ≥1 次').toBeGreaterThanOrEqual(1)
    cell('⑥-exfil', 'read-deny-bodies-0-stock', true)
  } finally {
    stub.close()
  }
})

// --- ⑦ 数据根三格 + MASK 追加根 ---

interface DataRootSpec { label: string; root: string; hardened: MatrixRuntime; stock: MatrixRuntime }

/** 一个数据根的三目标探针：bash（grants/policy-state test -s、workspaces/Y test -e）+ read/write/grep deny。 */
async function dataRootCells(spec: DataRootSpec): Promise<void> {
  const wsX = join(spec.root, 'workspaces', 'x')
  const grants = join(spec.root, 'standing-grants.json')
  const policyState = join(spec.root, 'policy-state.json')
  const wsY = join(spec.root, 'workspaces', 'other-bot', 'wm')
  const s = spec.label
  // 加固侧 bash：三目标不可见
  const bashOut = probeResults(await bashTurn(spec.hardened, wsX, [
    `probe() { n=$1; shift; if "$@" >/dev/null 2>&1; then r=0; else r=1; fi; echo "RESULT $n=$r"; }`,
    `probe ${s}_grants_s test -s '${grants}'`,
    `probe ${s}_ps_s test -s '${policyState}'`,
    `probe ${s}_wsy_e test -e '${wsY}'`,
  ].join('\n')))
  expectProbe(bashOut, `${s}_grants_s`, '1')
  expectProbe(bashOut, `${s}_ps_s`, '1')
  expectProbe(bashOut, `${s}_wsy_e`, '1')
  cell('⑦-data-root', `${s}/bash-grants`)
  cell('⑦-data-root', `${s}/bash-policy-state`)
  cell('⑦-data-root', `${s}/bash-workspaces-y`)
  // 加固侧文件工具：read/write/grep × 三目标 → deny
  const targets: Array<{ label: string; read: object; write: object; grep: object }> = [
    { label: 'grants', read: { file_path: grants }, write: { file_path: grants, content: 'p506-x' }, grep: { pattern: 'p506', path: spec.root } },
    { label: 'policy-state', read: { file_path: policyState }, write: { file_path: policyState, content: 'p506-x' }, grep: { pattern: 'p506', path: spec.root } },
    { label: 'workspaces-y', read: { file_path: wsY }, write: { file_path: wsY, content: 'p506-x' }, grep: { pattern: 'p506', path: join(spec.root, 'workspaces', 'other-bot') } },
  ]
  const before = [grants, policyState].map(sha256)
  for (const t of targets) {
    for (const [tool, args] of [['read', t.read], ['write', t.write], ['grep', t.grep]] as const) {
      const r = await oneTool(spec.hardened, wsX, tool, args)
      expect(r.isError, `${s}/${t.label}/${tool} deny`).toBe(true)
      expect(r.text, `${s}/${t.label}/${tool} guard 原因`).toContain('p2sdk-fs-guard')
      cell('⑦-data-root', `${s}/${t.label}/${tool}`)
    }
  }
  expect([grants, policyState].map(sha256), `${s} 哨兵不变`).toEqual(before)
  // stock 差分：三目标 bash 可见（0）、read 读到、grep 命中；write 工作区外落
  // 上游 fence（既有防护，无 guard 前缀）；另证数据根本身在 stock 可写（guard 才是防线）
  const sBash = probeResults(await bashTurn(spec.stock, wsX, [
    `probe() { n=$1; shift; if "$@" >/dev/null 2>&1; then r=0; else r=1; fi; echo "RESULT $n=$r"; }`,
    `probe ${s}_grants_s test -s '${grants}'`,
    `probe ${s}_ps_s test -s '${policyState}'`,
    `probe ${s}_wsy_e test -e '${wsY}'`,
  ].join('\n'), false))
  expectProbe(sBash, `${s}_grants_s`, '0')
  expectProbe(sBash, `${s}_ps_s`, '0')
  expectProbe(sBash, `${s}_wsy_e`, '0')
  cell('⑦-data-root', `${s}/stock-bash-visible`, true)
  const r1 = await oneTool(spec.stock, wsX, 'read', { file_path: grants })
  expect(r1.isError, `${s}/stock/read grants 成功`).toBe(false)
  expect(r1.text, `${s}/stock/read grants 读到内容`).toContain('p506')
  cell('⑦-data-root', `${s}/stock-read`, true)
  const g1 = await oneTool(spec.stock, wsX, 'grep', { pattern: 'p506', path: join(spec.root, 'workspaces', 'other-bot') })
  expect(g1.isError, `${s}/stock/grep 成功`).toBe(false)
  expect(g1.text, `${s}/stock/grep 命中哨兵`).toContain('p506-sentinel')
  cell('⑦-data-root', `${s}/stock-grep`, true)
  const w1 = await oneTool(spec.stock, wsX, 'write', { file_path: wsY, content: 'p506-x' })
  expect(w1.text, `${s}/stock/write 工作区外落上游 fence（无 guard 前缀）`).not.toContain('p2sdk-fs-guard')
  cell('⑦-data-root', `${s}/stock-write-fence`, true)
  const grantsBefore = readFileSync(grants, 'utf8')
  const w2 = await fileTurn(spec.stock, spec.root, [
    { name: 'read', args: { file_path: grants } },
    { name: 'write', args: { file_path: grants, content: 'p506-stock-written' } },
  ])
  const w2ok = [...w2.results.values()].every((x) => !x.isError)
  expect(w2ok, `${s}/stock cwd=数据根时 read+write grants 成功（guard 才是防线；上游 write 有 read-before-write 规则，同轮先读后写）`).toBe(true)
  expect(readFileSync(grants, 'utf8'), `${s}/stock write 真落盘`).toContain('p506-stock-written')
  writeFileSync(grants, grantsBefore)
  cell('⑦-data-root', `${s}/stock-write-root-cwd`, true)
}

it('⑦ 数据根三格（HOME 内非点目录 / HOME 外 / 未设缺省+WARN）+ MASK 追加根，期望逐格写死', { timeout: 600_000 }, async () => {
  // (a) HOME 内非点目录：M（PBOTS_DATA_DIR=DATA_DIR）与 STOCK
  await dataRootCells({ label: 'a_home_nondot', root: DATA_DIR, hardened: M, stock: STOCK })

  // (b) HOME 外
  const b = await launchMatrix({ env: { PBOTS_DATA_DIR: DATA_DIR_B } })
  const bStock = await launchMatrix({ stock: true, env: { PBOTS_DATA_DIR: DATA_DIR_B } })
  await dataRootCells({ label: 'b_home_outside', root: DATA_DIR_B, hardened: b, stock: bStock })

  // (c) 未设：缺省 $HOME/.config/pbots-ui，stderr 恰 1 行 WARN
  const c = await launchMatrix({ noDataDir: true })
  const warnLines = c.readStderr().split('\n').filter((l) => /^WARN p2sdk: PBOTS_DATA_DIR unset/.test(l))
  expect(warnLines, '⑦(c) WARN 恰 1 行').toHaveLength(1)
  const cStock = await launchMatrix({ stock: true, noDataDir: true })
  await dataRootCells({ label: 'c_unset_default', root: DEFAULT_DATA_DIR, hardened: c, stock: cStock })

  // MASK 追加根：P2SDK_SANDBOX_MASK 指到 MASK_DIR，其下哨兵同期望
  const mask = await launchMatrix({ env: { P2SDK_SANDBOX_MASK: MASK_DIR } })
  const maskStock = await launchMatrix({ stock: true, noDataDir: true, env: { P2SDK_SANDBOX_MASK: MASK_DIR } })
  const maskSent = join(MASK_DIR, 'mask-sentinel')
  const mBash = probeResults(await bashTurn(mask, WS, `if [ -e '${maskSent}' ]; then echo "RESULT mask_e=0"; else echo "RESULT mask_e=1"; fi`))
  expectProbe(mBash, 'mask_e', '1')
  cell('⑦-data-root', 'mask/bash-exist')
  for (const [tool, args] of [
    ['read', { file_path: maskSent }],
    ['write', { file_path: maskSent, content: 'p506-x' }],
    ['grep', { pattern: 'p506', path: MASK_DIR }],
  ] as const) {
    const r = await oneTool(mask, WS, tool, args)
    expect(r.isError, `mask/${tool} deny`).toBe(true)
    expect(r.text, `mask/${tool} guard 原因`).toContain('p2sdk-fs-guard')
    cell('⑦-data-root', `mask/${tool}`)
  }
  const sBash = probeResults(await bashTurn(maskStock, WS, `if [ -e '${maskSent}' ]; then echo "RESULT mask_e=0"; else echo "RESULT mask_e=1"; fi`, false))
  expectProbe(sBash, 'mask_e', '0')
  cell('⑦-data-root', 'mask/stock-bash-visible', true)
  const sm = await oneTool(maskStock, WS, 'read', { file_path: maskSent })
  expect(sm.isError, 'mask/stock/read 成功').toBe(false)
  expect(sm.text, 'mask/stock/read 读到哨兵').toContain('p506-sentinel-mask')
  cell('⑦-data-root', 'mask/stock-read', true)
})

// --- ⑧ 汇总（结论表 evidence/P5-06/matrix.md 的数据源） ---

it('⑧ 汇总：格数清点（全 PASS 才会到这里）', () => {
  const expected: Record<string, number> = {
    '①-file': 77,
    '①-bash': 21, // cat 9 + 存在性 10（proc 不设不可见格）+ find 1 + env 1
    '①-child': 240,
    '①-stock': 0, // 差分段格数不写死（跳过项因机器态而异），只清点 ≥
    '②-env': 5, // 三哨兵 + /proc grep + stock 差分
    '④-loopback': 5,
    '⑤-plugin-manager': 12,
    '⑥-exfil': 2,
    '⑦-data-root': 0,
  }
  for (const [section, want] of Object.entries(expected)) {
    const got = CELLS.filter((c) => c.section === section).length
    if (want > 0) expect(got, `${section} 格数`).toBe(want)
    else expect(got, `${section} 至少有差分格`).toBeGreaterThan(0)
  }
  console.log(`P5-06 矩阵：共 ${CELLS.length} 格（含差分 ${CELLS.filter((c) => c.stock).length}）`)
})
