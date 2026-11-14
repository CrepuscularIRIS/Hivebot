// U-25: src/market unit assertions, executed in a plain `node` subprocess.
// Same coordinate rule as tests/unit/p2temp.proc.mjs (see its header): the
// module also runs raw inside the dsh child, so its unit assertions run raw
// here too and coverage merges without losing ranges.
//
// Red anchor (acceptance ①): main's pluginManager/installBundle refused the
// listing spec '@agent-infra/mcp-server-filesystem@1.2.29' with structured
// `not-bundle` (T-19 ②b, work/p2-sdk/VERIFY-T-19.md) — dsh plugin-manager
// src/index.ts:984 throws ManagementFailure('not-bundle') whenever an added
// package's manifest declares no dsh.bundle. These cases pin the module that
// turns that exact spec into an installable wrapper bundle.
// Prints one JSON array of per-case results; exits non-zero if any failed.
import assert from 'node:assert/strict'
import { rmSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {

  marketWrapperDirFor,
  parseExactNpmSpec,
  patchPluginManagerInstall,
  serverNameOf,
  wrapperNameOf,
} from '../../src/market/wrapper.mjs'
// T1：自建临时目录登记，进程退出时删除（.proc.mjs import 不了 TS 登记簿）
const __t1Dirs = []
const regTmp = (d) => { __t1Dirs.push(d); return d }
process.on('exit', () => { for (const d of __t1Dirs) { try { rmSync(d, { recursive: true, force: true }) } catch (e) { /* 删除失败不阻断退出 */ } } })

/** Same npm-name rule src/p2temp/index.mjs enforces for connector bundle names. */
const BUNDLE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/** The SDK tree this runner lives in (its node_modules holds the preseed). */
const SDK_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CONNECTOR = '@agent-infra/mcp-server-filesystem'
const CONNECTOR_SPEC = `${CONNECTOR}@1.2.29`

/** A fake preseed tree: one bare npm MCP package + the dsh-mcp-client entry. */
function fakeSdkRoot({ name = 'fake-mcp', version = '1.0.0', bin = { 'fake-mcp': 'bin/mcp.cjs' }, dshBundle = false, withMcpClient = true, withBinFile = true } = {}) {
  const root = regTmp(mkdtempSync(join(tmpdir(), 'u25-sdk-')))
  const pkgDir = join(root, 'node_modules', name)
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name, version, bin,
    ...(dshBundle ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}),
  }))
  if (withBinFile) {
    mkdirSync(join(pkgDir, 'bin'), { recursive: true })
    writeFileSync(join(pkgDir, 'bin', 'mcp.cjs'), '// fake entry\n')
  }
  if (withMcpClient) {
    const entry = join(root, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')
    mkdirSync(join(entry, '..'), { recursive: true })
    writeFileSync(entry, '// fake mcp-client\n')
  }
  return root
}

const results = []
const case_ = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: `${error?.message ?? error}` })
  }
}

await case_('parseExactNpmSpec accepts the T-19 listing spec and plain coordinates', () => {
  assert.deepEqual(parseExactNpmSpec(CONNECTOR_SPEC), { name: CONNECTOR, version: '1.2.29' })
  assert.deepEqual(parseExactNpmSpec('pkg@1.0.0'), { name: 'pkg', version: '1.0.0' })
  assert.deepEqual(parseExactNpmSpec('pkg@1.0.0-beta.1'), { name: 'pkg', version: '1.0.0-beta.1' })
})

await case_('parseExactNpmSpec rejects non-exact specs: bare names, tags, ranges, paths, flags', () => {
  for (const bad of ['pkg', 'pkg@latest', 'pkg@^1.0.0', 'pkg@1.0', '@scope/pkg', '../evil@1.0.0', 'file:/x@1.0.0', '-x@1.0.0', '']) {
    assert.equal(parseExactNpmSpec(bad), null, bad)
  }
})

await case_('wrapperNameOf is a valid bundle name, deterministic, distinct per package', () => {
  assert.equal(wrapperNameOf(CONNECTOR), '@p2sdk-market/agent-infra__mcp-server-filesystem')
  assert.equal(wrapperNameOf('pkg'), '@p2sdk-market/pkg')
  assert.ok(BUNDLE_NAME_RE.test(wrapperNameOf(CONNECTOR)))
  assert.notEqual(wrapperNameOf('a/pkg'), wrapperNameOf('b/pkg'))
})

