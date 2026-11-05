// P6-26t: real launcher, scripted model, real ptc executor and approval service.
// Helpers adapted from write-outside.test.ts; every path derives from this run root.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// HOME 与区外探针互为兄弟，避免 HOME mask 先于区域判定拦截探针。
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'bot-p626t-'))
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME)
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const WS = join(DATA_DIR, 'workspaces', 'x')
// 区外目标仍在宿主 /tmp，从本次临时根派生，避免并行清扫其他测试。
const OUT_DIR = join(TEST_ROOT, 'outside')
mkdirSync(OUT_DIR, { recursive: true })
trackTmpDir(OUT_DIR)

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  request?: { toolName?: string; callId?: string; reason?: string; arguments?: unknown }
}

interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

interface WoRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
  readRequests(): Array<{ sessionId: string | null; toolResults?: Array<{ toolCallId: string | null; isError: boolean; text: string }> }>
}

const runtimes: WoRuntime[] = []

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bot-p626t-patch-'))
  trackTmpDir(dir)
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- id: ptc-runtime
  config:
    launch:
      kind: node-script
      executable: /usr/bin/node
      bootstrapPath: '${join(WS, '.ptc-boot.mjs')}'
- insert:
    - id: p626t-recorder
      name: '${pathToFileURL(join(PKG_ROOT, 'tests/support/p626t-recorder.mjs')).href}'
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

async function openFeed(rt: Runtime): Promise<Feed> {
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EventsFrame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as EventsFrame) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
}

async function launchWo(extraPatch?: string, home = mkdtempSync(join(tmpdir(), 'bot-p626t-dsh-'))): Promise<WoRuntime> {
  clearRealKeys()
  trackTmpDir(home)
  const patches = [fakeOverlay(), ...(extraPatch ? [extraPatch] : [])]
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_HOME: home,
      P2SDK_PATCH: patches.join(':'),
      PBOTS_DATA_DIR: DATA_DIR,
    },
  })
  const feed = await openFeed(rt)
  const t: WoRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    readRequests() {
      let raw: string
      try { raw = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return [] }
      return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    },
  }
  runtimes.push(t)
  return t
}

