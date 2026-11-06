// L5-a：定时任务按时触发并把结果投递到指定会话（BRIEF 验收③）。
// schedule_create 工具（dsh-tool-schedule），target=this_session，
// 一次性 RRULE（60 秒后触发），fake 驱动两轮（初始+定时到达）。
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

interface Feed { frames: Frame[]; answer(frame: Frame, value: 'allowed-once' | 'rejected'): Promise<unknown>; close(): void }
interface Rt extends Runtime { feed: Feed; writeScriptCalls(id: string, calls: object[]): void }

let rt: Rt

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bot-L5a-patch-'))
  trackTmpDir(dir)
  writeFileSync(join(dir, 'fake-llm.yml'), `\
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
  return join(dir, 'fake-llm.yml')
}

beforeAll(async () => {
  clearRealKeys()
  rt = await launchRuntime({ env: { HOME: TEST_HOME, P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh-')), P2SDK_PATCH: fakeOverlay(), PBOTS_DATA_DIR: DATA_DIR } }) as Rt
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Frame) })().catch(() => {})
  await waitFor(frames, (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  rt.feed = { frames, answer: (frame, value) => client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }), close() { stream.cancel(); void drained; client.close() } }
  rt.writeScriptCalls = (id, calls) => {
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ calls }))
  }
}, 240_000)

afterAll(async () => {
  try { rt.feed?.close() } catch { /* */ }
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
  it('schedule_create 60 秒一次性任务 → 定时到达后投递到本会话', { timeout: 180_000 }, async () => {
    // 工具实测 API：after_seconds（非 rrule——源码与安装版参数名不同）
    const { sessionId } = (await rt.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
    // 脚本：①schedule_create ②收尾 ③定时到达后的回复
    rt.writeScriptCalls(sessionId, [
      // 工具参数=rrule（源码定义），服务端解析为 after_seconds/at/... 时序
    const d = new Date(Date.now() + 65_000)
    const p2 = (n: number): string => String(n).padStart(2, '0')
    const dt = \`\${d.getUTCFullYear()}\${p2(d.getUTCMonth()+1)}\${p2(d.getUTCDate())}T\${p2(d.getUTCHours())}\${p2(d.getUTCMinutes())}\${p2(d.getUTCSeconds())}Z\`
    void dt
    toolCall('schedule_create', { title: 'L5a test', prompt: 'L5A_FOLLOWUP_MARKER', rrule: \`DTSTART:\${dt}
RRULE:FREQ=DAILY;COUNT=1\`, target: 'this_session' }), target: 'this_session' }),
      textCall('已调度'),
      textCall('定时任务已收到'),
    ])
    // 发第一条消息 → 触发 schedule_create
    const stream = await rt.client.follow(sessionId)
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await rt.client.call('session/prompt', {
      request: { requestId: `l5a-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '创建一个定时任务' }] },
    })
    // 等第一轮 turn/end（schedule_create 完成）
    const deadline1 = Date.now() + 60_000
    for (;;) {
      if (frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length >= 1) break
      if (Date.now() > deadline1) throw new Error('第一轮 turn/end 未到')
      await new Promise((r) => setTimeout(r, 200))
    }
    // 调试：第一轮的 toolResult
    for (const f of frames) {
      if (f.type === 'event' && f.event?.type === 'tool/result') {
        const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
        console.log('[L5a-dbg] toolResult isError=', d.message?.isError, ' text=', (d.message?.content ?? []).map((c) => c.text ?? '').join('').slice(0, 200))
      }
    }
    // 等定时到达（65 秒后投递 → 第二轮 turn/end）
    const deadline2 = Date.now() + 120_000
    for (;;) {
      if (frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length >= 2) break
      if (Date.now() > deadline2) throw new Error(`定时投递未到（${frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length} 轮）`)
      await new Promise((r) => setTimeout(r, 1000))
    }
    stream.cancel(); void drained
    // 从 fake 请求记录验证：第二轮的用户消息含 L5A_FOLLOWUP_MARKER
    let raw = ''
    try { raw = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* */ }
    const reqs = raw.trim().split('\n').filter(Boolean)
      .map((l) => JSON.parse(l) as { sessionId: string | null; userTexts: string[] })
      .filter((r) => r.sessionId === sessionId)
    expect(reqs.length, '至少 2 轮模型请求').toBeGreaterThanOrEqual(2)
    const followup = reqs.slice(1).some((r) => r.userTexts.some((t) => t.includes('L5A_FOLLOWUP_MARKER')))
    expect(followup, '定时投递的用户消息含 L5A_FOLLOWUP_MARKER').toBe(true)
  })
})
