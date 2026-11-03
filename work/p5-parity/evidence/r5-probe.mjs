// R5: real published dsh SDK + existing scripted provider; no real credentials.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { connect } from '../../../app/sdk/examples/lib/client.mjs'
const pkg = '/home/lingxufeng/bot/app/sdk'
const evidence = fileURLToPath(new URL('.', import.meta.url))
const root = mkdtempSync(join(evidence, 'r5-run-'))
const home = '/tmp/r5-sandbox'
mkdirSync(home, { recursive: true })
const wait = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label, ms = 60000) {
  const deadline = Date.now() + ms
  while (!fn()) { if (Date.now() > deadline) throw new Error(`timeout ${label}`); await wait(30) }
}
const server = createServer((req, res) => res.end('R5_LOOPBACK_OK'))
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const wrapper = join(root, 'bwrap-wrapper.py')
writeFileSync(wrapper, `import os,sys\na=sys.argv[2:]\ni=a.index('--')\na[i:i]=['--tmpfs',sys.argv[1]]\nos.execv('/usr/bin/bwrap',['bwrap']+a)\n`)
const landlock = '/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+node-addon-system-linux-x64@0.1.2/node_modules/@deepseek-ai/node-addon-system-linux-x64/bin/landlock-run'
const llWrapper = join(root, 'landlock-wrapper.py')
writeFileSync(llWrapper, `import os,sys\na=sys.argv[3:]\ncmd=a[a.index('--')+1:]\ngrants=[]\nfor p in ['/usr','/bin','/lib','/lib64','/etc','/dev']: \n if os.path.exists(p): grants+=['--ro',p]\nos.execv(sys.argv[1],[sys.argv[1]]+grants+['--rw','/tmp','--rw',sys.argv[2],'--']+cmd)\n`)
function tool(command) {
  const id = 'r5-' + Math.random().toString(16).slice(2)
  const args = JSON.stringify({ command, description: 'R5 sandbox canary probes (keys only)', timeout_ms: 20000 })
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: args } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
const done = { chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'R5_DONE' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'R5_DONE' } },
  { type: 'finish', reason: { kind: 'stop' } },
] }
const results = []
try {
  for (const mode of ['default-mock', 'default-real-fake', 'network-off', 'hide-read', 'landlock-fallback', 'landlock-read-allowlist']) {
    const dir = join(root, mode), cwd = join(dir, 'workspace'), secret = join(dir, 'secret')
    for (const p of [cwd, secret, join(dir, 'runtime'), join(dir, 'handoff')]) mkdirSync(p, { recursive: true })
    writeFileSync(join(secret, 'sentinel'), 'public-test-fixture')
    const patch = join(dir, 'patch.yml')
    let extra = ''
    if (mode === 'network-off') extra = `- id: sandbox\n  config:\n    runnerCommand: ['/usr/bin/bwrap', '--unshare-net']\n    runnerFailureSignatures: ['bwrap: ']\n`
    if (mode === 'hide-read') extra = `- id: sandbox\n  config:\n    runnerCommand: ['/usr/bin/python3', '-I', '${wrapper}', '${secret}']\n    runnerFailureSignatures: ['bwrap: ']\n`
    if (mode === 'landlock-read-allowlist') extra = `- id: sandbox\n  config:\n    runnerCommand: ['/usr/bin/python3', '-I', '${llWrapper}', '${landlock}', '${cwd}']\n    runnerFailureSignatures: ['landlock-run: ']\n`
    writeFileSync(patch, `- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(pkg, 'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n${extra}`)
    if (mode === 'landlock-fallback') { mkdirSync(join(dir, 'bin')); writeFileSync(join(dir, 'bin/bwrap'), '#!/bin/sh\nexit 1\n', { mode: 0o755 }) }
    writeFileSync(join(dir, 'runtime/r5-control'), 'public-test-fixture')
    const env = { PATH: mode === 'landlock-fallback' ? `${dir}/bin:/usr/bin:/bin` : '/usr/bin:/bin', HOME: home, P2SDK_PROVIDER: mode === 'default-real-fake' ? 'real' : 'mock',
      P2SDK_HOME: join(dir, 'runtime'), P2SDK_HANDOFF: join(dir, 'handoff'), P2SDK_PORT: '0', P2SDK_PATCH: patch,
      P2SDK_LLM_API_KEY: 'r5-env-sentinel-only', P2SDK_PROBE: 'r5-env-sentinel-only',
      LITELLM_MASTER_KEY: 'r5-env-sentinel-only', LITELLM_PROBE: 'r5-env-sentinel-only',
      OPENAI_API_KEY: 'r5-env-sentinel-only', ANTHROPIC_AUTH_TOKEN: 'r5-env-sentinel-only', DSH_PROBE: 'r5-env-sentinel-only' }
    const child = spawn(process.execPath, [join(pkg, 'scripts/start.mjs')], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = '', client, feed, follow
    child.stdout.on('data', b => log += b)
    child.stderr.on('data', b => log += b)
    try {
      await until(() => /\[p2sdk\] ready http/.test(log) || child.exitCode !== null, 'ready')
      if (child.exitCode !== null) throw new Error('SDK launch failed; see sanitized runtime log')
      const baseUrl = readFileSync(join(dir, 'handoff/base-url'), 'utf8').trim()
      const token = readFileSync(join(dir, 'handoff/launch-token'), 'utf8').trim()
      client = await connect({ baseUrl, token, interactions: 'answer' })
      feed = await client.socket.open('$events', {})
      let clientId, approvals = 0
      const feedTask = (async () => { for await (const f of feed) {
        if (f.type === 'ready') clientId = f.clientId
        if (f.type === 'waterfall' && f.event === 'approval/request') {
          approvals++
          await client.call('$events/result', { clientId, eventId: f.eventId, outcome: { kind: 'result', value: 'allowed-once' } })
        }
      } })()
      await until(() => clientId, '$events ready')
      const { sessionId } = await client.call('session/create', { request: { cwd } })
      const command = `python3 -I - <<'PY'\nimport os,json,urllib.request\nr={}\nfor label,p in [('workspace','${cwd}/inside'),('outside','${dir}/outside'),('home','${home}/outside-${mode}'),('tmp','/tmp/r5-write-${mode}')]:\n try:\n  with open(p,'w') as f: f.write('r5')\n  r[label]='written'\n except OSError as e: r[label]={'errno':e.errno,'error':e.strerror}\ntry:\n with open('${secret}/sentinel') as f: f.read()\n r['outside_read']='readable'\nexcept OSError as e: r['outside_read']={'errno':e.errno,'error':e.strerror}\ntry:\n with open(os.path.join(os.environ['DSH_HOME'],'r5-control')) as f: f.read()\n r['dsh_home_read']='readable'\nexcept OSError as e: r['dsh_home_read']={'errno':e.errno,'error':e.strerror}\nfor label,url in [('loopback','http://127.0.0.1:${port}'),('external','https://example.com')]:\n try:\n  with urllib.request.urlopen(url,timeout=3) as f: r[label]=f.status\n except Exception as e: r[label]=str(e)\nr['env_keys']=sorted(os.environ)\nprint('R5_RESULT='+json.dumps(r,sort_keys=True))\nPY`
      mkdirSync(join(dir, 'runtime/fake/scripts'), { recursive: true })
      writeFileSync(join(dir, `runtime/fake/scripts/${sessionId}.json`), JSON.stringify({ calls: [tool(command), done] }))
      follow = await client.follow(sessionId)
      const frames = []
      const followTask = (async () => { for await (const f of follow) frames.push(f) })()
      await client.call('session/prompt', { request: { requestId: `r5-${mode}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'Run the R5 scripted probe' }] } })
      await until(() => frames.some(f => f.type === 'event' && f.event?.type === 'turn/end'), 'turn/end')
      writeFileSync(join(dir, 'frames.json'), JSON.stringify(frames, null, 2))
      writeFileSync(join(dir, 'command.sh'), command + '\n')
      const text = frames.filter(f => f.type === 'event' && f.event?.type === 'tool/result').map(f => f.event.data.message.content.map(c => c.text ?? '').join('')).join('');
      const parsed = JSON.parse(text.split('R5_RESULT=')[1].split('\n')[0]);
      assert.equal(parsed.workspace, 'written'); assert.equal(parsed.outside.errno, mode.startsWith('landlock-') ? 13 : 30);
      if (mode === 'network-off') { assert.notEqual(parsed.loopback, 200); assert.notEqual(parsed.external, 200) }
      if (mode === 'hide-read' || mode === 'landlock-read-allowlist') assert.notEqual(parsed.outside_read, 'readable');
      assert.equal(parsed.env_keys.includes('P2SDK_LLM_API_KEY'), false);
      const summary = { mode, approvals, hostWorkspaceExists: existsSync(join(cwd, 'inside')), hostOutsideExists: existsSync(join(dir, 'outside')), hostTmpExists: existsSync(`/tmp/r5-write-${mode}`), toolResults: frames.filter(f => f.type === 'event' && f.event?.type === 'tool/result') }
      results.push(summary)
      console.log(JSON.stringify(summary))
      follow.cancel(); feed.cancel(); client.close()
      await Promise.all([followTask, feedTask])
    } finally {
      follow?.cancel(); feed?.cancel(); client?.close()
      // Only this exact ChildProcess, spawned above, is terminated.
      child.kill('SIGTERM')
      await until(() => child.exitCode !== null || child.signalCode !== null, 'own launcher exit', 15000)
      // No actual secrets were injected; strip sentinel values even from diagnostic logs.
      writeFileSync(join(dir, 'runtime.log'), log.replaceAll('r5-env-sentinel-only', '[SENTINEL_REDACTED]'))
      rmSync(join(dir, 'handoff'), { recursive: true, force: true })
    }
  }
} finally { await new Promise(r => server.close(r)) }
writeFileSync(join(root, 'summary.json'), JSON.stringify(results, null, 2))
assert.equal(results.length, 6)
console.log('R5_EVIDENCE=' + root)
