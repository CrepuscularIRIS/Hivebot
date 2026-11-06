// P6-24 验收（PLAN p6-orchestration P6-24 + 决策 36 + Q-024 A + panels/D3-r1.md
// 必须回应 5 条转验收）：worker 继承发起者工作区后的真实 Loader 行为。全部经真实
// launcher + fake LLM + orchestration.yml（envelope 生效）：
//   ② worker（cwd = 主 bot 目录）bash 与 write 各写一文件 → 宿主路径就在主 bot 目
//      录、主 bot 下一回合 read 两者成功、文件工具 0 卡；worker bash 能读主 bot 先写
//      的文件（同一挂载视图：替换而非叠加，bwrap 挂载面不因共用变大）。
//   ⑤ 无关 bot 仍写不进主 bot 目录；worker 也写不进别的 bot 工作区（P6-14 格）。
//   ① worker 的 write/edit 拒写 AGENTS.md / CLAUDE.md（含软链逃逸与 .local 变体）；
//      主 bot 自己写 AGENTS.md 不受限（拒的是 worker 信封，不是文件本身）。
//   ④ 删除 worker（bots.json 移除条目）后主 bot 目录文件清单不变；worker 从未
//      mint 过独立工作区（workspaces/<workerId> 不存在）。
// main 侧 cwd 解析 / fail closed / subdir 语法由 app/ui/tests/unit/m3/p624.test.ts
// 钉住；本文件钉 SDK 侧运行时行为。只结束自己 spawn 的子进程（stop 自管）。
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { BotsMetaStore } from '/tmp/bot-wt/P6-24/app/ui/main/m3-meta/store.ts'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from '/tmp/bot-wt/P6-24/app/sdk/node_modules/vitest/dist/index.js'
import { connect } from '/tmp/bot-wt/P6-24/app/sdk/examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '/tmp/bot-wt/P6-24/app/sdk/tests/support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '/tmp/bot-wt/P6-24/app/sdk/tests/support/fake/harness.ts'
import { tmkdir } from '/tmp/bot-wt/P6-24/app/sdk/tests/support/tmp-sweep.ts'

const PKG_ROOT = '/tmp/bot-wt/P6-24/app/sdk'
const ORCH_YML = join(PKG_ROOT, 'profile', 'patches', 'orchestration.yml')
const TEST_ROOT = tmkdir('bot-p624-run-')
const TEST_HOME = join(TEST_ROOT, 'home')
mkdirSync(TEST_HOME)
const DATA_DIR = join(TEST_HOME, 'pbots-data')
const MAIN_WS = join(DATA_DIR, 'workspaces', 'p6-main')
const OTHER_WS = join(DATA_DIR, 'workspaces', 'p-other')
const SUB_WS = join(MAIN_WS, 'sub')
const MAIN = 'p6-main'
const WORKER = 'p6-w1'
const WORKER_SUB = 'p6-w2'
const PLAIN = 'p6-other'

interface EventsFrame {
  type: string
  event?: string
  eventId?: string
  agentId?: string
}

interface Feed {
  frames: EventsFrame[]
  answer(frame: EventsFrame, value: string): Promise<unknown>
  close(): void
}

interface WRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
}

const runtimes: WRuntime[] = []

