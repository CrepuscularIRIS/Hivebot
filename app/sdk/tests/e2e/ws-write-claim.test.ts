// T14：产品组合下 bot 写自己工作区被 guard 软遮蔽拒——最小复现三格。
// ① claim 建会话（{sessionId, cwd}，产品 M1 的方式）→ 预期红（masked area，复现 T7a）；
// ② 对照：只传 {cwd}（T6 的方式）→ 预期绿；③ claim 但不链 presets.yml → 定位格（如实记录）。
// 模板：tests/e2e/skill-save.test.ts。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir, tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const TEST_ROOT = tmkdir('bot-T14-run-')
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME, { recursive: true })
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const PRESETS = join(PKG_ROOT, 'profile', 'patches', 'presets.yml')

const R = `t14-${Math.random().toString(16).slice(2, 10)}`

interface Feed { frames: Frame[]; close(): void }
interface Rt extends Runtime { feed: Feed; writeScriptCalls(sessionId: string, calls: object[]): void; readRequests(): Array<{ sessionId: string | null; toolResults: Array<{ toolCallId: string | null; isError: boolean; text: string }> }> }

function fakeOverlay(): string {
  const dir = tmkdir('bot-T14-patch-')
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

async function openFeed(rt: Runtime): Promise<Feed> {
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Frame) })().catch(() => {})
  await waitFor(frames, (f) => f.type === 'ready', 5000, '$events ready')
  return { frames, close() { stream.cancel(); void drained; client.close() } }
}

async function launch(withPresets: boolean): Promise<Rt> {
  clearRealKeys()
  const patches = withPresets ? `${fakeOverlay()}:${PRESETS}` : fakeOverlay()
  const rt = await launchRuntime({
    env: { HOME: TEST_HOME, P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh-')), P2SDK_PATCH: patches, PBOTS_DATA_DIR: DATA_DIR },
  })
  const feed = await openFeed(rt)
  return {
    ...rt, feed,
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
}

let rtPresets: Rt
let rtBare: Rt

beforeAll(async () => {
  rtPresets = await launch(true)
  rtBare = await launch(false)
}, 240_000)

afterAll(async () => {
  for (const rt of [rtPresets, rtBare]) {
    try { rt.feed.close() } catch { /* 已关 */ }
    try { await rt.stop() } catch { /* 已停 */ }
  }
})

function toolTurnCall(name: string, args: object): object {
  const id = `t14-${Math.random().toString(16).slice(2, 8)}`
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
  }
}

function textCall(text: string): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
  }
}

/** 驱动一个会话跑完一轮：write 相对 + write 绝对 + 收尾文本。返回 (sessionId, 工具结果)。 */
async function driveWrite(rt: Rt, create: { sessionId?: string; cwd: string }): Promise<{ sessionId: string; results: Array<{ isError: boolean; text: string }>; asked: number }> {
  const createReq = create.sessionId !== undefined
    ? { request: { sessionId: create.sessionId, cwd: create.cwd } }
    : { request: { cwd: create.cwd } }
  const { sessionId } = (await rt.client.call('session/create', createReq)) as { sessionId: string }
  rt.writeScriptCalls(sessionId, [
    toolTurnCall('write', { file_path: 'probe.txt', content: R }),
    toolTurnCall('write', { file_path: join(create.cwd, 'probe2.txt'), content: R }),
    toolTurnCall('write', { file_path: join(DATA_DIR, 'bots.json'), content: 'x' }),
    textCall('T14 完成'),
  ])
  const stream = await rt.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await rt.client.call('session/prompt', {
    request: { requestId: `t14-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T14 探针' }] },
  })
  const deadline = Date.now() + 60_000
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 400)}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const results: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    results.push({ isError: data.message?.isError === true, text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n') })
  }
  const asked = rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
  return { sessionId, results, asked }
}

describe('T14 产品组合下 bot 写自己工作区（claim vs cwd）', () => {
  it('① claim 建会话（{sessionId, cwd}）：相对/绝对写都成功、bots.json 仍拒、零审批卡', { timeout: 240_000 }, async () => {
    const ws = join(DATA_DIR, 'workspaces', `session-${randomUUID()}`)
    mkdirSync(ws, { recursive: true })
    const { sessionId, results, asked } = await driveWrite(rtPresets, { sessionId: `session-${randomUUID()}`, cwd: ws })
    expect(results[0]!.isError, `相对写被拒：${results[0]!.text.slice(0, 200)}`).toBe(false)
    expect(results[1]!.isError, `绝对写被拒：${results[1]!.text.slice(0, 200)}`).toBe(false)
    expect(existsSync(join(ws, 'probe.txt'))).toBe(true)
    expect(readFileSync(join(ws, 'probe2.txt'), 'utf8')).toBe(R)
    expect(asked, '区内写不出卡').toBe(0)
    // 遮蔽未被放宽：数据根顶层（bots.json）仍拒
    expect(results[2]!.isError, 'bots.json 写入仍被拒（遮蔽未放宽）').toBe(true)
    void sessionId
  })

  it('② 对照：只传 {cwd} 建会话——同脚本全绿', { timeout: 240_000 }, async () => {
    const ws = join(DATA_DIR, 'workspaces', `session-${randomUUID()}`)
    mkdirSync(ws, { recursive: true })
    const { results, asked } = await driveWrite(rtPresets, { cwd: ws })
    expect(results[0]!.isError, results[0]!.text.slice(0, 200)).toBe(false)
    expect(results[1]!.isError, results[1]!.text.slice(0, 200)).toBe(false)
    expect(readFileSync(join(ws, 'probe2.txt'), 'utf8')).toBe(R)
    expect(asked).toBe(0)
    expect(results[2]!.isError).toBe(true)
  })

  it('③ 定位：claim 建会话但不链 presets.yml——结果如实记录', { timeout: 240_000 }, async () => {
    const ws = join(DATA_DIR, 'workspaces', `session-${randomUUID()}`)
    mkdirSync(ws, { recursive: true })
    const { results } = await driveWrite(rtBare, { sessionId: `session-${randomUUID()}`, cwd: ws })
    // 定位格：绿= presets.yml 是必要条件；红= 与 presets 无关（claim 路径本身）
    console.log(`[T14-③] presets 无链时 claim 写: isError=${results[0]!.isError} text=${results[0]!.text.slice(0, 160)}`)
    expect(results[2]!.isError, 'bots.json 仍拒').toBe(true)
  })
})
