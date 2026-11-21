// Real published app/sdk; only fake external model. No inherited credentials.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { connect } from '../../../app/sdk/examples/lib/client.mjs'
const pkg = '/home/lingxufeng/bot/app/sdk'
const out = new URL('.', import.meta.url).pathname
const home = '/tmp/r4b-probe'
mkdirSync(home, { recursive: true })
const root = mkdtempSync(join(home, 'run-'))
const runName = root.split('/').pop()
const evidence = join(out, 'r4b-' + runName)
mkdirSync(evidence)
const wait = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label, ms = 60000) {
  const end = performance.now() + ms
  while (!fn()) { if (performance.now() > end) throw new Error('timeout ' + label); await wait(5) }
}
function proc(pid) {
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
    return { pid, ppid: +fields[1], state: fields[0], start: fields[19], exit: fields[49], cmd: readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim() }
  } catch { return null }
}
function tree(pid) {
  const rows = readdirSync('/proc').filter(x => /^\d+$/.test(x)).map(x => proc(+x)).filter(Boolean)
  const ids = new Set([pid])
  let size
  do { size = ids.size; for (const row of rows) if (ids.has(row.ppid)) ids.add(row.pid) } while (ids.size !== size)
  return rows.filter(row => ids.has(row.pid))
}
function tool(command, id) {
  const args = JSON.stringify({ command, description: 'R4b own process interruption', timeoutMs: 600000 })
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: args } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
const done = { chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'R4B_CONTINUED' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'R4B_CONTINUED' } },
  { type: 'finish', reason: { kind: 'stop' } },
] }
const patch = join(root, 'patch.yml')
writeFileSync(patch, `- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(pkg, 'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n`)
const runtime = join(root, 'runtime'), handoff = join(root, 'handoff'), cwd = join(root, 'workspace')
for (const dir of [runtime, handoff, cwd]) mkdirSync(dir)
const child = spawn('/usr/bin/strace', ['-f', '-ttt', '-e', 'trace=kill,wait4,waitid,exit_group', '-e', 'signal=SIGTERM,SIGKILL', '-o', join(evidence, 'signals.trace'), process.execPath, join(pkg, 'scripts/start.mjs')], {
  cwd, env: { PATH: '/usr/bin:/bin', HOME: home, P2SDK_PROVIDER: 'mock', P2SDK_HOME: runtime, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0', P2SDK_PATCH: patch }, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = '', client, feed, follow, launcherPid
child.stdout.on('data', b => log += b)
child.stderr.on('data', b => log += b)
const results = []
try {
  await until(() => /\[p2sdk\] ready http/.test(log) || child.exitCode !== null, 'ready')
  assert.equal(child.exitCode, null, 'SDK must start')
  launcherPid = tree(child.pid).find(x => x.ppid === child.pid)?.pid
  assert.ok(launcherPid)
  client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token: readFileSync(join(handoff, 'launch-token'), 'utf8').trim(), interactions: 'answer' })
  feed = await client.socket.open('$events', {})
  let clientId
  const feedTask = (async () => { for await (const f of feed) {
    if (f.type === 'ready') clientId = f.clientId
    if (f.type === 'waterfall' && f.event === 'approval/request') await client.call('$events/result', { clientId, eventId: f.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
  } })()
  await until(() => clientId, 'events ready')
  for (const [index, stubborn] of [false, false, false, true].entries()) {
    const { sessionId } = await client.call('session/create', { request: { cwd } })
    const command = stubborn ? "trap '' TERM; sleep 600 & wait" : 'sleep 600 & wait'
    mkdirSync(join(runtime, 'fake/scripts'), { recursive: true })
    // Tool 1 completes; tool 2 must be interrupted; done is consumed only after resuming.
    writeFileSync(join(runtime, `fake/scripts/${sessionId}.json`), JSON.stringify({ calls: [tool('printf R4B_STEP1', `r4b-first-${index}`), tool(command, `r4b-sleep-${index}`), done] }))
    follow = await client.follow(sessionId)
    const frames = []
    const followTask = (async () => { for await (const f of follow) frames.push(f) })()
    const baseline = new Set(tree(child.pid).map(x => x.pid))
    const prompt = text => client.call('session/prompt', { request: { requestId: `r4b-${index}-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text }] } })
    await prompt('Execute the two scripted steps')
    let observed = []
    await until(() => {
      observed = tree(child.pid).filter(x => !baseline.has(x.pid))
      return observed.some(x => /(^|\/)sleep 600/.test(x.cmd)) && observed.some(x => x.cmd.includes('bwrap'))
    }, 'sandbox sleep running')
    // Readiness means the real sleep exists, not merely a queued tool-call event.
    const tracked = new Map(observed.map(x => [x.pid, x]))
    const t0 = performance.now(), wall0 = Date.now()
    const ack = client.call('session/cancel', { request: { sessionId } })
    let ackMs
    ack.then(() => { ackMs = performance.now() - t0 })
    const exits = []
    const remaining = new Set(tracked.keys())
    await until(() => {
      for (const pid of remaining) {
        const row = proc(pid)
        if (!row || row.start !== tracked.get(pid).start || row.state === 'Z') {
          exits.push({ pid, ms: performance.now() - t0, state: row?.state ?? 'gone', exit: row?.exit ?? null })
          remaining.delete(pid)
        }
      }
      return remaining.size === 0
    }, 'tool tree quiescence', 15000)
    const treeExitMs = performance.now() - t0
    const response = await ack
    await until(() => frames.some(f => f.type === 'event' && f.event?.type === 'turn/end'), 'aborted turn end', 15000)
    const turnEndMs = performance.now() - t0
    const boundary = frames.length
    const requestLog = () => readFileSync(join(runtime, 'fake/requests.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(x => x.sessionId === sessionId)
    const before = requestLog().length
    await wait(350)
    assert.equal(requestLog().length, before, 'no spontaneous model request after cancel')
    assert.equal(before, 2, 'cancel prevented third model call')
    const cancelledFrames = frames.slice(0, boundary)
    const toolEvents = () => frames.filter(f => f.type === 'event' && f.event?.type === 'tool/call').length
    const toolsBefore = toolEvents()
    await prompt('Continue this session')
    await until(() => frames.slice(boundary).some(f => f.type === 'event' && f.event?.type === 'turn/end'), 'continued turn end')
    assert.ok(JSON.stringify(frames.slice(boundary)).includes('R4B_CONTINUED'))
    assert.equal(toolEvents(), toolsBefore, 'no new tool calls after interruption')
    const survivors = [...tracked.values()].map(x => proc(x.pid)).filter(x => x && x.start === tracked.get(x.pid).start)
    assert.equal(survivors.filter(x => x.state !== 'Z').length, 0)
    const summary = { index, stubborn, command, sessionId, wall0, ackMs, treeExitMs, turnEndMs, response, observed, exits, survivors, modelCallsBeforeResume: before, modelCallsAfterResume: requestLog().length, continued: true, noNewTools: true, cancelledTurnEnd: cancelledFrames.filter(f => f.type === 'event' && f.event?.type === 'turn/end') }
    results.push(summary)
    writeFileSync(join(evidence, `frames-${index}.json`), JSON.stringify(frames, null, 2))
    writeFileSync(join(evidence, 'summary.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify({ index, stubborn, ackMs, treeExitMs, turnEndMs, survivors: survivors.length, continued: true }))
    follow.cancel(); follow = null; await followTask
  }
  feed.cancel(); client.close(); await feedTask
} finally {
  follow?.cancel(); feed?.cancel(); client?.close()
  // Exact direct child launcher identity recorded under our own spawned tracer.
  if (launcherPid && proc(launcherPid)?.ppid === child.pid) process.kill(launcherPid, 'SIGTERM')
  else if (child.exitCode === null) child.kill('SIGTERM')
  await until(() => child.exitCode !== null || child.signalCode !== null, 'own launcher/tracer exit', 15000)
  rmSync(handoff, { recursive: true, force: true })
  rmSync(runtime, { recursive: true, force: true })
}
assert.equal(results.length, 4)
console.log('R4B_EVIDENCE=' + evidence)
