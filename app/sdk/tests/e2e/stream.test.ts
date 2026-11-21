// T-02 acceptance ①–④ (PLAN p2-sdk T-02 / D7 伪流式证伪), one test per item:
// ① keyless harness on a temp DSH_HOME ② first-chunk gate-file barrier with
// K≥3 deltas in order before turn end ③ whole-turn-buffering relay negative
// control (same first-chunk logic must go red) ④ re-run with a different
// prompt + text to rule out fixture overfit.
import { expect, it } from 'vitest'
import { DshClient } from '../../examples/lib/client.mjs'
import { MuxSocket } from '../../examples/lib/mux.mjs'
import {
  childEnvHas,
  createSession,
  KEY_VARS,
  launchFakeRuntime,
  PIECES_A,
  PIECES_B,
  PROMPT_A,
  PROMPT_B,
  runScriptedTurn,
  sendPrompt,
  waitForDelta,
  type Frame,
} from '../support/fake/harness.ts'
import { startBufferingRelay } from '../support/fake/relay.mjs'

const isTextDelta = (f: Frame): boolean =>
  f.type === 'assistant-stream' && f.frame?.type === 'chunk' && f.frame.chunk?.type === 'text-delta'

it('① harness: temp DSH_HOME, real keys cleared, keyless scripted turn completes', async () => {
  // Seed a sentinel key, then prove the harness clears it before launch.
  process.env.P2SDK_LLM_API_KEY = 'sk-p2sdk-sentinel-not-a-real-key'
  const rt = await launchFakeRuntime()
  try {
    expect(rt.home).toMatch(/p2sdk-runtime-/)
    for (const name of KEY_VARS) {
      expect(childEnvHas(rt.child.pid ?? 0, name), `${name} must not reach the runtime`).toBe(false)
    }
    const turn = await runScriptedTurn(rt, { prompt: PROMPT_A, pieces: PIECES_A })
    expect(turn.fullText).toBe(PIECES_A.join(''))
  } finally {
    await rt.stop()
  }
})

it('② first-chunk barrier: gate released only after the client receives chunk 1; K deltas in order before turn end', async () => {
  expect(PIECES_A.length, 'K >= 3').toBeGreaterThanOrEqual(3)
  const rt = await launchFakeRuntime()
  try {
    const turn = await runScriptedTurn(rt, { prompt: PROMPT_A, pieces: PIECES_A, gateId: 't02-first' })
    expect(turn.fullText).toBe(PIECES_A.join(''))
    expect(turn.lastDeltaIndex).toBeLessThan(turn.turnEndIndex)
  } finally {
    await rt.stop()
  }
})

it('③ negative control: a whole-turn-buffering relay makes the same first-chunk wait reject', async () => {
  const rt = await launchFakeRuntime()
  const relay = await startBufferingRelay({ baseUrl: rt.baseUrl, token: rt.token })
  try {
    const socket = new MuxSocket(relay.url, relay.cookie)
    await socket.ready
    const relayed = new DshClient({ baseUrl: rt.baseUrl, cookie: relay.cookie, socket })

    const sessionId = await createSession(rt.client, rt.home)
    rt.writeScript(sessionId, PIECES_A, 't02-neg') // gate never released in this test
    const frames: Frame[] = []
    const relayStream = await relayed.follow(sessionId)
    const drained = (async () => {
      for await (const f of relayStream) frames.push(f)
    })()
    await sendPrompt(rt.client, sessionId, PROMPT_A)

    // Same first-chunk logic as ②, behind the relay: must time out at 5s.
    await expect(waitForDelta(frames, PIECES_A[0])).rejects.toThrow(/first chunk/)
    expect(frames.filter(isTextDelta), 'no delta leaked before the whole turn flushed').toHaveLength(0)

    relayStream.cancel()
    void drained // cancel is locally terminal; the loop settles on relay/stop teardown
  } finally {
    relay.close()
    await rt.stop()
  }
})

it('④ re-run with a different prompt: same barrier assertions hold, fake recorded the new prompt', async () => {
  const rt = await launchFakeRuntime()
  try {
    const turn = await runScriptedTurn(rt, { prompt: PROMPT_B, pieces: PIECES_B, gateId: 't02-rerun' })
    expect(PIECES_B.join(''), '④ uses a different text fixture').not.toBe(PIECES_A.join(''))
    expect(turn.fullText).toBe(PIECES_B.join(''))
    expect(turn.lastDeltaIndex).toBeLessThan(turn.turnEndIndex)
    const requests = rt.readRequests()
    expect(requests.length).toBeGreaterThanOrEqual(1)
    const last = requests[requests.length - 1]
    expect(last.userTexts, 'the fake received the new prompt').toContain(PROMPT_B)
    expect(last.userTexts).not.toContain(PROMPT_A)
  } finally {
    await rt.stop()
  }
})