await case_('serverNameOf: deterministic, <=32 chars, distinct per package', () => {
  assert.equal(serverNameOf(CONNECTOR), 'mcp-server-filesystem-3408f957')
  for (const name of [CONNECTOR, 'pkg', '@a/very-long-package-name-that-exceeds-the-budget-for-sure']) {
    const id = serverNameOf(name)
    assert.match(id, SERVER_NAME_RE, name)
    assert.equal(id, serverNameOf(name), `deterministic for ${name}`)
  }
  assert.notEqual(serverNameOf('a/pkg'), serverNameOf('b/pkg'))
})

await case_('T70 launch comes from picks.json data: {workspace} placeholder resolved at generation', () => {
  // T70：启动配置从条目数据查表透传（launchArgsFor 删除）——期望从 picks.json 现算，不手抄。
  const picks = JSON.parse(readFileSync(new URL('../../src/market/picks.json', import.meta.url), 'utf8'))
  const wsHome = regTmp(mkdtempSync(join(tmpdir(), 't70-proc-')))
  const ws = join(wsHome, 'workspace')
  const withLaunch = picks.filter((p) => p.launch !== undefined)
  assert.ok(withLaunch.length >= 2, 'picks.json 至少两条带 launch')
  for (const p of withLaunch) {
    const dir = marketWrapperDirFor({ spec: `${p.name}@${p.version}`, sdkRoot: SDK_ROOT, dshHome: wsHome })
    assert.ok(typeof dir === 'string', `${p.name} wraps against the real preseed`)
    const row = JSON.parse(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).flatMap((q) => q.insert ?? [])[0]
    assert.deepEqual(row.config.args.slice(1), (p.launch.args ?? []).map((a) => a.replaceAll('{workspace}', ws)), `${p.name} args = 数据替换后`)
    assert.deepEqual(row.config.env, Object.fromEntries(Object.entries(p.launch.env ?? {}).map(([k, v]) => [k, v.replaceAll('{workspace}', ws)])), `${p.name} env = 数据替换后`)
  }
})

