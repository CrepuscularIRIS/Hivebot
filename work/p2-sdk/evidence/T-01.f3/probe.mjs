// T-01.f3 verifier probe (independent of vitest). Never prints token values.
// A: /proc environ allowlist + credential file placement
// B: transcript — tool-layer failures on old paths + a CONTROL read that must succeed
// C: documented residual — default handoff dir name is guessable (boolean only)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SDK = '/tmp/bot-wt/T-01.f3-verify/app/sdk'
const { connect, snapshotFrames } = await import(pathToFileURL(join(SDK, 'examples/lib/client.mjs')).href)

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function children(pid) {
  try { return readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').split(/\s+/).filter(Boolean).map(Number) } catch { return [] }
}
function dshPidUnder(pid) {
  const seen = new Set()
  const walk = (p) => {
    if (seen.has(p)) return null
    seen.add(p)
    try {
      const cmd = readFileSync(`/proc/${p}/cmdline`, 'utf8')
      if (cmd.includes('/dsh/lib/bin.js')) return p
    } catch { /* gone */ }
    for (const c of children(p)) { const f = walk(c); if (f) return f }
    return null
  }
  return walk(pid)
}
function envHas(pid, name) {
  try {
    return readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').some((e) => e.startsWith(`${name}=`))
  } catch { return false }
}

function overlayYml() {
  const dir = mkdtempSync(join(tmpdir(), 'probe-overlay-'))
  const yml = join(dir, 'fake.yml')
  writeFileSync(yml, `# verifier probe overlay
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(SDK, 'tests/support/fake/plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
  return yml
}

function readToolCall(index, id, filePath) {
  const args = JSON.stringify({ file_path: filePath })
  return [
    { type: 'block-start', index, blockType: 'tool-call' },
    { type: 'tool-call-delta', index, id, name: 'read', argumentsDelta: args },
    { type: 'block-end', index, block: { type: 'tool-call', id, name: 'read', arguments: args } },
  ]
}
const textCall = (text) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
  { type: 'finish', reason: { kind: 'stop' } },
] })

async function boot(env) {
  const child = spawn(process.execPath, [join(SDK, 'scripts/start.mjs')], {
    env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  let out = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (c) => { out += c })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (/\[p2sdk\] ready http/.test(out)) break
    if (child.exitCode !== null) throw new Error(`runtime exited early ${child.exitCode}:\n${out}`)
    await sleep(150)
  }
  if (!/\[p2sdk\] ready http/.test(out)) throw new Error(`no ready line:\n${out}`)
  return { child, out }
}

async function runTurnWithReads(handoff, reads, label) {
  const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
  const client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token })
  const work = mkdtempSync(join(tmpdir(), 'probe-work-'))
  const { sessionId } = await client.call('session/create', { request: { cwd: work } })
  let chunks = []
  reads.forEach((r, i) => { chunks = chunks.concat(readToolCall(i, `probe-${i}`, r.path)) })
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } })
  mkdirSync(join(work, '..', `probe-scripts-${process.pid}`), { recursive: true }) // noop keep structure simple
  // script must be written into $P2SDK_HOME/fake/scripts/<sessionId>.json — caller passes home via closure below
  return { client, sessionId, work, chunks, token }
}

// ---- Phase A+B: explicit handoff, env allowlist, transcript --------------
{
  const home = mkdtempSync(join(tmpdir(), 'probe-home-'))
  const handoff = mkdtempSync(join(tmpdir(), 'probe-ho-'))
  const { child } = await boot({ P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PATCH: overlayYml(), ANTHROPIC_AUTH_TOKEN: 'probe-sentinel-do-not-print' })
  try {
    const dsh = dshPidUnder(child.pid)
    log(`A dsh pid under launcher: ${dsh}`)
    log(`A dsh env ANTHROPIC_AUTH_TOKEN present (expect false): ${envHas(dsh, 'ANTHROPIC_AUTH_TOKEN')}`)
    log(`A dsh env P2SDK_HANDOFF present (expect false): ${envHas(dsh, 'P2SDK_HANDOFF')}`)
    log(`A dsh env DSH_HOME present (expect true): ${envHas(dsh, 'DSH_HOME')}`)
    log(`A dsh env PATH present (expect true): ${envHas(dsh, 'PATH')}`)
    const tokStat = statSync(join(handoff, 'launch-token'))
    log(`A handoff/launch-token mode (expect 600): ${(tokStat.mode & 0o777).toString(8)}`)
    log(`A home/launch-token exists (expect false): ${existsSync(join(home, 'launch-token'))}`)
    log(`A home/runtime-patch.yml exists after ready (expect false): ${existsSync(join(home, 'runtime-patch.yml'))}`)

    // B: transcript with 2 failing reads + 1 control read that must succeed
    const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
    const client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token })
    const work = mkdtempSync(join(tmpdir(), 'probe-work-'))
    writeFileSync(join(work, 'control.txt'), 'probe-control-ok')
    const { sessionId } = await client.call('session/create', { request: { cwd: work } })
    mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
    writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: [
      { chunks: [
        ...readToolCall(0, 'p-rel', '../launch-token'),
        ...readToolCall(1, 'p-abs', join(home, 'launch-token')),
        ...readToolCall(2, 'p-ctl', 'control.txt'),
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ] },
      textCall('完'),
    ] }))
    const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
    const frames = [...snapshotFrames(snapshot)]
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await client.call('session/prompt', { request: { requestId: `probe-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '读这三个文件' }] } })
    const deadline = Date.now() + 20000
    while (!frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end') && Date.now() < deadline) await sleep(100)
    stream.cancel(); void drained
    const all = JSON.stringify(frames)
    const notFoundCount = (all.match(/not found/g) ?? []).length
    log(`B frames total: ${frames.length}, turn/end present: ${frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')}`)
    log(`B 'not found' occurrences (expect 2): ${notFoundCount}`)
    log(`B control read content in transcript (expect true): ${all.includes('probe-control-ok')}`)
    log(`B token substring in transcript (expect false): ${all.includes(token)}`)
    log(`B handoff path in transcript (expect false): ${all.includes(handoff)}`)
  } finally {
    child.kill('SIGTERM')
    await new Promise((r) => { child.on('exit', r); setTimeout(() => { child.kill('SIGKILL'); r() }, 8000) })
  }
}