function fakeOverlay(): string {
  const dir = tmkdir('bot-p624-patch-')
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
`)
  return overlay
}

async function openFeed(rt: Runtime): Promise<Feed> {
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
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

/** bots.json 落盘（契约：零 worker 省略 bots 键；有 worker 写 createdBy）。 */
const writeBots = (bots: Record<string, { createdBy: string }>) => {
  writeFileSync(join(DATA_DIR, 'bots.json'), JSON.stringify({
    version: 1, mainBotId: MAIN, recipes: {}, ...(Object.keys(bots).length === 0 ? {} : { bots }),
  }))
}

beforeAll(async () => {
  mkdirSync(MAIN_WS, { recursive: true })
  mkdirSync(OTHER_WS, { recursive: true })
  mkdirSync(SUB_WS, { recursive: true })
  mkdirSync(join(MAIN_WS, 'normal', 'AGENTS.md'), { recursive: true })
  writeBots({ [WORKER]: { createdBy: MAIN }, [WORKER_SUB]: { createdBy: MAIN } })
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_HOME: join(TEST_ROOT, 'dsh'),
      P2SDK_PATCH: `${fakeOverlay()}:${ORCH_YML}`,
      PBOTS_DATA_DIR: DATA_DIR,
      P2SDK_ORCH_DATA_DIR: DATA_DIR,
    },
  })
  const feed = await openFeed(rt)
  const t: WRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
  runtimes.push(t)
  // 四个会话：主 bot、两个 worker（一个直接在主目录、一个在子目录）、无关普通 bot。
  for (const [id, cwd] of [[MAIN, MAIN_WS], [WORKER, MAIN_WS], [WORKER_SUB, SUB_WS], [PLAIN, OTHER_WS]] as Array<[string, string]>) {
    await t.client.call('session/create', { request: { sessionId: id, cwd } })
  }
  // P5-03：fake 游标 per-session 连续——每个会话的全部回合脚本一次性写全，按模型调用
  // 顺序排列（每回合 = 若干单工具调用 + 一个收尾 text）。turn() 只 prompt 不再写脚本。
  writeFileSync(join(MAIN_WS, 'seed.txt'), 'main-seed') // 先于 worker 回合存在
  // WORKER 的三个回合按 it 声明序排列：②（双通道写入）→ ⑤（写别的工作区）→ ①（指令文件）
  t.writeScriptCalls(WORKER, [
    toolCall('bash', { command: 'cat seed.txt', description: 'read the main bot seed file' }),
    toolCall('bash', { command: 'echo from-bash > bash-note.txt', description: 'write via bash into the shared workspace' }),
    toolCall('write', { file_path: 'write-note.txt', content: 'from-write' }),
    toolCall('write', { file_path: 'normal/AGENTS.md/notes.md', content: 'ordinary-directory-success' }),
    textCall('P6-24 完成'),
    toolCall('write', { file_path: join(OTHER_WS, 'x.txt'), content: 'nope' }),
    textCall('P6-24 完成'),
    // ① 指令文件回合（前置文件由该 it 在回合前补写，路径已在此固定）
    toolCall('write', { file_path: join(MAIN_WS, 'AGENTS.md'), content: 'hijack' }),
    toolCall('edit', { file_path: join(MAIN_WS, 'CLAUDE.md'), old_string: 'orig', new_string: 'hijack' }),
    toolCall('write', { file_path: join(MAIN_WS, 'AGENTS.local.md'), content: 'hijack' }),
    toolCall('write', { file_path: join(MAIN_WS, 'link.md'), content: 'hijack-via-link' }),
    // f1 HIGH#1 反向软链：CLAUDE.local.md → innocent.md；先 read 满足上游
    // read-before-edit（P5-06 ⑤），再 edit 指令名本身
    toolCall('read', { file_path: join(MAIN_WS, 'CLAUDE.local.md') }),
    toolCall('edit', { file_path: join(MAIN_WS, 'CLAUDE.local.md'), old_string: 'innocent', new_string: 'injected-instruction' }),
    textCall('P6-24 完成'),
  ])
  t.writeScriptCalls(MAIN, [
    toolCall('read', { file_path: join(MAIN_WS, 'bash-note.txt') }),
    toolCall('read', { file_path: join(MAIN_WS, 'write-note.txt') }),
    textCall('P6-24 完成'),
    // ① 主 bot 对照：先 read 满足上游 read-before-write（P5-06 ⑤），再 write
    toolCall('read', { file_path: join(MAIN_WS, 'AGENTS.md') }),
    toolCall('write', { file_path: join(MAIN_WS, 'AGENTS.md'), content: 'by-main' }),
    textCall('P6-24 完成'),
  ])
  t.writeScriptCalls(WORKER_SUB, [
    toolCall('write', { file_path: 'sub-note.txt', content: 'in-sub' }),
    textCall('P6-24 完成'),
  ])
  t.writeScriptCalls(PLAIN, [
    toolCall('write', { file_path: join(MAIN_WS, 'y.txt'), content: 'nope' }),
    textCall('P6-24 完成'),
  ])
}, 120_000)

afterAll(async () => { for (const rt of runtimes) { await rt.stop(); rt.feed.close() } })

/**
 * 跑一个 prompt 回合（脚本已在 beforeAll 一次性写全——P5-03：fake 游标 per-session
 * 连续，覆盖脚本会脱同步）。返回本回合全部 tool result。
 */
async function turn(h: WRuntime, sessionId: string, label: string, answer: 'allowed-once' | 'rejected' | 'none' = 'allowed-once'): Promise<Array<{ isError: boolean; text: string }>> {
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await h.client.call('session/prompt', {
    request: { requestId: `p6-24-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: label }] },
  })
  const answered = new Set<string>()
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
    const ended = frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')
    const results = frames.filter((f) => f.type === 'event' && f.event?.type === 'tool/result').length
    const called = frames.filter((f) => f.type === 'event' && f.event?.type === 'tool/call').length
    if (ended && results >= called && called > 0) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到（${sessionId} ${label}）；answered=${answered.size}；尾部：${JSON.stringify(frames.slice(-4)).slice(0, 400)}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const out: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    out.push({ isError: data.message?.isError === true, text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n') })
  }
  return out
}

