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
  const real = readFileSync(REAL_INDEX)
  let base = ''
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!)
    const json = (body: unknown): void => { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body)) }
    if (path === '/real/index.json') { res.writeHead(200, { 'content-type': 'application/json' }).end(real); return }
    if (path === '/local/index.json') {
      json({
        format: 1, title: 'U-23 本地目录', description: 'U-23 E2E 生成的单条目录（假 npm registry）',
        plugins: [{
          name: LOCAL_PLUGIN, title: 'Demo connector', description: 'U-23 可安装连接器（ping MCP）',
          versions: [{ version: '1.0.0', publishTimestamp: 1761958400, source: { type: 'npm', registry: `${base}/npm/` } }],
        }],
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
    if (path === '/npm/-/demo-connector-1.0.0.tgz') { res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(tgz); return }
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
