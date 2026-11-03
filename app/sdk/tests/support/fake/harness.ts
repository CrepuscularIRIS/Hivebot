// T-02 fake-provider test harness (PLAN p2-sdk T-02, D7 伪流式证伪).
// Wraps the T-01 shared launcher (tests/support/runtime.ts) with: real-key
// clearing (D7 keyless run), per-session scripted fake-LLM turns driven
// through $P2SDK_HOME/fake (script JSON + T-01⑧ gate-file barrier), and the
// T-01② process-tree listener criterion (`ss`, loopback only, no new listeners).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect } from 'vitest'
import { snapshotFrames, type DshClient } from '../../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../runtime.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Env vars that must never reach the runtime under test (D7: no real keys). */
export const KEY_VARS = [
  'P2SDK_LLM_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'LITELLM_MASTER_KEY',
] as const

/** Fixtures for ①②③ (A) and the ④ re-run (B): different prompt, different text. */
export const PROMPT_A = '讲五字口诀'
export const PROMPT_B = '换一段谚语'
export const PIECES_A = ['甲', '乙', '丙', '丁', '戊']
export const PIECES_B = ['子', '丑', '寅', '卯', '辰']

/** One session/follow mux frame (item value), minimally typed for assertions. */
export interface Frame {
  type: string
  event?: { type?: string; data?: unknown }
  frame?: { type?: string; chunk?: { type?: string; text?: string } }
}

/** The fake plugin's per-request record ($P2SDK_HOME/fake/requests.jsonl). */
export interface FakeRequest {
  ts: number
  sessionId: string | null
  provider: string
  model: string
  purpose: string | null
  userTexts: string[]
  /** P5-06: prior-turn tool results carried into this model call (child-session observation channel). */
  toolResults?: Array<{ toolCallId: string | null; isError: boolean; text: string }>
}

export interface FakeRuntime extends Runtime {
  /** Write the scripted model-call list for one session (plugin reads it per call). */
  writeScript(sessionId: string, pieces: string[], gateId?: string, paceMs = 10): void
  /** Write arbitrary scripted calls (raw chunk lists, e.g. tool-call turns). */
  writeScriptCalls(sessionId: string, calls: object[]): void
  /** Requests the fake provider actually received, in order. */
  readRequests(): FakeRequest[]
}

const isTextDelta = (f: Frame): boolean =>
  f.type === 'assistant-stream' && f.frame?.type === 'chunk' && f.frame.chunk?.type === 'text-delta'

/** Delete real key env vars from this process before launching (D7). */
export function clearRealKeys(): void {
  for (const name of KEY_VARS) delete process.env[name]
}

/** Whether the runtime child's environment carries `name` (never logs values). */
export function childEnvHas(pid: number, name: string): boolean {
  return readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').some((e) => e.startsWith(`${name}=`))
}

/**
 * pid of the dsh runtime process under the start.mjs launcher. T-01.f3 checks
 * the allowlist against the environment the model-driven tools actually
 * inherit, which is dsh's own environ — not the launcher's.
 */
export function runtimeDshPid(pid: number): number {
  for (const p of processTree(pid)) {
    let cmd = ''
    try {
      cmd = readFileSync(`/proc/${p}/cmdline`, 'utf8')
    } catch {
      continue
    }
    if (cmd.includes('/dsh/lib/bin.js')) return p
  }
  throw new Error(`no dsh runtime process under launcher ${pid}`)
}

/**
 * Scripted model call, chunk vocabulary copied from upstream mock-adapter.ts
 * (来源: deepseek-harness@ce7073d packages/core/agent-loop/tests/mock-adapter.ts).
 * gateAfterChunk=1 makes the fake hang after the first text-delta until the
 * gate file $P2SDK_HOME/gates/<gateId> appears (T-01⑧ channel).
 */
