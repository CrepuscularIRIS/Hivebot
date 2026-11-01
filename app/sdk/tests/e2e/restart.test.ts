// T-06 acceptance ①② (PLAN p2-sdk T-06 / D5 重启存续):
// ① 2 sessions x 1 turn -> kill -9 -> same start command + same P2SDK_HOME ->
//    session/list returns both (cold, no Agent attached), session/events reads
//    each history back (prompt, reply, completed turn/end).
// ② complete turn 1, kill -9 mid-stream of turn 2 (fake provider parked on the
//    T-01⑧ gate file) -> restart -> cold events show turn 1 completed and the
//    interrupted turn closed with a synthetic `interrupted` turn/end (the
//    cold-read view balances the log in memory, session-query/cold-read.ts) ->
//    one follow-up prompt resumes the Agent (closers persisted via agent-loop
//    resumeWith -> interruptedTurnClosers, dsh-sessions.md:50) and turn 3
//    completes on the same session identity.
// The T-02 fake provider scripts per sessionId (mock replay binds one script
// per live session, so it cannot drive 2 sessions on one runtime).
// Kill discipline: pgrep -P for the dsh child, SIGKILL only, never pkill -f.
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { createSession, sendPrompt, waitForDelta, waitForTurnEnd, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** No orphaned runtimes: everything booted here dies in afterAll if a test leaked it. */
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

/** The one start command every boot (first and restart) uses, unchanged. */
function startEnv(home: string, patch: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    P2SDK_PATCH: patch,
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: home,
    P2SDK_PORT: '0',
    P2SDK_READY_TIMEOUT_MS: '60000',
  }
}

