// P5-02 验收 ①–⑨（PLAN p5-parity 0b，决策 3/7/13）：文件工具凭证 NEVER。
// 全部经真实 launcher（scripts/start.mjs）+ fake LLM 工具调用，HOME=主仓
// .test-homes/p5-02（决策 8）。差分 = stock（后置 overlay 禁用 p2sdk-fs-guard），
// 每格写死两侧期望：deny 侧 isError + p2sdk-fs-guard 原因 + asked === 0；stock
// 侧读到哨兵内容 / 写成功 / 上游自身错误（真凭证类别只断言无 guard 前缀，
// 不读内容）。写类差分后恢复哨兵原内容；/run/user、/proc、/etc/ppp 与工具链
// 真文件的 stock 写不执行（不碰真实系统态），报告注明。测试只结束自己 spawn
// 的子进程，不用 pkill。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { uniqueTestHome } from '../support/sandbox-home.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = uniqueTestHome('p5-02') // P5-H3：运行级唯一（防并行全量互踩哨兵）
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const PASSWD_HOME = userInfo().homedir
const RUN_USER = `/run/user/${process.getuid()}`
const X_AUTH = 'p502-x-auth-sentinel'
/** 1x1 透明 PNG（read_image 哨兵；magic byte 由上游 sniff 校验）。 */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

interface Feed {
  frames: Array<{ type: string; event?: string; eventId?: string; agentId?: string }>
  answer(frame: { eventId?: string }, value: string): Promise<unknown>
  close(): void
}

interface GuardRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
}

const runtimes: GuardRuntime[] = []

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-02-patch-'))
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

/** stock 差分：禁用两层文件 guard 并恢复上游 fs（文件工具不走 shell wrapper）。 */
function stockOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-02-stock-'))
  const overlay = join(dir, 'stock.yml')
  writeFileSync(overlay, `\
# P5-02 差分对照：恢复 stock（无文件工具 guard，包括 P6-25.f1 执行层）
- id: p2sdk-fs-guard
  disabled: true
- id: p2sdk-fs-zone
  disabled: true
- id: fs-sandbox
  disabled: false
`)
  return overlay
}

async function openFeed(rt: Runtime): Promise<Feed> {
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Feed['frames'] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Feed['frames'][number]) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) => client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
}

interface LaunchOpts { env?: Record<string, string>; stock?: boolean }

async function launchGuard(opts: LaunchOpts = {}): Promise<GuardRuntime> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_PATCH: opts.stock ? `${fakeOverlay()}:${stockOverlay()}` : fakeOverlay(),
      P2SDK_X_AUTH: X_AUTH, // ⑤：runtime env 哨兵（P2SDK_ 前缀经 childEnv 白名单透传）
      PBOTS_DATA_DIR: DATA_DIR,
      ...opts.env,
    },
  })
  const feed = await openFeed(rt)
  const g: GuardRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
  runtimes.push(g)
  return g
}

/** 一个模型响应里的多个 tool-call block（并行执行）+ 收尾 text。 */
function multiToolCall(calls: Array<{ name: string; args: object }>): object {
  const blocks = calls.map((c, i) => {
    const id = `p5-02-${Math.random().toString(16).slice(2, 8)}-${i}`
    const argumentsJson = JSON.stringify(c.args)
    return [
      { type: 'block-start', index: i, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: i, id, name: c.name, argumentsDelta: argumentsJson },
      { type: 'block-end', index: i, block: { type: 'tool-call', id, name: c.name, arguments: argumentsJson } },
    ]
  }).flat()
  return [
    {
      chunks: [...blocks, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } }],
      paceMs: 10,
    },
  ]
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

/** 一个文件工具 turn：返回按 toolCallId 索引的结果 + 本会话 asked 数。
 *  P5-21 起 shell-ask 按档位表对文件工具出卡（工作区内=门控 ALWAYS、区外=ASK；
 *  本文件的运行时没配 policy-state → 门关 → 区内调用也出卡）。本文件测的是
 *  guard 的 NEVER 判定（deny 的格永不出卡，asked 恒 0 不受影响）；成功格的卡由
 *  这里自动 allowed-once 应答（批准后执行，成功/内容断言语义不变）。 */
