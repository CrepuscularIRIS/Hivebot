// U-23 P-D/P-C E2E 共用：连接器 bundle fixture + 本地市场（两个目录源 + 假 npm registry）。
// bundle 结构来源: app/sdk/tests/market/support.ts writeBundleFixture（dsh.bundle.patch + JSON cordis patch，
// mcp-client 行指向 fixtures/mcp-stdio-server.mjs；绝对路径按本机生成）。
// 目录源：real = T-19 快照 app/sdk/tests/e2e/fixtures/market/index.json（111 = 21 有坐标 + 90 not-installable）；
// local = 本测试生成的 1 条，source 指向同一 loopback 上的假 npm registry（packument + tgz），让「产品按钮装成功」
// 这条路在包装层（U-25）落地前也能真走 pnpm add → dsh bundle 检查 → listBundles。
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SDK_ROOT = join(__dirname, '..', '..', '..', 'sdk')
export const MARKET_PATCH = join(SDK_ROOT, 'profile', 'patches', 'market.yml')
export const MARKET_SOURCE_PATCH = join(SDK_ROOT, 'profile', 'patches', 'market-source.yml')
export const REAL_INDEX = join(SDK_ROOT, 'tests', 'e2e', 'fixtures', 'market', 'index.json')
export const DEMO_BUNDLE = '@p2sdk-fixture/demo-mcp'
export const LOCAL_PLUGIN = '@bot-u23/demo-connector'
/** U-26：local 源的裸 npm 包（无 dsh.bundle 声明、未预置）——真 pnpm 拉到 → dsh 结构化 not-bundle（旅程保留）。 */
export const BARE_PLUGIN = '@bot-u23/bare-package'

interface ListedVersion { version: string; install?: { spec?: string } }
interface ListedPlugin { name: string; metadata?: { keywords?: string[] }; versions?: ListedVersion[]; defaultVersion?: string }

interface ListedVersion2 { version: string; source?: { type?: string } }

/**
 * U-26 ④（GU-PDC-A MEDIUM，数据面方案）：real 快照里「有 npm 坐标（source.type==='npm'，
 * SDK listing 据此合成 install spec——快照原文无 install 字段）但未预置进 app/sdk
 * devDependencies（版本与 wrapper 预置判定一致）」的条目打 not-installable keyword——
 * classify 现有逻辑自动归「仅浏览」，用户不再面对 19 个点了只会真 pnpm 下载 → not-bundle
 * 慢失败的「安装」按钮。预置补齐后自动摘除；local 生成源不走此标记（假 registry 在线可装）。
 * 判定条目 = UI targetVersion 同款（defaultVersion 对应条 ?? versions[0]）。
 */
function patchRealIndex(): Buffer {
  const index = JSON.parse(readFileSync(REAL_INDEX, 'utf8')) as { plugins: Array<ListedPlugin & { versions?: ListedVersion2[] }> }
  const dev = JSON.parse(readFileSync(join(SDK_ROOT, 'package.json'), 'utf8')).devDependencies as Record<string, string>
  for (const plugin of index.plugins) {
    const versions = plugin.versions ?? []
    const target = versions.find((v) => v.version === plugin.defaultVersion) ?? versions[0]
    if (target?.source?.type !== 'npm') continue // 无坐标：fetch-market-fixture 本就标了 not-installable
    if (dev[plugin.name] === target.version) continue // 预置（版本一致）→ wrapper 可装，保持可装
    plugin.metadata ??= {}
    if (!plugin.metadata.keywords?.includes('not-installable')) (plugin.metadata.keywords ??= []).push('not-installable')
  }
  return Buffer.from(JSON.stringify(index))
}

/** 写一个可装的 dsh 连接器 bundle 目录（package.json + cordis.patch.yml），返回目录。 */
export function writeBundle(dir: string, name: string = DEMO_BUNDLE, version = '1.0.0'): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name, version, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 1)}\n`)
  const row = {
    id: `mcp-${createHash('sha1').update(name).digest('hex').slice(0, 8)}`,
    name: pathToFileURL(join(SDK_ROOT, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')).href,
    config: {
      serverName: 'demo', transport: 'stdio', command: process.execPath,
      args: [join(SDK_ROOT, 'tests', 'market', 'fixtures', 'mcp-stdio-server.mjs')],
      env: {}, cwd: '', failOnStartupError: true,
    },
  }
  writeFileSync(join(dir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [row] }])}\n`)
  return dir
}

