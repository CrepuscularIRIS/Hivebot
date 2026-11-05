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
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
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
      P2SDK_HOME: mkdtempSync(join(tmpdir(), 'bot-p626-dsh-')),
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

// ── ①–⑥：主会话 + 普通第二会话，同一 runtime（policy-state 从未 provision：
// L-7 R6「从未存在」不门控文件工具——区内写放行与区外拒互不干扰）──

it('① 复刻 probe2：绝对路径写宿主 /tmp → deny、文件不存在、0 卡（修复前这里无卡成功）', { timeout: 180_000 }, async () => {
  const rt = await launchWo()
  const probe = join(OUT_DIR, `probe-${R}.txt`)
  rmSync(probe, { force: true })
  const sess = await scriptedSession(rt, WS, [toolTurnCall('write', { file_path: probe, content: 'p625-x' })])
  const frames = await sess.next('none')
  expectWriteOutDeny(toolResults(frames)[0], 'write 绝对路径')
  expect(askedCount(rt, sess.sessionId), '硬拒不出卡').toBe(0)
  expect(existsSync(probe), '宿主文件不存在（修复前此处被无卡创建 = P6-22 r1 的洞）').toBe(false)
})

it('② 预置区外文件 edit → deny、内容不变；其读前提（区外 read）仍出卡（读语义不变差分）', { timeout: 240_000 }, async () => {
  const rt = runtimes[0]!
  const target = join(OUT_DIR, `edit-${R}.txt`)
  writeFileSync(target, 'p625-before')
  const before = createHash('sha256').update(readFileSync(target)).digest('hex')
  const sess = await scriptedSession(rt, WS, [
    toolTurnCall('read', { file_path: target }),
    toolTurnCall('edit', { file_path: target, old_string: 'p625-before', new_string: 'p625-after' }),
  ])
  const readFrames = await sess.next('allowed-once') // 区外读：照旧出卡（Q-013 第 3 行不变）
  expect(askedCount(rt, sess.sessionId), '区外 read 出卡 1 次').toBe(1)
  expect(toolResults(readFrames)[0]?.isError, '批准后读到（edit 的读前提成立）').toBe(false)
  const editFrames = await sess.next('none')
  expectWriteOutDeny(toolResults(editFrames)[0], 'edit 区外预置文件')
  expect(askedCount(rt, sess.sessionId), 'edit 不出卡（硬拒非表演卡）').toBe(1)
  expect(createHash('sha256').update(readFileSync(target)).digest('hex'), '宿主内容不变').toBe(before)
})

it('③ .. 逃逸：相对路径带 .. 段出工作区 → deny', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const escape = join(OUT_DIR, `escape-${R}.txt`)
  rmSync(escape, { force: true })
  // 字面 .. 段（join 会归一掉，手工拼）：从 WS 相对走到 OUT_DIR
  const dotted = `${relative(WS, OUT_DIR)}/escape-${R}.txt`
  expect(dotted.startsWith('..'), '前提：候选确实带 .. 段').toBe(true)
  const sess = await scriptedSession(rt, WS, [toolTurnCall('write', { file_path: dotted, content: 'p625-x' })])
  const frames = await sess.next('none')
  expectWriteOutDeny(toolResults(frames)[0], 'write .. 逃逸')
  expect(existsSync(escape), '逃逸目标不存在').toBe(false)
})

it('④ 工作区内软链指向区外 → 经软链写 deny、目标不存在', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const link = join(WS, `outlink-${R}`)
  symlinkSync(OUT_DIR, link)
  const target = join(OUT_DIR, `sl-${R}.txt`)
  rmSync(target, { force: true })
  const sess = await scriptedSession(rt, WS, [toolTurnCall('write', { file_path: join(link, `sl-${R}.txt`), content: 'p625-x' })])
  const frames = await sess.next('none')
  expectWriteOutDeny(toolResults(frames)[0], 'write 经软链')
  expect(existsSync(target), 'realpath 后的目标不存在').toBe(false)
})