async function toolTurn(
  h: GuardRuntime,
  cwd: string,
  calls: Array<{ name: string; args: object }>,
): Promise<{ results: Map<string, ToolResultView>; asked: number }> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [...multiToolCall(calls), textCall('P5-02 完成')])
  await h.client.call('session/prompt', {
    request: { requestId: `p5-02-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-02 探针' }] },
  })
  const answered = new Set<string>()
  const deadline = Date.now() + 60_000
  for (;;) {
    for (const f of h.feed.frames) {
      if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
        answered.add(f.eventId ?? '')
        await h.feed.answer(f, 'allowed-once')
      }
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到；asked=${answered.size}；尾部：${JSON.stringify(frames.slice(-4))}`)
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
  const asked = h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
  return { results, asked }
}

/** 单工具 turn 快捷：直接拿该工具结果。 */
async function oneTool(h: GuardRuntime, cwd: string, name: string, args: object): Promise<ToolResultView> {
  const { results } = await toolTurn(h, cwd, [{ name, args }])
  expect(results.size, `${name} 有一个结果`).toBe(1)
  return [...results.values()][0]
}

/** deny 断言：isError + 原因前缀 + 无审批。 */
function expectDeny(result: ToolResultView, asked: number, needle: string): void {
  expect(result.isError, `${result.toolCallId} deny 时 isError`).toBe(true)
  expect(result.text, `${result.toolCallId} 原因含 guard 前缀`).toContain('p2sdk-fs-guard')
  expect(result.text, `${result.toolCallId} 原因点名目标`).toContain(needle)
  expect(asked, 'deny 不出卡').toBe(0)
}

const sha256 = (p: string): string => {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex') } catch { return 'absent' }
}

/** ①的哨兵类别表：text 目标（read/write/edit/present）、png（read_image）、目录（glob/grep path）。 */
interface Category {
  name: string
  textFile: string
  png: string
  dir: string
  grep?: { pattern: string; path: string }
  /** stock 差分断言：'content' 读到标记 / 'png' 图片成功 / 'absent' 只断言无 guard 前缀 */
  stock: 'content' | 'png' | 'absent'
  /** stock write/edit 成功后要恢复的文件（记录 setup 内容） */
  restore?: string
  /** 差分不跑 write/edit（保护真实系统态） */
  skipStockWrite?: boolean
}

let GUARD_RT: GuardRuntime
let STOCK_RT: GuardRuntime

const CATS = (): Category[] => [
  { name: 'home-cred', textFile: join(TEST_HOME, '.ssh', 'sentinel-key'), png: join(TEST_HOME, '.ssh', 'sentinel.png'), dir: join(TEST_HOME, '.ssh'), stock: 'content', restore: join(TEST_HOME, '.ssh', 'sentinel-key') },
  { name: 'dotdir', textFile: join(TEST_HOME, '.codex', 'token'), png: join(TEST_HOME, '.codex', 'token.png'), dir: join(TEST_HOME, '.codex'), stock: 'content', restore: join(TEST_HOME, '.codex', 'token') },
  { name: 'other-bot', textFile: join(DATA_DIR, 'workspaces', 'other-bot', 'wm'), png: join(DATA_DIR, 'workspaces', 'other-bot', 'wm.png'), dir: join(DATA_DIR, 'workspaces', 'other-bot'), stock: 'content', restore: join(DATA_DIR, 'workspaces', 'other-bot', 'wm') },
  { name: 'data-top', textFile: join(DATA_DIR, 'top-sentinel'), png: join(DATA_DIR, 'top-sentinel.png'), dir: DATA_DIR, stock: 'content', restore: join(DATA_DIR, 'top-sentinel') },
  { name: 'dsh-home', textFile: join(GUARD_RT.home, 'sentinel-dsh'), png: join(GUARD_RT.home, 'sentinel-dsh.png'), dir: GUARD_RT.home, stock: 'content', restore: join(GUARD_RT.home, 'sentinel-dsh') },
  { name: 'handoff', textFile: join(GUARD_RT.handoff, 'sentinel-ho'), png: join(GUARD_RT.handoff, 'sentinel-ho.png'), dir: GUARD_RT.handoff, stock: 'content', restore: join(GUARD_RT.handoff, 'sentinel-ho') },
  { name: 'proc', textFile: '/proc/self/environ', png: '/proc/self/environ', dir: '/proc', grep: { pattern: X_AUTH, path: '/proc/self/environ' }, stock: 'absent', skipStockWrite: true },
  { name: 'run-user', textFile: `${RUN_USER}/bus`, png: `${RUN_USER}/bus`, dir: RUN_USER, stock: 'absent', skipStockWrite: true },
  { name: 'ppp', textFile: '/etc/ppp/chap-secrets', png: '/etc/ppp/chap-secrets', dir: '/etc/ppp', stock: 'absent', skipStockWrite: true },
]

const ENTRIES = ['read', 'read_image', 'glob', 'grep', 'write', 'edit', 'present'] as const
type Entry = typeof ENTRIES[number]

function entryCall(cat: Category, entry: Entry, dshPid: number): { name: string; args: object } {
  switch (entry) {
    case 'read': return { name: 'read', args: { file_path: cat.textFile } }
    case 'read_image': return { name: 'read_image', args: { file_path: cat.png } }
    case 'glob': return { name: 'glob', args: { pattern: '*', path: cat.dir } }
    case 'grep': return { name: 'grep', args: cat.grep ?? { pattern: 'p502', path: cat.dir } }
    case 'write': return { name: 'write', args: { file_path: cat.textFile, content: 'p502-overwritten' } }
    case 'edit': return { name: 'edit', args: { file_path: cat.textFile, old_string: 'p502', new_string: 'p502-overwritten' } }
    case 'present': return { name: 'present', args: { files: [{ path: cat.textFile }] } }
  }
}

function setupTestHome(): void {
  rmSync(TEST_HOME, { recursive: true, force: true })
  for (const d of [
    join(TEST_HOME, '.ssh'), join(TEST_HOME, '.codex'),
    join(DATA_DIR, 'workspaces', 'other-bot'), join(DATA_DIR, 'workspaces', 'x'),
    join(TEST_HOME, 'ws-ok'), join(TEST_HOME, 'ws-rel'), join(TEST_HOME, 'ws-link'),
  ]) mkdirSync(d, { recursive: true })
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel-key'), 'p502-sentinel-key')
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel.png'), PNG)
  writeFileSync(join(TEST_HOME, '.codex', 'token'), 'p502-sentinel-codex')
  writeFileSync(join(TEST_HOME, '.codex', 'token.png'), PNG)
  writeFileSync(join(DATA_DIR, 'workspaces', 'other-bot', 'wm'), 'p502-sentinel-otherbot')
  writeFileSync(join(DATA_DIR, 'workspaces', 'other-bot', 'wm.png'), PNG)
  writeFileSync(join(DATA_DIR, 'top-sentinel'), 'p502-sentinel-top')
  writeFileSync(join(DATA_DIR, 'top-sentinel.png'), PNG)
  writeFileSync(join(DATA_DIR, 'workspaces', 'x', 'f.txt'), 'p502-wsx')
  writeFileSync(join(DATA_DIR, 'policy-state.json'), '{"version":1,"paused":false,"instance":"other"}')
  writeFileSync(join(TEST_HOME, 'ws-ok', 'f.txt'), 'p502-wsok')
  writeFileSync(join(TEST_HOME, 'ws-ok', 'grep-hit.txt'), 'p5-02-grep-marker')
  writeFileSync(join(TEST_HOME, 'ws-rel', 'rel.txt'), 'p502-rel')
}

function dshPidOf(rt: Runtime): number {
  const pid = rt.child.pid!
  // launcher(start.mjs) → node(src/start.ts) → dsh：找 cmdline 含 dsh/lib/bin.js 的子孙
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

beforeAll(async () => {
  setupTestHome()
  GUARD_RT = await launchGuard()
  writeFileSync(join(GUARD_RT.home, 'sentinel-dsh'), 'p502-sentinel-dsh')
  writeFileSync(join(GUARD_RT.home, 'sentinel-dsh.png'), PNG)
  writeFileSync(join(GUARD_RT.handoff, 'sentinel-ho'), 'p502-sentinel-ho')
  writeFileSync(join(GUARD_RT.handoff, 'sentinel-ho.png'), PNG)
  STOCK_RT = await launchGuard({ stock: true })
  writeFileSync(join(STOCK_RT.home, 'sentinel-dsh'), 'p502-sentinel-dsh')
  writeFileSync(join(STOCK_RT.home, 'sentinel-dsh.png'), PNG)
  writeFileSync(join(STOCK_RT.handoff, 'sentinel-ho'), 'p502-sentinel-ho')
  writeFileSync(join(STOCK_RT.handoff, 'sentinel-ho.png'), PNG)
})

afterAll(async () => {
  for (const rt of runtimes) {
    try { await rt.stop() } catch { /* 已停 */ }
    try { rt.feed.close() } catch { /* 已关 */ }
    rmSync(rt.handoff, { recursive: true, force: true })
  }
  rmSync(TEST_HOME, { recursive: true, force: true })
})

it('① 9 类哨兵 × 7 入口：deny（isError + 原因 + asked 0）、写类 sha 不变；差分 stock 逐格命中', async () => {
  const pid = dshPidOf(GUARD_RT)
  for (const cat of CATS()) {
    const dir = cat.name === 'dsh-home' || cat.name === 'handoff' ? join(TEST_HOME, 'ws-ok') : join(TEST_HOME, 'ws-ok')
    const entries = ENTRIES.map((e) => entryCall(cat, e, pid))
    // proc/run-user 类别的 write/edit/present 目标与 read 相同（bus/environ）
    // 只校验临时哨兵；不打开真实系统凭证路径。
    const before = cat.restore ? sha256(cat.textFile) : undefined
    const { results, asked } = await toolTurn(GUARD_RT, dir, entries)
    expect(asked, `${cat.name}：全部 deny，无审批`).toBe(0)
    for (const [id, r] of results) {
      expect(r.isError, `${cat.name}/${id} isError`).toBe(true)
      expect(r.text, `${cat.name}/${id} 原因`).toContain('p2sdk-fs-guard')
    }
    if (cat.restore) expect(sha256(cat.textFile), `${cat.name} 写类哨兵不变`).toBe(before)

    // 差分：stock 同一调用（逐入口单 turn，读类断内容、写类断成功后恢复）
    for (const [idx, entry] of ENTRIES.entries()) {
      if (cat.name === 'ppp' || (cat.skipStockWrite && (entry === 'write' || entry === 'edit'))) continue // 真实凭证无 stock 读写；仅测 guard 拒绝
      const r = await oneTool(STOCK_RT, dir, entries[idx].name, entries[idx].args)
      expect(r.text, `${cat.name}/${entry} stock 无 guard 拦截`).not.toContain('p2sdk-fs-guard')
      if (cat.stock === 'content') {
        // read_image 的 stock 结果受模型图像能力校验影响（r4-tool-gates #4），
        // 只要求不被本 guard 拦（成功或上游自身校验错误均可），报告注明
        if (entry === 'read' || entry === 'glob' || entry === 'grep' || entry === 'present') expect(r.isError, `${cat.name}/${entry} stock 成功`).toBe(false)
        if (entry === 'read') expect(r.text, `${cat.name}/read stock 读到哨兵`).toContain('p502')
        if (entry === 'glob') expect(r.text, `${cat.name}/glob stock 列到哨兵`).toContain(basename(cat.textFile))
        if (entry === 'grep') expect(r.text, `${cat.name}/grep stock 命中哨兵`).toContain('p502')
        // write/edit：既有防护命中（§2）—— stock 的上游 workspace-write fence
        // 本来就拒工作区外写（两侧同拦），差分只断言错误不来自本 guard，
        // 不落盘不恢复；本 slug 防线由 deny 侧（p2sdk-fs-guard 原因）证明
      } else if (cat.stock === 'png') {
        expect(r.isError, `${cat.name}/${entry} stock 图片读取成功`).toBe(false)
      }
      // 'absent'（真凭证/系统态）：仅断言 stock 不被本 guard 拦（上游自己的错误或成功都算）
    }
  }
}, 600_000)

it('② 符号链接两格：bash 建的链接与预置链接 read 后都 deny', async () => {
  // 格 1：加固会话里 bash（审批后）ln -s 哨兵目录 → read 链接/x deny
  const ws = join(TEST_HOME, 'ws-link')
  const link = join(ws, 'credlink')
  rmSync(link, { force: true })
  const bashId = `p5-02-${Math.random().toString(16).slice(2, 8)}`
  const bashArgs = JSON.stringify({ command: `ln -s '${join(TEST_HOME, '.ssh')}' '${link}'`, description: 'P5-02 symlink probe' })
  const { sessionId } = (await GUARD_RT.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  const stream = await GUARD_RT.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  GUARD_RT.writeScriptCalls(sessionId, [{
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: bashId, name: 'bash', argumentsDelta: bashArgs },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: bashId, name: 'bash', arguments: bashArgs } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }, textCall('P5-02 完成')])
  await GUARD_RT.client.call('session/prompt', { request: { requestId: `p5-02-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-02 链接' }] } })
  const deadline = Date.now() + 30_000
  for (;;) {
    const req = GUARD_RT.feed.frames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
    if (req) { await GUARD_RT.feed.answer(req, 'allowed-once'); break }
    if (Date.now() > deadline) throw new Error('approval/request 未到（30s）')
    await new Promise((r) => setTimeout(r, 50))
  }
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline + 30_000) throw new Error('turn/end 未到')
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  expect(existsSync(link), 'bash 建立了符号链接（宿主可见）').toBe(true)
  const r1 = await oneTool(GUARD_RT, ws, 'read', { file_path: join(link, 'sentinel-key') })
  expectDeny(r1, 0, '.ssh')

  // 格 2：宿主预置指向 mask 根的链接 → read deny
  const masklink = join(ws, 'masklink')
  rmSync(masklink, { force: true })
  symlinkSync(DATA_DIR, masklink)
  const r2 = await oneTool(GUARD_RT, ws, 'read', { file_path: join(masklink, 'top-sentinel') })
  expect(r2.isError).toBe(true)
  expect(r2.text).toContain('p2sdk-fs-guard')
}, 180_000)

it('③ 目录根：grep path=$HOME、glob path=$HOME、grep path=/ → deny；grep path=$CWD 正常返回', async () => {
  const ws = join(TEST_HOME, 'ws-ok')
  const g1 = await oneTool(GUARD_RT, ws, 'grep', { pattern: 'sentinel', path: TEST_HOME })
  expect(g1.isError).toBe(true)
  expect(g1.text).toContain('p2sdk-fs-guard')
  const g2 = await oneTool(GUARD_RT, ws, 'glob', { pattern: '*', path: TEST_HOME })
  expect(g2.isError).toBe(true)
  expect(g2.text).toContain('p2sdk-fs-guard')
  const g3 = await oneTool(GUARD_RT, ws, 'grep', { pattern: 'x', path: '/' })
  expect(g3.isError).toBe(true)
  expect(g3.text).toContain('p2sdk-fs-guard')
  const g4 = await oneTool(GUARD_RT, ws, 'grep', { pattern: 'p5-02-grep', path: ws })
  expect(g4.isError, '$CWD 内 grep 正常').toBe(false)
  expect(g4.text).toContain('p5-02-grep-marker')
}, 120_000)

it('④ 路径形态：~ 展开、cd 后相对路径、glob ../ 与绝对 pattern → deny', async () => {
  const r1 = await oneTool(GUARD_RT, join(TEST_HOME, 'ws-ok'), 'read', { file_path: '~/.ssh/sentinel-key' })
  expect(r1.isError).toBe(true)
  expect(r1.text).toContain('p2sdk-fs-guard')

  // working_directory cd 到 $HOME 后 read 相对路径 .ssh/x
  const { sessionId: s1 } = (await GUARD_RT.client.call('session/create', { request: { cwd: join(TEST_HOME, 'ws-ok') } })) as { sessionId: string }
  const st1 = await GUARD_RT.client.follow(s1)
  const f1: Frame[] = []
  const d1 = (async () => { for await (const f of st1) f1.push(f) })()
  GUARD_RT.writeScriptCalls(s1, [...multiToolCall([{ name: 'working_directory', args: { cd: TEST_HOME } }]), ...multiToolCall([{ name: 'read', args: { file_path: '.ssh/sentinel-key' } }]), textCall('P5-02 完成')])
  await GUARD_RT.client.call('session/prompt', { request: { requestId: `p5-02-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId: s1, mode: 'queue', content: [{ type: 'text', text: 'P5-02 cd' }] } })
  await waitFor(f1, (f) => f.type === 'event' && f.event?.type === 'turn/end', 60_000, 'turn/end')
  st1.cancel()
  void d1
  const res1 = f1.filter((f) => f.type === 'event' && f.event?.type === 'tool/result').map((f) => JSON.stringify(f))
  expect(res1.find((t) => t.includes('.ssh/sentinel-key')) ?? res1.at(-1)).toContain('p2sdk-fs-guard')

  // cd 到 ~/.codex 后 read 相对 x
  const { sessionId: s2 } = (await GUARD_RT.client.call('session/create', { request: { cwd: join(TEST_HOME, 'ws-ok') } })) as { sessionId: string }
  const st2 = await GUARD_RT.client.follow(s2)
  const f2: Frame[] = []
  const d2 = (async () => { for await (const f of st2) f2.push(f) })()
  GUARD_RT.writeScriptCalls(s2, [
    ...multiToolCall([{ name: 'working_directory', args: { cd: join(TEST_HOME, '.codex') } }]),
    ...multiToolCall([{ name: 'read', args: { file_path: 'token' } }]),
    textCall('P5-02 完成'),
  ])
  await GUARD_RT.client.call('session/prompt', { request: { requestId: `p5-02-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId: s2, mode: 'queue', content: [{ type: 'text', text: 'P5-02 cd2' }] } })
  await waitFor(f2, (f) => f.type === 'event' && f.event?.type === 'turn/end', 60_000, 'turn/end')
  st2.cancel()
  void d2
  const res2 = f2.filter((f) => f.type === 'event' && f.event?.type === 'tool/result').map((f) => JSON.stringify(f))
  expect(res2.find((t) => t.includes('token')) ?? res2.at(-1)).toContain('p2sdk-fs-guard')

  // glob ../ 与绝对 pattern
  const rel = join(TEST_HOME, 'ws-rel')
  const g1 = await oneTool(GUARD_RT, rel, 'glob', { pattern: '../.ssh/*' })
  expect(g1.isError).toBe(true)
  expect(g1.text).toContain('p2sdk-fs-guard')
  const g2 = await oneTool(GUARD_RT, rel, 'glob', { pattern: `${TEST_HOME}/.ssh/**` })
  expect(g2.isError).toBe(true)
  expect(g2.text).toContain('p2sdk-fs-guard')
}, 180_000)

it('⑤ /proc env：self 与 runtime pid 的 environ grep deny；差分 stock grep 输出含哨兵值', async () => {
  const pid = dshPidOf(GUARD_RT)
  const ws = join(TEST_HOME, 'ws-ok')
  const g1 = await oneTool(GUARD_RT, ws, 'grep', { pattern: X_AUTH, path: '/proc/self/environ' })
  expect(g1.isError).toBe(true)
  expect(g1.text).toContain('p2sdk-fs-guard')
  const g2 = await oneTool(GUARD_RT, ws, 'grep', { pattern: X_AUTH, path: `/proc/${pid}/environ` })
  expect(g2.isError).toBe(true)
  expect(g2.text).toContain('p2sdk-fs-guard')

  const stockPid = dshPidOf(STOCK_RT)
  const s = await oneTool(STOCK_RT, ws, 'grep', { pattern: X_AUTH, path: `/proc/${stockPid}/environ` })
  expect(s.isError, `stock grep /proc/${stockPid}/environ 成功`).toBe(false)
  expect(s.text, 'stock 输出含哨兵值（差分命中）').toContain(X_AUTH)
}, 120_000)

it('⑥ 例外：workspaceRoot 子树读写放行、同级与顶层 deny；工具链只读；.condarc deny；/tmp 数据根同规则', async () => {
  const ws = join(DATA_DIR, 'workspaces', 'x')
  const okRead = await oneTool(GUARD_RT, ws, 'read', { file_path: 'f.txt' })
  expect(okRead.isError, '本工作区 read 成功').toBe(false)
  expect(okRead.text).toContain('p502-wsx')
  const okWrite = await oneTool(GUARD_RT, ws, 'write', { file_path: 'w.txt', content: 'p502-written' })
  expect(okWrite.isError, '本工作区 write 成功').toBe(false)
  expect(readFileSync(join(ws, 'w.txt'), 'utf8')).toContain('p502-written')
  const sib = await oneTool(GUARD_RT, ws, 'read', { file_path: '../other-bot/wm' })
  expect(sib.isError, '同级另一 bot 工作区 deny').toBe(true)
  expect(sib.text).toContain('p2sdk-fs-guard')
  const top = await oneTool(GUARD_RT, ws, 'read', { file_path: '../../top-sentinel' })
  expect(top.isError, '数据根顶层 deny').toBe(true)
  expect(top.text).toContain('p2sdk-fs-guard')
  const ps = await oneTool(GUARD_RT, ws, 'read', { file_path: '../../policy-state.json' })
  expect(ps.isError, 'policy-state.json deny（决策 16）').toBe(true)

  // 工具链白名单：read 成功、write deny（stock 写差分不跑——保护真实工具链，报告注明）
  const toolDir = join(PASSWD_HOME, 'miniconda3')
  const pick = readdirSync(toolDir).find((n) => {
    if (n === '.condarc' || n === 'etc') return false // 工具链凭证本身是 ①（单测格）
    try { const st = statSync(join(toolDir, n)); return st.isFile() && st.size > 0 && st.size < 100_000 } catch { return false }
  })
  expect(pick, 'miniconda3 下有可读小文件（非凭证）').toBeTruthy()
  const toolRead = await oneTool(GUARD_RT, ws, 'read', { file_path: join(toolDir, pick!) })
  expect(toolRead.isError, '工具链 read 放行').toBe(false)
  const before = sha256(join(toolDir, pick!))
  const toolWrite = await oneTool(GUARD_RT, ws, 'write', { file_path: join(toolDir, pick!), content: 'p502-x' })
  expect(toolWrite.isError, '工具链 write deny').toBe(true)
  expect(toolWrite.text).toContain('p2sdk-fs-guard')
  expect(sha256(join(toolDir, pick!)), '工具链文件不变').toBe(before)
  const condarc = await oneTool(GUARD_RT, ws, 'read', { file_path: join(PASSWD_HOME, 'miniconda3', '.condarc') })
  expect(condarc.isError, '.condarc（登记进 never-roots 的工具链凭证）read deny').toBe(true)
  expect(condarc.text).toContain('p2sdk-fs-guard')

  // /tmp 数据根（mkdtemp）：例外只取 header.cwd 子树
  const tmpData = mkdtempSync(join(tmpdir(), 'p5-02-tmpdata-'))
  mkdirSync(join(tmpData, 'workspaces', 'x'), { recursive: true })
  mkdirSync(join(tmpData, 'workspaces', 'other-bot'), { recursive: true })
  writeFileSync(join(tmpData, 'workspaces', 'x', 'f.txt'), 'p502-tmpx')
  writeFileSync(join(tmpData, 'workspaces', 'other-bot', 'wm'), 'p502-tmpo')
  const rtTmp = await launchGuard({ env: { PBOTS_DATA_DIR: tmpData } })
  const okT = await oneTool(rtTmp, join(tmpData, 'workspaces', 'x'), 'read', { file_path: 'f.txt' })
  expect(okT.isError, '/tmp 数据根下本工作区 read 成功').toBe(false)
  expect(okT.text).toContain('p502-tmpx')
  const sibT = await oneTool(rtTmp, join(tmpData, 'workspaces', 'x'), 'read', { file_path: '../other-bot/wm' })
  expect(sibT.isError, '/tmp 数据根下同级 deny（例外只取 header.cwd 子树）').toBe(true)
  expect(sibT.text).toContain('p2sdk-fs-guard')
  rmSync(tmpData, { recursive: true, force: true })
}, 240_000)

it('⑦ cwd=PKG_ROOT：edit guard.mjs、write bwrap-wrap.py → deny、sha 不变；read 二者成功', async () => {
  const guardPath = join(PKG_ROOT, 'src', 'policy', 'guard.mjs')
  const wrapPath = join(PKG_ROOT, 'sandbox', 'bwrap-wrap.py')
  const before = [guardPath, wrapPath].map(sha256)
  const w1 = await oneTool(GUARD_RT, PKG_ROOT, 'edit', { file_path: 'src/policy/guard.mjs', old_string: 'p502', new_string: 'p502-x' })
  expect(w1.isError).toBe(true)
  expect(w1.text).toContain('p2sdk-fs-guard')
  const w2 = await oneTool(GUARD_RT, PKG_ROOT, 'write', { file_path: 'sandbox/bwrap-wrap.py', content: 'p502' })
  expect(w2.isError).toBe(true)
  expect(w2.text).toContain('p2sdk-fs-guard')
  expect([guardPath, wrapPath].map(sha256)).toEqual(before)
  const r1 = await oneTool(GUARD_RT, PKG_ROOT, 'read', { file_path: 'src/policy/guard.mjs' })
  expect(r1.isError, 'read 策略代码放行（② 硬写保护只拒写）').toBe(false)
  const r2 = await oneTool(GUARD_RT, PKG_ROOT, 'read', { file_path: 'sandbox/bwrap-wrap.py' })
  expect(r2.isError).toBe(false)
}, 120_000)

it('⑧ 正对照：read 普通工作区文件与 /etc/hostname 成功（不越界收紧）', async () => {
  const r1 = await oneTool(GUARD_RT, join(TEST_HOME, 'ws-ok'), 'read', { file_path: 'f.txt' })
  expect(r1.isError).toBe(false)
  expect(r1.text).toContain('p502-wsok')
  const r2 = await oneTool(GUARD_RT, join(TEST_HOME, 'ws-ok'), 'read', { file_path: '/etc/hostname' })
  expect(r2.isError).toBe(false)
}, 120_000)

it('⑨ runtime patch 缺 guard 行（config 覆盖为空）→ launcher 非零退出并报原因', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p5-02-noguard-'))
  const overlay = join(dir, 'noguard.yml')
  writeFileSync(overlay, `\
# P5-02 ⑨：模拟 guard 行缺失（approval.yml 的 insert 行无 roots）。
# cordis 只把激活失败记成 warning 继续跑 —— launcher 监测激活失败签名后
# 终止 dsh 并以非零码退出（P5-02 决策 6，start.ts guardFailed 窗口）。
- id: p2sdk-fs-guard
  config: {}
`)
  const res = spawnSync(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: {
      PATH: process.env.PATH!,
      HOME: TEST_HOME,
      P2SDK_PROVIDER: 'mock',
      P2SDK_HOME: join(dir, 'home'),
      P2SDK_HANDOFF: join(dir, 'ho'),
      P2SDK_PATCH: overlay,
      PBOTS_DATA_DIR: DATA_DIR,
      P2SDK_READY_TIMEOUT_MS: '30000',
    },
    encoding: 'utf8',
    timeout: 90_000,
  })
  expect(res.status, 'launcher 非零退出').not.toBe(0)
  expect(res.stderr, '报原因：guard 激活失败').toContain('guard plugin failed to activate')
  expect(res.stderr).toContain('p2sdk-fs-guard')
  rmSync(dir, { recursive: true, force: true })
}, 120_000)