export const tempBundle = (name: string = DEMO_BUNDLE): string =>
  writeBundle(join(mkdtempSync(join(tmpdir(), 'bot-u23-bundle-')), 'pkg'), name)

export interface MarketServer { realUrl: string; localUrl: string; registry: string; close(): Promise<void> }

/** loopback：/real/index.json、/local/index.json、/npm/<name>（packument）、/npm/-/<file>.tgz。 */
export async function serveMarket(): Promise<MarketServer> {
  const work = mkdtempSync(join(tmpdir(), 'bot-u23-market-'))
  const pkgRoot = join(work, 'tar')
  writeBundle(join(pkgRoot, 'package'), LOCAL_PLUGIN)
  const tgzPath = join(work, 'demo-connector-1.0.0.tgz')
  execFileSync('tar', ['-czf', tgzPath, '-C', pkgRoot, 'package'])
  const tgz = readFileSync(tgzPath)
  // U-26：裸包 tarball（package.json 无 dsh.bundle 声明，未预置）——真 pnpm 装到 → not-bundle
  const bareRoot = join(work, 'bare')
  mkdirSync(join(bareRoot, 'package'), { recursive: true })
  writeFileSync(join(bareRoot, 'package', 'package.json'), `${JSON.stringify({ name: BARE_PLUGIN, version: '1.0.0' }, null, 1)}\n`)
  const bareTgzPath = join(work, 'bare-package-1.0.0.tgz')
  execFileSync('tar', ['-czf', bareTgzPath, '-C', bareRoot, 'package'])
  const bareTgz = readFileSync(bareTgzPath)
  const real = patchRealIndex()
  let base = ''
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!)
    const json = (body: unknown): void => { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body)) }
    if (path === '/real/index.json') { res.writeHead(200, { 'content-type': 'application/json' }).end(real); return }
    if (path === '/local/index.json') {
      json({
        format: 1, title: 'U-23 本地目录', description: 'U-23 E2E 生成的单条目录（假 npm registry）',
        plugins: [
          {
            name: LOCAL_PLUGIN, title: 'Demo connector', description: 'U-23 可安装连接器（ping MCP）',
            versions: [{ version: '1.0.0', publishTimestamp: 1761958400, source: { type: 'npm', registry: `${base}/npm/` } }],
          },
          {
            name: BARE_PLUGIN, title: 'Bare package', description: 'U-26 无 dsh.bundle 声明的裸 npm 包（not-bundle 旅程）',
            versions: [{ version: '1.0.0', publishTimestamp: 1761958400, source: { type: 'npm', registry: `${base}/npm/` } }],
          },
        ],
      })
      return
    }
    if (path === `/npm/${LOCAL_PLUGIN}`) {
      const time = '2020-01-01T00:00:00.000Z'
      json({
        name: LOCAL_PLUGIN, 'dist-tags': { latest: '1.0.0' }, time: { created: time, modified: time, '1.0.0': time },
        versions: {
          '1.0.0': {
            name: LOCAL_PLUGIN, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
            dist: {
              tarball: `${base}/npm/-/demo-connector-1.0.0.tgz`,
              shasum: createHash('sha1').update(tgz).digest('hex'),
              integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}`,
            },
          },
        },
      })
      return
    }
    if (path === `/npm/${BARE_PLUGIN}`) {
      const time = '2020-01-01T00:00:00.000Z'
      json({
        name: BARE_PLUGIN, 'dist-tags': { latest: '1.0.0' }, time: { created: time, modified: time, '1.0.0': time },
        versions: {
          '1.0.0': {
            name: BARE_PLUGIN, version: '1.0.0',
            dist: {
              tarball: `${base}/npm/-/bare-package-1.0.0.tgz`,
              shasum: createHash('sha1').update(bareTgz).digest('hex'),
              integrity: `sha512-${createHash('sha512').update(bareTgz).digest('base64')}`,
            },
          },
        },
      })
      return
    }
    if (path === '/npm/-/demo-connector-1.0.0.tgz') { res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(tgz); return }
    if (path === '/npm/-/bare-package-1.0.0.tgz') { res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(bareTgz); return }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('market server has no TCP address')
  base = `http://127.0.0.1:${address.port}`
  return {
    realUrl: `${base}/real/index.json`, localUrl: `${base}/local/index.json`, registry: `${base}/npm/`,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }),
  }
}
