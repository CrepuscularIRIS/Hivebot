// U-25 verifier 独立探针：不重跑测试文件，亲走 listing spec 直装旅程。
// ② listing(动态取 spec) → installBundle → listBundles wrapper enabled:false
//    → X 实调 read_file（真实 stdio server 回内容）；Y 无 mcp__ 工具
// ③ 无坐标 spec（裸名无 @version）→ 原样透传给 dsh → 结构化拒 + target 原样
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { connect } from '/tmp/bot-wt/U-25/app/sdk/examples/lib/client.mjs'

const PKG_ROOT = '/tmp/bot-wt/U-25/app/sdk'
const MARKET_SOURCE_YML = join(PKG_ROOT, 'profile', 'patches', 'market-source.yml')
const FIXTURES = join(PKG_ROOT, 'tests', 'e2e', 'fixtures', 'market')
const HELLO_TEXT = `vfy-u25-${Date.now().toString(36)}-real-stdio-read`

const log = (...a) => console.log('[probe]', ...a)
const fail = (msg) => { console.error('[probe] FAIL:', msg); process.exitCode = 1 }
const results = []
const check = (name, ok, detail = '') => {
  results.push([name, ok])
  if (!ok) fail(`${name}${detail ? ' :: ' + detail : ''}`)
  else log(`PASS ${name}${detail ? ' :: ' + detail : ''}`)
}

// --- fixture server (plugin-market 只认 http(s) 索引) ---
const body = readFileSync(join(FIXTURES, 'index.json'))
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' }).end(body)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const indexUrl = `http://127.0.0.1:${server.address().port}/index.json`
log('fixture index at', indexUrl)

// --- fake-provider overlay（与 e2e 同型，脚本驱动的假 LLM）---
const patchDir = mkdtempSync(join(tmpdir(), 'vfy-u25-patch-'))
const overlay = join(patchDir, 'fake-llm.yml')
writeFileSync(overlay, `# vfy U-25 probe overlay
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

// --- launch runtime（launchRuntime 的独立复刻）---
const home = mkdtempSync(join(tmpdir(), 'vfy-u25-home-'))
const handoff = mkdtempSync(join(tmpdir(), 'vfy-u25-handoff-'))
const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
  env: {
    ...process.env,
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: home,
    P2SDK_HANDOFF: handoff,
    P2SDK_PORT: '0',
    P2SDK_PATCH: `${MARKET_SOURCE_YML}:${overlay}`,
    P2SDK_MARKET_SOURCE_INDEXES: indexUrl,
    P2SDK_READY_TIMEOUT_MS: '90000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
child.stdout.on('data', (c) => { output += c })
child.stderr.on('data', (c) => { output += c })
const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  if (/\[p2sdk\] ready http/.test(output)) break
  if (child.exitCode !== null) { console.error('runtime exited early:\n' + output); process.exit(1) }
  await new Promise((r) => setTimeout(r, 200))
}
if (!/\[p2sdk\] ready http/.test(output)) { console.error('ready timeout:\n' + output); child.kill('SIGKILL'); process.exit(1) }
const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
const client = await connect({ baseUrl, token })
log('runtime ready, home =', home)

// --- 脚本化假 LLM 调用（与 e2e 同型）---
const textCall = (text) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
  { type: 'finish', reason: { kind: 'stop' } },
], paceMs: 10 })
const toolCall = (name, args) => {
  const id = `vfy-${Math.random().toString(16).slice(2, 8)}`; const j = JSON.stringify(args)
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: j.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: j.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: j } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ], paceMs: 10 }
}
const writeScriptCalls = (sessionId, calls) => {
  const dir = join(home, 'fake', 'scripts'); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
}
async function followCollect(sessionId) {
  const frames = []
  const stream = await client.follow(sessionId, { assistantStream: true })
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  return { frames, stop() { stream.cancel(); void drained } }
}
const waitForFrame = async (frames, pred, ms, label) => {
  const dl = Date.now() + ms
  for (;;) {
    const i = frames.findIndex(pred)
    if (i >= 0) return i
    if (Date.now() >= dl) throw new Error(`timeout waiting ${label}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}
