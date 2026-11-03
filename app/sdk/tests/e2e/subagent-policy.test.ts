// P5-05 acceptance ③④ (PLAN p5-parity P5-05, G1-r2 #1 A-H1 子代理 never 侧门):
// a root session delegating through subagent / subagent_fork / workflow gets
// an in-process child whose approval policy upstream pins to 'never'
// (deepseek-harness packages/subagent/subagent/src/child-agent.ts
// captureDelegatedPolicyOverrides → approval/policy {policy:'never',
// source:'delegation'}; workflow children go through the same
// subagents.startActivation, workflow-ptc/src/host.ts:203). Before the fix,
// shell-ask's T-12.f1 never-release let the child's ordinary bash execute with
// zero user interaction — the side door. This file's red run on unpatched main
// is the positive control (acceptance ④): the child's `m` file EXISTS. After
// the fix the child's bash is denied locally ('approval unavailable in this
// session', no approval/request dispatched for it), while a plain root
// session's identical command still produces the approval card (acceptance ③).
import { expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchFakeRuntime, sendPrompt, waitFor, type Frame, type FakeRuntime } from '../support/fake/harness.ts'
import type { Runtime } from '../support/runtime.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The installed PTC worker bootstrap (self-contained ESM bundle, lib/process.js). */
function ptcBootstrapSource(): string {
  const store = join(PKG_ROOT, 'node_modules', '.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))
  if (!hit) throw new Error('dsh-ptc-runtime-node not found in the pnpm store')
  return join(store, hit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js')
}

/** One $events downlink frame (gateway stream-protocol.ts RemoteEventDownlinkFrame). */
interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  clientId?: string
  request?: { toolName?: string; callId?: string; reason?: string }
}

/** One answer-mode client's $events subscription (interactions=answer). */
interface EventsFeed {
  client: DshClient
  frames: EventsFrame[]
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

/** Wait for one session's nth approval/request frame (copied from approval.test.ts). */
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

/** Wait until the followed stream saw its nth durable turn/end. */
async function waitForTurnEnds(frames: Frame[], count: number): Promise<void> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const ends = frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length
    if (ends >= count) return
    if (Date.now() >= deadline) {
      throw new Error(`timed out after 30000ms waiting for turn/end #${count} (saw ${ends})`)
    }
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Scripted tool call, chunk vocabulary from upstream mock-adapter (see approval.test.ts bashCall). */
function toolCall(name: string, args: Record<string, unknown>): object {
  const id = `p2sdk-p505-${Math.random().toString(16).slice(2, 8)}`
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

function bashCall(command: string): object {
  // description is a required bash-tool argument (tool-bash parameters schema).
  return toolCall('bash', { command, description: 'P5-05 child shell probe' })
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

/**
 * Runtime for this file: the harness fake-provider overlay PLUS a ptc-runtime
 * worker override (interpreter /usr/bin/node + a bootstrap copied into the
 * session workspace). The bwrap workspace-write profile mounts a private tmpfs
 * over /tmp; run from a /tmp worktree the default worker (the pnpm-managed
 * node and the pnpm-store bootstrap) sit under that tmpfs and the sandbox
 * cannot see them (sandbox-unavailable / worker-exit ENOENT). /usr/bin/node is
 * visible through the read-only root bind, and the workspace is bind-mounted
 * at its own absolute path, so the in-workspace bootstrap copy resolves inside
 * the sandbox. Test-environment accommodation only — the sandbox, the
 * delegation, and the approval policy under test are untouched.
 */
async function launchSubagentRuntime(): Promise<FakeRuntime & { work: string }> {
  const work = mkdtempSync(join(tmpdir(), 'p2sdk-p505-work-'))
  const bootstrap = join(work, '.p505-ptc-boot.mjs')
  copyFileSync(ptcBootstrapSource(), bootstrap)
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-p505-patch-'))
  const overlay = join(dir, 'p505.yml')
  writeFileSync(
    overlay,
    `\
# P5-05 generated overlay (tests/e2e/subagent-policy.test.ts): fake provider
# rows (same assembly as tests/support/fake/harness.ts) + the ptc-runtime
# worker override documented in launchSubagentRuntime().
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
`,
  )
  const rt = await launchFakeRuntime({ env: { P2SDK_PATCH: overlay } })
  return { ...rt, work }
}

/** Create a root session whose cwd is the shared workspace. */
async function createRootSession(rt: FakeRuntime & { work: string }): Promise<string> {
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd: rt.work } })) as { sessionId: string }
  expect(sessionId, 'session/create returned a sessionId').toBeTypeOf('string')
  return sessionId
}

/**
 * Script every runtime-assigned child (fake plugin default.json fallback): one
 * bash probe turn writing `m`, one closing text turn. Children's session ids
 * are unknown to the test until their first model call lands in requests.jsonl.
 */
