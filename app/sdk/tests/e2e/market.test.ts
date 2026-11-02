// T-09 acceptance (PLAN p2-sdk T-09 / BRIEF §6 D6, R-5 版 + 用户 2026-11-02
// 09:30 授权): the D6 market connector journey against the REAL source —
//
//   ① list the directory through the SDK surface: the snapshot served from
//      tests/e2e/fixtures/market/index.json (one-shot cache of
//      registry.modelcontextprotocol.io, see scripts/fetch-market-fixture.mjs)
//      carries ≥ N entries, all fetched, none hand-written, and the selected
//      connector's registry entry is among them (连接器必须真实存在于源中).
//   ② install the selected real connector (enabled:false) straight from the
//      LISTING's versions[].install spec — the registry package's real npm
//      coordinate (@agent-infra/mcp-server-filesystem@1.2.29). U-25: the
//      runtime's market wrapper (src/market/wrapper.mjs, wired from p2temp)
//      intercepts pluginManager/installBundle for preseeded bare npm MCP
//      packages and installs a generated dsh wrapper bundle
//      ($DSH_HOME/market-wrappers/…) carrying the mcp-client stdio row
//      instead. The wrapper rides the preseeded devDependency (setup fills
//      the pnpm store), so the whole path is offline-pure.
//   ②b (U-25) the wrapper artifacts are real: the generated bundle declares
//      dsh.bundle.patch (the exact field whose absence made main refuse this
//      same spec `not-bundle` — T-19 ②b, work/p2-sdk/VERIFY-T-19.md ③), the
//      patch row launches the real server with its registry-required named
//      arg, and the profile records the wrapper as an installed dependency
//      (nothing of the bare package is left selected).
//   ②c (T-19) entries whose registry record carries no npm coordinate stay
//      listed (marked `not-installable` in metadata.keywords) and an install
//      attempt fails with a structured error, never silently.
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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
/**
 * 同一条目的 format-1 name（T-19）：registry packages[] 里声明的真实 npm 包名
 * （registryType 'npm' 的 identifier），不再是 registry-name 的确定性改名。
 */
const CONNECTOR_MARKET_NAME = '@agent-infra/mcp-server-filesystem'
/** listing 的 versions[].install 必须给出的真实 npm spec（devDep 锁定同一版本，离线 store 可供）。 */
const CONNECTOR_INSTALL_SPEC = '@agent-infra/mcp-server-filesystem@1.2.29'
/**
 * U-25 动态 wrapper 的确定性身份（src/market/wrapper.mjs 的 wrapperNameOf /
 * serverNameOf 生成，字面量由 tests/unit/market-wrapper.proc.mjs 钉死——两处
 * 漂移会在本文件红）。serverName = 末段(≤23) + '-' + sha256(全名)前 8 位。
 */
const WRAPPER = '@p2sdk-market/agent-infra__mcp-server-filesystem'
const WRAPPER_SERVER_NAME = 'mcp-server-filesystem-3408f957'
/** X 启用后可见的连接器工具（wrapper 的 serverName + server 的 read_file）。 */
const CONNECTOR_TOOL = `mcp__${WRAPPER_SERVER_NAME}__read_file`

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
/** One listed entry as pluginMarket/search returns it (T-19: versions[].install)。 */
type ListedEntry = { name: string; title?: string; versions?: Array<{ version: string; install?: { spec?: string } }> }
/** The full listing, paged once by ① and reused by ②b/②c。 */
let allEntries: ListedEntry[] = []

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

  // U-25: install straight from the LISTING spec — the runtime's market
  // wrapper turns the bare npm coordinate into a generated wrapper bundle
  // before dsh's installBundle sees it (pre-U-25 this exact call was refused
  // `not-bundle`, T-19 ②b).
  installResult = await rt.client.call('pluginManager/installBundle', {
    spec: CONNECTOR_INSTALL_SPEC,
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
  ): Promise<{ total: number; entries: ListedEntry[] }> =>
    (await rt.client.call('pluginMarket/search', {
      url: indexUrl,
      query: { sort: { kind: 'index' }, text: '', offset, limit: 100 },
    })) as { total: number; entries: ListedEntry[] }
  const first = await page(0)
  const rest = first.total > 100 ? await page(100) : { total: first.total, entries: [] }
  const entries = [...first.entries, ...rest.entries]
  allEntries = entries
  expect(first.title).toBe('MCP official registry snapshot (offline mirror)')
  expect(first.total, `snapshot carries at least N=${N} entries`).toBeGreaterThanOrEqual(N)
  expect(entries.length, 'entries actually listed through the SDK surface').toBeGreaterThanOrEqual(N)

  // 连接器真实存在于源中: the mapped market entry is there AND keeps the
  // original registry name as its title (the source identity, never rewritten).
  const connector = entries.find((e) => e.name === CONNECTOR_MARKET_NAME)
  expect(connector, 'the selected connector really exists in the source snapshot').toBeTruthy()
  expect(connector?.title, 'the market entry keeps the original registry server name').toBe(CONNECTOR_SERVER)

  // T-19: the listing's install target is the registry-declared real npm
  // coordinate (packages[].identifier@version), not a made-up registry-name
  // mapping — this is what a user (or P4 UI) hands to installBundle.
  const listed = connector?.versions?.find((v) => v.install?.spec === CONNECTOR_INSTALL_SPEC)
  expect(listed, `connector lists the real npm install spec ${CONNECTOR_INSTALL_SPEC}`).toBeTruthy()
  // beforeAll already installed exactly this spec through the U-25 wrapper.

  // The fixture's own bookkeeping agrees (N is measured, then pinned).
  const source = JSON.parse(readFileSync(join(FIXTURES, 'source.json'), 'utf8')) as { pluginCount: number }
  expect(source.pluginCount).toBeGreaterThanOrEqual(N)

  const indexes = (await rt.client.call('pluginMarket/listIndexes', {})) as Array<{ url: string }>
  expect(indexes).toMatchObject([{ url: indexUrl }])
}, 120_000)

