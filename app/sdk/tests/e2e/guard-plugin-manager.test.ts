// P5-03 验收 ①–③（PLAN p5-parity 0c，G1-r2 #2 / B A10）：plugin_manager 移除。
// 双保险：approval.yml 按 id 整 config 覆盖三个 preset 行（standard/cordis/ptc）
// 的嵌套 tool-plugin-manager 为 disabled: true（cordis/ptc 同名嵌套行一并锁死）；
// guard.mjs 对工具名 plugin_manager 加硬 NEVER（后层 patch 把工具重新启用时，
// 调用仍在 pre-execute waterfall 最前被拒，不出卡）。
// ① 每个会加载的 preset（standard 默认 / cordis / ptc / minimal）的模型工具表
//    不含 plugin_manager（llm/stream 记录侧断言）；
// ② 后层 patch 以最小 config 重新启用该行后，fake 强行调 list_plugins /
//    set_plugin(停用 p2sdk-shell-ask) / install_bundle 三种 action → 每个
//    isError + 原因、asked === 0、$DSH_HOME/profiles 树与 runtime-patch.yml
//    快照前后不变；
// ③ 差分：stock（禁用 p2sdk-fs-guard）下同一 list_plugins 调用产生
//    approval/request（asked ≥ 1），作答 rejected 后无副作用。
// 另含文本级 drift 检查：approval.yml 的三个覆盖块 = 已装 preset 文件的
// insert 行 dedent 后仅翻 disabled 一键（上游变更 → 红）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { clearRealKeys, waitFor, type Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_HOME = tmkdir('bot-p605f1-pm-home-')

