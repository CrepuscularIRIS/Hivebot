// T-06 verify extra bad path, run OUTSIDE vitest:
//  A) independent re-check of ①'s restart step: boot `node scripts/start.mjs`
//     (the exact `pnpm start` command) on a home left by the test run, cold
//     session/list must return the 2 sessions and session/events the history.
//  B) error input: session/events with a bogus sessionId must fail cleanly
//     (RPC error), not hang or kill the runtime; a following session/list
//     must still work.
//  C) bogus launch token: /connect must refuse (non-302).
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { connect } from '/tmp/bot-wt/T-06/app/sdk/examples/lib/client.mjs'

const home = process.argv[2]
const child = spawn(process.execPath, ['scripts/start.mjs'], {
  cwd: '/tmp/bot-wt/T-06/app/sdk',
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
child.stdout.on('data', (c) => { out += c })
child.stderr.on('data', (c) => { out += c })
const pids = [child.pid]
try {
  const deadline = Date.now() + 60000
  while (!/\[p2sdk\] ready http/.test(out)) {
    if (child.exitCode !== null) throw new Error(`runtime exited early:\n${out}`)
    if (Date.now() > deadline) throw new Error(`no ready line:\n${out}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  // direct children (the dsh process), for cleanup by PID
  const pgrep = spawn('pgrep', ['-P', String(child.pid)])
  let kids = ''
  pgrep.stdout.on('data', (c) => { kids += c })
  await new Promise((r) => pgrep.on('close', r))
  for (const k of kids.split('\n').filter(Boolean)) pids.push(Number(k))

  const baseUrl = readFileSync(`${home}/base-url`, 'utf8').trim()
  const token = readFileSync(`${home}/launch-token`, 'utf8').trim()

  // C) bogus token refused
  let bogus = 'refused-unexpectedly'
  try {
    await connect({ baseUrl, token: 'not-the-token' })
  } catch (e) {
    bogus = String(e.message ?? e)
  }
  console.log('C bogus-token:', bogus)

  const client = await connect({ baseUrl, token })
  const list = await client.call('session/list', { _request: {} })
  console.log('A cold list count:', list.items.length, list.items.map((i) => i.sessionId).sort().join(','), 'agentAvailable:', list.items.map((i) => i.agentAvailable).join(','))
  for (const it of list.items) {
    const page = await client.call('session/events', { request: { address: { kind: 'session', sessionId: it.sessionId }, maxMessages: 200 } })
    const recs = page.records.map((r) => r.event)
    const users = recs.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user').map((e) => (e.data?.content ?? []).map((b) => b.text ?? '').join(''))
    const ends = recs.filter((e) => e.type === 'turn/end').map((e) => e.data?.reason?.kind ?? '?')
    console.log('A cold events:', JSON.stringify({ sessionId: it.sessionId, users, turnEnds: ends }))
  }
  // B) bogus session id -> clean error, runtime survives
  let err = 'no-error?'
  try {
    await client.call('session/events', { request: { address: { kind: 'session', sessionId: '00000000-dead-beef-0000-000000000000' }, maxMessages: 10 } })
  } catch (e) {
    err = String(e.message ?? e)
  }
  console.log('B bogus-sessionid error:', err.slice(0, 160))
  const again = await client.call('session/list', { _request: {} })
  console.log('B runtime still alive, list count:', again.items.length)
  client.close()
} finally {
  for (const pid of pids) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
  console.log('cleanup killed pids:', pids.join(','), 'parent exit:', child.exitCode, child.signalCode)
}
