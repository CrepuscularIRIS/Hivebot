// T-07 acceptance (PLAN p2-sdk T-07 / BRIEF §6 D8), five segments:
// ① the scripted fake model issues an ORDINARY bash call (no sandbox_permissions)
//    `touch <workspace>/canary`; an interactions=answer client receives it on
//    the gateway's $events stream as an approval/request waterfall frame whose
//    agentId IS the calling session's sessionId (Agent.id is the SessionId,
//    packages/core/agent/src/index.ts:219; the gateway projects the Agent away
//    and forwards agentId — stream-protocol.ts projectRemoteEventRequest).
// ② answering 'rejected' → the command never runs → canary absent.
// ③ two live sessions X/Y pending at once: approving Y's request (sessionId
//    不符 for X) leaves X's canary absent — approvals are session-isolated.
// ④ answering 'allowed-once' for the right session → canary exists.
// ⑤ a fresh session's resolved default permission is neither 'bypass' nor
//    'danger-full-access' (permissionPresets/catalog defaultPreset, the pinned
//    sandbox/mode + approval/policy durable events, the permissions projection).
//
// Preset-only probe: P2SDK_T07_PRESET_ONLY=1 boots WITHOUT
// profile/patches/approval.yml — the pure dsh permission-preset composition
// (approval policy 'ask' via the preset table). That run stays red at segment ①
// because presets cannot express "an ordinary shell call must ask"
// (tool-bash only asks on explicit sandbox_permissions escalation,
// packages/shell/tool-bash/src/index.ts approveBashEscalation). The captured
// red output is evidence/D8-preset-only-red.txt and motivated src/policy.
import { expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, sendPrompt, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** One $events downlink frame (gateway stream-protocol.ts RemoteEventDownlinkFrame). */
interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  clientId?: string
  request?: { toolName?: string; callId?: string; reason?: string }
}

/** Whether this run drops profile/patches/approval.yml (the preset-only red probe). */
const PRESET_ONLY = process.env.P2SDK_T07_PRESET_ONLY === '1'

/** Fake overlay: the scripted provider, T-02 pattern (tests/support/fake/plugin.mjs). */
function buildFakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-t07-patch-'))
  const overlay = join(dir, 't07-overlay.yml')
  writeFileSync(
    overlay,
    `\
# T-07 generated overlay (tests/e2e/approval.test.ts).
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
`,
  )
  return overlay
}

interface ApprovalRuntime extends Runtime {
  /** Write the scripted model-call list for one session (bash + text turns). */
  writeScript(sessionId: string, calls: object[]): void
}

