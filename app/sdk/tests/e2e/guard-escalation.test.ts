// P5-04 验收 ①–④（PLAN p5-parity 0d，G#5 前半，决策 10）：拒绝裸升权。
// guard.mjs 对任何工具 arguments.sandbox_permissions === 'danger-full-access'
// → deny（固定字面串 'escalation path not available'，v2.1 定死，P5-05 ② /
// P5-06 按此断言），判定插在 NEVER_TOOLS 之后、路径判定之前。堵的是真实
// 无沙箱路径（上游证据：bash-sandbox index.ts:92-100 mode===dfa 直接
// super.execute 不进 wrapper；sandbox/escalation.ts:30-31 WIDER_MODES 里
// dfa 是一切模式的升权终点；write/edit 同参数名，fs 工具 dfa 调用不受
// fs-sandbox 约束）。全部经真实 launcher + fake LLM，HOME=.test-homes/p5-04
//（决策 8）；哨兵是合成文件，只验证存在性/内容回读，不碰真实凭证。
// ① bash `cat <哨兵>` 带 dfa 参数 → deny、asked === 0、标记文件不存在；
// ② write / edit 带同参数写工作区外 → deny（原因必须是 dfa 字面串，不是
//    P5-02 的路径原因）、宿主无新文件 / 原文件不变、asked === 0；
// ③ 差分：stock（禁用 p2sdk-fs-guard）下同一 bash 产生 approval/asked，
//    批准后确实读到哨兵（无沙箱执行真发生了）；
// ④ 不带升权参数的普通 bash 行为与合入前一致：出卡 1 次、批准后执行成功。
// fake 插件按会话持内存游标（REPORT-P5-03 坑 1）：每 turn 新会话。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = '/home/lingxufeng/bot/.test-homes/p5-04'
const DATA_DIR = join(TEST_HOME, 'pbots-data')
/** P5-04 v2.1 定死的 deny 字面串（与 src/policy/guard.mjs 同源断言）。 */
export const DFA_REASON = 'escalation path not available'
/** 合成哨兵：wrapper 遮蔽的 $HOME/.ssh 下（P5-01 ②：加固 bash test -e 退出码 1）。 */
const SENTINEL = join(TEST_HOME, '.ssh', 'dfa-sentinel')
const SENTINEL_CONTENT = `p504-dfa-sentinel-${Math.random().toString(16).slice(2, 8)}`

interface Feed {
  frames: Array<{ type: string; event?: string; eventId?: string; agentId?: string }>
  answer(frame: { eventId?: string }, value: string): Promise<unknown>
  close(): void
}

interface EscRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
}

const runtimes: EscRuntime[] = []

function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-04-patch-'))
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

/** stock 差分：禁用 p2sdk-fs-guard（guard-fs.test.ts 同款）。 */
function stockOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-04-stock-'))
  const overlay = join(dir, 'stock.yml')
  writeFileSync(overlay, `\
# P5-04 差分对照：恢复 stock（无 dfa 参数 guard）
- id: p2sdk-fs-guard
  disabled: true
`)
  return overlay
}

async function openFeed(rt: Runtime): Promise<Feed> {
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: Feed['frames'] = []
  const drained = (async () => { for await (const f of stream) frames.push(f as Feed['frames'][number]) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return {
    frames,
    answer: (frame, value) => client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); void drained; client.close() },
  }
}

async function launchEsc(stock: boolean): Promise<EscRuntime> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_PATCH: stock ? `${fakeOverlay()}:${stockOverlay()}` : fakeOverlay(),
      PBOTS_DATA_DIR: DATA_DIR,
    },
  })
  const feed = await openFeed(rt)
  const g: EscRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
  }
  runtimes.push(g)
  return g
}

