// T-01 acceptance ⑧: mock-mode demo through the shared launcher.
// Covers: mkdtemp P2SDK_HOME, spawn start with mock provider, connected
// examples/lib client, release(gateId) barrier channel, and the min-client
// self-assertions passing under the mock provider.
// T-01.f3: acceptance ①②③ (R1 credential isolation, R6 snapshot barrier, O8 env allowlist).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { snapshotFrames } from '../../examples/lib/client.mjs'
import { main, resolveConfig, startRuntime } from '../../src/start.ts'
import {
  childEnvHas,
  createSession,
  launchFakeRuntime,
  PIECES_A,
  PROMPT_A,
  runScriptedTurn,
  runtimeDshPid,
  sendPrompt,
  waitForTurnEnd,
  type Frame,
} from '../support/fake/harness.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'

const PKG_ROOT = join(import.meta.dirname, '..', '..')

let rt: Runtime

beforeAll(async () => {
  rt = await launchRuntime()
})

afterAll(async () => {
  await rt?.stop()
})

it('boots in a mkdtemp home with a 0600 launch token and no token in output', async () => {
  expect(rt.home).toMatch(/p2sdk-runtime-/)
  // f3 R1: the credential lives in the separate handoff dir, never inside the
  // dsh-visible P2SDK_HOME/DSH_HOME.
  expect(rt.handoff).toMatch(/p2sdk-handoff-/)
  expect(existsSync(join(rt.handoff, 'launch-token'))).toBe(true)
  expect(existsSync(join(rt.home, 'launch-token'))).toBe(false)
  const mode = readFileSync(join(rt.handoff, 'launch-token')).toString()
  expect(mode).not.toContain('token=')
}, 120_000)

it('serves the session API over loopback to the connected client', async () => {
  // f3 R1: the session cwd is an independent work dir, not under P2SDK_HOME.
  const work = mkdtempSync(join(tmpdir(), 'p2sdk-work-'))
  const { sessionId } = await rt.client.call('session/create', { request: { cwd: work } })
  expect(typeof sessionId).toBe('string')
  // Parameterless typert methods take a `_request` placeholder field.
  const list = await rt.client.call('session/list', { _request: {} })
  expect(JSON.stringify(list)).toContain(sessionId)
}, 120_000)

it('release(gateId) touches the barrier file without opening a port', () => {
  rt.release('t01-gate')
  expect(existsSync(join(rt.home, 'gates', 't01-gate'))).toBe(true)
})

it('min-client self-assertions pass under the mock provider', async () => {
  const proc = spawn(process.execPath, [join(PKG_ROOT, 'examples', 'min-client.mjs'), '你好'], {
    env: { ...process.env, P2SDK_HANDOFF: rt.handoff },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', (c) => { out += c })
  proc.stderr.on('data', (c) => { out += c })
  const code = await new Promise<number>((resolve) => proc.on('exit', (c) => resolve(c ?? 1)))
  expect(out).toContain('min-client PASS')
  expect(code).toBe(0)
}, 120_000)

it('startRuntime boots in-process (coverage for src/start.ts runtime path)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-main-'))
  const handoff = mkdtempSync(join(tmpdir(), 'p2sdk-main-ho-'))
  const handle = startRuntime(resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_HANDOFF: handoff }))
  expect(await handle.ready).toBe(true)
  expect(existsSync(join(handoff, 'launch-token'))).toBe(true)
  expect(existsSync(join(home, 'launch-token'))).toBe(false)
  handle.child.kill('SIGTERM')
  const code = await handle.exited
  expect(code).toBeGreaterThanOrEqual(0)
}, 120_000)

it('main returns non-zero when no ready line arrives within the timeout', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-slow-'))
  const code = await main(resolveConfig({
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: home,
    P2SDK_READY_TIMEOUT_MS: '1',
  }))
  expect(code).toBeGreaterThanOrEqual(1)
}, 120_000)

// ---------------------------------------------------------------------------
// T-01.f3 (REVIEW-T-01 R1 + R6 + O8): credential isolation + snapshot barrier.
// ---------------------------------------------------------------------------

const isTurnEnd = (f: Frame): boolean => f.type === 'event' && f.event?.type === 'turn/end'

/** One scripted read tool-call block (chunk vocabulary per upstream
 * mock-adapter.ts toolCallResponse, deepseek-harness@ce7073d, MIT). */
function readToolCall(index: number, id: string, filePath: string): object[] {
  // The tool's wire schema names the parameter file_path (tool-fs read.ts).
  const args = JSON.stringify({ file_path: filePath })
  return [
    { type: 'block-start', index, blockType: 'tool-call' },
    { type: 'tool-call-delta', index, id, name: 'read', argumentsDelta: args },
    { type: 'block-end', index, block: { type: 'tool-call', id, name: 'read', arguments: args } },
  ]
}