function scriptedCall(pieces: string[], gateId?: string, paceMs = 10): object {
  const chunks: object[] = [
    { type: 'block-start', index: 0, blockType: 'text' },
    ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
    { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  return gateId ? { chunks, gateAfterChunk: 1, gateId, paceMs } : { chunks, paceMs }
}

/**
 * Boot the runtime with the T-01 launcher, real keys cleared, against a fresh
 * mkdtemp home. The scripted fake provider is selected through a generated
 * P2SDK_PATCH overlay (agent-default-model -> p2fake + p2sdk-fake-llm plugin).
 */
export async function launchFakeRuntime(opts: { env?: Record<string, string> } = {}): Promise<FakeRuntime> {
  clearRealKeys()
  const rt = await launchRuntime({ env: { ...overlayEnv(), ...opts.env } })
  const writeScriptCalls = (sessionId: string, calls: object[]): void => {
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
  }
  return {
    ...rt,
    writeScript(sessionId: string, pieces: string[], gateId?: string, paceMs = 10) {
      writeScriptCalls(sessionId, [scriptedCall(pieces, gateId, paceMs)])
    },
    writeScriptCalls,
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
}

/**
 * Generate the T-02 patch overlay into a temp dir: restate agent-default-model
 * to select the scripted p2fake provider and insert the p2sdk-fake-llm plugin
 * (later --patch overlays replace same-id rows from profile/patches/p2sdk.yml
 * whole). Loaded through the T-01 launcher's P2SDK_PATCH passthrough.
 */
function overlayEnv(): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-fake-patch-'))
  const pluginUrl = pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(
    overlay,
    `\
# T-02 generated fake-provider overlay (tests/support/fake/harness.ts).
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pluginUrl}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`,
  )
  return { P2SDK_PATCH: overlay }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll collected frames until one matches; the ms budget is the FAIL clock. */
export async function waitFor(frames: Frame[], pred: (f: Frame) => boolean, ms: number, label: string): Promise<number> {
  const deadline = Date.now() + ms
  for (;;) {
    const idx = frames.findIndex(pred)
    if (idx >= 0) return idx
    if (Date.now() >= deadline) throw new Error(`timed out after ${ms}ms waiting for ${label}`)
    await sleep(20)
  }
}

/** Index of the frame delivering the exact text-delta chunk (the first-chunk barrier receipt). */
export function waitForDelta(frames: Frame[], text: string, ms = 5000): Promise<number> {
  return waitFor(
    frames,
    (f) => isTextDelta(f) && f.frame?.chunk?.text === text,
    ms,
    `first chunk ${JSON.stringify(text)}`,
  )
}

/** Index of the durable turn/end event frame. */
export function waitForTurnEnd(frames: Frame[], ms = 5000): Promise<number> {
  return waitFor(frames, (f) => f.type === 'event' && f.event?.type === 'turn/end', ms, 'turn/end')
}

/** Queue-mode prompt exactly as examples/min-client.mjs sends it. */
export function sendPrompt(client: DshClient, sessionId: string, prompt: string): Promise<unknown> {
  const requestId = `p2sdk-t02-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return client.call('session/prompt', {
    request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }] },
  })
}

/**
 * Create one session on the runtime. T-01.f3 R1: the cwd is an independent
 * mkdtemp work dir — never under P2SDK_HOME/DSH_HOME, so a `read
 * ../launch-token` from inside the session finds nothing.
 */
export async function createSession(client: DshClient, _home?: string): Promise<string> {
  const work = mkdtempSync(join(tmpdir(), 'p2sdk-work-'))
  const { sessionId } = (await client.call('session/create', { request: { cwd: work } })) as {
    sessionId: string
  }
  expect(sessionId, 'session/create returned a sessionId').toBeTypeOf('string')
  return sessionId
}

/** T-01② criterion helpers: the runtime process tree's listening sockets. */
export function processTree(pid: number): number[] {
  if (pid <= 0) throw new Error(`invalid pid ${pid}`)
  const out: number[] = []
  const walk = (p: number): void => {
    out.push(p)
    let children = ''
    try {
      children = readFileSync(join('/proc', String(p), 'task', String(p), 'children'), 'utf8')
    } catch {
      return
    }
    for (const c of children.split(/\s+/).filter(Boolean)) walk(Number(c))
  }
  walk(pid)
  return out
}

export function isLoopback(endpoint: string): boolean {
  return endpoint.startsWith('127.0.0.1:') || endpoint.startsWith('[::1]:')
}

/** Local endpoints of LISTEN sockets owned by the given process tree (ss -ltnp). */
export function treeListenerEndpoints(pid: number): string[] {
  const tree = new Set(processTree(pid))
  const res = spawnSync('ss', ['-ltnp'], { encoding: 'utf8' })
  if (res.status !== 0) throw new Error(`ss -ltnp failed with exit ${res.status}: ${res.stderr}`)
  const records: string[] = []
  for (const line of res.stdout.split('\n')) {
    if (/^(State|Netid)\s/.test(line) || line.trim() === '') continue
    if (/^(LISTEN|ESTAB|UNCONN)/.test(line)) records.push(line)
    else if (records.length > 0) records[records.length - 1] += ` ${line.trim()}` // wrapped process info
  }
  const endpoints: string[] = []
  for (const rec of records) {
    if (!rec.startsWith('LISTEN')) continue
    const pids = [...rec.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]))
    if (!pids.some((p) => tree.has(p))) continue
    endpoints.push(rec.split(/\s+/)[3]) // State Recv-Q Send-Q Local:Port Peer Process
  }
  return endpoints.sort()
}

export interface TurnResult {
  fullText: string
  lastDeltaIndex: number
  turnEndIndex: number
}

/**
 * One scripted turn through the examples/lib client. With gateId: the fake
 * hangs after chunk 1; the client must actually receive it (5s FAIL clock)
 * before release(gateId), the T-01② listener criterion is re-checked during
 * the barrier, and all K pieces must land in order before turn/end.
 * T-01.f3 R6: the prompt is sent only after the follow opening snapshot
 * arrived (subscription barrier), and the snapshot baseline is folded into
 * the frame statistics so a turn landing inside the baseline still settles.
 */
export async function runScriptedTurn(
  rt: FakeRuntime,
  opts: { prompt: string; pieces: string[]; gateId?: string; paceMs?: number },
): Promise<TurnResult> {
  const pid = rt.child.pid ?? 0
  const sessionId = await createSession(rt.client, rt.home)
  rt.writeScript(sessionId, opts.pieces, opts.gateId, opts.paceMs)

  const listeners = treeListenerEndpoints(pid)
  expect(listeners.length, 'runtime tree listens on at least one socket').toBeGreaterThanOrEqual(1)
  for (const e of listeners) expect(isLoopback(e), `listener ${e} is loopback`).toBe(true)

  const { stream, snapshot } = await rt.client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
  const frames: Frame[] = [...snapshotFrames(snapshot)]
  const drained = (async () => {
    for await (const f of stream) frames.push(f)
  })()
  await sendPrompt(rt.client, sessionId, opts.prompt)

  if (opts.gateId) {
    await waitForDelta(frames, opts.pieces[0]) // barrier receipt at the client; 5s timeout = FAIL
    expect(treeListenerEndpoints(pid), 'no new listeners during the barrier').toEqual(listeners)
    rt.release(opts.gateId)
  }

  if (opts.gateId) {
    await waitForDelta(frames, opts.pieces[0]) // barrier receipt at the client; 5s timeout = FAIL
    expect(treeListenerEndpoints(pid), 'no new listeners during the barrier').toEqual(listeners)
    rt.release(opts.gateId)
  }
  const turnEndIndex = await waitForTurnEnd(frames)
  // Gateway sends no terminal frame after a client cancel (stream-server.ts
  // returns silently for non-remote aborts), so cancel is locally terminal:
  // the background loop settles when rt.stop() closes the socket.
  stream.cancel()
  void drained

  let cursor = 0
  let lastDeltaIndex = -1
  frames.forEach((f, i) => {
    if (i >= turnEndIndex || cursor >= opts.pieces.length) return
    if (isTextDelta(f) && f.frame?.chunk?.text === opts.pieces[cursor]) {
      cursor += 1
      lastDeltaIndex = i
    }
  })
  expect(cursor, `${cursor}/${opts.pieces.length} scripted pieces in order before turn end`).toBe(opts.pieces.length)
  const all = frames.filter(isTextDelta).map((f) => f.frame?.chunk?.text ?? '')
  expect(all.join(''), 'exactly the scripted text arrived as deltas').toBe(opts.pieces.join(''))
  expect(lastDeltaIndex).toBeLessThan(turnEndIndex)
  return { fullText: all.join(''), lastDeltaIndex, turnEndIndex }
}