/** Boot the fake-provider runtime; the approval policy patch joins unless PRESET_ONLY. */
async function launchApprovalRuntime(): Promise<ApprovalRuntime> {
  clearRealKeys()
  const approvalYml = join(PKG_ROOT, 'profile', 'patches', 'approval.yml')
  const patches = PRESET_ONLY
    ? buildFakeOverlay()
    : `${buildFakeOverlay()}:${approvalYml}`
  const rt = await launchRuntime({ env: { P2SDK_PATCH: patches } })
  return {
    ...rt,
    writeScript(sessionId: string, calls: object[]) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
}

/** Scripted bash tool call — chunk vocabulary copied from upstream mock-adapter
 * toolCallResponse (来源: deepseek-harness@ce7073d packages/core/agent-loop/tests/mock-adapter.ts). */
function bashCall(command: string): object {
  const id = `p2sdk-t07-${Math.random().toString(16).slice(2, 8)}`
  // description is a required bash-tool argument (tool-bash parameters schema).
  const argumentsJson = JSON.stringify({ command, description: 'Create the D8 approval canary file' })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

/** Scripted plain-text answer (the post-tool model call that closes the turn). */
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

/** Create a session whose cwd exists (the canary lands inside the workspace). */
async function createSessionAt(client: DshClient, home: string): Promise<string> {
  const cwd = join(home, 'workspace')
  mkdirSync(cwd, { recursive: true })
  const { sessionId } = (await client.call('session/create', { request: { cwd } })) as { sessionId: string }
  expect(sessionId, 'session/create returned a sessionId').toBeTypeOf('string')
  return sessionId
}

/** One answer-mode client's $events subscription (interactions=answer is what
 * the gateway requires for $events; only owner peers may answer waterfalls). */
interface EventsFeed {
  client: DshClient
  frames: EventsFrame[]
  /** Resolve one pending approval waterfall with an ApprovalOutcome string. */
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

async function openEvents(rt: Runtime): Promise<EventsFeed> {
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => {
    for await (const f of stream) frames.push(f as EventsFrame)
  })()
  const ready = await waitFor(frames, (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames[ready].clientId ?? ''
  return {
    client,
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() {
      stream.cancel()
      void drained
      client.close()
    },
  }
}

/** The approval/request waterfall frame for one session (agentId = sessionId). */
function approvalFor(feed: EventsFeed, sessionId: string): EventsFrame {
  const frame = feed.frames.find(
    (f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId,
  )
  expect(frame, `approval/request waterfall for session ${sessionId} arrived on $events`).toBeTruthy()
  return frame as EventsFrame
}

/** Follow a session and collect its frames until the stream is cancelled. */
async function follow(client: DshClient, sessionId: string): Promise<{ frames: Frame[]; stop(): void }> {
  const frames: Frame[] = []
  const stream = await client.follow(sessionId)
  const drained = (async () => {
    for await (const f of stream) frames.push(f)
  })()
  return {
    frames,
    stop() {
      stream.cancel()
      void drained
    },
  }
}

/** Wait for this session's nth approval/request frame (the ① FAIL clock). */
async function waitForApproval(feed: EventsFeed, sessionId: string, nth: number): Promise<EventsFrame> {
  const matches = (): number[] =>
    feed.frames.flatMap((f, i) =>
      f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId ? [i] : [])
  const deadline = Date.now() + 10_000
  for (;;) {
    const hits = matches()
    if (hits.length >= nth) return feed.frames[hits[nth - 1]]
    if (Date.now() >= deadline) {
      throw new Error(`timed out after 10000ms waiting for approval/request #${nth} for ${sessionId}`)
    }
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Wait until the followed stream saw its nth durable turn/end (prior turns' don't count as later ones). */
async function waitForTurnEnds(frames: Frame[], count: number): Promise<void> {
  const deadline = Date.now() + 15_000
  for (;;) {
    const ends = frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length
    if (ends >= count) return
    if (Date.now() >= deadline) {
      throw new Error(`timed out after 15000ms waiting for turn/end #${count} (saw ${ends})`)
    }
    await new Promise((r) => setTimeout(r, 20))
  }
}

it('D8: ordinary shell asks for approval; deny leaves no file; approve runs it; default permission is confined', async () => {
  const rt = await launchApprovalRuntime()
  const feed = await openEvents(rt)
  try {
    const s1 = await createSessionAt(rt.client, rt.home)
    const canaryDenied = join(rt.home, 'workspace', 'canary-denied')
    const canaryAllowed = join(rt.home, 'workspace', 'canary-allowed')
    rt.writeScript(s1, [
      bashCall(`touch ${canaryDenied}`),
      textCall('被拒绝'),
      bashCall(`touch ${canaryAllowed}`),
      textCall('被批准'),
    ])

    const stream = await follow(rt.client, s1)

    // ①+② first turn: ordinary bash call → approval request with sessionId → reject.
    await sendPrompt(rt.client, s1, '摸一下 canary-denied')
    const asked1 = await waitForApproval(feed, s1, 1)
    expect(asked1.request?.toolName, 'the approval names the bash tool').toBe('bash')
    expect(asked1.agentId, 'the approval carries the calling sessionId').toBe(s1)
    await feed.answer(asked1, 'rejected')
    await waitForTurnEnds(stream.frames, 1)
    expect(existsSync(canaryDenied), 'rejected shell call left no canary').toBe(false)

    // ④ second turn: approve the right session's request → the command runs.
    await sendPrompt(rt.client, s1, '摸一下 canary-allowed')
    const asked2 = await waitForApproval(feed, s1, 2)
    expect(asked2.eventId, 'each ask is a distinct request').not.toBe(asked1.eventId)
    await feed.answer(asked2, 'allowed-once')
    await waitForTurnEnds(stream.frames, 2)
    expect(existsSync(canaryAllowed), 'approved shell call created the canary').toBe(true)

    // ⑤ resolved default permission: never bypass, never danger-full-access.
    const catalog = (await rt.client.call('permissionPresets/catalog', {})) as {
      defaultPreset: string
    }
    expect(catalog.defaultPreset, `catalog default preset is confining (got ${catalog.defaultPreset})`)
      .not.toBe('danger-full-access')
    expect(catalog.defaultPreset, 'no bypass-style default').not.toMatch(/bypass/i)

    const projections = (await rt.client.call('session/projections', { request: { sessionId: s1 } })) as {
      values: { permissions?: { currentValue?: string } }
    }
    const current = projections.values.permissions?.currentValue
    expect(current, `the session's resolved preset is confining (got ${current})`).not.toBe('danger-full-access')
    expect(current, 'no bypass-style preset').not.toMatch(/bypass/i)

    const events = (await rt.client.call('session/events', {
      request: { address: { kind: 'session', sessionId: s1 }, maxMessages: 200 },
    })) as { records: Array<{ type: string; event: { type: string; data?: { mode?: string; policy?: string } } }> }
    const sandboxMode = events.records.find((r) => r.event.type === 'sandbox/mode')?.event.data?.mode
    const approvalPolicy = events.records.find((r) => r.event.type === 'approval/policy')?.event.data?.policy
    expect(sandboxMode, `the pinned sandbox mode is confining (got ${sandboxMode})`).not.toBe('danger-full-access')
    expect(sandboxMode, 'no bypass-style sandbox mode').not.toMatch(/bypass/i)
    expect(approvalPolicy, 'the pinned approval policy asks').toBe('ask')

    stream.stop()
  } finally {
    feed.close()
    await rt.stop()
  }
})

it('D8: an approval granted in session Y does not release a pending shell call in session X', async () => {
  const rt = await launchApprovalRuntime()
  const feed = await openEvents(rt)
  try {
    // Two live sessions on the one runtime, each scripted to one bash turn.
    const x = await createSessionAt(rt.client, rt.home)
    const y = await createSessionAt(rt.client, rt.home)
    const canaryX = join(rt.home, 'workspace', 'canary-x')
    const canaryY = join(rt.home, 'workspace', 'canary-y')
    rt.writeScript(x, [bashCall(`touch ${canaryX}`), textCall('x 完成')])
    rt.writeScript(y, [bashCall(`touch ${canaryY}`), textCall('y 完成')])

    const streamX = await follow(rt.client, x)
    const streamY = await follow(rt.client, y)

    // Both shell calls pend on approval at the same time.
    await sendPrompt(rt.client, x, 'x 摸 canary-x')
    await sendPrompt(rt.client, y, 'y 摸 canary-y')
    const askedX = await waitForApproval(feed, x, 1)
    const askedY = await waitForApproval(feed, y, 1)
    expect(askedY.eventId, 'X and Y are distinct pending requests').not.toBe(askedX.eventId)

    // ③ approve the request whose sessionId is Y (不符 for X): Y runs, X must not.
    await feed.answer(askedY, 'allowed-once')
    await waitForTurnEnds(streamY.frames, 1)
    expect(existsSync(canaryY), 'Y own approval ran Y own command').toBe(true)
    expect(existsSync(canaryX), `X stays blocked while only Y's approval arrived`).toBe(false)

    // Settle X with a rejection; its canary must never appear.
    await feed.answer(askedX, 'rejected')
    await waitForTurnEnds(streamX.frames, 1)
    expect(existsSync(canaryX), 'X own rejected call left no canary').toBe(false)

    streamX.stop()
    streamY.stop()
  } finally {
    feed.close()
    await rt.stop()
  }
})