/** 已装 dsh-web-app 的 presets 目录（经 realpath 后的 dsh 包解析，pnpm 布局）。 */
const WEBAPP_PRESETS = (() => {
  const require = createRequire(join(realpathSync(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh')), 'lib', 'bin.js'))
  return join(dirname(require.resolve('@deepseek-ai/dsh-web-app/package.json')), 'presets')
})()

interface Feed {
  frames: Array<{ type: string; event?: string; eventId?: string; agentId?: string }>
  answer(frame: { eventId?: string }, value: string): Promise<unknown>
  close(): void
}

interface PmRuntime extends Runtime {
  feed: Feed
  writeScriptCalls(sessionId: string, calls: object[]): void
  /** llm/stream 记录（config.test.ts 同款）：sessionId → 各次请求的工具名集合。 */
  readToolNames(): Map<string, string[][]>
}

const runtimes: PmRuntime[] = []

/** fake LLM + llm/stream 记录器（工具表断言用）。 */
function recorderOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-03-patch-'))
  writeFileSync(join(dir, 'recorder.mjs'), `\
// P5-03 request-side recorder: per-request tool names at llm/stream.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p2sdk-llm-recorder'

export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    const home = process.env.DSH_HOME
    if (home === undefined) throw new Error('p2sdk-llm-recorder: $DSH_HOME is not set')
    appendFileSync(join(home, 'fake', 'llm-streams.jsonl'), \`\${JSON.stringify({
      ts: Date.now(),
      sessionId: options.sessionId === undefined ? 'null' : String(options.sessionId),
      toolNames: (options.tools ?? []).map((t) => t.name).sort(),
    })}\\n\`)
    return next()
  })
}
`)
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
    - id: p2sdk-llm-recorder
      name: '${pathToFileURL(join(dir, 'recorder.mjs')).href}'
`)
  return overlay
}

/** stock 差分：禁用 p2sdk-fs-guard（guard-fs.test.ts 同款）。 */
function stockOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-03-stock-'))
  const overlay = join(dir, 'stock.yml')
  writeFileSync(overlay, `\
# P5-03 差分对照：恢复 stock（无 plugin_manager 名字 NEVER）
- id: p2sdk-fs-guard
  disabled: true
`)
  return overlay
}

/** 后层 patch 重新启用该行：preset-standard 的最小 config，只挂 tool-plugin-manager。 */
function reenableOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p5-03-reenable-'))
  const overlay = join(dir, 'reenable.yml')
  writeFileSync(overlay, `\
# P5-03 ②/③ 前提：后层 --patch 按 id 覆盖 preset-standard 的 config.plugins，
# 重新启用 tool-plugin-manager（其余 sibling 行不进本最小 config）。
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    order: 1
    plugins:
      - id: tool-plugin-manager
        name: '@deepseek-ai/dsh-plugin-manager/tools'
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

interface LaunchOpts { stock?: boolean; reenable?: boolean }

async function launchPm(opts: LaunchOpts = {}): Promise<PmRuntime> {
  clearRealKeys()
  const patches = [recorderOverlay()]
  if (opts.reenable) patches.push(reenableOverlay())
  if (opts.stock) patches.push(stockOverlay())
  const rt = await launchRuntime({ env: { HOME: TEST_HOME, P2SDK_PATCH: patches.join(':') } })
  const feed = await openFeed(rt)
  const g: PmRuntime = {
    ...rt,
    feed,
    writeScriptCalls(sessionId, calls) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    readToolNames() {
      const out = new Map<string, string[][]>()
      const lines = readFileSync(join(rt.home, 'fake', 'llm-streams.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
      for (const line of lines) {
        const r = JSON.parse(line) as { sessionId: string; toolNames: string[] }
        const list = out.get(r.sessionId) ?? []
        list.push(r.toolNames)
        out.set(r.sessionId, list)
      }
      return out
    },
  }
  runtimes.push(g)
  return g
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

/** 一个模型响应里的多个 tool-call block（并行执行）+ 收尾 text。 */
function multiToolCall(calls: Array<{ name: string; args: object }>): object {
  const blocks = calls.map((c, i) => {
    const id = `p5-03-${Math.random().toString(16).slice(2, 8)}-${i}`
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

interface ToolResultView { toolCallId: string; isError: boolean; text: string }

/** 一个 turn（给定脚本）；返回按 toolCallId 索引的结果 + asked 数。 */
async function pmTurn(
  h: PmRuntime,
  sessionId: string,
  calls: object[],
): Promise<{ results: Map<string, ToolResultView>; asked: number }> {
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [...calls, textCall('P5-03 完成')])
  await h.client.call('session/prompt', {
    request: { requestId: `p5-03-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-03 探针' }] },
  })
  const deadline = Date.now() + 60_000
  for (;;) {
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
  const asked = h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
  return { results, asked }
}

/** $DSH_HOME/profiles 树 + runtime-patch.yml 的内容快照（②/③ 副作用断言）。 */
function snapshotHome(home: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const rel = relative(home, p)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else out.set(rel, createHash('sha256').update(readFileSync(p)).digest('hex'))
    }
  }
  const profiles = join(home, 'profiles')
  if (existsSync(profiles)) walk(profiles)
  const patch = join(home, 'runtime-patch.yml')
  out.set('runtime-patch.yml', existsSync(patch) ? createHash('sha256').update(readFileSync(patch)).digest('hex') : 'absent')
  return out
}

/** 会话创建（preset 缺省 = standard）。 */
async function createSession(h: PmRuntime, agentPreset?: string): Promise<string> {
  const request: Record<string, string> = { cwd: join(h.home, 'workspace') }
  if (agentPreset !== undefined) request.agentPreset = agentPreset
  const { sessionId } = (await h.client.call('session/create', { request })) as { sessionId: string }
  return sessionId
}

/** 文本 turn（工具表断言只需驱动一次 llm 请求）。 */
async function warmTurn(h: PmRuntime, sessionId: string): Promise<void> {
  await pmTurn(h, sessionId, [])
}

const PM_ACTIONS = [
  { name: 'plugin_manager', args: { action: 'list_plugins' } },
  { name: 'plugin_manager', args: { action: 'set_plugin', target: 'p2sdk-shell-ask', enabled: false } },
  { name: 'plugin_manager', args: { action: 'install_bundle', target: 'left-pad' } },
]

beforeAll(async () => {
  mkdirSync(TEST_HOME, { recursive: true })
})

afterAll(async () => {
  for (const h of runtimes) {
    h.feed.close()
    await h.stop()
  }
})

it('① 每个会加载的 preset 的模型工具表不含 plugin_manager', { timeout: 240_000 }, async () => {
  const h = await launchPm()
  const cases: Array<{ label: string; preset?: string }> = [
    { label: 'standard（默认会话，不带 agentPreset）' },
    { label: 'cordis', preset: 'cordis' },
    { label: 'ptc', preset: 'ptc' },
    { label: 'minimal', preset: 'minimal' },
  ]
  const sessionIds: string[] = []
  for (const c of cases) {
    const sessionId = await createSession(h, c.preset)
    sessionIds.push(sessionId)
    await warmTurn(h, sessionId)
  }
  const records = h.readToolNames()
  expect(records.size, '四个会话都驱动了 llm 请求').toBeGreaterThanOrEqual(4)
  for (const sessionId of sessionIds) {
    const requests = records.get(sessionId)
    expect(requests, `会话 ${sessionId} 有 llm 请求记录`).toBeDefined()
    for (const tools of requests!) {
      expect(tools, `会话 ${sessionId} 工具表不含 plugin_manager`).not.toContain('plugin_manager')
    }
  }
})

it('② 重新启用后 guard 名字 NEVER 拦三种 action：asked 0、报错带原因、无副作用', { timeout: 240_000 }, async () => {
  const h = await launchPm({ reenable: true })
  // fake 插件按会话持有脚本游标（plugin.mjs cursors），一个会话只喂一个 turn。
  const sessionId = await createSession(h)
  const before = snapshotHome(h.home)
  const { results, asked } = await pmTurn(h, sessionId, [multiToolCall(PM_ACTIONS)])
  expect(asked, '三种 action 都不出卡').toBe(0)
  expect(results.size, '三个 tool result').toBe(3)
  for (const r of results.values()) {
    expect(r.isError, `${r.toolCallId} deny 时 isError`).toBe(true)
    expect(r.text, '原因带 guard 前缀').toContain('p2sdk-fs-guard')
    expect(r.text, '原因点名 plugin_manager').toContain('plugin_manager')
  }
  // 前提成立：重新启用后工具表确有 plugin_manager（差分前提，不是断言加固行为）
  const tools = h.readToolNames().get(sessionId)?.[0] ?? []
  expect(tools, 'reenable patch 生效：工具表出现 plugin_manager').toContain('plugin_manager')
  const after = snapshotHome(h.home)
  expect([...after.entries()].sort().toString(), '$DSH_HOME/profiles 树与 runtime-patch.yml 不变').toBe([...before.entries()].sort().toString())
})

it('③ 差分：stock 下同一 list_plugins 产生 approval/asked，作答 rejected 无副作用', { timeout: 240_000 }, async () => {
  const h = await launchPm({ stock: true, reenable: true })
  const sessionId = await createSession(h)
  const before = snapshotHome(h.home)

  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  h.writeScriptCalls(sessionId, [multiToolCall([PM_ACTIONS[0]]), textCall('P5-03 stock 完成')])
  await h.client.call('session/prompt', {
    request: { requestId: `p5-03-stock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'P5-03 stock 探针' }] },
  })
  const deadline = Date.now() + 30_000
  let frame: { eventId?: string } | undefined
  for (;;) {
    frame = h.feed.frames.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
    if (frame !== undefined || Date.now() > deadline) break
    await new Promise((r) => setTimeout(r, 50))
  }
  expect(frame, 'stock 下 plugin_manager 产生 approval/request').toBeDefined()
  await h.feed.answer(frame!, 'rejected')
  // 等 turn 收尾（副作用断言要在 turn 结束后取快照）
  const endDeadline = Date.now() + 30_000
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > endDeadline) throw new Error(`turn/end 未到；尾部：${JSON.stringify(frames.slice(-4))}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  void drained
  const asked = h.feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
  expect(asked, 'stock 下 asked ≥ 1').toBeGreaterThanOrEqual(1)
  const after = snapshotHome(h.home)
  expect([...after.entries()].sort().toString(), 'rejected 后无副作用').toBe([...before.entries()].sort().toString())
})

function assertPresetDrift(approval: string): void {
  for (const preset of ['standard', 'cordis', 'ptc'] as const) {
    const source = readFileSync(join(WEBAPP_PRESETS, `${preset}.patch.yml`), 'utf8')
    const start = source.split('\n').findIndex((l) => l === `    - id: preset-${preset}`)
    expect(start, `已装 ${preset}.patch.yml 含 insert 行`).toBeGreaterThanOrEqual(0)
    const lines = source.split('\n').slice(start)
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const expected = lines.map((l) => (l === '' ? l : l.slice(4)))
    let flipped = 0
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] === '      - id: tool-plugin-manager') {
        for (let j = i + 1; j < expected.length && expected[j].startsWith('        ') && !expected[j].startsWith('      - '); j++) {
          if (expected[j].startsWith('        disabled:')) {
            expected[j] = '        disabled: true'
            flipped++
          }
        }
      }
    }
    expect(flipped, `${preset} 恰一处 disabled 翻转`).toBe(1)
    // approval.yml 中对应的覆盖块（`- id: preset-X` 到下一个顶层 `- id:` / EOF）
    const rows = approval.split('\n')
    const s = rows.findIndex((l) => l === `- id: preset-${preset}`)
    expect(s, `approval.yml 含 preset-${preset} 覆盖行`).toBeGreaterThanOrEqual(0)
    let e = rows.length
    for (let k = s + 1; k < rows.length; k++) {
      if (rows[k].startsWith('- id:')) { e = k; break }
    }
    const ours: string[] = []
    for (let k = s; k < e; k++) {
      if (rows[k] === '' && (ours.length === 0 || ours[ours.length - 1] === '')) continue
      ours.push(rows[k])
    }
    const exp = expected.filter((l, i) => !(l === '' && (i === 0 || expected[i - 1] === '')))
    while (ours.length > 0 && ours[ours.length - 1] === '') ours.pop()
    while (exp.length > 0 && exp[exp.length - 1] === '') exp.pop()
    // P6-05：standard 的 persona prefix 在上游基础句之后追加了三段式回复段落
    // （P6-02 定稿，approval.yml 该处注释记 sha256；段落内容与默认链系统提示由
    // work/p6-orchestration/evidence/P6-05/probe.mjs 独立校验）。对 prefix 值
    // 本身豁免逐字比对（两侧同替换为一行占位）；persona 行 id/name 与块内其余
    // 全部行仍逐字比对。
    const cutPersonaPrefix = (lines: string[]): string[] => {
      const i = lines.indexOf('      - id: persona')
      const cfg = i >= 0 ? lines.indexOf('        config:', i) : -1
      if (cfg < 0) throw new Error(`preset-${preset}: persona 行 / config 缺失`)
      let end = lines.length
      for (let k = cfg + 1; k < lines.length; k++) {
        if (/^ {6}- id: /.test(lines[k])) { end = k; break }
      }
      const prefix = lines.findIndex((line, k) => k > cfg && k < end && line.startsWith('          prefix:'))
      if (prefix < 0) throw new Error(`preset-${preset}: persona prefix 缺失`)
      let valueEnd = prefix + 1
      while (valueEnd < end && (lines[valueEnd] === '' || lines[valueEnd].startsWith('           '))) valueEnd++
      return [...lines.slice(0, prefix), '          prefix: <P6-05 追加段落，值豁免逐字比对>', ...lines.slice(valueEnd)]
    }
    const oursCmp = preset === 'standard' ? cutPersonaPrefix(ours) : ours
    const expCmp = preset === 'standard' ? cutPersonaPrefix(exp) : exp
    expect(oursCmp.join('\n'), `approval.yml 的 preset-${preset} 覆盖块与上游一致（仅 disabled 翻转；standard persona prefix 为 P6-05 偏差）`).toBe(expCmp.join('\n'))
  }
}

it('drift：approval.yml 三个覆盖块 = 已装 preset 文件 dedent 后仅翻 disabled 一键', () => {
  assertPresetDrift(readFileSync(join(PKG_ROOT, 'profile', 'patches', 'approval.yml'), 'utf8'))
})

it.each([
  ['新增 persona config.suffix', '      - id: agent-instructions', '          suffix: UNAPPROVED\n      - id: agent-instructions'],
  ['修改 persona 既有 name', "        name: '@deepseek-ai/dsh-persona'", "        name: 'unapproved-persona'"],
])('drift 回归：%s 必须报红', (_label, before, after) => {
  const approval = readFileSync(join(PKG_ROOT, 'profile', 'patches', 'approval.yml'), 'utf8')
  expect(approval).toContain(before)
  expect(() => assertPresetDrift(approval.replace(before, after))).toThrow(/preset-standard/)
})

it('drift 回归：只修改 standard persona prefix 值仍绿', () => {
  const approval = readFileSync(join(PKG_ROOT, 'profile', 'patches', 'approval.yml'), 'utf8')
  const prefix = '            You are a coding agent powered by the {{model}} model.'
  expect(approval).toContain(prefix)
  assertPresetDrift(approval.replace(prefix, '            Changed prefix value.'))
})
