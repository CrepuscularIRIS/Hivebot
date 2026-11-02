// T-01.f1 hands-on verification of acceptance ① and ② (verifier-owned, not the builder's test).
// Boots the real runtime (mock provider, mkdtemp home) from the worktree, then:
//   ② client.close() -> socket.open() must throw MuxError immediately.
//   ① follow a session, send a prompt, SIGKILL dsh the moment the FIRST chunk
//      arrives (真 mid-stream), race the for-await against 8s:
//      reject with MuxError = PASS; normal end = silent exit FAIL; timeout = hang FAIL.
// Exit 0 only if both checks pass. No pkill -f: pids via pgrep -P / known parent.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '/tmp/bot-wt/T-01.f1/app/sdk/examples/lib/client.mjs'
import { MuxError } from '/tmp/bot-wt/T-01.f1/app/sdk/examples/lib/mux.mjs'

const WT = '/tmp/bot-wt/T-01.f1/app/sdk'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const home = mkdtempSync(join(tmpdir(), 'p2sdk-verify-f1-'))
const parent = spawn(process.execPath, [join(WT, 'scripts', 'start.mjs')], {
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
parent.stdout.setEncoding('utf8').on('data', (c) => { out += c })
parent.stderr.setEncoding('utf8').on('data', (c) => { out += c })
const deadline = Date.now() + 60000
while (Date.now() < deadline) {
  if (/\[p2sdk\] ready http/.test(out)) break
  if (parent.exitCode !== null) { console.error(`runtime exited early (code ${parent.exitCode}):\n${out}`); process.exit(1) }
  await sleep(200)
}
if (!/\[p2sdk\] ready http/.test(out)) { console.error(`runtime never became ready:\n${out}`); process.exit(1) }
const baseUrl = readFileSync(join(home, 'base-url'), 'utf8').trim()
const token = readFileSync(join(home, 'launch-token'), 'utf8').trim()
const dshPids = (() => {
  try {
    return execSync(`pgrep -P ${parent.pid}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number)
  } catch { return [] }
})()
console.log(`runtime ready baseUrl=${baseUrl} parent=${parent.pid} dshPids=${JSON.stringify(dshPids)}`)

// --- ② close() then open() must throw immediately ---
let check2 = 'FAIL'
const client2 = await connect({ baseUrl, token })
client2.close()
try {
  await client2.socket.open('session/follow', {})
  check2 = 'FAIL: open() resolved normally on closed socket'
} catch (e) {
  check2 = e instanceof MuxError ? `PASS (${e.constructor.name}: ${e.message})` : `FAIL: wrong error type ${e?.constructor?.name}: ${e?.message}`
}
console.log(`② ${check2}`)

// --- ① kill dsh mid-stream -> for-await must exit with connection error ---
const client = await connect({ baseUrl, token })
const { sessionId } = await client.call('session/create', { request: { cwd: join(home, 'workspace') } })
const stream = await client.follow(sessionId, { assistantStream: true })
let frames = 0
let firstChunkAt = 0
const consume = (async () => {
  for await (const f of stream) {
    frames++
    if (f.type === 'assistant-stream' && f.frame?.type === 'chunk' && !firstChunkAt) firstChunkAt = Date.now()
  }
  return 'ended-normally'
})()
const requestId = `verify-${Date.now()}`
await client.call('session/prompt', {
  request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text: '你好' }] },
})
// park until the first chunk reaches the client, then SIGKILL dsh (mid-stream)
const killBy = Date.now() + 8000
while (!firstChunkAt && Date.now() < killBy) await sleep(5)
if (!firstChunkAt) {
  console.error('① FAIL: no chunk arrived within 8s, cannot stage mid-stream kill')
  parent.kill('SIGKILL'); process.exit(1)
}
for (const pid of dshPids) { try { process.kill(pid, 'SIGKILL') } catch {} }
console.log(`① killed dsh ${JSON.stringify(dshPids)} after first chunk (frames so far=${frames})`)
const t0 = Date.now()
const outcome = await Promise.race([
  consume.then((v) => v, (err) => err),
  sleep(8000).then(() => 'still-pending-after-8s'),
])
const ms = Date.now() - t0
let check1
if (outcome instanceof MuxError) check1 = `PASS (MuxError after ${ms}ms: ${outcome.message})`
else if (outcome === 'ended-normally') check1 = `FAIL: for-await ended normally (silent exit-0 path), frames=${frames}`
else if (outcome === 'still-pending-after-8s') check1 = 'FAIL: for-await still pending after 8s (hang)'
else check1 = `FAIL: unexpected rejection ${outcome?.constructor?.name}: ${outcome?.message}`

// cleanup
try { client.close() } catch {}
try { client2.close() } catch {}
try { parent.kill('SIGTERM') } catch {}
await sleep(300)
try { parent.kill('SIGKILL') } catch {}

const ok2 = check2.startsWith('PASS')
const ok1 = check1.startsWith('PASS')
console.log(`① ${check1}`)
console.log(ok1 && ok2 ? 'HANDS-ON PASS' : 'HANDS-ON FAIL')
process.exit(ok1 && ok2 ? 0 : 1)
