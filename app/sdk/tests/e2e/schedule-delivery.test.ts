// L5-a：定时任务按时触发并把结果投递到指定会话（BRIEF 验收③）。
// 安装版 API（node_modules 实测）：schedule_create({title, prompt, after_seconds})——
// 不用 rrule/target（参考仓源码有但安装版删了）。MIN=60 秒。
// 模板：mock-demo.test.ts。
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'bot-L5a-run-'))
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME, { recursive: true })
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const WS = join(DATA_DIR, 'workspaces', 'x')
mkdirSync(WS, { recursive: true })

interface Feed { frames: Frame[]; close(): void }
interface Rt extends Runtime { feed: Feed; writeScriptCalls(id: string, calls: object[]): void }

let rt: Rt

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bot-L5a-patch-'))
  trackTmpDir(dir)
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
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
                inputModalities: [text, image]
`)
  return overlay
}

beforeAll(async () => {
  clearRealKeys()
  const launched = await launchRuntime({
    env: { HOME: TEST_HOME, P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh-')), P2SDK_PATCH: fakeOverlay(), PBOTS_DATA_DIR: DATA_DIR },
  })
  const client = await connect({ baseUrl: launched.baseUrl, token: launched.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Frame) })().catch(() => {})
  await waitFor(frames, (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  rt = {
    ...launched,
    feed: { frames, close() { stream.cancel(); void drained; client.close() } },
    writeScriptCalls(sessionId, calls) {
      const dir = join(launched.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
}, 240_000)

afterAll(async () => {
  try { rt?.feed?.close() } catch { /* */ }
  try { await rt?.stop() } catch { /* */ }
})

function toolCall(name: string, args: object): object {
  const id = `l5a-${Math.random().toString(16).slice(2, 8)}`
  const a = JSON.stringify(args)
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: a } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}

function textCall(t: string): object {
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: t },
    { type: 'block-end', index: 0, block: { type: 'text', text: t } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }
}

describe('L5-a 定时投递', () => {
  it('schedule_create 60 秒一次性 → 定时到达投递到本会话', { timeout: 180_000 }, async () => {
    const { sessionId } = (await rt.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
    rt.writeScriptCalls(sessionId, [
      toolCall('schedule_create', { title: 'L5a test', prompt: 'L5A_FOLLOWUP_DELIVERED', after_seconds: 60 }),
      textCall('已调度'),
      textCall('定时任务收到并完成'),
    ])
    const stream = await rt.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await rt.client.call('session/prompt', {
      request: { requestId: `l5a-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '创建定时任务' }] },
    })
    // 等第一轮 turn/end（schedule_create 完成）
    const d1 = Date.now() + 60_000
    for (;;) {
      if (frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length >= 1) break
      if (Date.now() > d1) throw new Error('第一轮 turn/end 未到')
      await new Promise((r) => setTimeout(r, 200))
    }
    // 等第二轮（60 秒后定时投递）
    const d2 = Date.now() + 120_000
    for (;;) {
      if (frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length >= 2) break
      if (Date.now() > d2) throw new Error(`定时投递未到（${frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length} 轮）`)
      await new Promise((r) => setTimeout(r, 1000))
    }
    stream.cancel()
    void drained
    let raw = ''
    try { raw = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* */ }
    const reqs = raw.trim().split('\n').filter(Boolean)
      .map((l) => JSON.parse(l) as { sessionId: string | null; userTexts: string[] })
      .filter((r) => r.sessionId === sessionId)
    expect(reqs.length, '≥2 轮模型请求').toBeGreaterThanOrEqual(2)
    expect(reqs.slice(1).some((r) => r.userTexts.some((t) => t.includes('L5A_FOLLOWUP_DELIVERED'))), '定时投递含标记').toBe(true)
  })
})