function writeChildScript(rt: FakeRuntime, m: string): void {
  const dir = join(rt.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'default.json'), JSON.stringify({ calls: [bashCall(`echo x > ${m}`), textCall('子代理完成')] }))
}

/** Poll the fake request log until a model call ran outside the root session. */
async function childSessionId(rt: FakeRuntime, exclude: string, ms = 30_000): Promise<string> {
  const deadline = Date.now() + ms
  for (;;) {
    const hit = rt.readRequests().find((r) => r.sessionId !== null && r.sessionId !== exclude)
    if (hit) return hit.sessionId as string
    if (Date.now() >= deadline) {
      throw new Error(`no child model call observed outside ${exclude} within ${ms}ms`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

/**
 * Wait until the child ran its SECOND model call. The child's script is
 * [bash probe, closing text]: call #1 only happens after the bash tool result
 * (denied or executed) returned, so once it lands the m-file question is
 * settled. The gateway refuses direct session/follow on subagent children
 * ("subagent Sessions require their durable parent address"), so the request
 * log is the observation channel.
 */
async function waitChildSettled(rt: FakeRuntime, child: string, ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms
  for (;;) {
    const calls = rt.readRequests().filter((r) => r.sessionId === child).length
    if (calls >= 2) return
    if (Date.now() >= deadline) {
      throw new Error(`child ${child} settled only ${calls}/2 model calls within ${ms}ms`)
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

/**
 * One delegation probe: the root calls `delegation` (a scripted tool call the
 * caller provides), the child's bash `echo x > m` must be DENIED — m absent and
 * no approval/request dispatched for the child (a local deny never asks).
 */
async function assertChildDenied(
  rt: FakeRuntime & { work: string },
  feed: EventsFeed,
  delegation: object,
  m: string,
): Promise<void> {
  const root = await createRootSession(rt)
  // Extra trailing text turns absorb the subagent completion notice turns.
  rt.writeScriptCalls(root, [delegation, textCall('已委派'), textCall('通知一'), textCall('通知二'), textCall('通知三')])
  writeChildScript(rt, m)

  await sendPrompt(rt.client, root, 'P5-05 委派探针')
  const child = await childSessionId(rt, root)
  await waitChildSettled(rt, child)
  expect(existsSync(m), `delegated child's bash was denied: ${m} must not exist (G1-r2 #1)`).toBe(false)
  expect(
    feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === child),
    'the denied child dispatched no approval request',
  ).toHaveLength(0)
}

/** The root-session control (acceptance ③ tail): the SAME command in a plain
 * root session still produces the approval card; rejecting it leaves no file. */
async function assertRootStillAsks(rt: FakeRuntime & { work: string }, feed: EventsFeed, mRoot: string): Promise<void> {
  const root = await createRootSession(rt)
  rt.writeScriptCalls(root, [bashCall(`echo x > ${mRoot}`), textCall('根会话完成')])
  const stream = await follow(rt.client, root)
  try {
    await sendPrompt(rt.client, root, '根会话同一条命令')
    const asked = await waitForApproval(feed, root, 1)
    expect(asked.request?.toolName, 'the root session still asks for ordinary bash').toBe('bash')
    await feed.answer(asked, 'rejected')
    await waitForTurnEnds(stream.frames, 1)
    expect(existsSync(mRoot), 'the rejected root call left no file').toBe(false)
  } finally {
    stream.stop()
  }
}

async function runDelegationCase(delegation: object, mName: string): Promise<void> {
  const rt = await launchSubagentRuntime()
  const feed = await openEvents(rt)
  try {
    const m = join(rt.work, mName)
    await assertChildDenied(rt, feed, delegation, m)
    await assertRootStillAsks(rt, feed, `${m}-root`)
  } finally {
    feed.close()
    await rt.stop()
  }
}

it('P5-05 ③ subagent: child bash under the pinned never policy is denied; the root still asks', async () => {
  await runDelegationCase(
    toolCall('subagent', { description: 'P5-05 probe', prompt: 'run the shell probe and report' }),
    'm-subagent',
  )
})

it('P5-05 ③ subagent_fork: child bash under the pinned never policy is denied; the root still asks', async () => {
  await runDelegationCase(
    toolCall('subagent_fork', { description: 'P5-05 probe', prompt: 'run the shell probe and report' }),
    'm-fork',
  )
})

it('P5-05 ③ workflow: agent() child bash under the pinned never policy is denied; the root still asks', async () => {
  await runDelegationCase(
    toolCall('workflow', {
      script: 'return await agent("run the shell probe and report")',
      meta: { name: 'p5-05-probe', description: 'P5-05 delegated child shell probe' },
    }),
    'm-workflow',
  )
})
