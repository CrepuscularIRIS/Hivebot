import { launchRuntime as launchBaseRuntime } from './runtime-base.ts'
// P6-26t: real launcher, scripted model, real ptc executor and approval service.
// Helpers adapted from write-outside.test.ts; every path derives from this run root.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from '/tmp/bot-wt/P6-26t/app/sdk/node_modules/vitest/dist/index.js'
import { connect, type DshClient } from '/tmp/bot-wt/P6-26t/app/sdk/examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '/tmp/bot-wt/P6-26t/app/sdk/tests/support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '/tmp/bot-wt/P6-26t/app/sdk/tests/support/fake/harness.ts'
import { trackTmpDir } from '/tmp/bot-wt/P6-26t/app/sdk/tests/support/tmp-sweep.ts'

const PKG_ROOT = "/tmp/bot-wt/P6-26t/app/sdk"
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
  const patches = [fakeOverlay(), ...(extraPatch && extraPatch !== 'BASE' ? [extraPatch] : [])]
  const rt = await (extraPatch === 'BASE' ? launchBaseRuntime : launchRuntime)({
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

// Independent verifier cases, using the existing real-runtime harness above.
it('V1 actual main@75267c6 policy and tiers: symlink executes without approval', async () => {
  const evidence = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-26t'
  const baseline = JSON.parse(readFileSync(join(evidence, 'base-tiers.json'), 'utf8'))
  const overlay = join(TEST_ROOT, 'actual-base.yml')
  writeFileSync(overlay, `- id: p2sdk-shell-ask\n  name: '${pathToFileURL(join(evidence, 'base-shell-ask.mjs')).href}'\n  config:\n    tiers: ${JSON.stringify(baseline)}\n`)
  const rt = await launchWo('BASE')
  rmSync(join(DATA_DIR, 'policy-state.json'), { force: true })
  const sess = await scriptedSession(rt, WS, [runCode("const fs = await import('node:fs/promises'); await fs.symlink('.', 'verifier-base-link'); return 'baseline-linked'")])
  const results = toolResults(await sess.next('none'))
  console.log('V1 debug', JSON.stringify(results), JSON.stringify(cards(rt, sess.sessionId))); expect(results[0]?.isError).toBe(false)
  expect(results[0]?.text).toContain('baseline-linked')
  expect(existsSync(join(WS, 'verifier-base-link'))).toBe(true)
  expect(cards(rt, sess.sessionId)).toHaveLength(0)
  console.log('V1 baseline: symlink=true approval=0 result=baseline-linked')
})

it('V2 bad path: wrong runtime instance cannot execute run_code after rejection', async () => {
  const rt = await launchWo()
  writeFileSync(join(DATA_DIR, 'policy-state.json'), JSON.stringify({ version: 1, instance: 'wrong-instance', paused: false }))
  const code = "const fs = await import('node:fs/promises'); await fs.symlink('.', 'verifier-denied-link'); return 'must-not-run'"
  const sess = await scriptedSession(rt, WS, [runCode(code)])
  const results = toolResults(await sess.next('rejected'))
  expect(results[0]?.isError).toBe(true)
  expect(cards(rt, sess.sessionId)).toHaveLength(1)
  expect(cards(rt, sess.sessionId)[0]?.request?.reason).toContain(code)
  expect(existsSync(join(WS, 'verifier-denied-link'))).toBe(false)
  console.log('V2 wrong instance: rejected=true symlink=false approval=1 full-program-in-reason=true')
})

it('V3 tiers are cached until module/runtime reload, unlike per-call policy-state', async () => {
  const evidence = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-26t'
  const table = join(TEST_ROOT, 'dynamic-tiers.json')
  const file = join(TEST_ROOT, 'cached-policy.mjs')
  const baseline = JSON.parse(readFileSync(join(evidence, 'base-tiers.json'), 'utf8'))
  writeFileSync(table, JSON.stringify(baseline))
  let source = readFileSync(join(PKG_ROOT, 'src/policy/shell-ask.mjs'), 'utf8')
  for (const name of ['containment', 'resolve', 'request-net']) source = source.replaceAll(`./${name}.mjs`, join(PKG_ROOT, 'src/policy', `${name}.mjs`))
  source = source.replace("new URL('../../profile/tiers.json', import.meta.url)", JSON.stringify(table))
  writeFileSync(file, source)
  const oldModule = await import(pathToFileURL(file).href)
  expect(oldModule.loadTiers({}).run_code).toBeUndefined()
  writeFileSync(table, JSON.stringify({ ...baseline, run_code: 'sandbox-allow', workflow: 'sandbox-allow' }))
  expect(oldModule.loadTiers({}).run_code).toBeUndefined()
  const reloaded = await import(pathToFileURL(file).href + '?reload=1')
  expect(reloaded.loadTiers({}).run_code).toBe('sandbox-allow')
  console.log('V3 live old table remains default=allow; fresh module reads sandbox-allow; runtime reload required')
})