await case_('marketWrapperDirFor writes a format-1 wrapper for a preseeded bare package', () => {
  const sdk = fakeSdkRoot()
  const home = regTmp(mkdtempSync(join(tmpdir(), 'u25-home-')))
  const dir = marketWrapperDirFor({ spec: 'fake-mcp@1.0.0', sdkRoot: sdk, dshHome: home })
  assert.ok(typeof dir === 'string' && dir.startsWith(join(home, 'market-wrappers')), `wrapper dir under dsh home: ${dir}`)
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@p2sdk-market/fake-mcp')
  assert.equal(manifest.version, '1.0.0')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  const patch = JSON.parse(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8'))
  const row = patch.flatMap((p) => p.insert ?? [])[0]
  assert.equal(row.config.transport, 'stdio')
  assert.equal(row.config.command, process.execPath)
  assert.ok(row.config.args[0].endsWith(join('fake-mcp', 'bin', 'mcp.cjs')), `entry first: ${row.config.args[0]}`)
  assert.equal(row.config.failOnStartupError, true)
  assert.match(row.config.serverName, SERVER_NAME_RE)
  assert.match(row.name, /^file:\/\//, 'mcp-client referenced by absolute file URL (profile workspace has no node_modules)')
  assert.ok(existsSync(join(home, 'workspace')), 'the default allowed workspace was created')
})

await case_('marketWrapperDirFor is idempotent: identical bytes on regeneration', () => {
  const sdk = fakeSdkRoot()
  const home = regTmp(mkdtempSync(join(tmpdir(), 'u25-home-')))
  const dir = marketWrapperDirFor({ spec: 'fake-mcp@1.0.0', sdkRoot: sdk, dshHome: home })
  const before = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')
  assert.equal(marketWrapperDirFor({ spec: 'fake-mcp@1.0.0', sdkRoot: sdk, dshHome: home }), dir)
  assert.equal(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8'), before)
})

await case_('marketWrapperDirFor passes through (null): version mismatch, real dsh bundle, no bin, missing package, missing entry file, missing mcp-client', () => {
  const base = { spec: 'fake-mcp@1.0.0' }
  const home = () => regTmp(mkdtempSync(join(tmpdir(), 'u25-home-')))
  assert.equal(marketWrapperDirFor({ ...base, sdkRoot: fakeSdkRoot({ version: '1.2.29' }), dshHome: home() }), null, 'version mismatch')
  assert.equal(marketWrapperDirFor({ ...base, sdkRoot: fakeSdkRoot({ dshBundle: true }), dshHome: home() }), null, 'declares dsh.bundle already')
  assert.equal(marketWrapperDirFor({ ...base, sdkRoot: fakeSdkRoot({ bin: null }), dshHome: home() }), null, 'no bin')
  assert.equal(marketWrapperDirFor({ ...base, sdkRoot: fakeSdkRoot({ withBinFile: false }), dshHome: home() }), null, 'bin file missing')
  assert.equal(marketWrapperDirFor({ ...base, sdkRoot: fakeSdkRoot({ withMcpClient: false }), dshHome: home() }), null, 'no resolvable dsh-mcp-client')
  assert.equal(marketWrapperDirFor({ spec: 'absent-pkg@1.0.0', sdkRoot: fakeSdkRoot(), dshHome: home() }), null, 'package absent from the preseed')
  assert.equal(marketWrapperDirFor({ spec: 'fake-mcp', sdkRoot: fakeSdkRoot(), dshHome: home() }), null, 'not an exact coordinate')
})

await case_('marketWrapperDirFor wraps the REAL preseeded connector (T-19 ②b spec that main refused not-bundle)', () => {
  const home = regTmp(mkdtempSync(join(tmpdir(), 'u25-home-')))
  const dir = marketWrapperDirFor({ spec: CONNECTOR_SPEC, sdkRoot: SDK_ROOT, dshHome: home })
  assert.ok(dir, `the T-19 listing spec wraps against the real preseed: ${dir}`)
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@p2sdk-market/agent-infra__mcp-server-filesystem')
  const row = JSON.parse(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).flatMap((p) => p.insert ?? [])[0]
  assert.equal(row.config.serverName, 'mcp-server-filesystem-3408f957')
  assert.deepEqual(row.config.args.slice(-2), ['--allowed-directories', join(home, 'workspace')])
})

await case_('patchPluginManagerInstall rewrites only wrappable specs and restores cleanly', async () => {
  class FakePM {
    installBundle(spec, options) { return Promise.resolve({ spec, options }) }
  }
  const pm = new FakePM()
  const home = regTmp(mkdtempSync(join(tmpdir(), 'u25-home-')))
  const restore = patchPluginManagerInstall(pm, { dshHome: home })
  assert.ok(restore, 'patched')
  // Double patch is a no-op.
  assert.equal(patchPluginManagerInstall(pm, { dshHome: home }), null)
  const wrapped = await pm.installBundle(CONNECTOR_SPEC, { enabled: false })
  assert.ok(String(wrapped.spec).startsWith(join(home, 'market-wrappers')), `npm coordinate redirected to the wrapper: ${wrapped.spec}`)
  const passthrough1 = await pm.installBundle('/some/local/dir', { enabled: false })
  assert.equal(passthrough1.spec, '/some/local/dir', 'local dir spec untouched')
  const passthrough2 = await pm.installBundle('absent-pkg@9.9.9', { enabled: false })
  assert.equal(passthrough2.spec, 'absent-pkg@9.9.9', 'non-preseeded coordinate untouched (dsh pnpm path)')
  restore()
  assert.ok(!Object.hasOwn(pm, 'installBundle'), 'restore removed the own property')
})

await case_('patchPluginManagerInstall tolerates a missing service', () => {
  assert.equal(patchPluginManagerInstall(undefined, { dshHome: '/tmp' }), null)
  assert.equal(patchPluginManagerInstall(null, { dshHome: '/tmp' }), null)
})

process.stdout.write(`${JSON.stringify(results)}\n`)
const failed = results.filter((r) => !r.ok)
if (failed.length > 0) process.exitCode = 1