it('⑤ 区内 write/edit 照常（policy-state 从未 provision 态；本测试的合法工作区就在 /tmp 下——区外判定不看 /tmp）', { timeout: 240_000 }, async () => {
  const rt = runtimes[0]!
  const a = join(WS, `inside-${R}.txt`)
  const sess = await scriptedSession(rt, WS, [
    toolTurnCall('write', { file_path: a, content: 'p625-in' }),
    toolTurnCall('edit', { file_path: a, old_string: 'p625-in', new_string: 'p625-edited' }),
  ])
  const wFrames = await sess.next('none')
  expect(toolResults(wFrames)[0]?.isError, '区内 write 成功').toBe(false)
  const eFrames = await sess.next('none')
  expect(toolResults(eFrames)[0]?.isError, '区内 edit 成功').toBe(false)
  expect(readFileSync(a, 'utf8'), 'edit 落盘').toBe('p625-edited')
  expect(askedCount(rt, sess.sessionId), '区内读写 0 卡（门从未 provision 不门控）').toBe(0)
})

it('⑥ 普通第二会话（另一工作区）写区外/写他人工作区 → deny（不只 worker 受约束）', { timeout: 180_000 }, async () => {
  const rt = runtimes[0]!
  const out = join(OUT_DIR, `plain-${R}.txt`)
  const others = join(WS, `others-ws-${R}.txt`)
  rmSync(out, { force: true })
  rmSync(others, { force: true })
  const sess = await scriptedSession(rt, WS2, [
    toolTurnCall('write', { file_path: out, content: 'p625-x' }),
    toolTurnCall('write', { file_path: others, content: 'p625-x' }),
  ])
  const f1 = await sess.next('none')
  expectWriteOutDeny(toolResults(f1)[0], '普通会话写宿主 /tmp')
  const f2 = await sess.next('none')
  const other = toolResults(f2)[0]
  expect(other?.isError, '普通会话写另一会话工作区：拒').toBe(true)
  expect(other?.text, '他人工作区在数据 mask 根内 → 由 guard 先拒（P5-02 语义不变）').toContain('p2sdk-fs-guard')
  expect(askedCount(rt, sess.sessionId), '0 卡').toBe(0)
  expect(existsSync(out), '宿主文件不存在').toBe(false)
  expect(existsSync(others), '他人工作区文件不存在').toBe(false)
})

