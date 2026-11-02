// T-09 (D6): one-shot online fetch of the MCP official registry snapshot,
// cached as a local fixture so every later run (including $OFFLINE) reads the
// mirror only. Idempotent: skips when the fixture exists unless --force.
//
// 源（用户 2026-11-02 09:30 授权，R-5 版 D6）: registry.modelcontextprotocol.io
// 公开匿名 API（modelcontextprotocol/registry，Apache-2.0/MIT）。快照构成：
//   1. /v0.1/servers?limit=100&version=latest 第 1 页（字母序 a 段，N 的主体）
//   2. 同 API search=filesystem 结果中不在第 1 页的条目（至少含选定连接器
//      io.github.bytedance/mcp-server-filesystem——registry 真实 stdio 型官方
//      条目；任务原选 @modelcontextprotocol/server-filesystem 实测不在源中，
//      按「验收连接器必须真实存在于源中」改选，实测记录见 source.json）。
// 输出（均 commit 进仓）:
//   tests/e2e/fixtures/market/index.json  — dsh format-1 索引（条目全部来自
//     registry 原始响应，仅字段投影，无手写条目）
//   tests/e2e/fixtures/market/source.json — 抓取元数据：源 URL、fetchedAt、
//     原始响应 sha256、条数 N、构成说明（离线时目录真实性的凭证）
// 转换依据: dsh format-1 类型 deepseek-harness packages/util/plugin-market-index
// src/types.ts:19-102（{format,title,description,plugins:[{name,title,
// description,versions:[{version,publishTimestamp,source}]}]}）；publishTimestamp
// 取 registry _meta official.publishedAt 的 Unix 秒（reuse/market-backend.md
// 「版本时间优先取 registry 发布元数据」）。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(PKG_ROOT, 'tests', 'e2e', 'fixtures', 'market')
const INDEX_PATH = join(OUT_DIR, 'index.json')
const SOURCE_PATH = join(OUT_DIR, 'source.json')

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers'
const PAGE_URL = `${REGISTRY}?limit=100&version=latest`
const SEARCH_URL = `${REGISTRY}?limit=100&version=latest&search=filesystem`
/** D6 验收连接器（registry 真实条目，名字与测试断言一致）。 */
export const CONNECTOR_SERVER = 'io.github.bytedance/mcp-server-filesystem'

const force = process.argv.includes('--force')
if (!force && existsSync(INDEX_PATH) && existsSync(SOURCE_PATH)) {
  console.log(`[fetch-market-fixture] fixture present, skipping (use --force to refetch): ${INDEX_PATH}`)
  process.exit(0)
}

/** One fetch, text for sha256 + parsed json from the same bytes. */
async function fetchSnapshot(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const raw = await res.text()
  return { raw, body: JSON.parse(raw) }
}

/**
 * Deterministic registry-name → npm-name mapping (reuse/market-backend.md
 * 「应保留源 id 到 bundle 包名的确定性映射」; dsh validates against
 * /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/ —
 * plugin-market-index src/index.ts:29). Lowercase, then 'domain/pkg' becomes
 * the scoped '@domain/pkg'; characters npm rejects collapse to '-'. The
 * ORIGINAL registry name survives in `title` (and source.json raw sha256), so
 * the D6 «really exists in the source» anchor stays on the source identity.
 */
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
function toNpmName(registryName) {
  const lower = registryName.toLowerCase()
  const scoped = lower.includes('/') ? `@${lower}` : lower
  const collapsed = scoped.replace(/[^a-z0-9._~@/-]/g, '-')
  if (!NPM_NAME.test(collapsed)) throw new Error(`mapping produced an invalid npm name for ${registryName}: ${collapsed}`)
  return collapsed
}

/** registry server 条目 → dsh format-1 plugin 行（字段投影 + 确定性改名）。 */
function toPlugin(entry) {
  const s = entry.server
  const published = entry._meta?.['io.modelcontextprotocol.registry/official']?.publishedAt
  const ts = published !== undefined ? Math.floor(Date.parse(published) / 1000) : Math.floor(Date.now() / 1000)
  return {
    name: toNpmName(s.name),
    title: s.name,
    description: s.description ?? '',
    versions: [{ version: s.version, publishTimestamp: ts, source: { type: 'npm' } }],
  }
}

const page = await fetchSnapshot(PAGE_URL)
const search = await fetchSnapshot(SEARCH_URL)
const byName = new Map(page.body.servers.map((e) => [e.server.name, e]))
for (const e of search.body.servers) if (!byName.has(e.server.name)) byName.set(e.server.name, e)

if (!byName.has(CONNECTOR_SERVER)) {
  throw new Error(`selected connector ${CONNECTOR_SERVER} absent from the fetched snapshot — source changed, re-verify`)
}
const plugins = [...byName.values()].map(toPlugin)
const npmNames = new Set(plugins.map((p) => p.name))
if (npmNames.size !== plugins.length) {
  throw new Error('registry-name → npm-name mapping collided inside the snapshot; refine the mapping')
}

const index = {
  format: 1,
  title: 'MCP official registry snapshot (offline mirror)',
  description:
    'One-shot fetch of registry.modelcontextprotocol.io (page 1 of version=latest plus the search=filesystem hits); ' +
    'served locally so $OFFLINE runs never touch the network. Regenerate: node scripts/fetch-market-fixture.mjs --force',
  plugins,
}

const source = {
  fetchedAt: new Date().toISOString(),
  upstream: 'https://registry.modelcontextprotocol.io/v0.1/servers',
  queries: [
    { url: PAGE_URL, sha256: createHash('sha256').update(page.raw).digest('hex'), count: page.body.servers.length },
    { url: SEARCH_URL, sha256: createHash('sha256').update(search.raw).digest('hex'), count: search.body.servers.length },
  ],
  composition: 'page1(version=latest) ∪ search=filesystem(version=latest), deduped by server name',
  pluginCount: plugins.length,
  selectedConnector: {
    serverName: CONNECTOR_SERVER,
    npmPackage: '@agent-infra/mcp-server-filesystem',
    presentIn: 'search=filesystem response (raw sha256 above)',
    note: 'task-preferred @modelcontextprotocol/server-filesystem is NOT in the registry (verified 2026-11-02); D6 requires the connector to really exist in the source',
  },
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`)
writeFileSync(SOURCE_PATH, `${JSON.stringify(source, null, 1)}\n`)
console.log(`[fetch-market-fixture] wrote ${plugins.length} plugins -> ${INDEX_PATH}`)
