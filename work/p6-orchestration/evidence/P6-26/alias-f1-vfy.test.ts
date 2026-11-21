// P6-25 验收（PLAN p6-orchestration P6-25 / §12.8 判断 3，决策 37）：文件写类工具
// 目标 resolve 后不在本会话工作区内 → 一律 deny，不出卡。根因：P5-21 起写类「区外
// → next()」交上游 fence，而 dsh fence 可写根含宿主 /tmp（dsh-sandbox
// lib/index.js:232-244），bash 的 /tmp 却是私有 tmpfs——所有会话都能用 write/edit
// 无卡改写宿主 /tmp（P6-22 r1 实锚：worker 在 /tmp/bot-wt/P6-22 根留下 probe2.txt，
// dev-single-json-schema-1.w1.jsonl:8760）。
// 格：① 复刻 probe2（绝对路径写宿主 /tmp → 拒、文件不存在、0 卡）；② 预置文件
// edit → 拒、内容不变（读前提满足后的 edit；区外读仍出卡 = 读语义不变的差分）；
// ③ .. 逃逸 → 拒；④ 工作区内软链指向区外 → 拒；⑤ 区内 write/edit 照常（本
// runtime 的 policy-state 从未 provision，L-7 R6 的「从未存在」态一并覆盖）；⑥ 普通
// bot（另一工作区的第二会话）写区外 → 拒；⑦ never 子代理（ptc）写区外 → 拒（修复
// 前这里是无卡成功——A9 ⑦ 的区外写变体）。
// 注意（派发约束）：测试自身的 HOME/工作区就在 /tmp 下（/tmp/bot-p625-*），区外判定
// 只看「是否在本会话 workspaceRoot 子树内」，不看「是否在 /tmp」——⑤ 就是这条的
// 防误判格。全部经真实 launcher + fake LLM；只结束自己 spawn 的子进程（stop 自管）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from '/tmp/bot-wt/P6-26/app/sdk/node_modules/vitest/dist/index.js'
import { connect, type DshClient } from '/tmp/bot-wt/P6-26/app/sdk/examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '/tmp/bot-wt/P6-26/app/sdk/tests/support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '/tmp/bot-wt/P6-26/app/sdk/tests/support/fake/harness.ts'
import { trackTmpDir } from '/tmp/bot-wt/P6-26/app/sdk/tests/support/tmp-sweep.ts'

const PKG_ROOT = '/tmp/bot-wt/P6-26/app/sdk'
// HOME 与区外探针互为兄弟，避免 HOME mask 先于区域判定拦截探针。
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'bot-p626-run-'))
trackTmpDir(TEST_ROOT)
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME)
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const WS = join(DATA_DIR, 'workspaces', 'x')
const WS2 = join(DATA_DIR, 'workspaces', 'y')
// 区外目标仍在宿主 /tmp，从本次临时根派生，避免并行清扫其他测试。
const OUT_DIR = join(TEST_ROOT, 'outside')
mkdirSync(OUT_DIR, { recursive: true })
trackTmpDir(OUT_DIR)
const R = Math.random().toString(16).slice(2, 8)

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
  request?: { toolName?: string; callId?: string; reason?: string }
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
  const dir = mkdtempSync(join(tmpdir(), 'bot-p626-patch-'))
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