/** Boot `pnpm -C app/sdk start`'s underlying command against an existing home. */
async function bootHome(home: string, patch: string): Promise<{ child: ChildProcess; baseUrl: string; token: string; client: DshClient }> {
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: startEnv(home, patch),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  booted.push(child)
  let output = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => { output += c })
  const deadline = Date.now() + 60_000
  while (!/\[p2sdk\] ready http/.test(output)) {
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):\n${output}`)
    if (Date.now() >= deadline) throw new Error(`no ready line within 60s:\n${output}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  const baseUrl = readFileSync(join(home, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(home, 'launch-token'), 'utf8').trim()
  return { child, baseUrl, token, client: await connect({ baseUrl, token }) }
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

// --- wire record helpers (shapes verified against dsh-api-session-controller types) ---

interface WireEvent {
  type: string
  seq: number
  // user/message flattens the message onto data (content/id/role/source);
  // assistant/message nests it under data.message.
  data: {
    turn?: number
    reason?: { kind?: string }
    content?: Array<{ type: string; text?: string }>
    source?: { kind?: string }
    message?: { role?: string; content?: Array<{ type: string; text?: string }> }
  }
}
interface EventsPage { records: Array<{ type: string; event: WireEvent }>; hasMore: boolean; cursor: number }

async function eventsOf(client: DshClient, sessionId: string): Promise<EventsPage> {
  return (await client.call('session/events', {
    request: { address: { kind: 'session', sessionId }, maxMessages: 200 },
  })) as EventsPage
}

const recordText = (m?: { content?: Array<{ type: string; text?: string }> }): string =>
  (m?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')

/** Real human prompts only: user/message with source.kind 'user' (runtime-context injections are filtered out). */
const realUserTexts = (page: EventsPage): string[] =>
  page.records
    .filter((r) => r.event.type === 'user/message' && r.event.data.source?.kind === 'user')
    .map((r) => recordText(r.event.data))

const assistantTexts = (page: EventsPage): string[] =>
  page.records.filter((r) => r.event.type === 'assistant/message').map((r) => recordText(r.event.data.message))

const turnEndReasons = (page: EventsPage): string[] =>
  page.records.filter((r) => r.event.type === 'turn/end').map((r) => r.event.data.reason?.kind ?? '')

// --- fake-provider wiring (T-02 harness equivalents; area constraint keeps them local) ---

/** Fake overlay, copied from tests/support/fake/harness.ts overlayEnv() (same profile rows). */
function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-t06-patch-'))
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
# T-06 generated fake-provider overlay (tests/e2e/restart.test.ts).
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

/** Scripted model calls (chunk vocabulary copied from harness.ts scriptedCall, upstream mock-adapter). */
function writeScriptCalls(home: string, sessionId: string, calls: object[]): void {
  const dir = join(home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
}

const scriptedCall = (pieces: string[], gateId?: string): object => ({
  chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
    { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ],
  ...(gateId ? { gateAfterChunk: 1, gateId } : {}),
  paceMs: 10,
})

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

it('① restart survival: kill -9 -> same start command + same P2SDK_HOME -> list returns both sessions, events reads history', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-t06-r1-'))
  const patch = fakeOverlay()
  const rt = await bootHome(home, patch)
  const s1 = await createSession(rt.client, home)
  const s2 = await createSession(rt.client, home)
  writeScriptCalls(home, s1, [scriptedCall(['甲', '乙', '丙', '丁', '戊'])])
  writeScriptCalls(home, s2, [scriptedCall(['子', '丑', '寅', '卯', '辰'])])
  await runTurn(rt.client, s1, '重启前·第一问', '甲')
  await runTurn(rt.client, s2, '重启前·第二问', '子')
  await killTree9(rt.child)
  expect(rt.child.signalCode ?? rt.child.exitCode, 'the runtime died to the kill, not on its own').not.toBe(null)

  const rt2 = await bootHome(home, patch) // identical spawn: same argv, same env, same P2SDK_HOME
  const list = (await rt2.client.call('session/list', { _request: {} })) as { items: Array<{ sessionId: string; agentAvailable: boolean }> }
  expect(list.items.map((i) => i.sessionId).sort()).toEqual([s1, s2].sort())
  expect(list.items.every((i) => !i.agentAvailable), 'cold list: no Agent attached before any prompt').toBe(true)

  for (const [sid, prompt, reply] of [[s1, '重启前·第一问', '甲乙丙丁戊'], [s2, '重启前·第二问', '子丑寅卯辰']] as const) {
    const page = await eventsOf(rt2.client, sid)
    expect(page.hasMore, 'whole history in one page').toBe(false)
    expect(realUserTexts(page)).toEqual([prompt])
    expect(assistantTexts(page)).toContain(reply)
    expect(turnEndReasons(page)).toEqual(['completed'])
  }
  rt2.client.close()
  rt.client.close()
  await killTree9(rt2.child)
}, 120_000)

it('② kill -9 mid-stream: completed turns survive, the interrupted turn is closed by synthetic events after resume', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-t06-r2-'))
  const patch = fakeOverlay()
  const rt = await bootHome(home, patch)
  const sid = await createSession(rt.client, home)
  writeScriptCalls(home, sid, [
    scriptedCall(['甲', '乙', '丙', '丁', '戊']),
    scriptedCall(['子', '丑', '寅', '卯', '辰'], 't06-mid'),
  ])

  // Turn 1 completes; turn 2 parks the fake after chunk 1, mid-stream, gate never released.
  await runTurn(rt.client, sid, '重启前·完整一问', '甲')
  const stream = await rt.client.follow(sid)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })().catch(() => { /* killed mid-stream by design */ })
  await sendPrompt(rt.client, sid, '重启前·会被中断的一问')
  await waitForDelta(frames, '子', 15_000) // barrier receipt: the model call is streaming and parked
  await killTree9(rt.child)

  const rt2 = await bootHome(home, patch)
  const cold = await eventsOf(rt2.client, sid)
  expect(realUserTexts(cold)).toEqual(['重启前·完整一问', '重启前·会被中断的一问'])
  expect(assistantTexts(cold)).toContain('甲乙丙丁戊')
  expect(turnEndReasons(cold), 'cold view: turn 1 completed, interrupted turn closed by synthetic turn/end').toEqual(['completed', 'interrupted'])

  // One follow-up prompt resumes the Agent (closers persisted, dsh-sessions.md:50);
  // the fake's in-memory cursor restarts at call 0, so turn 3 replays 甲乙丙丁戊.
  const stream2 = await rt2.client.follow(sid)
  const frames2: Frame[] = []
  const drained2 = (async () => { for await (const f of stream2) frames2.push(f) })()
  await sendPrompt(rt2.client, sid, '重启后·续聊一问')
  await waitForDelta(frames2, '甲', 15_000)
  await waitForTurnEnd(frames2, 15_000)
  stream2.cancel()
  void drained2

  const page = await eventsOf(rt2.client, sid)
  expect(realUserTexts(page)).toEqual(['重启前·完整一问', '重启前·会被中断的一问', '重启后·续聊一问'])
  expect(assistantTexts(page)).toContain('甲乙丙丁戊')
  expect(turnEndReasons(page), 'resumed log: completed / interrupted(completed by resume) / completed').toEqual(['completed', 'interrupted', 'completed'])
  stream.cancel()
  void drained
  rt2.client.close()
  rt.client.close()
  await killTree9(rt2.child)
}, 120_000)
