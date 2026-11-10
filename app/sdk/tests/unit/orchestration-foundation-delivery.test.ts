// P6-21 delivery 真 Loader 用例（验收 ⑤）：同键投两次 → 落盘恰 1 条；用户
// 手发的 source.kind='user' 消息不被当成已投；send 返回即 flush（回执语义）。
// Boots the real Loader (scripts/start.mjs, mock provider + scripted fake LLM +
// tests/support/orchestration-foundation-plugin.mjs via P2SDK_PATCH), drives
// session/prompt as the human, and reaches delivery only through the plugin's
// typert remote — the same shape P6-09's probe used.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')

// sandbox hygiene: tests run under a throwaway HOME (PLAN §2 通用约定) and
// the runtime data root stays off the real user config.
process.env.HOME = tmkdir('bot-p621-home-')

/** Overlay: fake provider (same rows as tests/support/fake/harness.ts overlayEnv) + the P6-21 plugin. */
const patchDir = tmkdir('bot-p621-patch-')
const overlay = join(patchDir, 'p621.yml')
writeFileSync(
  overlay,
  `\
# P6-21 generated overlay (tests/unit/orchestration-foundation-delivery.test.ts).
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
    - id: p621-foundation
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-foundation-plugin.mjs')).href}'
`,
)

const home = tmkdir('bot-p621-runtime-')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(join(home, 'gates'), { recursive: true })

let rt: Runtime
const control = (request: object) => rt.client.call('p621/control', { request })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Projected {
  events: Array<{ type: string; id?: string; sourceKind?: string; inserted?: Array<{ id: string }>; reason?: string }>
}

async function read(sessionId: string): Promise<Projected['events']> {
  return ((await control({ op: 'read', sessionId })) as Projected).events
}

async function untilTurnEnds(sessionId: string, count: number, label: string) {
  const deadline = Date.now() + 30_000
  for (;;) {
    const events = await read(sessionId)
    if (events.filter((e) => e.type === 'turn/end').length >= count) return events
    if (Date.now() > deadline) throw new Error(`${label}: timed out; last events ${JSON.stringify(events).slice(0, 2000)}`)
    await sleep(150)
  }
}

function writeScript(sessionId: string, replies: string[]) {
  const calls = replies.map((text) => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ], paceMs: 10 }))
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

beforeAll(async () => {
  rt = await launchRuntime({ env: { P2SDK_PATCH: overlay, P2SDK_HOME: home, PBOTS_DATA_DIR: join(home, 'data') } })
}, 120_000)

afterAll(async () => {
  await rt.stop()
})

it('delivers each stable id exactly once; user-authored messages never count as delivered', { timeout: 120_000 }, async () => {
  const { sessionId: W } = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }
  writeScript(W, ['hello', 'done'])

  // human sends a real message through the user RPC → source.kind 'user'
  await rt.client.call('session/prompt', {
    request: { requestId: `p621-user-${Date.now()}`, sessionId: W, mode: 'queue', content: [{ type: 'text', text: '用户手发' }] },
  })
  const afterUser = await untilTurnEnds(W, 1, 'user turn')
  const userMessage = afterUser.find((e) => e.type === 'user/message' && e.sourceKind === 'user')
  expect(userMessage, 'the human prompt landed as a persisted user/message').toBeTruthy()

  // a user-authored id is never "delivered by us" (deliveryIdOf owns pbots kinds only)
  expect((await control({ op: 'holds', sessionId: W, id: userMessage!.id! })) as { holds: boolean }).toEqual({ holds: false })

  // deliver our own message once; send resolves only after flush, so the log
  // is already readable at return (receipt semantics)
  const message = {
    id: 'pbots-assign:p621-1',
    role: 'user',
    content: [{ type: 'text', text: '去做一件事' }],
    source: { kind: 'pbots-main', form: 'relay', assignmentId: 'p621-1', mainBotId: 'p621-main' },
  }
  const first = (await control({ op: 'deliver', sessionId: W, message })) as { skipped: boolean }
  expect(first).toEqual({ skipped: false })
  const immediatelyAfter = await read(W)
  expect(
    immediatelyAfter.filter((e) => e.type === 'agent/inbox/spliced' && (e.inserted ?? []).some((m) => m.id === 'pbots-assign:p621-1')).length,
    'flush-before-receipt: the insert splice is visible the moment send returns',
  ).toBeGreaterThanOrEqual(1)

  await untilTurnEnds(W, 2, 'assignment turn')
  const landed = async () => (await read(W)).filter((e) => e.type === 'user/message' && e.id === 'pbots-assign:p621-1').length
  expect(await landed()).toBe(1)

  // same stable id again → history check skips; still exactly one persisted copy
  const second = (await control({ op: 'deliver', sessionId: W, message })) as { skipped: boolean }
  expect(second).toEqual({ skipped: true })
  expect(await landed()).toBe(1)
  expect((await control({ op: 'holds', sessionId: W, id: 'pbots-assign:p621-1' })) as { holds: boolean }).toEqual({ holds: true })
})

// P6-21.f1 (L-9): two concurrent sends of the same id must deliver exactly
// once — the idle-target double insert and the busy-target 'already pending'
// throw both stem from holds()→followup not being single-flighted.
it('two concurrent same-id sends deliver exactly once (L-9 f1)', { timeout: 120_000 }, async () => {
  const { sessionId: C } = (await rt.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }
  writeScript(C, ['ok']) // the woken assignment turn, if any, needs one reply
  const message = {
    id: 'pbots-assign:p621f1-1',
    role: 'user',
    content: [{ type: 'text', text: '并发投递' }],
    source: { kind: 'pbots-main', form: 'relay', assignmentId: 'p621f1-1', mainBotId: 'p621-main' },
  }
  const settled = await Promise.allSettled([
    control({ op: 'deliver', sessionId: C, message }),
    control({ op: 'deliver', sessionId: C, message }),
  ])
  expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']) // no 'already pending' rejection
  const skipped = settled.map((s) => (s.status === 'fulfilled' ? (s.value as { skipped: boolean }).skipped : 'rejected')).sort().map(String)
  expect(skipped).toEqual(['false', 'true'])
  const events = await read(C)
  expect(
    events.filter((e) => e.type === 'agent/inbox/spliced' && (e.inserted ?? []).some((m) => m.id === message.id)).length,
    'exactly one insert splice for the stable id (修复前空闲目标可落两条)',
  ).toBe(1)
})