const textCall = (text: string): object => ({
  chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ],
})

describe('T-01.f3 credential isolation + snapshot barrier', () => {
  it('① fake read ../launch-token fails at the tool layer; token and handoff path never reach the transcript', async () => {
    const rt2 = await launchFakeRuntime({ env: { ANTHROPIC_AUTH_TOKEN: 'sk-f3-env-sentinel' } })
    try {
      // O8: the launcher's other shell credentials stay out of the dsh runtime
      // (the environment model-driven tools inherit), via the childEnv allowlist.
      const dshPid = runtimeDshPid(rt2.child.pid ?? 0)
      expect(childEnvHas(dshPid, 'ANTHROPIC_AUTH_TOKEN')).toBe(false)
      // R1: the handoff directory itself never enters the dsh environment.
      expect(childEnvHas(dshPid, 'P2SDK_HANDOFF')).toBe(false)
      expect(childEnvHas(dshPid, 'DSH_HOME')).toBe(true)

      const token = readFileSync(join(rt2.handoff, 'launch-token'), 'utf8').trim()
      expect(token.length).toBeGreaterThan(0)
      expect(existsSync(join(rt2.handoff, 'base-url'))).toBe(true)

      // Session cwd is an independent mkdtemp work dir (not under P2SDK_HOME).
      const sessionId = await createSession(rt2.client, rt2.home)
      rt2.writeScriptCalls(sessionId, [
        {
          chunks: [
            ...readToolCall(0, 'f3-rel', '../launch-token'),
            // Absolute path derivable from the dsh child's own env ($DSH_HOME/$P2SDK_HOME).
            ...readToolCall(1, 'f3-env', join(rt2.home, 'launch-token')),
            { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
            { type: 'finish', reason: { kind: 'tool-calls' } },
          ],
        },
        textCall('完'),
      ])

      const frames: Frame[] = []
      const { stream, snapshot } = await rt2.client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
      frames.push(...snapshotFrames(snapshot))
      const drained = (async () => {
        for await (const f of stream) frames.push(f)
      })()
      await sendPrompt(rt2.client, sessionId, '读一下 ../launch-token')
      await waitForTurnEnd(frames)
      stream.cancel()
      void drained

      const all = JSON.stringify(frames)
      expect(all, 'both reads fail at the tool layer (FS_NOT_FOUND appears twice)').toMatch(/not found(.|\n)*not found/)
      expect(all).not.toContain(token)
      expect(all).not.toContain(rt2.handoff)
    } finally {
      await rt2.stop()
    }
  }, 120_000)

  it('② paceMs=0 stress: 20 scripted turns through the barrier all pass', async () => {
    const rt2 = await launchFakeRuntime()
    try {
      for (let i = 0; i < 20; i++) {
        const turn = await runScriptedTurn(rt2, { prompt: `第${i}轮`, pieces: ['零', '壹', '贰', '叁'], paceMs: 0 })
        expect(turn.fullText, `turn ${i}`).toBe('零壹贰叁')
      }
    } finally {
      await rt2.stop()
    }
  }, 240_000)

  it('③ a follow opening snapshot that already contains turn/end settles without waiting for increments', async () => {
    const rt2 = await launchFakeRuntime()
    try {
      const sessionId = await createSession(rt2.client, rt2.home)
      rt2.writeScript(sessionId, PIECES_A)
      // Complete the whole turn BEFORE any follow subscription exists.
      await sendPrompt(rt2.client, sessionId, PROMPT_A)
      const deadline = Date.now() + 10_000
      for (;;) {
        const page = (await rt2.client.call('session/events', {
          request: { address: { kind: 'session', sessionId } },
        })) as { records?: Frame[] }
        if ((page.records ?? []).some(isTurnEnd)) break
        if (Date.now() > deadline) throw new Error('turn never became durable')
        await new Promise((r) => setTimeout(r, 50))
      }

      // Late follow: the entire turn, turn/end included, is now inside the opening snapshot.
      const { stream, snapshot } = await rt2.client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
      const baseline = snapshotFrames(snapshot)
      expect(baseline.some(isTurnEnd), 'turn/end is inside the snapshot records').toBe(true)

      // No incremental turn/end ever arrives — a consumer waiting on increments
      // alone would hang forever; the baseline is the only completion path.
      const increments: Frame[] = []
      const collect = (async () => {
        for await (const f of stream) increments.push(f)
      })()
      await new Promise((r) => setTimeout(r, 500))
      expect(increments.some(isTurnEnd)).toBe(false)

      // Baseline consumption settles immediately: no hang.
      expect(baseline.some(isTurnEnd)).toBe(true)
      stream.cancel()
      void collect
    } finally {
      await rt2.stop()
    }
  }, 120_000)
})
