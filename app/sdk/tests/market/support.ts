// P2-TEMP：P3 可推翻 — T-03 market tests shared helpers.
// Serves the self-made format-1 snapshot over loopback HTTP (plugin-market
// fetches indexes over http(s); a local static server is the offline stand-in),
// materializes the MCP bundle fixture (structure per the upstream
// creator-plugin-manager expected e2e: package.json dsh.bundle.patch +
// cordis.patch.yml as JSON), and reads the methods.json snapshot.
import { createServer, type Server } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PKG_ROOT = join(import.meta.dirname, '..', '..')
export const MARKET_YML = join(PKG_ROOT, 'profile', 'patches', 'market.yml')
export const FIXTURES = join(PKG_ROOT, 'tests', 'market', 'fixtures')

export const BUNDLE_NAME = '@p2sdk-fixture/demo-mcp'
export const CONNECTOR_TOOL = 'mcp__demo__ping'

/** Loopback static server for the format-1 snapshot; resolves to its index URL. */
export async function serveMarketIndex(): Promise<{ url: string; close: () => Promise<void> }> {
  const body = readFileSync(join(FIXTURES, 'market-index.json'))
  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('market index server has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/index.json`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  }
}

/**
 * Materialize the MCP bundle fixture under `dir` (absolute paths differ per
 * machine, so the patch is generated rather than stored). Same shape as the
 * upstream fixture: dsh.bundle.patch names a patch file whose content is JSON.
 */
export function writeBundleFixture(dir: string): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: BUNDLE_NAME,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 1)}\n`)
  const mcpRow = {
    id: 'demo-mcp',
    // Absolute specifier: the $DSH_HOME profile workspace has no node_modules.
    name: pathToFileURL(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')).href,
    config: {
      serverName: 'demo',
      transport: 'stdio',
      command: process.execPath,
      args: [join(FIXTURES, 'mcp-stdio-server.mjs')],
      env: {},
      cwd: '',
      failOnStartupError: true,
    },
  }
  writeFileSync(join(dir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [mcpRow] }])}\n`)
  return dir
}

/** Generated test patch that inserts the methods-snapshot observer plugin. */
export function writeObserverPatch(dir: string): string {
  const path = join(dir, 'methods-snapshot.patch.yml')
  writeFileSync(path, `\
- insert:
    - id: p2sdk-methods-snapshot
      name: '${pathToFileURL(join(FIXTURES, 'methods-snapshot.mjs')).href}'
`)
  return path
}

/** The runtime's registered method table, read once it contains `needle`. */
export async function readMethods(home: string, needle: string, timeoutMs = 60_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const methods: string[] = JSON.parse(readFileSync(join(home, 'methods.json'), 'utf8'))
      if (needle === '' || methods.includes(needle)) return methods
    } catch {
      // not written yet
    }
    if (Date.now() > deadline) throw new Error(`methods.json never contained ${JSON.stringify(needle)}`)
    await new Promise((r) => setTimeout(r, 300))
  }
}
