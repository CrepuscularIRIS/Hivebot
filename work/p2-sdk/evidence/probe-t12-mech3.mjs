#!/usr/bin/env node
// T-12 补充探针：确认 C3 的防御机制（沙箱挡读 or 探针哑掉）。
// 同一默认链（无 P2SDK_PATCH/HANDOFF），探针：
//  1) /etc/hostname 读（workspace 外一般读） 2) ls /tmp 3) find /tmp 详版
//  4) /proc 可见性 + /proc/*/environ 里 P2SDK 名（进程侧旁路）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'file:///tmp/bot-wt/T-12/app/sdk/examples/lib/client.mjs'

const SDK = '/tmp/bot-wt/T-12/app/sdk'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const note = (label, detail) => { results.push({ label, detail }); console.log(`INFO | ${label} | ${detail}`) }

function bashCall(command) {
  const id = 'probe2-' + Math.random().toString(16).slice(2, 8)
  const argumentsJson = JSON.stringify({ command, description: 'verifier probe 2' })
  return { kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
function textCall(text) {
  return { kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }
}

const PROBES = [
  ['names', 'echo VFY_NAMES="$(grep -a -h -o "P2SDK_[A-Z_]*=" /proc/[0-9]*/environ 2>/dev/null | sort -u | head -c 200)" VFY_LEAK=$(grep -a -l -E "P2SDK_(HOME|HANDOFF)=" /proc/[0-9]*/environ 2>/dev/null | wc -l)'],
  ['dshhome', 'echo VFY_DSH_HOME_FILES=$(grep -a -l "DSH_HOME=" /proc/[0-9]*/environ 2>/dev/null | wc -l)'],
]

const home = mkdtempSync(join(tmpdir(), 'p2sdk-vfy2-home-'))
const env = {}
for (const [k, v] of Object.entries(process.env)) {
  if (!k.startsWith('P2SDK_') && !k.startsWith('DSH_') && k !== 'NODE_V8_COVERAGE') env[k] = v
}
Object.assign(env, { P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '90000' })
const { spawn } = await import('node:child_process')
const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = '', err = ''
child.stdout.setEncoding('utf8'); child.stdout.on('data', (c) => { out += c })
child.stderr.setEncoding('utf8'); child.stderr.on('data', (c) => { err += c })
const overridePath = join(home, 'replay-override.json')
const t0 = Date.now()
while (Date.now() - t0 < 15000) {
  if (existsSync(overridePath)) {
    writeFileSync(overridePath + '.p', JSON.stringify(PROBES.flatMap(([, c]) => [bashCall(c), textCall('p')])))
    renameSync(overridePath + '.p', overridePath)
    break
  }
  if (child.exitCode !== null) break
  await sleep(2)
}
while (!/\[p2sdk\] ready http/.test(out)) { if (child.exitCode !== null) throw new Error('early exit ' + out + err); await sleep(100) }
const dshPid = Number(/p2sdk: dsh pid (\d+)/.exec(err)?.[1] ?? 0)
const handoff = /p2sdk: handoff (\S+)/.exec(err)?.[1] ?? ''
await sleep(200)
const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
note('operator-side handoff', handoff)
note('operator-side token exists (len)', String(token.length))

const client = await connect({ baseUrl, token, interactions: 'answer' })
const stream = await client.socket.open('$events', {})
const eframes = []
void (async () => { for await (const f of stream) eframes.push(f) })()
while (!eframes.some((f) => f.type === 'ready')) await sleep(20)
const clientId = eframes.find((f) => f.type === 'ready')?.clientId ?? ''

const cwd = join(home, 'workspace')
const { mkdirSync } = await import('node:fs')
mkdirSync(cwd, { recursive: true })
const { sessionId: sid } = await client.call('session/create', { request: { cwd } })
const follow = await client.follow(sid, { assistantStream: true })
const frames = []
void (async () => { for await (const f of follow) frames.push(f) })()

for (let i = 0; i < PROBES.length; i++) {
  await client.call('session/prompt', { request: { requestId: 'v2-' + i, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'p' }] } })
  const t = Date.now()
  let ask
  for (;;) {
    ask = eframes.find((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sid && !f.__v2done)
    if (ask) break
    if (Date.now() > t + 15000) throw new Error('no approval for probe ' + i)
    await sleep(20)
  }
  ask.__v2done = true
  await client.call('$events/result', { clientId, eventId: ask.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
  const t2 = Date.now()
  const before = frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length
  while (frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length < before + 1) {
    if (Date.now() > t2 + 20000) throw new Error('no turn end for probe ' + i)
    await sleep(50)
  }
}
follow.cancel()
await sleep(300)
const all = JSON.stringify(frames).split(token).join('<REDACTED>')
writeFileSync('/home/lingxufeng/bot/work/p2-sdk/evidence/t12-mech-transcript.json', all)
for (const [label] of PROBES) {
  const m = all.match(new RegExp('VFY_[A-Z0-9_]+=[^"\\\\]*(?:\\\\.[^"\\\\]*)*', 'g')) ?? []
}





client.close()
child.kill('SIGTERM')
if (dshPid) { try { process.kill(dshPid, 'SIGTERM') } catch {} }
await sleep(500)
if (dshPid) { try { process.kill(dshPid, 0); process.kill(dshPid, 'SIGKILL') } catch {} }
process.exit(0)
