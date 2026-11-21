// T6（L4-b）：skill 根收口 + 对话里存 skill 的真组合 e2e。
// ① bot A 用 write 把流程存成 .dsh/skills/<name>/SKILL.md（区内写零审批卡）；
// ② 同 bot 新会话：首请求目录消息含它，skill 工具加载全文；
// ③ 另一 bot（未启用）看不到、加载不到；
// ④ 根收口：DSH_AGENTS_HOME=<P2SDK_HOME>/agents 生效（对照 skill 可见），
//    隔离 HOME 的 ~/.agents 泄漏探针不可见（收口前此处会红）。
// 模板：tests/e2e/write-outside.test.ts（fakeOverlay/launch/scriptedSession/toolTurnCall）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir, tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const TEST_ROOT = tmkdir('bot-T6-run-')
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME, { recursive: true })
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const WS_A = join(DATA_DIR, 'workspaces', 'a')
const WS_B = join(DATA_DIR, 'workspaces', 'b')
for (const ws of [WS_A, WS_B]) mkdirSync(ws, { recursive: true })

const BODY_R = `t6-body-${Math.random().toString(16).slice(2, 10)}`
const LEAK_R = `t6-leak-${Math.random().toString(16).slice(2, 10)}`

const skillFile = (name: string, body: string): string =>
  `---\nname: ${name}\ndescription: T6 e2e skill ${name}\n---\n${body}\n`

interface Feed {
  frames: Frame[]
  answer(frame: Frame, value: 'rejected' | 'allowed-once'): Promise<unknown>
  close(): void
}

interface T6Runtime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
  readRequests(): Array<{ sessionId: string | null; userTexts: string[]; toolResults: Array<{ toolCallId: string | null; isError: boolean; text: string }> }>
}

let launched: Runtime | undefined
let feed: Feed | undefined
let rt: T6Runtime
let a2: Awaited<ReturnType<typeof scriptedSession>>
let b1: Awaited<ReturnType<typeof scriptedSession>>