const sendPrompt = (sessionId, text) => client.call('session/prompt', {
  request: { requestId: `vfy-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, sessionId, mode: 'queue', content: [{ type: 'text', text }] },
})
const toolNamesOfTurn = async (sessionId, tail = []) => {
  writeScriptCalls(sessionId, [textCall('vfy tool-table probe'), ...tail])
  const h = await followCollect(sessionId)
  await sendPrompt(sessionId, 'vfy list tools')
  await waitForFrame(h.frames, (f) => f.type === 'event' && f.event?.type === 'turn/end', 30_000, 'probe turn/end')
  const names = []
  for (const f of h.frames) {
    if (f.type === 'event' && f.event?.type === 'request/header') {
      for (const t of f.event.data?.header?.tools ?? []) names.push(t.name)
    }
  }
  h.stop()
  return names
}

try {
  // ① listing 动态取 spec（不硬编码）
  const search = async (offset) => (await client.call('pluginMarket/search', {
    url: indexUrl, query: { sort: { kind: 'index' }, text: '', offset, limit: 100 },
  }))
  const first = await search(0)
  const rest = first.total > 100 ? await search(100) : { entries: [] }
  const entries = [...first.entries, ...rest.entries]
  const conn = entries.find((e) => e.name === '@agent-infra/mcp-server-filesystem')
  check('listing: connector entry found', !!conn, `total=${first.total}`)
  const specRow = conn?.versions?.find((v) => typeof v.install?.spec === 'string' && /@\d+\.\d+\.\d+$/.test(v.install.spec))
  const SPEC = specRow?.install?.spec
  check('listing: exact npm coordinate spec present', !!SPEC, `spec=${SPEC}`)

  // ② 直装 listing spec（enabled:false）
  const install = await client.call('pluginManager/installBundle', { spec: SPEC, options: { enabled: false } })
  check('② install via wrapper: not failed', install?.application !== 'failed' && install?.error === undefined,
    `outcome=${JSON.stringify(install).slice(0, 220)}`)
  const bundles = await client.call('pluginManager/listBundles', {})
  const seg = 'agent-infra__mcp-server-filesystem'
  const WRAPPER_NAME = `@p2sdk-market/${seg}`
  const row = bundles.find((b) => b.name === WRAPPER_NAME)
  check('② listBundles: wrapper bundle present', !!row, `names=${bundles.map((b) => b.name).join(',')}`)
  check('② wrapper enabled === false', row?.enabled === false, `enabled=${row?.enabled}`)
  check('② bare package never a bundle', bundles.find((b) => b.name === '@agent-infra/mcp-server-filesystem') === undefined)

  // ②b 盘上产物抽验
  const wdir = join(home, 'market-wrappers', seg)
  const wmanifest = JSON.parse(readFileSync(join(wdir, 'package.json'), 'utf8'))
  check('②b wrapper declares dsh.bundle.patch', wmanifest.dsh?.bundle?.patch === './cordis.patch.yml')
  const patchRows = JSON.parse(readFileSync(join(wdir, 'cordis.patch.yml'), 'utf8'))
  const mcpRow = patchRows.flatMap((p) => p.insert ?? [])[0]
  check('②b stdio row + required arg baked',
    mcpRow?.config?.transport === 'stdio'
    && JSON.stringify(mcpRow?.config?.args?.slice(-2)) === JSON.stringify(['--allowed-directories', join(home, 'workspace')])
    && String(mcpRow?.config?.args?.[0] ?? '').includes('mcp-server-filesystem'),
    `args=${JSON.stringify(mcpRow?.config?.args)}`)
  const serverName = mcpRow?.config?.serverName
  check('②b serverName shape (≤32, [A-Za-z0-9_-])', /^[A-Za-z0-9_-]{1,32}$/.test(serverName ?? ''), serverName)
  // wrapper 名与目录段一致性：name === @p2sdk-market/<dir segment>
  check('②b wrapper name ↔ dir segment', wmanifest.name === WRAPPER_NAME, wmanifest.name)

  // ③ X 实调 read_file / Y 隔离
  const workspace = join(home, 'workspace'); mkdirSync(workspace, { recursive: true })
  const helloPath = join(workspace, 'hello.txt'); writeFileSync(helloPath, HELLO_TEXT)
  const TOOL = `mcp__${serverName}__read_file`
  const { sessionId: x } = await client.call('p2temp/session.createWithConnectors', {
    request: { connectors: [WRAPPER_NAME], agentPreset: 'standard', cwd: workspace },
  })
  const { sessionId: y } = await client.call('session/create', { request: { cwd: workspace } })
  const xTools = await toolNamesOfTurn(x, [toolCall(TOOL, { path: helloPath }), textCall('vfy done')])
  const yTools = await toolNamesOfTurn(y)
  check('③ X tool table has connector tool', xTools.includes(TOOL), `tool=${TOOL}`)
  check('③ Y has no mcp__ tool', yTools.filter((n) => n.startsWith('mcp__')).length === 0, JSON.stringify(yTools.filter((n) => n.startsWith('mcp__'))))
  const h = await followCollect(x)
  await sendPrompt(x, 'vfy read hello.txt')
  await waitForFrame(h.frames, (f) => f.type === 'event' && f.event?.type === 'turn/end', 60_000, 'X turn/end')
  const callFrame = h.frames.find((f) => f.type === 'event' && f.event?.type === 'tool/call' && JSON.stringify(f).includes(TOOL))
  check('③ X stream shows tool/call of connector tool', !!callFrame)
  const resFrame = h.frames.find((f) => f.type === 'event' && f.event?.type === 'tool/result' && JSON.stringify(f).includes(HELLO_TEXT))
  check('③ X stream shows tool/result with REAL server output', !!resFrame)
  h.stop()
  const yAgain = await toolNamesOfTurn(y)
  check('③ Y stays mcp__-less after X used the tool', yAgain.filter((n) => n.startsWith('mcp__')).length === 0)

  // ④ 无坐标 spec（裸名，无 @version）：wrapper 不拦 → 原样透传 → dsh 结构化拒
  const beforeDirs = new Set(readdirSync(join(home, 'market-wrappers')))
  const bareSpec = '@agent-infra/mcp-server-filesystem' // 无 @x.y.z → parseExactNpmSpec null
  const bare = await client.call('pluginManager/installBundle', { spec: bareSpec, options: { enabled: false } })
  check('④ bare spec: application failed (dsh refusal, as-is)', bare?.application === 'failed',
    `outcome=${JSON.stringify(bare).slice(0, 300)}`)
  check('④ bare spec: structured error code', typeof bare?.error?.code === 'string', `code=${bare?.error?.code}`)
  check('④ bare spec: target passthrough unchanged', bare?.target === bareSpec || String(bare?.error?.diagnostic ?? '').includes(bareSpec),
    `target=${bare?.target}`)
  const afterDirs = new Set(readdirSync(join(home, 'market-wrappers')))
  const newDirs = [...afterDirs].filter((d) => !beforeDirs.has(d))
  check('④ no new wrapper dir generated for the bare spec', newDirs.length === 0, `new=${newDirs.join(',')}`)

  // 汇总
  const passed = results.filter((r) => r[1]).length
  log(`SUMMARY ${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
} catch (err) {
  fail(`probe threw: ${err?.stack ?? err}`)
} finally {
  client.close()
  child.kill('SIGTERM')
  await new Promise((r) => { const t = setTimeout(() => { child.kill('SIGKILL'); r() }, 8000); child.on('exit', () => { clearTimeout(t); r() }) })
  server.close()
}
