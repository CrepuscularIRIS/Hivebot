// T-09 acceptance (PLAN p2-sdk T-09 / BRIEF §6 D6, R-5 版 + 用户 2026-11-02
// 09:30 授权): the D6 market connector journey against the REAL source —
//
//   ① list the directory through the SDK surface: the snapshot served from
//      tests/e2e/fixtures/market/index.json (one-shot cache of
//      registry.modelcontextprotocol.io, see scripts/fetch-market-fixture.mjs)
//      carries ≥ N entries, all fetched, none hand-written, and the selected
//      connector's registry entry is among them (连接器必须真实存在于源中).
//   ② install the selected real connector (enabled:false) through the real
//      pluginManager/installBundle flow — the wrapper bundle carries the
//      official npm package @agent-infra/mcp-server-filesystem
//      (io.github.bytedance/mcp-server-filesystem, stdio, official status
//      active; the task-preferred @modelcontextprotocol/server-filesystem is
//      NOT in the registry — verified 2026-11-02, hence this substitution).
//   ③ X enabled / Y not (p2temp/session.createWithConnectors; preset.ensure
//      must be available): X's request tool table contains the connector's
//      tool, Y's contains no mcp__* tool; a scripted (fake LLM) turn drives X
//      to CALL the tool — X's stream must show the call AND the result event;
//   ④ the whole suite is green under $OFFLINE (fixtures are local; the
//      connector package rides the app/sdk devDependencies, installed by the
//      frozen-lockfile setup).
//
// D6 verbatim anchors (BRIEF §6 D6 R-5 版): 目录来自选定数据源（非手写）→
// fixture generated only by scripts/fetch-market-fixture.mjs; 条目数 ≥ N →
// the N below; X 的一轮对话中出现该工具的调用和结果事件 / 未启用的 session Y
// 看不到这个工具 → ③ assertions.
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import type { Frame } from '../support/fake/harness.ts'
import { sendPrompt } from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MARKET_SOURCE_YML = join(PKG_ROOT, 'profile', 'patches', 'market-source.yml')
const FIXTURES = join(PKG_ROOT, 'tests', 'e2e', 'fixtures', 'market')

/** N: 实测快照条数（fetch-market-fixture.mjs 落盘的 pluginCount）。 */
const N = 111
/** 选定连接器：registry 真实条目名（快照 title 保留源身份；format-1 name 走确定性 npm 映射）。 */
const CONNECTOR_SERVER = 'io.github.bytedance/mcp-server-filesystem'
/** 同一条目的 format-1 映射名（fetch-market-fixture.mjs toNpmName 的确定输出）。 */
const CONNECTOR_MARKET_NAME = '@io.github.bytedance/mcp-server-filesystem'
/** wrapper bundle 名（承载真实 npm 包的启动配置，走 installBundle 装入 profile）。 */
const WRAPPER = '@p2sdk-real/filesystem'
/** X 启用后可见的连接器工具（serverName 'filesystem' + server 的 read_file）。 */
const CONNECTOR_TOOL = 'mcp__filesystem__read_file'

interface FollowHandle {
  frames: Frame[]
  stop(): void
}

let rt: Runtime
let indexUrl: string
let closeIndex: () => Promise<void>
let installResult: unknown
let helloPath: string
const HELLO_TEXT = 'p2sdk-d6-connector-evidence'

