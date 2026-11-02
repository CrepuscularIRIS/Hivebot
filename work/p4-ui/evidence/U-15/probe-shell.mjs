// U-15 验收探针：#4 / session/list / installBundle 的 wire 壳形态独立实测。
// 判定问题：U-14 verifier 称 #4 正确壳是 `_request:{}`（从 session/list 类推），
// builder 称 `{request:…}`。本探针对真 p2sdk runtime 逐一发三种壳，记录各自结果。
// 依据（源码级）：gateway assertExactArguments 要求 args 键集合 === descriptor 参数 wire 名
// （dsh-api-gateway/lib/index.js:1773-1790）；参数名来自各方法实现签名
// （p2temp createWithConnectors(request) / session list(_request) / installBundle(spec, options)）。
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SDK_ROOT = '/tmp/bot-wt/U-15/app/sdk'
const MARKET_PATCH = join(SDK_ROOT, 'profile', 'patches', 'market.yml')

// fake overlay（与 app/ui tests/support/sdk-runtime.ts fakeOverlayPath 同款）
const overlayDir = mkdtempSync(join(tmpdir(), 'u15-probe-overlay-'))
const pluginUrl = pathToFileURL(join(SDK_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href
const overlay = join(overlayDir, 'fake-llm.yml')
writeFileSync(overlay, `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pluginUrl}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)

// bundle fixture（d1.spec writeBundleFixture 同款）
const BUNDLE_NAME = '@p2sdk-fixture/demo-mcp'
const bundleDir = mkdtempSync(join(tmpdir(), 'u15-probe-bundle-'))
mkdirSync(bundleDir, { recursive: true })
writeFileSync(join(bundleDir, 'package.json'), `${JSON.stringify({
  name: BUNDLE_NAME, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
}, null, 1)}\n`)
const mcpRow = {
  id: 'demo-mcp',
  name: pathToFileURL(join(SDK_ROOT, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')).href,
  config: {
    serverName: 'demo', transport: 'stdio', command: process.execPath,
    args: [join(SDK_ROOT, 'tests', 'market', 'fixtures', 'mcp-stdio-server.mjs')],
    env: {}, cwd: '', failOnStartupError: true,
  },
}
writeFileSync(join(bundleDir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [mcpRow] }])}\n`)

const home = mkdtempSync(join(tmpdir(), 'u15-probe-home-'))
const handoff = mkdtempSync(join(tmpdir(), 'u15-probe-handoff-'))
const child = spawn(process.execPath, [join(SDK_ROOT, 'scripts', 'start.mjs')], {
  env: {
    ...process.env,
    HOME: home, // HOME 隔离（LEARNINGS）
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: home,
    P2SDK_HANDOFF: handoff,
    P2SDK_PORT: '0',
    P2SDK_PATCH: `${MARKET_PATCH}:${overlay}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.setEncoding('utf8'); child.stdout.on('data', (c) => { output += c })
child.stderr.setEncoding('utf8'); child.stderr.on('data', (c) => { output += c })

const deadline = Date.now() + 60_000
while (!/\[p2sdk\] ready http/.test(output)) {
  if (child.exitCode !== null) { console.log('RUNTIME EXITED', child.exitCode, output); process.exit(1) }
  if (Date.now() > deadline) { console.log('RUNTIME TIMEOUT', output); child.kill('SIGKILL'); process.exit(1) }
  await new Promise((r) => setTimeout(r, 200))
}
const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
const { connect } = await import(pathToFileURL(join(SDK_ROOT, 'examples', 'lib', 'client.mjs')).href)
const client = await connect({ baseUrl, token, interactions: 'answer' })

async function probe(label, method, args) {
  try {
    const value = await client.call(method, args)
    console.log(`[${label}] OK ${JSON.stringify(value).slice(0, 200)}`)
  } catch (error) {
    const e = error
    const info = { name: e.name, code: e.code ?? e.errorCode, message: String(e.message).slice(0, 180) }
    console.log(`[${label}] REJECT ${JSON.stringify(info)}`)
  }
}

const inner = { connectors: ['x-nonexistent-bundle'], agentPreset: 'standard' }
await probe('#4 裸对象（无壳）', 'p2temp/session.createWithConnectors', inner)
await probe('#4 {request:…}', 'p2temp/session.createWithConnectors', { request: inner })
await probe('#4 {_request:…}（U-14 verifier 口径）', 'p2temp/session.createWithConnectors', { _request: inner })
await probe('session/list {} 裸', 'session/list', {})
await probe('session/list {_request:{}}', 'session/list', { _request: {} })
await probe('session/list {request:{}}', 'session/list', { request: {} })
await probe('#21 preset.ensure 裸对象', 'p2temp/preset.ensure', { agentPreset: 'standard', connectors: ['x-nonexistent-bundle'] })
await probe('#21 preset.ensure {request:…}', 'p2temp/preset.ensure', { request: { agentPreset: 'standard', connectors: ['x-nonexistent-bundle'] } })
await probe('installBundle {spec,options}（enabled:false）', 'pluginManager/installBundle', { spec: bundleDir, options: { enabled: false } })

client.close()
child.kill('SIGTERM')
await new Promise((resolve) => {
  const t = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 10_000)
  child.on('exit', () => { clearTimeout(t); resolve() })
  if (child.exitCode !== null) { clearTimeout(t); resolve() }
})
console.log('probe done')