it('② installs the listing spec through the generated wrapper (enabled:false)', async () => {
  const install = installResult as { application?: string; error?: unknown; target?: string; bundle?: string }
  expect(install?.application, `installBundle outcome: ${JSON.stringify(install).slice(0, 500)}`).not.toBe('failed')
  expect(install?.error).toBeUndefined()
  expect(install?.bundle ?? install?.target, 'dsh installed the WRAPPER bundle, not the bare package').toBe(WRAPPER)

  // listBundles returns a bare BundleInfo[] array.
  const bundles = (await rt.client.call('pluginManager/listBundles', {})) as Array<{
    name: string
    enabled: boolean
  }>
  const row = bundles.find((b) => b.name === WRAPPER)
  expect(row, `${WRAPPER} appears in pluginManager/listBundles`).toBeTruthy()
  expect(row?.enabled, 'the connector installed disabled — enabling is per-session via p2temp').toBe(false)
}, 120_000)

it('②b the wrapper bundle is real on disk: dsh.bundle.patch present, registry-required arg baked, profile records it', async () => {
  const wrapperDir = join(rt.home, 'market-wrappers', 'agent-infra__mcp-server-filesystem')
  const manifest = JSON.parse(readFileSync(join(wrapperDir, 'package.json'), 'utf8')) as {
    name: string; version: string; dsh?: { bundle?: { patch?: string } }
  }
  expect(manifest.name).toBe(WRAPPER)
  expect(manifest.version).toBe('1.2.29')
  // The exact field whose absence made dsh refuse this spec `not-bundle`
  // (plugin-manager src/index.ts:984) — now present in the generated bundle.
  expect(manifest.dsh?.bundle?.patch, 'the wrapper declares dsh.bundle.patch').toBe('./cordis.patch.yml')

  const patch = JSON.parse(readFileSync(join(wrapperDir, 'cordis.patch.yml'), 'utf8')) as Array<{
    insert?: Array<{ id: string; name: string; config: { serverName: string; transport: string; command: string; args: string[] } }>
  }>
  const row = patch.flatMap((p) => p.insert ?? [])[0]
  expect(row.config.transport).toBe('stdio')
  expect(row.config.command, 'launches with the runtime node').toBe(process.execPath)
  // The official server's own documented stdio contract: named arg
  // --allowed-directories (registry packageArguments, isRequired) — the
  // wrapper's default value is the runtime workspace under $DSH_HOME.
  expect(row.config.args.slice(-2), 'registry-required named arg with the workspace default').toEqual([
    '--allowed-directories', join(rt.home, 'workspace'),
  ])
  expect(row.config.args[0].includes('mcp-server-filesystem'), 'entry is the real preseeded server').toBe(true)
  expect(row.config.serverName).toBe(WRAPPER_SERVER_NAME)

  // Persistence anchor: the profile recorded the wrapper as its dependency
  // (pnpm add of the generated dir), and nothing of the BARE package is left.
  const profiles = join(rt.home, 'profiles')
  const deps = readdirSync(profiles, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      try {
        return JSON.parse(readFileSync(join(profiles, e.name, 'package.json'), 'utf8')) as Record<string, unknown>
      } catch {
        return {}
      }
    })
  const withWrapper = deps.filter((m) => typeof m.dependencies === 'object' && m.dependencies !== null
    && WRAPPER in (m.dependencies as Record<string, unknown>))
  expect(withWrapper.length, `a profile under ${profiles} records ${WRAPPER} as a dependency`).toBeGreaterThanOrEqual(1)

  const bundles = (await rt.client.call('pluginManager/listBundles', {})) as Array<{ name: string }>
  expect(bundles.find((b) => b.name === CONNECTOR_MARKET_NAME), 'the bare npm package is never left as a bundle').toBeUndefined()
}, 120_000)

it('②c entries without an npm coordinate stay listed and fail with a structured error', async () => {
  // The fixture marks them (fetch-market-fixture.mjs T-19): listed, never installable.
  const index = JSON.parse(readFileSync(join(FIXTURES, 'index.json'), 'utf8')) as {
    plugins: Array<{ name: string; title: string; metadata?: { keywords?: string[] }; versions: Array<{ version: string }> }>
  }
  const bare = index.plugins.find((p) => p.metadata?.keywords?.includes('not-installable'))
  expect(bare, 'the regenerated fixture marks coordinate-less entries not-installable').toBeTruthy()

  const visible = allEntries.find((e) => e.name === bare?.name)
  expect(visible, 'the coordinate-less entry is still visible through the SDK listing').toBeTruthy()

  const result = (await rt.client.call('pluginManager/installBundle', {
    spec: `${bare?.name}@${bare?.versions[0]?.version}`,
    options: { enabled: false },
  })) as { application?: string; error?: { code?: string; diagnostic?: string } }
  expect(result?.application, `install attempt fails loudly: ${JSON.stringify(result).slice(0, 300)}`).toBe('failed')
  expect(typeof result?.error?.code, 'the failure is a structured refusal, not silence').toBe('string')
  // Online the refusal is a registry 404 in ~2s; offline ($OFFLINE netns) pnpm's
  // own fetch timeout/backoff makes the same refusal take ~70s — the 300s cap
  // covers both without special-casing the environment.
}, 300_000)

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
