// T-03 独立验收脚本（verifier 亲跑，不复用 vitest 断言路径）：
//  ① pluginMarket/search 对本地 format-1 快照返回条目
//  ② installBundle(enabled:false) → p2temp X 含 mcp__demo__ping、普通 Y 不含
//     （并复核 X/Y 请求侧工具表计数，builder 口径 X=35 / Y=31）
//  ③ 方法表：full 计数（builder 口径 144）+ bare 差集 = 恰 1 个 p2temp 方法
//  坏路径：connectors 传未安装名 / 空数组 → RPC 报错且不建 session
// 运行：pnpm -C /tmp/bot-wt/T-03/app/sdk exec node <本脚本>（Node 24 type-stripping）
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = '/tmp/bot-wt/T-03/app/sdk'
const { launchRuntime } = await import(`${ROOT}/tests/support/runtime.ts`)
const {
  MARKET_YML, serveMarketIndex, writeBundleFixture, writeObserverPatch, readMethods,
  BUNDLE_NAME, CONNECTOR_TOOL,
} = await import(`${ROOT}/tests/market/support.ts`)

const out = []
const say = (line) => { out.push(line); console.log(line) }
let failed = 0
const check = (label, cond, detail = '') => {
  if (cond) say(`PASS ${label}${detail ? ` — ${detail}` : ''}`)
  else { failed++; say(`FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

const requestToolNames = async (rt, sessionId) => {
  const names = []
  const stream = await rt.client.follow(sessionId, { assistantStream: true })
  const done = (async () => {
    for await (const frame of stream) {
      if (frame.type === 'event' && frame.event?.type === 'request/header') {
        for (const tool of frame.event.data.header.tools ?? []) names.push(tool.name)
      }
      if (frame.type === 'event' && frame.event?.type === 'turn/end') return
    }
  })()
  await rt.client.call('session/prompt', {
    request: {
      requestId: `verify03-${sessionId}-${Math.random().toString(16).slice(2, 8)}`,
      sessionId, mode: 'queue', content: [{ type: 'text', text: '你好' }],
    },
  })
  await done
  stream.cancel()
  return names
}

// ---------- boot full runtime (market.yml + observer) ----------
const index = await serveMarketIndex()
const scratch = mkdtempSync(join(tmpdir(), 'verify03-'))
const observer = writeObserverPatch(scratch)
const rt = await launchRuntime({
  env: { P2SDK_PATCH: `${MARKET_YML}:${observer}`, P2SDK_MARKET_INDEXES: index.url },
})
say(`runtime ready: ${rt.baseUrl}`)

// ---------- ① search over the loopback format-1 snapshot ----------
const search = await rt.client.call('pluginMarket/search', {
  url: index.url, query: { sort: { kind: 'index' }, text: '', offset: 0, limit: 10 },
})
check('① search returns entries', Array.isArray(search.entries) && search.entries.length === 3,
  `title=${JSON.stringify(search.title)} total=${search.total} names=${search.entries.map((e) => e.name).join(',')}`)
const narrowed = await rt.client.call('pluginMarket/search', {
  url: index.url, query: { sort: { kind: 'index' }, text: 'echo', offset: 0, limit: 10 },
})
check('① text=echo narrows to 1', narrowed.entries.length === 1 && narrowed.entries[0].name === '@p2sdk-fixture/echo-tool')

// ---------- ② installBundle(enabled:false) → X vs Y ----------
const bundleDir = writeBundleFixture(join(scratch, 'demo-mcp'))
const install = await rt.client.call('pluginManager/installBundle', { spec: bundleDir, options: { enabled: false } })
check('② installBundle(enabled:false) succeeds', install?.application !== 'failed' && !install?.error,
  `application=${install?.application}`)

const { sessionId: x } = await rt.client.call('p2temp/session.createWithConnectors', {
  request: { connectors: [BUNDLE_NAME], agentPreset: 'standard', cwd: join(rt.home, 'workspace') },
})
const { sessionId: y } = await rt.client.call('session/create', { request: { cwd: join(rt.home, 'workspace') } })
const xTools = await requestToolNames(rt, x)
const yTools = await requestToolNames(rt, y)
check('② X tools include the MCP tool', xTools.includes(CONNECTOR_TOOL))
check('② Y tools contain no mcp__*', yTools.filter((n) => n.startsWith('mcp__')).length === 0)
say(`    tool-table sizes: X=${xTools.length} Y=${yTools.length} (builder claim X=35 Y=31)`)

// ---------- ③ method table ----------
const full = await readMethods(rt.home, 'p2temp/session.createWithConnectors')
const rtBare = await launchRuntime({ env: { P2SDK_PATCH: observer } })
const bare = await readMethods(rtBare.home, '')
const added = full.filter((m) => !bare.includes(m))
const marketAdded = added.filter((m) => m.startsWith('pluginMarket/'))
const own = added.filter((m) => !m.startsWith('pluginMarket/'))
say(`    method tables: full=${full.length} (builder claim 144) bare=${bare.length} added=${added.length} (pluginMarket/*=${marketAdded.length})`)
check('③ full method table count = 144', full.length === 144, `got ${full.length}`)
check('③ added \\ pluginMarket/* is exactly the one p2temp method',
  own.length === 1 && own[0] === 'p2temp/session.createWithConnectors', JSON.stringify(own))
check('③ no other p2temp/* methods', full.filter((m) => m.startsWith('p2temp/')).length === 1)

// ---------- bad paths ----------
let sessionsBefore = 0
try { sessionsBefore = (await rt.client.call('session/list', {})).sessions.length } catch { /* shape varies */ }
const bad1 = await rt.client.call('p2temp/session.createWithConnectors', { request: { connectors: ['@nope/missing'] } }).then(
  () => 'no-error', (e) => String(e.message ?? e).slice(0, 120),
)
check('bad path: uninstalled connector errors', bad1 !== 'no-error', bad1)
const bad2 = await rt.client.call('p2temp/session.createWithConnectors', { request: { connectors: [] } }).then(
  () => 'no-error', (e) => String(e.message ?? e).slice(0, 120),
)
check('bad path: empty connectors errors', bad2 !== 'no-error', bad2)
let sessionsAfter = 0
try { sessionsAfter = (await rt.client.call('session/list', {})).sessions.length } catch { /* shape varies */ }
check('bad paths created no session', sessionsAfter === sessionsBefore, `${sessionsBefore} -> ${sessionsAfter}`)

await rt.stop()
await rtBare.stop()
await index.close()
say(failed === 0 ? 'ALL HANDS-ON CHECKS PASS' : `HANDS-ON FAILURES: ${failed}`)
process.exit(failed === 0 ? 0 : 1)