function toolCall(name: string, args: object): object {
  const id = `p6-24-${Math.random().toString(16).slice(2, 8)}`
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

const askedFrom = (h: WRuntime, sessionId: string): number =>
  h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length

/** 完整清单：相对路径、目录、软链原文、文件 SHA256（不按 utf8 解码、不排除名字）。 */
function inventory(dir: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (d: string, rel: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      const r = join(rel, name)
      const stat = lstatSync(p)
      if (stat.isSymbolicLink()) out.push([r, `link:${readlinkSync(p)}`])
      else if (stat.isDirectory()) { out.push([r, 'directory']); walk(p, r) }
      else out.push([r, createHash('sha256').update(readFileSync(p)).digest('hex')])
    }
  }
  walk(dir, '')
  return out
}

it('② 共用目录：worker bash/write 双通道落主 bot 目录，主 bot 下一回合 read 成功、文件工具 0 卡；worker 能读主 bot 先写的文件（同一挂载视图）', { timeout: 180_000 }, async () => {
  const h = runtimes[0]!
  const before = askedFrom(h, WORKER)
  const results = await turn(h, WORKER, '② worker 双通道写入')
  // bash 两调（cat / echo）：读到了主 bot 的文件（同一视图），写入成功
  expect(results[0]!.isError, `bash cat: ${results[0]!.text}`).toBe(false)
  expect(results[0]!.text).toContain('main-seed')
  expect(results[1]!.isError, `bash echo: ${results[1]!.text}`).toBe(false)
  // write 工具：无卡（工作区内 workspace-write 档）且成功
  expect(results[2]!.isError, `write: ${results[2]!.text}`).toBe(false)
  // 宿主路径就在主 bot 目录
  expect(readFileSync(join(MAIN_WS, 'bash-note.txt'), 'utf8').trim()).toBe('from-bash')
  expect(readFileSync(join(MAIN_WS, 'write-note.txt'), 'utf8')).toBe('from-write')
  expect(results[3]!.isError, results[3]!.text).toBe(false)
  expect(readFileSync(join(MAIN_WS, 'normal', 'AGENTS.md', 'notes.md'), 'utf8')).toBe('ordinary-directory-success')
  console.log('DIRECTORY_BASENAME_NORMAL', JSON.stringify(results[3]))
  // 主 bot 下一回合直接 read 两者（验收 ② 后半）
  const mainReads = await turn(h, MAIN, '② 主 bot 下一回合 read')
  expect(mainReads[0]!.isError).toBe(false)
  expect(mainReads[0]!.text).toContain('from-bash')
  expect(mainReads[1]!.isError).toBe(false)
  expect(mainReads[1]!.text).toContain('from-write')
  // write 的 0 卡断言：本回合 3 工具里 write 是唯一文件工具，bash 的卡不计数
  const askedNow = askedFrom(h, WORKER)
  expect(askedNow - before).toBe(2) // 恰好两次 bash 卡（cat + echo），write 0 卡
  expect(existsSync(join(DATA_DIR, 'workspaces', WORKER))).toBe(false) // 未 mint 独立目录
})

it('⑤ 隔离不放宽：worker 写别的 bot 工作区拒；无关 bot 写主 bot 目录拒（P6-24⑤ / P6-14 格）', { timeout: 120_000 }, async () => {
  const h = runtimes[0]!
  const wBefore = askedFrom(h, WORKER)
  const pBefore = askedFrom(h, PLAIN)
  const wOut = await turn(h, WORKER, '⑤ worker 写别的工作区', 'none')
  expect(wOut[0]!.isError).toBe(true)
  expect(existsSync(join(OTHER_WS, 'x.txt'))).toBe(false)
  expect(askedFrom(h, WORKER) - wBefore).toBe(0) // 不出卡（区外写硬拒）
  const pOut = await turn(h, PLAIN, '⑤ 无关 bot 写主 bot 目录', 'none')
  expect(pOut[0]!.isError).toBe(true)
  expect(existsSync(join(MAIN_WS, 'y.txt'))).toBe(false)
  expect(askedFrom(h, PLAIN) - pBefore).toBe(0)
})

