import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SDK = '/tmp/bot-wt/P6-05f1/app/sdk'
const OUT = dirname(fileURLToPath(import.meta.url))
const root = mkdtempSync('/tmp/bot-p605f1-default-')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const requests = []
const server = createServer(async (req, res) => {
  let body = ''
  for await (const part of req) body += part
  const data = JSON.parse(body)
  // Store body only: never authentication headers or handoff credentials.
  requests.push({ path: req.url, model: data.model, messages: data.messages })
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const chunk = (delta, finish_reason = null) => ({ id: 'p605f1-local', object: 'chat.completion.chunk', created: 1, model: data.model, choices: [{ index: 0, delta, finish_reason }] })
  for (const c of [chunk({ role: 'assistant', content: '' }), chunk({ content: 'p605f1 local endpoint reply' }), chunk({}, 'stop')]) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.end('data: [DONE]\n\n')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
for (const d of ['home', 'tmp', 'data', 'dsh', 'handoff', 'workspace']) mkdirSync(join(root, d))
const env = {
  PATH: process.env.PATH,
  HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'), PBOTS_DATA_DIR: join(root, 'data'),
  P2SDK_HOME: join(root, 'dsh'), P2SDK_HANDOFF: join(root, 'handoff'), P2SDK_PORT: '0',
  P2SDK_PROVIDER: 'real', P2SDK_LLM_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  P2SDK_LLM_API_KEY: 'local-test-placeholder-not-a-credential', P2SDK_LLM_MODEL: 'p605f1-local',
  DSH_TELEMETRY_MODE: 'DISABLED', DBUS_SESSION_BUS_ADDRESS: `unix:path=${root}/no-dbus`,
}
assert.equal(Object.hasOwn(env, 'P2SDK_PATCH'), false)
const child = spawn(process.execPath, [join(SDK, 'scripts/start.mjs')], { cwd: SDK, env, stdio: ['ignore', 'pipe', 'pipe'] })
let stdout = '', stderr = '', client, stream
child.stdout.on('data', c => { stdout += c })
child.stderr.on('data', c => { stderr += c })
try {
  const deadline = Date.now() + 60000
  const baseFile = join(root, 'handoff/base-url')
  while (!existsSync(baseFile)) {
    assert.equal(child.exitCode, null, `runtime exit: ${stderr}`)
    assert.ok(Date.now() < deadline, `boot timeout: ${stderr}`)
    await sleep(100)
  }
  const { connect } = await import(pathToFileURL(join(SDK, 'examples/lib/client.mjs')).href)
  client = await connect({ baseUrl: readFileSync(baseFile, 'utf8').trim(), token: readFileSync(join(root, 'handoff/launch-token'), 'utf8').trim() })
  const created = await client.call('session/create', { request: { cwd: join(root, 'workspace') } })
  assert.equal(created.agentPreset, 'standard')
  const followed = await client.follow(created.sessionId, { awaitSnapshot: true, assistantStream: true })
  stream = followed.stream
  assert.equal(followed.snapshot.header.agentPreset, 'standard')
  const frames = []
  let ended = false
  const drained = (async () => {
    for await (const f of stream) {
      frames.push(f)
      if (f.type === 'event' && f.event?.type === 'turn/end') { ended = true; break }
    }
  })()
  await client.call('session/prompt', { request: { sessionId: created.sessionId, requestId: 'p605f1-default-probe', mode: 'queue', content: [{ type: 'text', text: 'p605f1 default-chain acceptance; reply only' }] } })
  const endDeadline = Date.now() + 30000
  while (!ended && Date.now() < endDeadline) await sleep(100)
  assert.ok(ended, 'turn/end not observed')
  stream.cancel()
  await drained
  assert.equal(requests.length, 1)
  const systems = requests[0].messages.filter(m => ['system', 'developer'].includes(m.role)).map(m => typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => b.text).join('')).join('\n')
  const section = systems.match(/^## Replying to the user\n\n[^\n]+/m)?.[0] ?? ''
  const hash = createHash('sha256').update(section).digest('hex')
  assert.equal(hash, 'c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356')
  let rejected = ''
  try { await client.call('session/create', { request: { cwd: join(root, 'workspace'), agentPreset: 'p6-reply' } }) }
  catch (e) { rejected = e.message }
  assert.match(rejected, /not found|not-found/i)
  const evidence = { patchEnvPresent: Object.hasOwn(env, 'P2SDK_PATCH'), provider: 'real adapter -> local HTTP stub (no live model / no real credentials)', preset: created.agentPreset, sessionId: created.sessionId, requests: requests.length, path: requests[0].path, sectionSha256: hash, systemChars: systems.length, turnEnded: ended, unmountedPresetRejected: rejected, systemTexts: systems, responseObserved: JSON.stringify(frames).includes('p605f1 local endpoint reply') }
  assert.ok(evidence.responseObserved)
  writeFileSync(join(OUT, 'vfy-default-no-patch.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ ...evidence, systemTexts: '<saved in vfy-default-no-patch.json>' }, null, 2))
  console.log('DEFAULT NO PATCH PASS')
} finally {
  stream?.cancel(); client?.close()
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([new Promise(r => child.once('exit', r)), sleep(8000)])
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await new Promise(r => child.once('exit', r))
    }
  }
  server.closeAllConnections()
  await new Promise(r => server.close(r))
  writeFileSync(join(OUT, 'vfy-default-runtime.log'), `stdout\n${stdout}\nstderr\n${stderr}`)
  rmSync(root, { recursive: true, force: true })
}
