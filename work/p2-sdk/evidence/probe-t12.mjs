#!/usr/bin/env node
// T-12 verifier 独立探针：真默认链启动（无 P2SDK_PATCH、无 P2SDK_HANDOFF）。
// 模型行为经 llm-replay 的 overrideFile 竞争覆盖注入（launcher 在 spawn 前写
// <home>/replay-override.json，dsh 插件装载时才读——本脚本在文件出现后立即
// 原子改写，无需任何 patch overlay）。审批链、沙箱、handoff 全部真实。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'file:///tmp/bot-wt/T-12/app/sdk/examples/lib/client.mjs'

const SDK = '/tmp/bot-wt/T-12/app/sdk'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const note = (ok, label, detail = '') => {
  results.push({ ok, label, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`)
}

function bashCall(command, extra = {}) {
  const id = 'probe-' + Math.random().toString(16).slice(2, 8)
  const argumentsJson = JSON.stringify({ command, description: 'verifier probe', ...extra })
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

/** Boot the default chain. overwrite(): called once the replay override appears. */
async function boot(name, replayEntries) {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-vfy-home-'))
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('P2SDK_') && !k.startsWith('DSH_') && k !== 'NODE_V8_COVERAGE') env[k] = v
  }
  Object.assign(env, { P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_PORT: '0', P2SDK_READY_TIMEOUT_MS: '90000' })
  const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], {
    env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = '', err = ''
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (c) => { out += c })
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (c) => { err += c })

  // race-overwrite the replay override the launcher just wrote
  const overridePath = join(home, 'replay-override.json')
  const tmpWrite = join(home, 'replay-override.probe.json')
  const t0 = Date.now()
  let overwrote = false
  while (Date.now() - t0 < 15000) {
    if (existsSync(overridePath)) {
      writeFileSync(tmpWrite, JSON.stringify(replayEntries))
      renameSync(tmpWrite, overridePath)
      overwrote = true
      break
    }
    if (child.exitCode !== null) break
    await sleep(2)
  }
  if (!overwrote) throw new Error(`${name}: replay override race lost or launcher exited (code ${child.exitCode})\n${out}\n${err}`)

  const deadline = Date.now() + 90000
  while (!/\[p2sdk\] ready http/.test(out)) {
    if (child.exitCode !== null) throw new Error(`${name}: launcher exited early (${child.exitCode})\n${out}\n${err}`)
    if (Date.now() > deadline) throw new Error(`${name}: ready timeout\n${out}\n${err}`)
    await sleep(100)
  }
  const dshPid = Number(/p2sdk: dsh pid (\d+)/.exec(err)?.[1] ?? 0)
  const handoff = /p2sdk: handoff (\S+)/.exec(err)?.[1] ?? ''
  await sleep(200) // let handoff files settle
  const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
  return { name, home, handoff, dshPid, baseUrl, token, child, out, err,
    async stop() {
      child.kill('SIGTERM')
      if (dshPid) { try { process.kill(dshPid, 'SIGTERM') } catch {} }
      await new Promise((r) => { const t = setTimeout(() => { try { process.kill(dshPid, 'SIGKILL') } catch {}; r() }, 5000); child.on('exit', () => { clearTimeout(t); r() }) })
    } }
}

async function openEvents(rt) {
  const client = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  void drained
  const deadline = Date.now() + 10000
  while (!frames.some((f) => f.type === 'ready')) {
    if (Date.now() > deadline) throw new Error('$events ready timeout')
    await sleep(20)
  }
  const clientId = frames.find((f) => f.type === 'ready')?.clientId ?? ''
  return { client, frames, clientId,
    answer: (frame, value) => client.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } }),
    close() { stream.cancel(); client.close() },
  }
}

const asksFor = (feed, sid) => feed.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sid)
async function waitAsk(feed, sid, n, ms = 15000) {
  const t = Date.now()
  for (;;) {
    const hits = asksFor(feed, sid)
    if (hits.length >= n) return hits[n - 1]
    if (Date.now() > t + ms) throw new Error(`timed out waiting approval/request #${n} (have ${hits.length})`)
    await sleep(20)
  }
}
async function waitTurnEnds(frames, count, ms = 20000) {
  const t = Date.now()
  for (;;) {
    const ends = frames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length
    if (ends >= count) return
    if (Date.now() > t + ms) throw new Error(`timed out waiting turn/end #${count} (saw ${ends})`)
    await sleep(20)
  }
}
async function createSessionAt(client, home) {
  const cwd = join(home, 'workspace')
  mkdirSync(cwd, { recursive: true })
  const { sessionId } = await client.call('session/create', { request: { cwd } })
  if (typeof sessionId !== 'string') throw new Error('session/create returned no sessionId')
  return sessionId
}
async function sendPrompt(client, sessionId, text) {
  return client.call('session/prompt', { request: { requestId: 'vfy-' + Math.random().toString(16).slice(2), sessionId, mode: 'queue', content: [{ type: 'text', text }] } })
}
const transcriptText = (frames) => JSON.stringify(frames)

// ---------- Phase A: ① 默认链普通 bash 必问 ----------
async function phaseA() {
  const rt = await boot('A', [
    bashCall('touch "$PWD/canary-denied"'), textCall('a'),
    bashCall('touch "$PWD/canary-allowed"'), textCall('b'),
    textCall('c'), textCall('d'), textCall('e'), textCall('f'),
  ])
  const feed = await openEvents(rt)
  try {
    note(rt.handoff.startsWith('/tmp/p2sdk-handoff-') && !rt.handoff.includes(rt.home), 'A0 默认 handoff 为随机 tmpdir（stderr 行）', `handoff=${rt.handoff}`)
    const env0 = readFileSync(`/proc/${rt.dshPid}/environ`, 'utf8').split('\0')
    note(!env0.some((e) => e.startsWith('P2SDK_HOME=')), 'A0 /proc/<dsh>/environ 无 P2SDK_HOME')
    note(!env0.some((e) => e.startsWith('P2SDK_HANDOFF=')), 'A0 /proc/<dsh>/environ 无 P2SDK_HANDOFF')
    const sid = await createSessionAt(feed.client, rt.home)
    const stream = await feed.client.follow(sid, { assistantStream: true })
    const frames = []
    // simpler: manual drain
    const collect = (async () => { for await (const f of stream) frames.push(f) })()
    void collect

    await sendPrompt(feed.client, sid, 'p1')
    const ask1 = await waitAsk(feed, sid, 1)
    note(ask1.request?.toolName === 'bash', 'A1 默认链普通 bash 产生 approval/request', `toolName=${ask1.request?.toolName}`)
    await feed.answer(ask1, 'rejected')
    await waitTurnEnds(frames, 1)
    note(!existsSync(join(rt.home, 'workspace', 'canary-denied')), 'A2 拒绝后 canary 不存在')

    await sendPrompt(feed.client, sid, 'p2')
    const ask2 = await waitAsk(feed, sid, 2)
    note(ask2.eventId !== ask1.eventId, 'A3 第二次请求是独立 approval')
    await feed.answer(ask2, 'allowed-once')
    await waitTurnEnds(frames, 2)
    note(existsSync(join(rt.home, 'workspace', 'canary-allowed')), 'A4 批准后 canary 存在')
    stream.cancel()
    return rt
  } finally { feed.close(); await rt.stop() }
}

// ---------- Phase B: ② 绕过封堵 ----------
async function phaseB() {
  const rt = await boot('B', [
    bashCall('touch "$PWD/mode-denied"', { sandbox_permissions: 'workspace-write', justification: 'vfy repeat-mode' }), textCall('a'),
    bashCall('touch "$PWD/mode-allowed"', { sandbox_permissions: 'workspace-write', justification: 'vfy repeat-mode' }), textCall('b'),
    bashCall('touch "$PWD/dfa-denied"', { sandbox_permissions: 'danger-full-access', justification: 'vfy dfa' }), textCall('c'),
    bashCall('touch "$PWD/dfa-allowed"', { sandbox_permissions: 'danger-full-access', justification: 'vfy dfa' }), textCall('d'),
    textCall('e'), textCall('f'),
  ])
  const feed = await openEvents(rt)
  try {
    const sid = await createSessionAt(feed.client, rt.home)
    const stream = await feed.client.follow(sid, { assistantStream: true })
    const frames = []
    const collect = (async () => { for await (const f of stream) frames.push(f) })()
    void collect

    await sendPrompt(feed.client, sid, 'b1')
    const ask1 = await waitAsk(feed, sid, 1)
    note(true, 'B1 同模式(workspace-write)重复仍产生 approval/request', `toolName=${ask1.request?.toolName} reason=${ask1.request?.reason}`)
    await feed.answer(ask1, 'rejected')
    await waitTurnEnds(frames, 1)
    note(!existsSync(join(rt.home, 'workspace', 'mode-denied')), 'B2 同模式拒绝后不执行')

    await sendPrompt(feed.client, sid, 'b2')
    const ask2 = await waitAsk(feed, sid, 2)
    await feed.answer(ask2, 'allowed-once')
    await waitTurnEnds(frames, 2)
    note(existsSync(join(rt.home, 'workspace', 'mode-allowed')), 'B3 同模式批准后执行')

    await sendPrompt(feed.client, sid, 'b3')
    const ask3 = await waitAsk(feed, sid, 3)
    await sleep(2000) // 双弹窗观察窗：若策略与上游升权都问，这里会到 4
    note(asksFor(feed, sid).length === 3, 'B4 严格宽(danger-full-access)恰好一次 approval（不双弹窗）', `asks=${asksFor(feed, sid).length}`)
    await feed.answer(ask3, 'rejected')
    await waitTurnEnds(frames, 3)
    note(!existsSync(join(rt.home, 'workspace', 'dfa-denied')), 'B5 严格宽拒绝后不执行')

    await sendPrompt(feed.client, sid, 'b4')
    const ask4 = await waitAsk(feed, sid, 4)
    await feed.answer(ask4, 'allowed-once')
    await waitTurnEnds(frames, 4)
    note(existsSync(join(rt.home, 'workspace', 'dfa-allowed')), 'B6 严格宽批准后执行')
    note(asksFor(feed, sid).length === 4, 'B7 全程恰好 4 次 approval（无额外弹窗）', `asks=${asksFor(feed, sid).length}`)
    stream.cancel()
    return rt
  } finally { feed.close(); await rt.stop() }
}

// ---------- Phase C: ③④ 凭证不可推导 / find 不可达 ----------
async function phaseC() {
  const probes = [
    'echo VFY_PRINTENV=$(printenv | grep -c -E "^P2SDK_(HOME|HANDOFF)=")',
    'echo VFY_CAT_DERIVED=$(cat "$(dirname "${P2SDK_HOME:-/nonexistent}")/.dsh-handoff/launch-token" 2>/dev/null | wc -c | tr -d " ")',
    'echo VFY_FIND_TMP_COUNT=$(find /tmp -maxdepth 3 -name launch-token 2>/dev/null | wc -l) VFY_FIND_TMP_BYTES=$(find /tmp -maxdepth 3 -name launch-token 2>/dev/null | head -1 | xargs -r cat 2>/dev/null | wc -c)',
  ]
  const rt = await boot('C', probes.flatMap((c) => [bashCall(c), textCall('p')]).concat([textCall('x'), textCall('y')]))
  const feed = await openEvents(rt)
  try {
    const sid = await createSessionAt(feed.client, rt.home)
    const stream = await feed.client.follow(sid, { assistantStream: true })
    const frames = []
    const collect = (async () => { for await (const f of stream) frames.push(f) })()
    void collect
    for (let i = 0; i < probes.length; i++) {
      await sendPrompt(feed.client, sid, `probe ${i}`)
      const ask = await waitAsk(feed, sid, i + 1)
      await feed.answer(ask, 'allowed-once')
      await waitTurnEnds(frames, i + 1)
    }
    stream.cancel()
    await sleep(300)
    const all = transcriptText(frames)
    // 证据脱敏：不落 token 本体
    const safe = all.split(rt.token).join('<REDACTED>')
    writeFileSync('/home/lingxufeng/bot/work/p2-sdk/evidence/t12-phaseC-transcript.json', safe)
    note(safe.includes('VFY_PRINTENV=0'), 'C1 模型侧 env 无 P2SDK_HOME/HANDOFF', (safe.match(/VFY_PRINTENV=\d+/) ?? ['?'])[0])
    note(safe.includes('VFY_CAT_DERIVED=0'), 'C2 推导路径 cat 取 0 字节', (safe.match(/VFY_CAT_DERIVED=\d+/) ?? ['?'])[0])
    const m = safe.match(/VFY_FIND_TMP_COUNT=(\d+) VFY_FIND_TMP_BYTES=(\d+)/)
    note(m !== null && m[1] === '0' && m[2] === '0', 'C3 find /tmp -name launch-token 不可达（关键对抗探针）', m ? `count=${m[1]} bytes=${m[2]}` : 'marker missing')
    note(!safe.includes(rt.token), 'C4 token 本体未出现在模型可见 transcript')
    return rt
  } finally { feed.close(); await rt.stop() }
}

// ---------- run ----------
const handoffs = []
try {
  const a = await phaseA(); handoffs.push(a.handoff)
  const b = await phaseB(); handoffs.push(b.handoff)
  const c = await phaseC(); handoffs.push(c.handoff)
} catch (e) {
  console.error('PROBE ERROR:', e.message)
  results.push({ ok: false, label: 'probe 异常', detail: e.message })
}
note(new Set(handoffs).size === handoffs.length && handoffs.every((h) => h.startsWith('/tmp/p2sdk-handoff-')), 'C5 每次启动 handoff 均为新随机 tmpdir', handoffs.join(' | '))
const failed = results.filter((r) => !r.ok)
console.log(`\n=== probe summary: ${results.length - failed.length}/${results.length} PASS ===`)
process.exit(failed.length ? 1 : 0)