/** Serve the cached registry snapshot over loopback (plugin-market fetches http(s) only). */
async function serveFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const body = readFileSync(join(FIXTURES, 'index.json'))
  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture server has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/index.json`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  }
}

/** Fake-provider overlay (approval.test.ts pattern): scripted p2fake turns. */
function fakeOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-t09-patch-'))
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
# T-09 generated fake-provider overlay (tests/e2e/market.test.ts).
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

/**
 * The wrapper dsh bundle: package.json + JSON cordis patch inserting one
 * mcp-client row whose stdio command runs the REAL official npm package
 * (app/sdk devDependency, installed from registry.npmjs.org by setup). Same
 * shape as T-03's writeBundleFixture; machine-absolute paths are why it is
 * generated per run instead of stored.
 */
function writeRealConnectorBundle(dir: string, allowedDir: string): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: WRAPPER,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 1)}\n`)
  const dist = realpathSync(join(PKG_ROOT, 'node_modules', '@agent-infra', 'mcp-server-filesystem', 'dist', 'index.cjs'))
  const mcpRow = {
    id: 'real-filesystem-mcp',
    // Absolute specifier: the $DSH_HOME profile workspace has no node_modules.
    name: pathToFileURL(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')).href,
    config: {
      serverName: 'filesystem',
      transport: 'stdio',
      command: process.execPath,
      // The official server's own documented stdio contract: named arg
      // --allowed-directories (registry packageArguments).
      args: [dist, '--allowed-directories', allowedDir],
      env: {},
      cwd: '',
      failOnStartupError: true,
    },
  }
  writeFileSync(join(dir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [mcpRow] }])}\n`)
  return dir
}

/** Scripted model calls (approval.test.ts chunk vocabulary). */
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

function toolCall(name: string, args: object): object {
  const id = `p2sdk-t09-${Math.random().toString(16).slice(2, 8)}`
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

function writeScriptCalls(sessionId: string, calls: object[]): void {
  const dir = join(rt.home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
}

/** Follow a session and collect frames until stop(). */
async function follow(sessionId: string): Promise<FollowHandle> {
  const frames: Frame[] = []
  const stream = await rt.client.follow(sessionId, { assistantStream: true })
  const drained = (async () => {
    for await (const f of stream) frames.push(f)
  })()
  return {
    frames,
    stop() {
      stream.cancel()
      void drained
    },
  }
}

/**
 * The request tool table, observed from one scripted text turn (T-03 pattern).
 * `tailCalls` extend the SAME script the probe consumes call #0 from — the
 * fake provider's cursor is per session, so a later writeScriptCalls would
 * overwrite the file and desync it (T-09 debugging finding).
 */
async function requestToolNames(sessionId: string, tailCalls: object[] = []): Promise<string[]> {
  writeScriptCalls(sessionId, [textCall('工具表探针'), ...tailCalls])
  const handle = await follow(sessionId)
  await sendPrompt(rt.client, sessionId, '列工具')
  await waitForFrame(handle.frames, (f) => f.type === 'event' && f.event?.type === 'turn/end', 30_000, 'probe turn/end')
  const names: string[] = []
  for (const f of handle.frames) {
    if (f.type === 'event' && f.event?.type === 'request/header') {
      const header = (f.event as unknown as { data: { header: { tools?: Array<{ name: string }> } } }).data.header
      for (const tool of header.tools ?? []) names.push(tool.name)
    }
  }
  handle.stop()
  return names
}

/** Poll collected frames until one matches (FAIL clock). */
async function waitForFrame(frames: Frame[], pred: (f: Frame) => boolean, ms: number, label: string): Promise<number> {
  const deadline = Date.now() + ms
  for (;;) {
    const idx = frames.findIndex(pred)
    if (idx >= 0) return idx
    if (Date.now() >= deadline) throw new Error(`timed out after ${ms}ms waiting for ${label}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

beforeAll(async () => {
  const fixture = await serveFixture()
  indexUrl = fixture.url
  closeIndex = fixture.close

  rt = await launchRuntime({
    env: {
      P2SDK_PATCH: `${MARKET_SOURCE_YML}:${fakeOverlay()}`,
      P2SDK_MARKET_SOURCE_INDEXES: indexUrl,
    },
  })

  const workspace = join(rt.home, 'workspace')
  mkdirSync(workspace, { recursive: true })
  helloPath = join(workspace, 'hello.txt')
  writeFileSync(helloPath, HELLO_TEXT)

  const scratch = mkdtempSync(join(tmpdir(), 'p2sdk-t09-'))
  const wrapperDir = writeRealConnectorBundle(join(scratch, 'real-filesystem'), workspace)
  installResult = await rt.client.call('pluginManager/installBundle', {
    spec: wrapperDir,
    options: { enabled: false },
  })
}, 240_000)

afterAll(async () => {
  await rt?.stop()
  await closeIndex?.()
}, 60_000)

it('① lists the cached registry snapshot through pluginMarket/search: >=N entries, connector entry present', async () => {
  // pluginMarket/search caps limit at 100 — page through the 111-entry snapshot.
  const page = async (
    offset: number,
  ): Promise<{ total: number; entries: Array<{ name: string; title?: string }> }> =>
    (await rt.client.call('pluginMarket/search', {
      url: indexUrl,
      query: { sort: { kind: 'index' }, text: '', offset, limit: 100 },
    })) as { total: number; entries: Array<{ name: string; title?: string }> }
  const first = await page(0)
  const rest = first.total > 100 ? await page(100) : { total: first.total, entries: [] }
  const entries = [...first.entries, ...rest.entries]
  expect(first.title).toBe('MCP official registry snapshot (offline mirror)')
  expect(first.total, `snapshot carries at least N=${N} entries`).toBeGreaterThanOrEqual(N)
  expect(entries.length, 'entries actually listed through the SDK surface').toBeGreaterThanOrEqual(N)

  // 连接器真实存在于源中: the mapped market entry is there AND keeps the
  // original registry name as its title (the source identity, never rewritten).
  const connector = entries.find((e) => e.name === CONNECTOR_MARKET_NAME)
  expect(connector, 'the selected connector really exists in the source snapshot').toBeTruthy()
  expect(connector?.title, 'the market entry keeps the original registry server name').toBe(CONNECTOR_SERVER)

  // The fixture's own bookkeeping agrees (N is measured, then pinned).
  const source = JSON.parse(readFileSync(join(FIXTURES, 'source.json'), 'utf8')) as { pluginCount: number }
  expect(source.pluginCount).toBeGreaterThanOrEqual(N)

  const indexes = (await rt.client.call('pluginMarket/listIndexes', {})) as Array<{ url: string }>
  expect(indexes).toMatchObject([{ url: indexUrl }])
}, 120_000)

