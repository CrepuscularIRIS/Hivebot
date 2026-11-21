#!/usr/bin/env node
// P6-05 verifier：完全不设 P2SDK_PATCH 的默认链检查。
//   A. session/create 不带 agentPreset → header.agentPreset === 'standard'
//   B. session/create 显式 agentPreset='p6-reply' → 应被拒（p6-reply insert preset 不在默认链）
// 运行：node live_default.mjs   （布局 /tmp/bot-p6-05-vfy-live，用后即删）
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SDK = '/tmp/bot-wt/P6-05/app/sdk'
const ROOT = '/tmp/bot-p6-05-vfy-live'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

rmSync(ROOT, { recursive: true, force: true })
for (const d of ['home', 'dsh', 'handoff', 'data', 'work']) mkdirSync(join(ROOT, d), { recursive: true })

const env = {
  PATH: process.env.PATH,
  HOME: join(ROOT, 'home'),
  P2SDK_PROVIDER: 'mock',
  P2SDK_HOME: join(ROOT, 'dsh'),
  P2SDK_HANDOFF: join(ROOT, 'handoff'),
  P2SDK_PORT: '0',
  P2SDK_READY_TIMEOUT_MS: '180000',
  PBOTS_DATA_DIR: join(ROOT, 'data'),
  DSH_TELEMETRY_MODE: 'DISABLED',
}
if ('P2SDK_PATCH' in env) delete env.P2SDK_PATCH

const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', (c) => { stderr += c })
const dshPid = () => Number(/^p2sdk: dsh pid (\d+)$/m.exec(stderr)?.[1] ?? 0) || 0

const fails = []
const cleanup = async () => {
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    const until = Date.now() + 8000
    while (child.exitCode === null && Date.now() < until) await sleep(200)
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  const dp = dshPid()
  if (dp > 0) {
    try { process.kill(dp, 0); process.kill(dp, 'SIGTERM') } catch { /* gone */ }
    const until = Date.now() + 8000
    while (Date.now() < until) { try { process.kill(dp, 0); await sleep(200) } catch { break } }
    try { process.kill(dp, 0); process.kill(dp, 'SIGKILL') } catch { /* gone */ }
  }
  rmSync(ROOT, { recursive: true, force: true })
}
process.on('SIGINT', () => { void cleanup().then(() => process.exit(130)) })

try {
  const handoffBase = join(ROOT, 'handoff', 'base-url')
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`runtime 提前退出 code=${child.exitCode}\n${stderr.slice(-1500)}`)
    if (existsSync(handoffBase)) break
    await sleep(300)
  }
  if (!existsSync(handoffBase)) throw new Error(`180s 未 ready\n${stderr.slice(-1500)}`)

  const baseUrl = readFileSync(handoffBase, 'utf8').trim()
  const token = readFileSync(join(ROOT, 'handoff', 'launch-token'), 'utf8').trim()
  const { connect } = await import(pathToFileURL(join(SDK, 'examples', 'lib', 'client.mjs')).href)
  const client = await connect({ baseUrl, token })

  // A. 默认会话
  const work = join(ROOT, 'work', 'std')
  const { sessionId } = await client.call('session/create', { request: { cwd: work } })
  const { snapshot } = await client.follow(sessionId, { awaitSnapshot: true })
  const preset = snapshot?.header?.agentPreset
  console.log(`A. 默认会话 ${sessionId} agentPreset=${preset}`)
  if (preset !== 'standard') fails.push(`A: agentPreset=${preset} != standard`)

  // B. p6-reply 显式 preset：默认链（无 P2SDK_PATCH）应拒
  let rejected = false
  let why = ''
  try {
    const r = await client.call('session/create', { request: { cwd: work, agentPreset: 'p6-reply' } })
    why = `居然成功了 sessionId=${r?.sessionId ?? '?'}`
  } catch (e) {
    rejected = true
    why = String(e?.message ?? e).slice(0, 300)
  }
  console.log(`B. agentPreset=p6-reply 被拒=${rejected} 原因=${why}`)
  if (!rejected) fails.push(`B: p6-reply 在无 P2SDK_PATCH 默认链上居然可用（${why}）`)
  client.close()
} catch (e) {
  fails.push(`FATAL: ${e?.stack ?? e}`)
} finally {
  await cleanup()
}
for (const f of fails) console.error(`FAIL: ${f}`)
console.log(fails.length === 0 ? 'live_default PASS' : `live_default ${fails.length} 项不过`)
process.exit(fails.length === 0 ? 0 : 1)