/** 一次性写全整段脚本（fake 游标按会话持有，二次覆盖会脱同步——P5-03 实测）。 */
async function scriptedSession(h: WoRuntime, cwd: string, calls: object[], preset = 'ptc', existing?: string): Promise<{
  sessionId: string
  next(answer?: 'rejected' | 'allowed-once' | 'none'): Promise<Frame[]>
}> {
  const sessionId = existing ?? ((await h.client.call('session/create', { request: { cwd, agentPreset: preset } })) as { sessionId: string }).sessionId
  h.writeScriptCalls(sessionId, calls.flatMap((c) => [c, textCall('P6-26t 完成')]))
  const answered = new Set<string>()
  return {
    sessionId,
    async next(answer = 'rejected'): Promise<Frame[]> {
      const stream = await h.client.follow(sessionId)
      const frames: Frame[] = []
      const drained = (async () => { for await (const f of stream) frames.push(f) })()
      await h.client.call('session/prompt', {
        request: { requestId: `p626t-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P6-26t 探针' }] },
      })
      const deadline = Date.now() + 60_000
      for (;;) {
        if (answer !== 'none') {
          for (const f of h.feed.frames) {
            if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
              answered.add(f.eventId ?? '')
              await h.feed.answer(f, answer)
            }
          }
        }
        if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
        if (Date.now() > deadline) {
          throw new Error(`turn/end 未到；answered=${answered.size}；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 400)}`)
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      stream.cancel()
      void drained
      return frames
    },
  }
}

function toolTurnCall(name: string, args: object): object {
  const id = `p626t-${Math.random().toString(16).slice(2, 8)}`
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

function askedCount(h: WoRuntime, sessionId: string): number {
  return h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
}

function toolResults(frames: Frame[]): Array<{ isError: boolean; text: string }> {
  const out: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    out.push({
      isError: data.message?.isError === true,
      text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n'),
    })
  }
  return out
}

function runCode(code: string): object {
  return toolTurnCall('run_code', { code, description: 'P6-26t process policy probe' })
}
function provision(rt: Runtime, paused = false): void {
  const instance = createHash('sha256').update(rt.token).digest('hex')
  writeFileSync(join(DATA_DIR, 'policy-state.json'), JSON.stringify({ version: 1, instance, paused }))
}
function cards(rt: WoRuntime, sessionId: string): EventsFrame[] {
  return rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
}

beforeAll(() => {
  mkdirSync(WS, { recursive: true })
  const store = join(PKG_ROOT, 'node_modules/.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))!
  copyFileSync(join(store, hit, 'node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/process.js'), join(WS, '.ptc-boot.mjs'))
})
afterAll(async () => {
  for (const rt of runtimes) {
    rt.feed.close()
    await rt.stop()
  }
})

it('⓪ enumerate user-selectable presets and model-visible tool tables', { timeout: 180_000 }, async () => {
  const rt = await launchWo()
  const list = await rt.client.call('agentPresets/list', {}) as { presets: Array<{ id: string }> }
  const presets = list.presets.filter((p) => !p.id.startsWith('p2temp-'))
  expect(presets.map((p) => p.id)).toContain('ptc')
  for (const preset of presets) {
    const sess = await scriptedSession(rt, WS, [], preset.id)
    rt.writeScriptCalls(sess.sessionId, [textCall('inventory')])
    await sess.next('none')
  }
  const inventory = readFileSync(join(rt.home, 'inventory.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  expect(inventory).toHaveLength(presets.length)
  if (process.env.P626T_INVENTORY) writeFileSync(process.env.P626T_INVENTORY, JSON.stringify({ presets, inventory }, null, 2))
})

it.skipIf(process.env.P626T_BASELINE !== '1')('① positive control on base: run_code creates a symlink without a card', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const code = "const fs = await import('node:fs/promises'); await fs.symlink('.', 'baseline-link'); return 'linked'"
  const sess = await scriptedSession(rt, WS, [runCode(code)])
  const result = toolResults(await sess.next('none'))[0]
  expect(result?.isError).toBe(false)
  expect(result?.text).toContain('linked')
  expect(existsSync(join(WS, 'baseline-link'))).toBe(true)
  expect(askedCount(rt, sess.sessionId)).toBe(0)
})

it('② missing state: reject blocks code; allowed-once executes and card contains full program', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  rmSync(join(DATA_DIR, 'policy-state.json'), { force: true })
  const code = "const fs = await import('node:fs/promises'); await fs.symlink('.', 'approved-link'); return 'linked'"
  const sess = await scriptedSession(rt, WS, [runCode(code), runCode(code)])
  const denied = toolResults(await sess.next('rejected'))[0]
  expect(askedCount(rt, sess.sessionId)).toBe(1)
  expect(JSON.stringify(cards(rt, sess.sessionId)[0])).toContain(code)
  expect(denied?.isError).toBe(true)
  expect(existsSync(join(WS, 'approved-link'))).toBe(false)
  const allowed = toolResults(await sess.next('allowed-once'))[0]
  expect(allowed?.isError).toBe(false)
  expect(allowed?.text).toContain('linked')
  expect(existsSync(join(WS, 'approved-link'))).toBe(true)
  expect(askedCount(rt, sess.sessionId)).toBe(2)
})

it('workflow is another process-code entry and obeys the bash gate', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const call = toolTurnCall('workflow', { script: "return 'workflow-live'", meta: { name: 'p626t', description: 'process gate probe' } })
  const sess = await scriptedSession(rt, WS, [call, call], 'standard')
  rmSync(join(DATA_DIR, 'policy-state.json'), { force: true })
  expect(toolResults(await sess.next('rejected'))[0]?.isError).toBe(true)
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
  expect(JSON.stringify(cards(rt, sess.sessionId)[0])).toContain("return 'workflow-live'")
  provision(rt)
  expect(toolResults(await sess.next('none'))[0]?.text).toContain('workflow-live')
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
})

it('③ existing ptc session rereads policy-state per call: valid → paused → restored', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const sess = await scriptedSession(rt, WS, Array.from({ length: 3 }, () => runCode("return 'live-state'")))
  provision(rt)
  expect(toolResults(await sess.next('none'))[0]?.text).toContain('live-state')
  expect(askedCount(rt, sess.sessionId)).toBe(0)
  provision(rt, true)
  expect(toolResults(await sess.next('rejected'))[0]?.isError).toBe(true)
  expect(askedCount(rt, sess.sessionId)).toBe(1)
  provision(rt)
  expect(toolResults(await sess.next('none'))[0]?.text).toContain('live-state')
  expect(askedCount(rt, sess.sessionId)).toBe(1)
})

it('a persisted ptc session created under the old default gets the new gate on runtime reload', { timeout: 180_000 }, async () => {
  const overlay = join(TEST_ROOT, 'old-tiers.yml')
  writeFileSync(overlay, '- id: p2sdk-shell-ask\n  config:\n    tiers:\n      default: allow\n      bash: sandbox-allow\n')
  const old = await launchWo(overlay)
  const sess = await scriptedSession(old, WS, [runCode("return 'old-default'")])
  expect(toolResults(await sess.next('none'))[0]?.text).toContain('old-default')
  expect(cards(old, sess.sessionId)).toHaveLength(0)
  old.feed.close()
  await old.stop()
  const rt = await launchWo(undefined, old.home)
  rmSync(join(DATA_DIR, 'policy-state.json'), { force: true })
  const resumed = await scriptedSession(rt, WS, [runCode("return 'must-not-run'")], 'ptc', sess.sessionId)
  expect(toolResults(await resumed.next('rejected'))[0]?.isError).toBe(true)
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
})

it('③ corrupt tier overlay fails closed for run_code', { timeout: 180_000 }, async () => {
  const overlay = join(TEST_ROOT, 'corrupt.yml')
  writeFileSync(overlay, '- id: p2sdk-shell-ask\n  config:\n    tiers: broken\n')
  const rt = await launchWo(overlay)
  provision(rt)
  const sess = await scriptedSession(rt, WS, [runCode("return 'must-not-run'")])
  expect(toolResults(await sess.next('rejected'))[0]?.isError).toBe(true)
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
  expect(cards(rt, sess.sessionId)[0]?.request?.reason).toContain('tier table unavailable')
})

it('④ nested ptc read outside asks, write outside denies (no silent success)', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  provision(rt)
  const target = join(OUT_DIR, 'nested-write.txt')
  const sess = await scriptedSession(rt, WS, [
    runCode("return await tools.read({file_path:'/etc/hostname'})"),
    runCode(`return await tools.write({file_path:${JSON.stringify(target)},content:'must-not-land'})`),
  ])
  const read = toolResults(await sess.next('rejected'))
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
  expect(cards(rt, sess.sessionId)[0]?.request?.toolName).toBe('read')
  expect(JSON.stringify(read)).toContain('rejected')
  const write = toolResults(await sess.next('none'))
  expect(JSON.stringify(write)).toContain('write-outside-workspace')
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
  expect(existsSync(target)).toBe(false)
})

it('⑤ standard bash still asks with missing state and runs with valid state', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const sess = await scriptedSession(rt, WS, [toolTurnCall('bash', { command: 'echo bash-unchanged', description: 'probe' }), toolTurnCall('bash', { command: 'echo bash-unchanged', description: 'probe' })], 'standard')
  rmSync(join(DATA_DIR, 'policy-state.json'), { force: true })
  expect(toolResults(await sess.next('rejected'))[0]?.isError).toBe(true)
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
  provision(rt)
  expect(toolResults(await sess.next('none'))[0]?.text).toContain('bash-unchanged')
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
})