it('② installs the real connector bundle through installBundle (enabled:false)', async () => {
  const install = installResult as { application?: string; error?: unknown }
  expect(install?.application, `installBundle outcome: ${JSON.stringify(install).slice(0, 500)}`).not.toBe('failed')
  expect(install?.error).toBeUndefined()

  // listBundles returns a bare BundleInfo[] array.
  const bundles = (await rt.client.call('pluginManager/listBundles', {})) as Array<{
    name: string
    enabled: boolean
  }>
  const row = bundles.find((b) => b.name === WRAPPER)
  expect(row, `${WRAPPER} appears in pluginManager/listBundles`).toBeTruthy()
  expect(row?.enabled, 'the connector installed disabled — enabling is per-session via p2temp').toBe(false)
}, 120_000)

it('③ X (connectors) sees and CALLS the real filesystem tool; Y never sees it', async () => {
  const cwd = join(rt.home, 'workspace')
  const { sessionId: x } = (await rt.client.call('p2temp/session.createWithConnectors', {
    request: { connectors: [WRAPPER], agentPreset: 'standard', cwd },
  })) as { sessionId: string }
  const { sessionId: y } = (await rt.client.call('session/create', { request: { cwd } })) as { sessionId: string }
  expect(x).not.toBe(y)

  // Tool tables: X carries the connector tool, Y carries no mcp__* tool at all.
  // X's script carries the tool turn in its tail (see requestToolNames note).
  const xTools = await requestToolNames(x, [toolCall(CONNECTOR_TOOL, { path: helloPath }), textCall('D6 调用完成')])
  const yTools = await requestToolNames(y)
  expect(xTools, `X's request tool table contains ${CONNECTOR_TOOL}`).toContain(CONNECTOR_TOOL)
  expect(yTools.filter((n) => n.startsWith('mcp__')), 'Y (not enabled) sees no connector tool').toEqual([])

  // The scripted turn on X: model calls the connector tool, then closes with text.
  const handle = await follow(x)
  await sendPrompt(rt.client, x, '读一下 hello.txt')
  await waitForFrame(handle.frames, (f) => f.type === 'event' && f.event?.type === 'turn/end', 60_000, 'X turn/end')

  const callFrame = handle.frames.find(
    (f) => f.type === 'event' && f.event?.type === 'tool/call' && JSON.stringify(f).includes(CONNECTOR_TOOL),
  )
  expect(callFrame, `X's stream shows the ${CONNECTOR_TOOL} call event`).toBeTruthy()

  // tool/result carries the callId + content, not the tool name — match on type
  // plus the real content the stdio server returned for the read.
  const resultFrame = handle.frames.find(
    (f) => f.type === 'event' && f.event?.type === 'tool/result' && JSON.stringify(f).includes(HELLO_TEXT),
  )
  expect(resultFrame, 'X\'s stream shows the tool/result event with the real server output').toBeTruthy()
  handle.stop()

  // Y stays tool-less across its own turns (X/Y isolation anchor of D6).
  const yAgain = await requestToolNames(y)
  expect(yAgain.filter((n) => n.startsWith('mcp__'))).toEqual([])
}, 240_000)

it('preset.ensure is available and rebuilds the exact preset X froze', async () => {
  const cwd = join(rt.home, 'workspace')
  const { sessionId: x } = (await rt.client.call('p2temp/session.createWithConnectors', {
    request: { connectors: [WRAPPER], agentPreset: 'standard', cwd },
  })) as { sessionId: string }
  const peek = await rt.client.follow(x, { awaitSnapshot: true })
  const header = (peek.snapshot as { header?: { agentPreset?: string } }).header
  peek.stream.cancel()
  const frozen = header?.agentPreset
  expect(frozen, 'X froze a temporary preset id').toMatch(/^p2temp-/)

  const ensured = (await rt.client.call('p2temp/preset.ensure', {
    request: { agentPreset: 'standard', connectors: [WRAPPER] },
  })) as { presetId: string }
  expect(ensured.presetId, 'preset.ensure (T-16) rebuilds the id X froze').toBe(frozen)
}, 180_000)