// ---- Phase C: default handoff name guess (documented residual) -----------
{
  const home = mkdtempSync(join(tmpdir(), 'probe-home2-'))
  const defHandoff = join(SDK, '.dsh-handoff')
  const { child } = await boot({ P2SDK_HOME: home, P2SDK_PATCH: overlayYml() }) // no P2SDK_HANDOFF -> default fixed name
  try {
    log(`C default handoff used: ${existsSync(join(defHandoff, 'launch-token'))}`)
    const token = readFileSync(join(defHandoff, 'launch-token'), 'utf8').trim()
    const client = await connect({ baseUrl: readFileSync(join(defHandoff, 'base-url'), 'utf8').trim(), token })
    const work = mkdtempSync(join(tmpdir(), 'probe-work2-'))
    const { sessionId } = await client.call('session/create', { request: { cwd: work } })
    mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
    writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls: [
      { chunks: [
        ...readToolCall(0, 'p-guess', join(defHandoff, 'launch-token')),
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ] },
      textCall('完'),
    ] }))
    const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
    const frames = [...snapshotFrames(snapshot)]
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    await client.call('session/prompt', { request: { requestId: `probe2-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '读一下' }] } })
    const deadline = Date.now() + 20000
    while (!frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end') && Date.now() < deadline) await sleep(100)
    stream.cancel(); void drained
    const all = JSON.stringify(frames)
    log(`C turn/end present: ${frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')}`)
    log(`C guessed-default-path token IN transcript (expect true = residual real): ${all.includes(token)}`)
  } finally {
    child.kill('SIGTERM')
    await new Promise((r) => { child.on('exit', r); setTimeout(() => { child.kill('SIGKILL'); r() }, 8000) })
    rmSync(defHandoff, { recursive: true, force: true })
  }
}
log('PROBE DONE')
