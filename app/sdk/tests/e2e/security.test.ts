// T-08 acceptance ①–⑥ (PLAN p2-sdk T-08 / BRIEF §6 D8, R-5 wording):
// ① T-01② process-tree ss criterion: every runtime listener is loopback.
// ② Admission: no cookie -> 401, cross-site markers -> 403 (even with a valid
//    cookie), and the /connect?token -> cookie exchange works (positive).
// ③ Sentinel sk-canary-p2sdk-<random> injected into the provider env of a
//    fake-driven runtime: build session -> chat -> kill -9 -> restart, then the
//    scanner (tests/e2e/security/scan.mjs, run via `pnpm -C app/sdk exec node`
//    and self-guarding on Node >=24.9.0) sweeps tracked files, both boots'
//    logs, the whole $DSH_HOME (session.v4.jsonl.zstd decoded, all frames) and
//    /proc/<pid>/cmdline: 0 hits.
// ④ Scanner positive control: the sentinel planted into a compressed session
//    file as zstd FRAME 2 (dsh session files are multi-frame; a single-frame
//    decoder would miss it, G2-r2 item 2) and into a plain log must FAIL the
//    scan, printing only paths + the sk-canary-p2sdk- prefix, never the value.
// ⑤ The D2 real-model scenario (T-01④): the same scanner re-run for the real
//    key (key from env, never printed; only the hit count is reported).
// ⑥ Real-provider-path sentinel (R-5): pi-ai apiKeyEnv points at the sentinel
//    and baseURL at a local loopback stub; the stub asserts it received the
//    sentinel as the Bearer key, then the same scan must be clean (a mock that
//    never reads the key proves nothing).
// Kill discipline (LEARNINGS): pgrep -P for children, SIGKILL only, never pkill -f.
import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync, zstdCompressSync } from 'node:zlib'
import { afterAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import {
  childEnvHas,
  clearRealKeys,
  createSession,
  isLoopback,
  processTree,
  sendPrompt,
  treeListenerEndpoints,
  waitForDelta,
  waitForTurnEnd,
  type Frame,
} from '../support/fake/harness.ts'
import { launchRuntime } from '../support/runtime.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCAN = join(PKG_ROOT, 'tests', 'e2e', 'security', 'scan.mjs')
const CANARY_PREFIX = 'sk-canary-p2sdk-'
const newSentinel = (): string => `${CANARY_PREFIX}${randomUUID().replaceAll('-', '')}`
/** Captured at import time, before any clearRealKeys() call; never logged. */
const REAL_KEY = process.env.P2SDK_LLM_API_KEY || process.env.LITELLM_MASTER_KEY || ''

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// --- boot plumbing (local copies of the T-06 pattern; tests/support and
// examples are outside this task's area) ---

interface Boot {
  child: ChildProcess
  baseUrl: string
  token: string
  client: DshClient
  logs(): { stdout: string; stderr: string }
}

const booted: ChildProcess[] = []
afterAll(() => {
  for (const child of booted) {
    if (child.exitCode !== null) continue
    for (const pid of [child.pid, ...childPids(child.pid)]) {
      try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    }
  }
})

/** Direct children of pid via pgrep (LEARNINGS: never pkill -f). */
function childPids(pid: number | undefined): number[] {
  if (!pid) return []
  try {
    return execSync(`pgrep -P ${pid}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number)
  } catch {
    return [] // pgrep exits 1 on no match
  }
}

/** Boot scripts/start.mjs against an existing home; env entries must be strings. */
async function boot(home: string, env: Record<string, string>): Promise<Boot> {
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: { ...process.env, ...env, P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  booted.push(child)
  const state = { stdout: '', stderr: '' }
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout.on('data', (c: string) => { state.stdout += c })
  child.stderr.on('data', (c: string) => { state.stderr += c })
  const deadline = Date.now() + 60_000
  while (!/\[p2sdk\] ready http/.test(state.stdout + state.stderr)) {
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):\n${state.stdout}\n${state.stderr}`)
    if (Date.now() >= deadline) throw new Error(`no ready line within 60s:\n${state.stdout}\n${state.stderr}`)
    await sleep(200)
  }
  const baseUrl = readFileSync(join(home, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(home, 'launch-token'), 'utf8').trim()
  return { child, baseUrl, token, client: await connect({ baseUrl, token }), logs: () => ({ ...state }) }
}

/** kill -9 the start.mjs parent and its dsh child, then wait for the parent's exit. */
async function killTree9(parent: ChildProcess): Promise<void> {
  for (const pid of [parent.pid, ...childPids(parent.pid)]) {
    try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  }
  await new Promise<void>((resolve) => {
    if (parent.exitCode !== null) return resolve()
    const timer = setTimeout(resolve, 10_000)
    parent.on('exit', () => { clearTimeout(timer); resolve() })
  })
}

/** Fake-provider overlay, copied from tests/e2e/restart.test.ts fakeOverlay() (same profile rows). */
function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-t08-patch-'))
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
# T-08 generated fake-provider overlay (tests/e2e/security.test.ts).
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

/** Scripted model call (chunk vocabulary from upstream mock-adapter, via harness.ts/restart.test.ts). */
function scriptedCall(pieces: string[]): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
      { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
}

function writeScriptCalls(home: string, sessionId: string, calls: object[]): void {
  const dir = join(home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
}

/** Follow + prompt one turn, wait for its first delta and durable turn/end. */
async function runTurn(client: DshClient, sessionId: string, prompt: string, firstDelta: string): Promise<void> {
  const stream = await client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await sendPrompt(client, sessionId, prompt)
  await waitForDelta(frames, firstDelta, 15_000)
  await waitForTurnEnd(frames, 15_000)
  stream.cancel()
  void drained // cancel is locally terminal (T-01.f1); the loop settles on teardown
}

/** Every regular file under root, recursively (the ③ storage-format probe). */
function walkFiles(root: string, out: string[] = []): string[] {
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, ent.name)
    if (ent.isDirectory()) walkFiles(p, out)
    else if (ent.isFile()) out.push(p)
  }
  return out
}

// --- scanner invocation: always `pnpm -C app/sdk exec node …` (③ scanner rule) ---

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

// --- ① process-tree ss criterion (T-01②) ---

it('① ss process-tree criterion: every runtime listener is loopback', async () => {
  clearRealKeys()
  const rt = await launchRuntime()
  const endpoints = treeListenerEndpoints(rt.child.pid!)
  expect(endpoints.length, 'runtime tree listens on at least one socket').toBeGreaterThanOrEqual(1)
  for (const e of endpoints) expect(isLoopback(e), `listener ${e} is loopback`).toBe(true)
  await rt.stop()
}, 120_000)

// --- ② admission: cookie required, cross-site rejected, /connect positive ---

it('② admission: no cookie 401, cross-site 403, /connect?token cookie works', async () => {
  clearRealKeys()
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-t08-auth-'))
  const rt = await boot(home, { P2SDK_PROVIDER: 'mock' })
  const envelope = JSON.stringify({
    type: 'client-request', rpcId: 'p2sdk-t08-auth', method: 'session/list', payload: { args: {} },
  })
  const post = (headers: Record<string, string>) =>
    fetch(`${rt.baseUrl}/api/session/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: envelope,
      redirect: 'manual',
    })

  const noCookie = await post({})
  expect(noCookie.status, 'unauthenticated /api call is rejected (401/403 family)').toBe(401)
  const crossSite = await post({ cookie: rt.client.cookie, 'sec-fetch-site': 'cross-site' })
  expect(crossSite.status, 'cross-site marker is rejected even with a valid cookie').toBe(403)
  const foreignOrigin = await post({ cookie: rt.client.cookie, origin: 'https://evil.example' })
  expect(foreignOrigin.status, 'foreign Origin authority is rejected even with a valid cookie').toBe(403)

  // Positive: a fresh /connect?token exchange yields a cookie that works.
  const res = await fetch(`${rt.baseUrl}/connect?token=${encodeURIComponent(rt.token)}&interactions=none`, { redirect: 'manual' })
  expect([302, 303], `/connect?token answers with a redirect (got ${res.status})`).toContain(res.status)
  const freshCookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  expect(freshCookie, 'token exchange returns a cookie').toBeTruthy()
  const ok = await post({ cookie: freshCookie })
  expect(ok.status, 'positive: the /connect?token-exchanged cookie works').toBe(200)

  rt.client.close()
  await killTree9(rt.child)
}, 120_000)

// --- ③ sentinel through a fake-driven run + restart, full sweep = 0 hits ---

it('③ sentinel leak scan: fake run -> kill -9 -> restart -> 0 hits everywhere', async () => {
  clearRealKeys()
  const sentinel = newSentinel()
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-t08-scan-'))
  const keyEnv = { P2SDK_PROVIDER: 'mock', P2SDK_PATCH: fakeOverlay(), P2SDK_LLM_API_KEY: sentinel }

  const rt1 = await boot(home, keyEnv)
  expect(childEnvHas(rt1.child.pid!, 'P2SDK_LLM_API_KEY'), 'the sentinel really reached the runtime env (name only, never the value)').toBe(true)
  // ① re-checked inside the fake-driven run.
  const endpoints = treeListenerEndpoints(rt1.child.pid!)
  expect(endpoints.length).toBeGreaterThanOrEqual(1)
  for (const e of endpoints) expect(isLoopback(e), `listener ${e} is loopback`).toBe(true)

  const sid = await createSession(rt1.client, home)
  writeScriptCalls(home, sid, [scriptedCall(['甲', '乙', '丙'])])
  await runTurn(rt1.client, sid, '安全扫描前的一问', '甲')
  const logs1 = rt1.logs()
  rt1.client.close()
  await killTree9(rt1.child)

  const rt2 = await boot(home, keyEnv) // identical env: the restart
  const list = (await rt2.client.call('session/list', { _request: {} })) as { items: Array<{ sessionId: string }> }
  expect(list.items.map((i) => i.sessionId), 'restart on the same home lists the persisted session').toContain(sid)

  // Storage-format probe (③): record the actual suffixes before scanning.
  const sessionFiles = walkFiles(join(home, 'sessions'))
  const suffixes = [...new Set(sessionFiles.map((f) => f.slice(f.lastIndexOf('.'))))]
  expect(sessionFiles.length, `session storage files exist (suffixes: ${suffixes.join(',') || 'none'})`).toBeGreaterThan(0)
  expect(suffixes, `session storage format probe: ${suffixes.join(',')}`).toContain('.zstd')

  const logDir = mkdtempSync(join(tmpdir(), 'p2sdk-t08-logs-'))
  const log1 = join(logDir, 'boot1.log')
  writeFileSync(log1, `${logs1.stdout}\n--stderr--\n${logs1.stderr}`)
  const l2 = rt2.logs()
  const log2 = join(logDir, 'boot2.log')
  writeFileSync(log2, `${l2.stdout}\n--stderr--\n${l2.stderr}`)

  const res = scan({ secret: sentinel, prefix: CANARY_PREFIX, home, files: [log1, log2], pids: processTree(rt2.child.pid!), tracked: true })
  expect(res.stdout, 'scanner output carries paths/prefix only, never the sentinel').not.toContain(sentinel)
  expect(res.status, `scan must be clean:\n${res.stdout}\n${res.stderr}`).toBe(0)
  expect(res.stdout).toContain('CLEAN')

  rt2.client.close()
  await killTree9(rt2.child)
}, 180_000)

// --- ④ scanner positive control: planted frame-2 + plain log must FAIL it ---

it('④ scanner positive control: sentinel in zstd frame 2 and in a plain log both FAIL the scan', async () => {
  const sentinel = newSentinel()
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-t08-pos-'))
  const sessionDir = join(dir, 'sessions', 'ws', 'session-00000000-0000-0000-0000-000000000000')
  mkdirSync(sessionDir, { recursive: true })
  const zstdFile = join(sessionDir, 'session.v4.jsonl.zstd')
  // Frame 2 carries the sentinel: dsh session files are multi-frame, and a
  // single-frame decoder (Node 22 behavior) would miss it — G2-r2 item 2.
  const frame1 = zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'user/message', data: { content: [{ type: 'text', text: '第一帧' }] } })}\n`))
  const frame2 = zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'assistant/message', data: { secret: sentinel } })}\n`))
  writeFileSync(zstdFile, Buffer.concat([frame1, frame2]))
  const logFile = join(dir, 'run.log')
  writeFileSync(logFile, `info: turn ok\nerror: auth key ${sentinel} rejected\n`)

  const res = scan({ secret: sentinel, prefix: CANARY_PREFIX, home: dir })
  expect(res.status, `planted sentinel must FAIL the scan:\n${res.stdout}`).toBe(1)
  expect(res.stdout, 'the compressed session file is reported').toContain(`HIT ${zstdFile}`)
  expect(res.stdout, 'the plain log file is reported').toContain(`HIT ${logFile}`)
  expect(res.stdout, 'output prints the canary prefix').toContain(CANARY_PREFIX)
  expect(res.stdout, 'output never prints the sentinel value').not.toContain(sentinel)

  // A compression the scanner does not recognize (gzip) inside a scanned home
  // must FAIL the scan rather than be skipped (③ rule: 认不出的格式判 FAIL).
  const gzipDir = mkdtempSync(join(tmpdir(), 'p2sdk-t08-gzip-'))
  mkdirSync(join(gzipDir, 'sessions'), { recursive: true })
  writeFileSync(join(gzipDir, 'sessions', 'session.v5.jsonl.gz'), gzipSync('{"type":"user/message"}\n'))
  const gz = scan({ secret: sentinel, home: gzipDir })
  expect(gz.status, `unrecognized compression must FAIL the scan:\n${gz.stdout}`).toBe(2)
  expect(gz.stdout, 'the unrecognized file is reported by path').toContain('UNRECOGNIZED')
  expect(gz.stdout).toContain(join(gzipDir, 'sessions', 'session.v5.jsonl.gz'))
}, 60_000)

it('④b scanner guards: refuses non-pnpm invocation and Node <24.9', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-t08-guard-'))
  // Bare node (no pnpm markers in env): the pnpm guard must refuse.
  const bare = spawnSync(process.execPath, [SCAN, '--home', home], {
    env: { ...process.env, P2SCAN_SECRET: 'x', npm_config_user_agent: '' },
    encoding: 'utf8',
    timeout: 60_000,
  })
  expect(bare.status, `bare node must be refused:\n${bare.stdout}`).toBe(3)
  expect(bare.stdout).toContain('GUARD')
  // System Node 22 even with pnpm markers: the version guard must refuse —
  // v22's zstdDecompressSync decodes only frame 1 (G2-r2-A, re-verified here).
  const v22 = spawnSync('/usr/bin/node', [SCAN, '--home', home], {
    env: {
      ...process.env,
      P2SCAN_SECRET: 'x',
      npm_config_user_agent: 'pnpm/11.0.9 npm/? node/v22.23.4 linux x64',
    },
    encoding: 'utf8',
    timeout: 60_000,
  })
  expect(v22.status, `Node 22 must be refused:\n${v22.stdout}`).toBe(3)
  expect(v22.stdout).toContain('GUARD')
}, 60_000)

// --- ⑤ real key, D2 scenario, same scanner; count only ---

it.skipIf(!REAL_KEY)('⑤ real-key D2 smoke re-scan: same scanner, key from env, hits=0', async () => {
  // Gate on endpoint reachability: inside $OFFLINE (own netns, only lo) the
  // host's LiteLLM loopback is unreachable and the D2 smoke cannot run — skip
  // instead of failing the offline gate (the online run carries the evidence).
  const base = (process.env.P2SDK_LLM_BASE_URL || 'http://127.0.0.1:4001').replace(/\/+$/, '')
  try {
    await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(2000) })
  } catch {
    console.log('  ⑤ skipped: LiteLLM endpoint not reachable (offline netns or endpoint down)')
    return
  }
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-t08-real-'))
  const rt = await boot(home, { P2SDK_LLM_API_KEY: REAL_KEY }) // real provider mode
  const d2 = spawnSync('pnpm', ['-C', PKG_ROOT, 'exec', 'node', 'examples/min-client.mjs', '你好'], {
    env: { ...process.env, P2SDK_HOME: home, P2SDK_LLM_API_KEY: REAL_KEY },
    encoding: 'utf8',
    timeout: 120_000,
  })
  expect(d2.status, `D2 smoke must pass first (T-01④ scenario):\n${d2.stdout}\n${d2.stderr}`).toBe(0)

  const logDir = mkdtempSync(join(tmpdir(), 'p2sdk-t08-real-logs-'))
  const bootLog = join(logDir, 'boot.log')
  writeFileSync(bootLog, `${rt.logs().stdout}\n--stderr--\n${rt.logs().stderr}`)
  const d2Log = join(logDir, 'min-client.out')
  writeFileSync(d2Log, `${d2.stdout}\n--stderr--\n${d2.stderr}`)

  const res = scan({ secret: REAL_KEY, home, files: [bootLog, d2Log], pids: processTree(rt.child.pid!), tracked: true })
  expect(res.status, `real-key scan must be clean:\n${res.stdout}\n${res.stderr}`).toBe(0)
  expect(res.stdout, 'output never contains the real key').not.toContain(REAL_KEY)
  console.log('  ⑤ real-key scan hits=0 (scanner reported CLEAN)')

  rt.client.close()
  await killTree9(rt.child)
}, 180_000)

// --- ⑥ real provider path sentinel via a loopback stub (R-5 condition) ---

it('⑥ real provider path sentinel: loopback stub receives the Bearer key, disk scan stays clean', async () => {
  clearRealKeys()
  const sentinel = newSentinel()
  const seen: Array<{ url: string; authorization: string }> = []
  // OpenAI-compatible SSE stub on loopback (pi-ai openai-completions client shape).
  const stub = createServer((req, res) => {
    seen.push({ url: req.url ?? '', authorization: req.headers.authorization ?? '' })
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'glm-5.3-flash', object: 'model' }] }))
      return
    }
    if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
      sse({ id: 'chatcmpl-stub', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
      sse({ id: 'chatcmpl-stub', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: '桩回复甲' }, finish_reason: null }] })
      sse({ id: 'chatcmpl-stub', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: '乙' }, finish_reason: null }] })
      sse({ id: 'chatcmpl-stub', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
      sse({ id: 'chatcmpl-stub', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()))
  const port = (stub.address() as AddressInfo).port
  try {
    const home = mkdtempSync(join(tmpdir(), 'p2sdk-t08-prov-'))
    const rt = await boot(home, { P2SDK_LLM_API_KEY: sentinel, P2SDK_LLM_BASE_URL: `http://127.0.0.1:${port}` })

    const sid = await createSession(rt.client, home)
    const stream = await rt.client.follow(sid)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await sendPrompt(rt.client, sid, '真实路径哨兵一问')

    // The stub must receive the sentinel (Bearer) BEFORE any scanning counts.
    const deadline = Date.now() + 60_000
    while (!seen.some((r) => r.authorization === `Bearer ${sentinel}`)) {
      if (Date.now() >= deadline) {
        throw new Error(`stub never received the sentinel as the Bearer key (requests seen: ${seen.length})`)
      }
      await sleep(200)
    }
    for (const r of seen) expect(r.url.includes(sentinel), 'the key never travels in the URL query').toBe(false)

    // Let the turn land; the scan below is the hard assertion either way.
    try { await waitForTurnEnd(frames, 60_000) } catch { /* an errored turn still gets scanned */ }
    stream.cancel()
    void drained

    const logDir = mkdtempSync(join(tmpdir(), 'p2sdk-t08-prov-logs-'))
    const logFile = join(logDir, 'boot.log')
    writeFileSync(logFile, `${rt.logs().stdout}\n--stderr--\n${rt.logs().stderr}`)
    const res = scan({ secret: sentinel, prefix: CANARY_PREFIX, home, files: [logFile], pids: processTree(rt.child.pid!), tracked: true })
    expect(res.stdout, 'scanner output carries paths/prefix only, never the sentinel').not.toContain(sentinel)
    expect(res.status, `real-provider-path scan must be clean:\n${res.stdout}\n${res.stderr}`).toBe(0)

    rt.client.close()
    await killTree9(rt.child)
  } finally {
    stub.close()
  }
}, 180_000)
