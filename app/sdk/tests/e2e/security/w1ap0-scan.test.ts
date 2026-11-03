// P5-06 验收 ③（PLAN p5-parity P5-06）：T-08 扫描器对本矩阵运行产物的 0 命中
// + 扫描器正对照。复用 tests/e2e/security/scan.mjs 与 env 哨兵注入法
// （security.test.ts 同款：`pnpm -C app/sdk exec node` 调扫描器）。
//
// ③a：fake 驱动的加固 runtime 里跑一轮「读/写/grep 全被 deny」的矩阵缩影 turn
//      （哨兵值 = 文件内容 canary），turn 结束后扫描 $DSH_HOME（session.v4
//      jsonl.zstd 全帧 = transcript/会话存储）、启动 stderr 日志、进程树
//      /proc/<pid>/cmdline —— canary 值 0 命中（deny 原因只带路径不带值）。
// ③b：正对照（T-08 ④ 同法）：canary 植入 zstd 第 2 帧与明文日志 → 扫描器必须
//      FAIL 并只报路径 + 前缀，绝不回显值。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zstdCompressSync } from 'node:zlib'
import { afterAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCAN = join(PKG_ROOT, 'tests', 'e2e', 'security', 'scan.mjs')
const TEST_HOME = '/home/lingxufeng/bot/.test-homes/p5-06-scan' // 与 w1ap0-matrix.test.ts 并行 worker，独立 HOME
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const CANARY_PREFIX = 'sk-canary-p2sdk-'
const canary = `${CANARY_PREFIX}p506scan${Math.random().toString(16).slice(2, 10)}`

interface EventsFrame { type: string; event?: string; eventId?: string; agentId?: string }
interface Feed { frames: EventsFrame[]; close(): void }

const runtimes: Runtime[] = []
const feeds: Feed[] = []

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-06-scan-patch-'))
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

function multiToolCall(calls: Array<{ name: string; args: object }>): object {
  const blocks = calls.map((c, i) => {
    const id = `p5-06-scan-${Math.random().toString(16).slice(2, 8)}-${i}`
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

interface ScanResult { status: number; stdout: string; stderr: string }

function scan(opts: { secret: string; prefix?: string; home?: string; files?: string[]; pids?: number[]; tracked?: boolean }): ScanResult {
  const args = ['-C', PKG_ROOT, 'exec', 'node', SCAN]
  if (opts.home) args.push('--home', opts.home)
  for (const f of opts.files ?? []) args.push('--file', f)
  for (const pid of opts.pids ?? []) args.push('--pid', String(pid))
  if (opts.tracked) args.push('--tracked')
  const res = spawnSync('pnpm', args, {
    env: { ...process.env, P2SCAN_SECRET: opts.secret, P2SCAN_PREFIX: opts.prefix ?? '' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

function processTree(pid: number): number[] {
  const out: number[] = []
  const walk = (p: number): void => {
    out.push(p)
    let children = ''
    try {
      children = readFileSync(join('/proc', String(p), 'task', String(p), 'children'), 'utf8')
    } catch { return }
    for (const c of children.split(/\s+/).filter(Boolean)) walk(Number(c))
  }
  walk(pid)
  return out
}

/** root 下全部普通文件（T-08 ③ 的存储格式探针同款）。 */
function walkFiles(root: string, out: string[] = []): string[] {
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, ent.name)
    if (ent.isDirectory()) walkFiles(p, out)
    else if (ent.isFile()) out.push(p)
  }
  return out
}

afterAll(async () => {
  for (const f of feeds) { try { f.close() } catch { /* 已关 */ } }
  for (const rt of runtimes) { try { await rt.stop() } catch { /* 已停 */ } }
  rmSync(TEST_HOME, { recursive: true, force: true })
})

it('③a 矩阵缩影运行后：会话存储 / 日志 / 进程 cmdline 全扫描 0 命中', { timeout: 240_000 }, async () => {
  clearRealKeys()
  // 哨兵：canary 值做文件内容（矩阵的读写目标）；值只进文件内容，不进任何 env
  mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
  mkdirSync(join(DATA_DIR, 'workspaces', 'x'), { recursive: true })
  writeFileSync(join(TEST_HOME, '.ssh', 'sentinel-key'), canary)
  writeFileSync(join(DATA_DIR, 'top-sentinel'), canary)
  const rt = await launchRuntime({
    env: { HOME: TEST_HOME, P2SDK_PATCH: fakeOverlay(), PBOTS_DATA_DIR: DATA_DIR },
  })
  runtimes.push(rt)
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as EventsFrame) })().catch(() => {})
  feeds.push({
    frames,
    close() { stream.cancel(); void drained; client.close() },
  })
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')

  // 矩阵缩影 turn：read/write/grep 全部指向 canary 哨兵文件（全 deny，原因只带
  // 路径）。canary 值只存在于哨兵文件内容里，绝不进任何工具调用参数——否则
  // 模型侧参数本身就会把值写进 transcript，那是自伤不是泄漏。
  const ws = join(DATA_DIR, 'workspaces', 'x')
  const { sessionId } = (await client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  const follow = await client.follow(sessionId)
  const turnFrames: Frame[] = []
  const turnDrained = (async () => { for await (const f of follow) turnFrames.push(f) })().catch(() => { /* cancel */ })
  void turnDrained
  const dir = join(rt.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [
    multiToolCall([
      { name: 'read', args: { file_path: join(TEST_HOME, '.ssh', 'sentinel-key') } },
      { name: 'write', args: { file_path: join(DATA_DIR, 'top-sentinel'), content: 'p506-benign-write' } },
      { name: 'grep', args: { pattern: 'p506-benign-pattern', path: DATA_DIR } },
    ]),
    textCall('P5-06 扫描缩影完成'),
  ] }))
  await client.call('session/prompt', {
    request: { requestId: `p5-06-scan-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-06 扫描缩影' }] },
  })
  await waitFor(turnFrames as unknown as Frame[], (f) => f.type === 'event' && f.event?.type === 'turn/end', 60_000, 'turn/end')
  follow.cancel()

  // 存储格式前提（T-08 ③ 同款）：$DSH_HOME/sessions 下确有 .zstd 会话文件，
  // 否则 0 命中是空绿
  const sessionFiles = walkFiles(join(rt.home, 'sessions'))
  expect(sessionFiles.length, '会话存储文件存在').toBeGreaterThan(0)
  expect(sessionFiles.some((f) => f.endsWith('.zstd')), '会话存储含 .zstd（transcript 载体）').toBe(true)

  // 前提：三格确实 deny（否则 0 命中是空绿）
  const results = turnFrames.filter((f) => f.type === 'event' && f.event?.type === 'tool/result')
  expect(results.length, '三个 tool result').toBe(3)
  for (const f of results) {
    const text = JSON.stringify(f)
    expect(text, 'deny 原因带 guard 前缀（矩阵缩影真被拦）').toContain('p2sdk-fs-guard')
    expect(text, '结果不含 canary 值').not.toContain(canary)
  }

  const logDir = mkdtempSync(join(tmpdir(), 'p5-06-scan-logs-'))
  const log = join(logDir, 'boot.log')
  writeFileSync(log, rt.readStderr())
  const res = scan({ secret: canary, prefix: CANARY_PREFIX, home: rt.home, files: [log], pids: processTree(rt.child.pid!), tracked: true })
  expect(res.stdout, '扫描器输出绝不回显 canary 值').not.toContain(canary)
  expect(res.status, `矩阵运行产物扫描必须 CLEAN：\n${res.stdout}\n${res.stderr}`).toBe(0)
  expect(res.stdout).toContain('CLEAN')
})

it('③b 扫描器正对照：zstd 第 2 帧与明文日志的 canary 都必须 FAIL 扫描', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p5-06-scan-pos-'))
  const sessionDir = join(dir, 'sessions', 'ws', 'session-00000000-0000-0000-0000-000000000000')
  mkdirSync(sessionDir, { recursive: true })
  const zstdFile = join(sessionDir, 'session.v4.jsonl.zstd')
  // dsh 会话文件是多帧 zstd；单帧解码器会漏第 2 帧（T-08 ④ / G2-r2 item 2）
  const frame1 = zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'user/message', data: { content: [{ type: 'text', text: '第一帧' }] } })}\n`))
  const frame2 = zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'assistant/message', data: { secret: canary } })}\n`))
  writeFileSync(zstdFile, Buffer.concat([frame1, frame2]))
  const logFile = join(dir, 'run.log')
  writeFileSync(logFile, `info: turn ok\nerror: auth key ${canary} rejected\n`)

  const res = scan({ secret: canary, prefix: CANARY_PREFIX, home: dir })
  expect(res.status, `植入 canary 必须 FAIL：\n${res.stdout}`).toBe(1)
  expect(res.stdout, '压缩会话文件被点名').toContain(`HIT ${zstdFile}`)
  expect(res.stdout, '明文日志被点名').toContain(`HIT ${logFile}`)
  expect(res.stdout, '输出带 canary 前缀').toContain(CANARY_PREFIX)
  expect(res.stdout, '输出绝不回显 canary 值').not.toContain(canary)
})