it('P6-25.f1 真 Loader：文件工具走新后端，同一判定/执行窗口换链后读写及假凭证读写均拒', { timeout: 240_000 }, async () => {
  const fakeCred = join(TEST_HOME, '.ssh')
  mkdirSync(fakeCred, { recursive: true })
  writeFileSync(join(fakeCred, 'marker.txt'), 'FAKE-CREDENTIAL-CONTENT')
  writeFileSync(join(OUT_DIR, 'marker.txt'), 'OUTSIDE-CONTENT')
  const evidence = join(TEST_HOME, 'fs-zone-executions.jsonl')
  const cases = [
    { name: 'write', leaf: 'new.txt', destination: OUT_DIR, code: 'write-outside-workspace' },
    { name: 'read', leaf: 'marker.txt', destination: OUT_DIR, code: 'read-outside-workspace' },
    { name: 'write', leaf: 'new-key.txt', destination: fakeCred, code: 'never-root' },
    { name: 'read', leaf: 'marker.txt', destination: fakeCred, code: 'never-root' },
  ].map((c, i) => {
    const directory = join(WS, `execute-swap-${R}-${i}`)
    mkdirSync(directory)
    return { ...c, directory, filePath: join(directory, c.leaf) }
  })
  const overlay = join(TEST_HOME, 'fs-zone-swap.yml')
  writeFileSync(overlay, `- insert:\n    - id: p625f1-swap\n      name: '${pathToFileURL(join(PKG_ROOT, 'tests/support/fs-zone-swap.mjs')).href}'\n      config:\n        evidence: ${JSON.stringify(evidence)}\n        swaps: ${JSON.stringify(cases)}\n`)
  const rt = await launchWo(overlay)
  for (const c of cases) {
    const args = { file_path: c.filePath, ...(c.name === 'write' ? { content: 'MUST-NOT-BE-WRITTEN' } : {}) }
    const sess = await scriptedSession(rt, WS, [toolTurnCall(c.name, args)])
    const frames = await sess.next('none')
    const result = toolResults(frames)[0]
    expect(result?.isError, `${c.name} -> ${c.code}; seam=${readFileSync(evidence, 'utf8')}; result=${JSON.stringify(result)}`).toBe(true)
    expect(result?.text).toContain(c.code)
    expect(result?.text).not.toContain('FAKE-CREDENTIAL-CONTENT')
    expect(result?.text).not.toContain('OUTSIDE-CONTENT')
    expect(askedCount(rt, sess.sessionId), '判定时区内：0 卡').toBe(0)
  }
  const executions = readFileSync(evidence, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  expect(executions).toHaveLength(4)
  expect(executions.every((e) => e.backend === true && e.verdict?.allInside === true), '真 Loader 后端类型及 exec 同引用交接').toBe(true)
  expect(existsSync(join(OUT_DIR, 'new.txt'))).toBe(false)
  expect(existsSync(join(fakeCred, 'new-key.txt'))).toBe(false)
  expect(readFileSync(join(fakeCred, 'marker.txt'), 'utf8')).toBe('FAKE-CREDENTIAL-CONTENT')
})

it('P6-26 真 Loader：inner 接缝的 read/read_image/present/listDir 拒区外及假凭证，区内搜索与 read→edit 不误伤', { timeout: 240_000 }, async () => {
  const fakeCred = join(TEST_HOME, '.ssh')
  mkdirSync(fakeCred, { recursive: true })
  for (const dir of [fakeCred, OUT_DIR]) {
    writeFileSync(join(dir, 'p626.txt'), 'FAKE-CRED-MARKER-OUTSIDE')
    writeFileSync(join(dir, 'p626.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9l8AAAAASUVORK5CYII=', 'base64'))
  }
  const evidence = join(TEST_HOME, 'p626-inner.jsonl')
  const cases = [
    { name: 'read', leaf: 'p626.txt', destination: OUT_DIR },
    { name: 'read', leaf: 'p626.txt', destination: fakeCred },
    { name: 'read_image', leaf: 'p626.png', destination: fakeCred },
    { name: 'present', leaf: 'p626.txt', destination: fakeCred },
    { name: 'read', leaf: '', destination: fakeCred },
  ].map((c, i) => {
    const directory = join(WS, `p626-inner-${R}-${i}`)
    mkdirSync(directory)
    if (c.leaf) writeFileSync(join(directory, c.leaf), c.name === 'read_image' ? readFileSync(join(OUT_DIR, c.leaf)) : 'INSIDE')
    return { ...c, directory, filePath: c.leaf ? join(directory, c.leaf) : directory }
  })
  const overlay = join(TEST_HOME, 'p626-inner.yml')
  writeFileSync(overlay, `- insert:\n    - id: p626-inner\n      name: '${pathToFileURL(join(PKG_ROOT, 'tests/support/fs-zone-swap.mjs')).href}'\n      config:\n        inner: true\n        evidence: ${JSON.stringify(evidence)}\n        swaps: ${JSON.stringify(cases)}\n`)
  const rt = await launchWo(overlay)
  for (const c of cases) {
    const args = c.name === 'present' ? { files: [{ path: c.filePath }] } : { file_path: c.filePath }
    const sess = await scriptedSession(rt, WS, [toolTurnCall(c.name, args)])
    const result = toolResults(await sess.next('none'))[0]
    expect(result?.isError, JSON.stringify(result)).toBe(true)
    expect(result?.text).toMatch(/never-root|read-outside-workspace/)
    expect(result?.text).not.toMatch(/FAKE-CRED-MARKER|\/proc\/self\/fd/)
    expect(askedCount(rt, sess.sessionId)).toBe(0)
  }
  expect(readFileSync(evidence, 'utf8').trim().split('\n')).toHaveLength(cases.length)
  const dir = join(WS, `p626-noharm-${R}`)
  mkdirSync(dir)
  const file = join(dir, 'a.txt')
  writeFileSync(file, 'needle-p626\n')
  const sess = await scriptedSession(rt, WS, [
    toolTurnCall('glob', { pattern: '*.txt', path: dir }),
    toolTurnCall('grep', { pattern: 'needle-p626', path: dir }),
    toolTurnCall('read', { file_path: file }),
    toolTurnCall('edit', { file_path: file, old_string: 'needle-p626', new_string: 'edited-p626' }),
  ])
  for (let i = 0; i < 4; i++) {
    const result = toolResults(await sess.next('none'))[0]
    expect(result?.isError).toBe(false)
    if (i === 0) expect(result?.text).toContain('a.txt')
    if (i === 1) expect(result?.text).toContain('needle-p626')
  }
  expect(askedCount(rt, sess.sessionId)).toBe(0)
  expect(readFileSync(file, 'utf8')).toBe('edited-p626\n')
  const outsideGlob = await scriptedSession(rt, WS, [toolTurnCall('glob', { pattern: 'p626.txt', path: OUT_DIR })])
  const globResult = toolResults(await outsideGlob.next('allowed-once'))[0]
  expect(globResult?.isError).toBe(false)
  expect(globResult?.text).toContain('p626.txt')
  expect(askedCount(rt, outsideGlob.sessionId)).toBe(1)
})

// ── ⑦：never 子代理（ptc）写区外 → deny（修复前 never 会话的区外写也无卡成功）──

/** 已装 ptc worker bootstrap（/tmp worktree 下须复制进会话工作区，P5-05/P5-21 同法）。 */
function ptcBootstrapSource(): string {
  const store = join(PKG_ROOT, 'node_modules', '.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))
  if (!hit) throw new Error('dsh-ptc-runtime-node not found in the pnpm store')
  return join(store, hit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js')
}

it('⑦ never 子代理（ptc）写区外 → 本地 deny、宿主无文件、子会话 0 卡', { timeout: 420_000 }, async () => {
  const bootstrap = join(WS, '.p625-ptc-boot.mjs')
  copyFileSync(ptcBootstrapSource(), bootstrap)
  const dir = mkdtempSync(join(tmpdir(), 'bot-p626-sub-'))
  trackTmpDir(dir)
  const overlay = join(dir, 'sub.yml')
  writeFileSync(overlay, `\
# P6-25 ⑦：ptc worker 覆盖（subagent-policy / tiers-policy ⑤ 同法）
- id: ptc-runtime
  config:
    launch:
      kind: node-script
      executable: /usr/bin/node
      bootstrapPath: ${bootstrap}
`)
  const rt = await launchWo(overlay)
  const target = join(OUT_DIR, `sub-${R}.txt`)
  rmSync(target, { force: true })
  // root 脚本一次写全（fake 游标按会话持有，覆盖脚本会脱同步——P5-03 实测）
  const { sessionId: root } = (await rt.client.call('session/create', { request: { cwd: WS } })) as { sessionId: string }
  rt.writeScriptCalls(root, [
    toolTurnCall('subagent', { description: 'P6-25 probe', prompt: 'run the P6-25 child write-outside probe' }),
    textCall('已委派'),
  ])
  // 子会话脚本（default.json fallback）：区外写 + 收尾
  const childScriptDir = join(rt.home, 'fake', 'scripts')
  mkdirSync(childScriptDir, { recursive: true })
  writeFileSync(join(childScriptDir, 'default.json'), JSON.stringify({
    calls: [toolTurnCall('write', { file_path: target, content: 'p625-x' }), textCall('子会话完成')],
  }))
  await rt.client.call('session/prompt', {
    request: { requestId: `p6-25-${Date.now()}`, sessionId: root, mode: 'queue', content: [{ type: 'text', text: 'P6-25 委派' }] },
  })
  const deadline = Date.now() + 120_000
  let child = ''
  for (;;) {
    const hit = rt.readRequests().find((r) => r.sessionId !== null && r.sessionId !== root)
    if (hit) { child = hit.sessionId as string; break }
    if (Date.now() > deadline) throw new Error('120s 内没观察到子会话模型调用')
    await new Promise((r) => setTimeout(r, 50))
  }
  for (;;) {
    const calls = rt.readRequests().filter((r) => r.sessionId === child).length
    if (calls >= 2) break
    if (Date.now() > deadline + 120_000) throw new Error(`子会话只完成 ${calls}/2 段`)
    await new Promise((r) => setTimeout(r, 50))
  }
  const childResults = rt.readRequests()
    .filter((r) => r.sessionId === child)
    .flatMap((r) => r.toolResults ?? [])
  expect(
    childResults.some((t) => t.isError && t.text.includes(DENY_CODE)),
    'never 子代理的区外写是 P6-25 本地 deny（修复前：无卡成功写宿主 /tmp）',
  ).toBe(true)
  expect(existsSync(target), '宿主文件不存在').toBe(false)
  const childCards = rt.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === child)
  expect(childCards, 'never 子会话 0 卡').toHaveLength(0)
})
