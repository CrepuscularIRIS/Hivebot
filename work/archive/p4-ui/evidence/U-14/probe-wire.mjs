// U-14 验收探针（verifier）：对真 SDK runtime 实测 app/ui M3 各 dsh.rpc 调用的 wire 壳。
// 生产路径同构：DshConnection.rpc → rpcRaw（connect.ts:29-45）= /api/<method> client-request 包络。
// 用例矩阵（发现 b 复核 + U-14 ① 对照）：
//   A1 session/list {cursor:null}      —— m3-meta/index.ts:84 patch 分支现状
//   A2 session/list {_request:{}}      —— restore.spec.ts:118 e2e 成功形状
//   A3 session/list {}                 —— 裸空对象
//   B1 p2temp/session.createWithConnectors 无壳 —— orchestrate.ts:105 现状（agentPreset 显式给，不走 list）
//   B2 同方法 {request:…} 壳            —— restore.spec.ts:81 SDK client 成功形状
//   C1 p2temp/preset.ensure {request:…} —— restore.ts:34 修复后现状（预期 ok）
//   C2 p2temp/preset.ensure 无壳        —— commit 申报的 arguments-invalid（复核）
//   D  agentPresets/list {}             —— orchestrate.ts:86 / m3 index.ts:60 现状（e2e 已证 ok，基线）
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const WT = resolve(import.meta.dirname, '..', '..', 'tmp', 'bot-wt', 'U-14') // placeholder, replaced below
const SDK_ROOT = process.env.SDK_ROOT
if (!SDK_ROOT) throw new Error('SDK_ROOT env required')

for (const name of ['P2SDK_LLM_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LITELLM_MASTER_KEY']) delete process.env[name]

const home = mkdtempSync(join(tmpdir(), 'vfy-U-14-home-'))
const handoff = mkdtempSync(join(tmpdir(), 'vfy-U-14-handoff-'))
const overlay = join(mkdtempSync(join(tmpdir(), 'vfy-U-14-patch-')), 'fake-llm.yml')
const fake = pathToFileURL(join(SDK_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href
import { writeFileSync } from 'node:fs'
writeFileSync(overlay, `- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${fake}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
const marketYml = join(SDK_ROOT, 'profile', 'patches', 'market.yml')

const child = spawn(process.execPath, [join(SDK_ROOT, 'scripts', 'start.mjs')], {
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0', P2SDK_PATCH: `${marketYml}:${overlay}`, P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
child.stdout.on('data', (c) => { output += c }); child.stderr.on('data', (c) => { output += c })
const deadline = Date.now() + 60000
while (!/\[p2sdk\] ready http/.test(output)) {
  if (child.exitCode !== null) throw new Error(`runtime exited early: ${output}`)
  if (Date.now() >= deadline) throw new Error(`runtime not ready: ${output}`)
  await new Promise((r) => setTimeout(r, 200))
}
const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()

// cookie 交换（client.mjs:67-75 同款；interactions=answer 同生产 DshConnection）
const res = await fetch(`${baseUrl}/connect?token=${encodeURIComponent(token)}&interactions=answer`, { redirect: 'manual' })
if (res.status !== 302 && res.status !== 303) throw new Error(`token exchange failed: HTTP ${res.status}`)
const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

// rpcRaw 同构（app/ui/main/dsh/connect.ts:29-45 原样逻辑）
async function rpcRaw(method, args) {
  const rpcId = randomUUID()
  const r = await fetch(`${baseUrl}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
  })
  if (!r.ok) return { ok: false, error: { code: 'HTTP', message: String(r.status) } }
  const body = await r.json()
  if (body.type !== 'server-response' || body.rpcId !== rpcId || body.result === undefined) {
    return { ok: false, error: { code: 'envelope', message: JSON.stringify(body).slice(0, 200) } }
  }
  return body.result
}

const show = (tag, r) => console.log(`${tag}: ${JSON.stringify(r).slice(0, 260)}`)

const cwd = mkdtempSync(join(tmpdir(), 'vfy-U-14-ws-'))
try {
  show('D  agentPresets/list {}                      (现状, 基线)', await rpcRaw('agentPresets/list', {}))
  show('A1 session/list {cursor:null}                (M3 patch 现状)', await rpcRaw('session/list', { cursor: null }))
  show('A2 session/list {_request:{}}                (e2e 成功形状)', await rpcRaw('session/list', { _request: {} }))
  show('A3 session/list {}                           (裸空)', await rpcRaw('session/list', {}))
  show('C1 preset.ensure {request:{...}}             (restore.ts 修复后)', await rpcRaw('p2temp/preset.ensure', { request: { agentPreset: 'standard', connectors: [] } }))
  show('C2 preset.ensure 无壳                         (commit 申报拒)', await rpcRaw('p2temp/preset.ensure', { agentPreset: 'standard', connectors: [] }))
  show('B1 createWithConnectors 无壳                 (orchestrate.ts:105 现状)', await rpcRaw('p2temp/session.createWithConnectors', { connectors: ['vfy-none'], agentPreset: 'standard', cwd }))
  show('B2 createWithConnectors {request:…} 壳        (SDK client 形状)', await rpcRaw('p2temp/session.createWithConnectors', { request: { connectors: ['vfy-none'], agentPreset: 'standard', cwd } }))
} finally {
  child.kill('SIGTERM')
  await new Promise((r) => { const t = setTimeout(() => { child.kill('SIGKILL'); r() }, 10000); child.on('exit', () => { clearTimeout(t); r() }); if (child.exitCode !== null) { clearTimeout(t); r() } })
}