async function launchWo(extraPatch?: string): Promise<WoRuntime> {
  clearRealKeys()
  const patches = [fakeOverlay(), ...(extraPatch ? [extraPatch] : [])]
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_HOME: mkdtempSync(join(TEST_ROOT, 'dsh-')),
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
async function scriptedSession(h: WoRuntime, cwd: string, calls: object[]): Promise<{
  sessionId: string
  next(answer?: 'rejected' | 'allowed-once' | 'none'): Promise<Frame[]>
}> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  h.writeScriptCalls(sessionId, calls.flatMap((c) => [c, textCall('P6-25 完成')]))
  const answered = new Set<string>()
  return {
    sessionId,
    async next(answer = 'rejected'): Promise<Frame[]> {
      const stream = await h.client.follow(sessionId)
      const frames: Frame[] = []
      const drained = (async () => { for await (const f of stream) frames.push(f) })()
      await h.client.call('session/prompt', {
        request: { requestId: `p6-25-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P6-25 探针' }] },
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
  const id = `p6-25-${Math.random().toString(16).slice(2, 8)}`
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

const DENY_CODE = 'write-outside-workspace'

/** 断言一个 tool result 是 P6-25 的本地 deny（不出卡的硬拒）。 */
function expectWriteOutDeny(r: { isError: boolean; text: string } | undefined, label: string): void {
  expect(r, `${label}：有 tool result`).toBeTruthy()
  expect(r!.isError, `${label}：isError`).toBe(true)
  expect(r!.text, `${label}：原因是 P6-25 固定字面串（code 前缀，无宿主绝对路径）`).toContain(DENY_CODE)
  expect(r!.text, `${label}：不回显目标绝对路径（redact 口径）`).not.toContain(OUT_DIR)
}

beforeAll(() => {
  mkdirSync(WS, { recursive: true })
  mkdirSync(WS2, { recursive: true })
}, 30_000)

afterAll(async () => {
  for (const rt of runtimes) {
    try { rt.feed.close() } catch { /* 已关 */ }
    try { await rt.stop() } catch { /* 已停 */ }
  }
})

// verifier P6-26: session cwd spelled through a symlink alias of the real workspace.
// Base (P6-25.f1) reads in-zone files fine; check that the fd-bound read path does too.
it('vfy P6-26 alias cwd：别名工作区内 read / present 不误伤', { timeout: 240_000 }, async () => {
  const alias = join(TEST_ROOT, 'ws-alias')
  symlinkSync(WS, alias)
  const file = join(WS, `alias-${R}.txt`)
  writeFileSync(file, 'ALIAS-INSIDE-OK')
  const rt = await launchWo()
  const out: Record<string, unknown> = {}
  for (const [label, cwd, args, tool] of [
    ['cwd=alias read alias-path', alias, { file_path: join(alias, `alias-${R}.txt`) }, 'read'],
    ['cwd=alias read real-path', alias, { file_path: file }, 'read'],
    ['cwd=alias present', alias, { files: [{ path: join(alias, `alias-${R}.txt`) }] }, 'present'],
    ['cwd=real read', WS, { file_path: file }, 'read'],
  ] as const) {
    const sess = await scriptedSession(rt, cwd, [toolTurnCall(tool, args)])
    const r = toolResults(await sess.next('none'))[0]
    out[label] = { isError: r?.isError, text: r?.text?.slice(0, 160), asks: askedCount(rt, sess.sessionId) }
  }
  console.log('VFY-ALIAS ' + JSON.stringify(out))
  for (const v of Object.values(out) as Array<{ isError: boolean }>) expect(v.isError).toBe(false)
})

// 独立补齐旧 verifier 真 Loader 探针：alias/real cwd × read/read_image/present/listDir。
it('vfy f1 alias/real cwd all read entrypoints and missing-file bad path', { timeout: 240_000 }, async () => {
  const alias = join(TEST_ROOT, 'matrix-alias')
  symlinkSync(WS, alias)
  const leaf = `matrix-${R}.txt`
  const png = `matrix-${R}.png`
  writeFileSync(join(WS, leaf), 'VFY-F1-CONTENT')
  writeFileSync(join(WS, png), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))
  const rt = await launchWo()
  for (const [label, cwd] of [['alias', alias], ['real', WS]] as const) {
    for (const [tool, args, marker] of [
      ['read', { file_path: join(cwd, leaf) }, 'VFY-F1-CONTENT'],
      ['read', { file_path: join(WS, leaf) }, 'VFY-F1-CONTENT'],
      ['read_image', { file_path: join(cwd, png) }, ''],
      ['present', { files: [{ path: join(cwd, leaf) }] }, ''],
    ] as const) {
      const sess = await scriptedSession(rt, cwd, [toolTurnCall(tool, args)])
      const result = toolResults(await sess.next('none'))[0]
      const asks = askedCount(rt, sess.sessionId)
      console.log('VFY-F1-MATRIX ' + JSON.stringify({ label, tool, args, result, asks }))
      expect(result).toBeDefined()
      expect(result?.isError).toBe(false)
      if (marker) expect(result?.text).toContain(marker)
      expect(result?.text).not.toContain('/proc/self/fd')
      expect(asks).toBe(0)
    }
    const sess = await scriptedSession(rt, cwd, [toolTurnCall('read', { file_path: join(cwd, 'missing-vfy-file') })])
    const result = toolResults(await sess.next('none'))[0]
    console.log('VFY-F1-MISSING ' + JSON.stringify({ label, result }))
    expect(result?.isError).toBe(true)
    expect(result?.text).toContain('not found')
    expect(askedCount(rt, sess.sessionId)).toBe(0)
  }
})