/** 一个模型响应里的 tool-call block 们 + 收尾 text。 */
function multiToolCall(calls: Array<{ name: string; args: object }>): object {
  const blocks = calls.map((c, i) => {
    const id = `p5-04-${Math.random().toString(16).slice(2, 8)}-${i}`
    const argumentsJson = JSON.stringify(c.args)
    return [
      { type: 'block-start', index: i, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: i, id, name: c.name, argumentsDelta: argumentsJson },
      { type: 'block-end', index: i, block: { type: 'tool-call', id, name: c.name, arguments: argumentsJson } },
    ]
  }).flat()
  return {
    chunks: [...blocks, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } }],
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

interface ToolResultView { toolCallId: string; isError: boolean; text: string }

/** dfa 升权 bash 调用：读哨兵并把内容落进工作区标记文件（①与③用同一命令）。 */
function dfaBashCall(marker: string): { name: string; args: object } {
  return {
    name: 'bash',
    args: {
      command: `cat ${SENTINEL} > ${marker} 2>&1; echo cat_rc=$?`,
      description: 'P5-04 danger-full-access escalation probe',
      sandbox_permissions: 'danger-full-access',
      justification: 'P5-04 dfa 探针：验证升权路径',
    },
  }
}

/** 一个 turn（新会话，fake 游标坑）：prompt → 可选等待 approval → 等收尾。 */
async function turn(
  h: EscRuntime,
  cwd: string,
  calls: object[],
  onApproval?: (frame: { eventId?: string }) => Promise<void>,
): Promise<{ sessionId: string; results: Map<string, ToolResultView> }> {
  const { sessionId } = (await h.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [...calls, textCall('P5-04 完成')])
  await h.client.call('session/prompt', {
    request: { requestId: `p5-04-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-04 探针' }] },
  })
  const deadline = Date.now() + 60_000
  for (;;) {
    if (onApproval !== undefined) {
      const f = h.feed.frames.find((fr) => fr.type === 'waterfall' && fr.event === 'approval/request' && fr.agentId === sessionId)
      if (f !== undefined) await onApproval(f)
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到；尾部：${JSON.stringify(frames.slice(-4))}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const results = new Map<string, ToolResultView>()
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const data = f.event.data as { message?: { toolCallId?: string; isError?: boolean; content?: Array<{ type: string; text?: string }> } }
    results.set(data.message?.toolCallId ?? '', {
      toolCallId: data.message?.toolCallId ?? '',
      isError: data.message?.isError === true,
      text: (data.message?.content ?? []).map((c) => c.text ?? '').join('\n'),
    })
  }
  return { sessionId, results }
}

function askedFor(h: EscRuntime, sessionId: string): number {
  return h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
}

let GUARD_RT: EscRuntime
let STOCK_RT: EscRuntime

beforeAll(async () => {
  mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
  mkdirSync(join(TEST_HOME, 'workspace'), { recursive: true })
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(SENTINEL, SENTINEL_CONTENT)
  GUARD_RT = await launchEsc(false)
  STOCK_RT = await launchEsc(true)
}, 180_000)

afterAll(async () => {
  for (const h of runtimes) {
    h.feed.close()
    await h.stop()
  }
})

it('① dfa 升权 bash：deny + dfa 字面原因 + asked 0 + 标记文件不存在', { timeout: 180_000 }, async () => {
  expect(existsSync(SENTINEL), '前提：宿主侧哨兵存在').toBe(true)
  const marker = join(TEST_HOME, 'workspace', 'leak-dfa-guarded.txt')
  const { sessionId, results } = await turn(GUARD_RT, join(TEST_HOME, 'workspace'), [multiToolCall([dfaBashCall(marker)])])
  expect(askedFor(GUARD_RT, sessionId), 'deny 不出卡').toBe(0)
  expect(results.size, '一个 tool result').toBe(1)
  const r = [...results.values()][0]!
  expect(r.isError, 'deny 时 isError').toBe(true)
  expect(r.text, '原因带 guard 前缀').toContain('p2sdk-fs-guard')
  expect(r.text, `原因含 v2.1 定死的字面串 "${DFA_REASON}"`).toContain(DFA_REASON)
  expect(existsSync(marker), '命令未执行：标记文件不存在').toBe(false)
})

it('② dfa 升权 write/edit 工作区外：deny（dfa 原因，非路径原因）+ 宿主无副作用 + asked 0', { timeout: 180_000 }, async () => {
  const outsideWrite = join(TEST_HOME, 'dfa-outside-write.txt')
  const outsideEdit = join(TEST_HOME, 'dfa-outside-edit.txt')
  const editBefore = createHash('sha256').update('p504-original').digest('hex')
  writeFileSync(outsideEdit, 'p504-original')
  const dfa = { sandbox_permissions: 'danger-full-access', justification: 'P5-04 dfa 探针：验证升权路径' }
  const { sessionId, results } = await turn(GUARD_RT, join(TEST_HOME, 'workspace'), [
    multiToolCall([
      { name: 'write', args: { file_path: outsideWrite, content: 'p504-x', ...dfa } },
      { name: 'edit', args: { file_path: outsideEdit, old_string: 'p504-original', new_string: 'p504-x', ...dfa } },
    ]),
  ])
  expect(askedFor(GUARD_RT, sessionId), 'deny 不出卡').toBe(0)
  expect(results.size, '两个 tool result').toBe(2)
  for (const r of results.values()) {
    expect(r.isError, `${r.toolCallId} deny 时 isError`).toBe(true)
    expect(r.text, '原因是 dfa 字面串（区分 P5-02 路径原因）').toContain(DFA_REASON)
    expect(r.text, '不是 masked/read-only 路径原因').not.toContain('masked area')
  }
  expect(existsSync(outsideWrite), 'write 未执行：宿主无新文件').toBe(false)
  expect(createHash('sha256').update(readFileSync(outsideEdit)).digest('hex'), 'edit 未执行：原文件不变').toBe(editBefore)
})

it('③ 差分：stock 下同一 dfa bash 出卡，批准后哨兵真被读到（真实无沙箱路径）', { timeout: 180_000 }, async () => {
  const marker = join(TEST_HOME, 'workspace', 'leak-dfa-stock.txt')
  let answered = 0
  const { sessionId } = await turn(STOCK_RT, join(TEST_HOME, 'workspace'), [multiToolCall([dfaBashCall(marker)])], async (frame) => {
    if (answered === 0) {
      answered++
      await STOCK_RT.feed.answer(frame, 'allowed-once')
    }
  })
  expect(answered, 'stock 下同一调用产生 approval/asked').toBe(1)
  expect(askedFor(STOCK_RT, sessionId), 'asked 恰 1').toBe(1)
  expect(existsSync(marker), '批准后命令真执行（无沙箱路径存在）').toBe(true)
  expect(readFileSync(marker, 'utf8').trim(), '哨兵内容真被读到').toBe(SENTINEL_CONTENT)
})

it('④ 不带升权参数的普通 bash 与合入前一致：出卡 1 次、批准后执行', { timeout: 180_000 }, async () => {
  const marker = join(TEST_HOME, 'workspace', 'parity-marker.txt')
  const ordinaryBash = {
    name: 'bash',
    args: { command: `echo p504-parity > ${marker}`, description: 'P5-04 普通调用行为一致性探针' },
  }
  let answered = 0
  const { sessionId } = await turn(GUARD_RT, join(TEST_HOME, 'workspace'), [multiToolCall([ordinaryBash])], async (frame) => {
    if (answered === 0) {
      answered++
      await GUARD_RT.feed.answer(frame, 'allowed-once')
    }
  })
  expect(answered, '普通 bash 照旧出卡').toBe(1)
  expect(askedFor(GUARD_RT, sessionId), 'asked 恰 1').toBe(1)
  expect(existsSync(marker), '批准后照旧执行').toBe(true)
  expect(readFileSync(marker, 'utf8').trim(), '命令真实执行').toBe('p504-parity')
})