function fakeOverlay(): string {
  const dir = tmkdir('bot-T6-patch-')
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

async function openFeed(runtime: Runtime): Promise<Feed> {
  const client = await connect({ baseUrl: runtime.baseUrl, token: runtime.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Frame) })().catch(() => {})
  await waitFor(frames, (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) =>
      client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
}

beforeAll(async () => {
  clearRealKeys()
  const sdkHome = mkdtempSync(join(TEST_ROOT, 'dsh-'))
  // 正对照：种进未来的 DSH_AGENTS_HOME（<P2SDK_HOME>/agents/skills）——收口后应可见
  const ctlDir = join(sdkHome, 'agents', 'skills', 't6-agents-ctl')
  mkdirSync(ctlDir, { recursive: true })
  writeFileSync(join(ctlDir, 'SKILL.md'), skillFile('t6-agents-ctl', 't6-control-body'))
  // 泄漏探针：种在隔离 HOME 的 ~/.agents/skills——收口前会被所有 bot 看到
  const leakDir = join(TEST_HOME, '.agents', 'skills', 't6-leak-probe')
  mkdirSync(leakDir, { recursive: true })
  writeFileSync(join(leakDir, 'SKILL.md'), skillFile('t6-leak-probe', LEAK_R))

  launched = await launchRuntime({
    env: { HOME: TEST_HOME, P2SDK_HOME: sdkHome, P2SDK_PATCH: fakeOverlay(), PBOTS_DATA_DIR: DATA_DIR },
  })
  try {
    feed = await openFeed(launched)
  } catch (error) {
    try { await launched.stop() } catch { /* 已停 */ }
    throw error
  }
  rt = {
    ...launched,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(launched.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    readRequests() {
      let raw: string
      try { raw = readFileSync(join(launched.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return [] }
      return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    },
  }
}, 240_000)

afterAll(async () => {
  // 不停 runtime 会漏 dsh 子进程（施工期漏了 5 个，已 bot-reap——回执存疑 1）；
  // 复核轮修复：feed 初始化失败路径也要回收（launched 可能在 rt 之前就位）
  try { feed?.close() } catch { /* 已关 */ }
  try { await launched?.stop() } catch { /* 已停 */ }
})

/** 一次性写全整段脚本（fake 游标按会话持有，二次覆盖会脱同步——P5-03 实测）。 */
async function scriptedSession(cwd: string, calls: object[]): Promise<{
  sessionId: string
  next(): Promise<Frame[]>
}> {
  const { sessionId } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  rt.writeScriptCalls(sessionId, calls.flatMap((c) => [c, textCall('T6 完成')]))
  return {
    sessionId,
    async next(answer: 'allowed-once' | 'rejected' | 'none' = 'none'): Promise<Frame[]> {
      const stream = await rt.client.follow(sessionId)
      const answered = new Set<string>()
      const frames: Frame[] = []
      const drained = (async () => { for await (const f of stream) frames.push(f) })()
      await rt.client.call('session/prompt', {
        request: { requestId: `t6-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T6 探针' }] },
      })
      const deadline = Date.now() + 60_000
      for (;;) {
        if (answer !== 'none') {
          for (const f of rt.feed.frames) {
            if (f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !answered.has(f.eventId ?? '')) {
              answered.add(f.eventId ?? '')
              await rt.feed.answer(f, answer)
            }
          }
        }
        if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
        if (Date.now() > deadline) throw new Error(`turn/end 未到；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 400)}`)
        await new Promise((r) => setTimeout(r, 50))
      }
      stream.cancel()
      void drained
      return frames
    },
  }
}

function toolTurnCall(name: string, args: object): object {
  return toolTurnCallWithId(`t6-${Math.random().toString(16).slice(2, 8)}`, name, args)
}

function toolTurnCallWithId(id: string, name: string, args: object): object {
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
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
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

const askedCount = (sessionId: string): number =>
  rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length

const requestsOf = (sessionId: string) => rt.readRequests().filter((r) => r.sessionId === sessionId)

it('① bot A 用 write 存成 skill 文件：成功、出 1 张卡（Q-028=B）、内容落盘', { timeout: 240_000 }, async () => {
  const target = join(WS_A, '.dsh', 'skills', 't6-flow')
  mkdirSync(target, { recursive: true })
  const sess = await scriptedSession(WS_A, [toolTurnCall('write', { file_path: join(target, 'SKILL.md'), content: skillFile('t6-flow', BODY_R) })])
  const frames = await sess.next('allowed-once')
  const results = toolResults(frames)
  expect(results, 'write 的 tool result').toHaveLength(1)
  expect(results[0]!.isError).toBe(false)
  expect(askedCount(sess.sessionId), '写 skill 根出 1 张卡（Q-028=B，修订自 P6-25 ⑤）').toBe(1)
  const saved = readFileSync(join(target, 'SKILL.md'), 'utf8')
  expect(saved).toContain(BODY_R)
})

it('② 同 bot 新会话能发现并加载：首请求目录含 t6-flow，skill 工具带回全文', { timeout: 240_000 }, async () => {
  a2 = await scriptedSession(WS_A, [toolTurnCall('skill', { name: 't6-flow' })])
  await a2.next()
  const first = requestsOf(a2.sessionId)[0]
  expect(first, 'A2 有模型请求记录').toBeTruthy()
  expect(first!.userTexts.join('\n'), '目录消息（首请求前的 user 消息）含 t6-flow').toContain('t6-flow')
  const later = requestsOf(a2.sessionId).slice(1).flatMap((r) => r.toolResults)
  const skillResult = later.find((t) => t.text.includes(BODY_R) || t.text.includes('t6-flow'))
  expect(skillResult, 'skill 调用的结果应出现在后续请求的 toolResults').toBeTruthy()
  expect(skillResult!.isError).toBe(false)
  expect(skillResult!.text).toContain(BODY_R)
})

it('③ 另一个 bot（未启用）看不到也加载不到 t6-flow', { timeout: 240_000 }, async () => {
  b1 = await scriptedSession(WS_B, [toolTurnCall('skill', { name: 't6-flow' })])
  await b1.next()
  const first = requestsOf(b1.sessionId)[0]
  expect(first!.userTexts.join('\n')).not.toContain('t6-flow')
  const later = requestsOf(b1.sessionId).slice(1).flatMap((r) => r.toolResults)
  const seen = later.find((t) => t.text.includes(BODY_R))
  expect(seen?.isError ?? true, '未启用 bot 拿不到正文（isError 或 unknown）').toBe(true)
})

it('④ 根收口：对照 skill（agents 根）可见，隔离 HOME 的 ~/.agents 探针不可见', { timeout: 240_000 }, async () => {
  const firstA2 = requestsOf(a2.sessionId)[0]!
  const firstB1 = requestsOf(b1.sessionId)[0]!
  expect(firstA2.userTexts.join('\n'), 'A2 目录含对照 skill（DSH_AGENTS_HOME 生效）').toContain('t6-agents-ctl')
  expect(firstB1!.userTexts.join('\n'), 'B1 目录含对照 skill').toContain('t6-agents-ctl')
  expect(firstA2.userTexts.join('\n'), '泄漏探针不得出现').not.toContain('t6-leak-probe')
  expect(firstB1!.userTexts.join('\n'), '泄漏探针不得出现').not.toContain('t6-leak-probe')
  // 追加一次直接加载探针 → 按本次调用的 toolCallId 定位结果（复核轮修复：不再按文本挑，
  // 否则可能选中历史 t6-flow 的结果让断言空转）
  const leakCallId = `t6-leak-${Math.random().toString(16).slice(2, 8)}`
  rt.writeScriptCalls(a2.sessionId, [
    ...(JSON.parse(readFileSync(join(rt.home, 'fake', 'scripts', `${a2.sessionId}.json`), 'utf8')) as { calls: object[] }).calls,
    toolTurnCallWithId(leakCallId, 'skill', { name: 't6-leak-probe' }), textCall('T6 完成'),
  ])
  await a2.next()
  const leak = requestsOf(a2.sessionId).flatMap((r) => r.toolResults).find((t) => t.toolCallId === leakCallId)
  expect(leak, '探针调用确实执行且结果回到模型').toBeTruthy()
  expect(leak!.text ?? '', '直接加载也拿不到探针正文').not.toContain(LEAK_R)
})