it('① 指令文件拒写：AGENTS.md / CLAUDE.md / .local 变体 / 正反软链逃逸全拒且内容不变；主 bot 写自己的 AGENTS.md 不受限', { timeout: 180_000 }, async () => {
  const h = runtimes[0]!
  writeFileSync(join(MAIN_WS, 'CLAUDE.md'), 'orig-claude')
  writeFileSync(join(MAIN_WS, 'AGENTS.local.md'), 'orig-local')
  writeFileSync(join(MAIN_WS, 'AGENTS.md'), 'orig-agents')
  symlinkSync('AGENTS.md', join(MAIN_WS, 'link.md'))
  // f1 HIGH#1 反向软链：指令名 → 普通文件（resolved basename 无害、raw 名命中）
  writeFileSync(join(MAIN_WS, 'innocent.md'), 'innocent')
  symlinkSync('innocent.md', join(MAIN_WS, 'CLAUDE.local.md'))
  const before = askedFrom(h, WORKER)
  const results = await turn(h, WORKER, '① worker 写指令文件', 'none')
  for (const [i, want] of ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'link.md'].entries()) {
    expect(results[i]!.isError, `${want} 应被信封拒`).toBe(true)
    expect(results[i]!.text).toContain('instruction files')
  }
  // 反向软链：read 可读（信封不拦读），edit 必须拒且宿主字节不变（经 CLAUDE.local.md
  // 实改 innocent.md = 给主 bot 注入指令，HIGH#1）
  expect(results[4]!.isError, `read CLAUDE.local.md: ${results[4]!.text}`).toBe(false)
  expect(results[5]!.isError, '反向软链 CLAUDE.local.md→innocent.md 的 edit 应被信封拒').toBe(true)
  expect(results[5]!.text).toContain('instruction files')
  expect(readFileSync(join(MAIN_WS, 'innocent.md'), 'utf8')).toBe('innocent')
  expect(readFileSync(join(MAIN_WS, 'AGENTS.md'), 'utf8')).toBe('orig-agents')
  expect(readFileSync(join(MAIN_WS, 'CLAUDE.md'), 'utf8')).toBe('orig-claude')
  expect(readFileSync(join(MAIN_WS, 'AGENTS.local.md'), 'utf8')).toBe('orig-local')
  expect(askedFrom(h, WORKER) - before).toBe(0) // 拒不出卡
  // 主 bot 不受限（信封只挂 worker；用户可让主 bot 维护自己的指令文件）
  const mainOut = await turn(h, MAIN, '① 主 bot 写自己的 AGENTS.md')
  expect(mainOut[0]!.isError, `main write AGENTS.md: ${mainOut[0]!.text}`).toBe(false)
  expect(readFileSync(join(MAIN_WS, 'AGENTS.md'), 'utf8')).toBe('by-main')
})

it('subdir worker：产物落主 bot 目录的子目录（Q-024 任务自适应）', { timeout: 120_000 }, async () => {
  const h = runtimes[0]!
  const out = await turn(h, WORKER_SUB, 'subdir worker 写子目录')
  expect(out[0]!.isError, `write in subdir: ${out[0]!.text}`).toBe(false)
  expect(readFileSync(join(MAIN_WS, 'sub', 'sub-note.txt'), 'utf8')).toBe('in-sub')
})

it('④ 删除边界（硬门槛）：真实 removeBot 存储 API 删除 worker 后完整字节清单不变', { timeout: 60_000 }, async () => {
  writeFileSync(join(MAIN_WS, 'binary.bin'), Buffer.from([0, 255, 254, 128, 1]))
  mkdirSync(join(MAIN_WS, 'empty-directory'))
  symlinkSync('binary.bin', join(MAIN_WS, 'binary-link'))
  const before = inventory(MAIN_WS)
  expect(before.map(([p]) => p)).toContain('bash-note.txt')
  expect(before.map(([p]) => p)).toContain('write-note.txt')
  // 真实 M3 单写者 API，不再手改元数据；这里只证明存储删除边界，非 session/delete
  // 用户旅程（本分支没有该 RPC / UI 入口）。保留主 bot、配方与另一 worker。
  const store = new BotsMetaStore(DATA_DIR)
  try {
    await store.init()
    await store.removeBot(WORKER)
    expect(store.read().bots).toEqual({ [WORKER_SUB]: { createdBy: MAIN } })
    await store.removeBot(WORKER_SUB)
    expect(store.read().bots).toBeUndefined()
  } finally { store.close() }
  const reopened = new BotsMetaStore(DATA_DIR)
  try {
    await reopened.init()
    expect(reopened.read()).toEqual({ version: 1, mainBotId: MAIN, recipes: {} })
  } finally { reopened.close() }
  const listed = await runtimes[0]!.client.call('session/list', { _request: {} }) as { items: Array<{ sessionId: string }> }
  const ids = listed.items.map((item) => item.sessionId)
  expect(ids).toContain(WORKER)
  expect(ids).toContain(WORKER_SUB)
  console.log('AFTER_REMOVE_BOT_SESSIONS', JSON.stringify({ workerStillPresent: ids.includes(WORKER), subWorkerStillPresent: ids.includes(WORKER_SUB) }))
  const after = inventory(MAIN_WS)
  expect(after).toEqual(before)
  // worker 从未 mint 独立工作区（没有可误删的第二目录）
  expect(existsSync(join(DATA_DIR, 'workspaces', WORKER))).toBe(false)
  expect(existsSync(join(DATA_DIR, 'workspaces', WORKER_SUB))).toBe(false)
  expect(relative(DATA_DIR, MAIN_WS)).toBe(join('workspaces', MAIN))
})
