// T92 探针：dsh session/fork 能否经我们 gateway 调用 + 分叉子会话换绑（不动 app/）
// 跑法：node work/tickets/evidence/T92-fork-probe.mjs（需 app/ui 产物已 build；起 sdk runtime 真调）
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SDK_ROOT = new URL('../../../app/sdk', import.meta.url).pathname
const home = mkdtempSync(join(tmpdir(), 't92-home-'))
const handoff = mkdtempSync(join(tmpdir(), 't92-handoff-'))
const dir = mkdtempSync(join(tmpdir(), 't92-data-'))
// fake provider：一条 user 消息 → 一个完整 assistant turn（fork 需「有 completed turn」）
const call = (text) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'finish', reason: { kind: 'stop' } },
], paceMs: 40 })
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
writeFileSync(join(home, 'fake', 'scripts', 'default.json'), JSON.stringify({ calls: [call('第一答'), call('第二答')] }))

const child = spawn(process.execPath, [join(SDK_ROOT, 'scripts', 'start.mjs')], {
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0', P2SDK_PATCH: '', P2SDK_DATA_DIR: dir, P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
child.stdout.on('data', (d) => { out += d; const m = out.match(/\[p2sdk\] ready (http\S+)/); if (m && !probe.started) void start(m[1]) })
child.stderr.on('data', (d) => { out += d })
const log = (...a) => console.log('[t92]', ...a)
const timeout = setTimeout(() => { log('TIMEOUT'); child.kill(); process.exit(2) }, 90_000)
const probe = { started: false }

async function start(url) {
  probe.started = true
  const { readFileSync: rf } = await import('node:fs')
  const baseUrl = rf(join(handoff, 'base-url'), 'utf8').trim()
  const token = rf(join(handoff, 'launch-token'), 'utf8').trim()
  const dsh = await (await import('file://' + join(SDK_ROOT, 'examples', 'lib', 'client.mjs'))).connect({ baseUrl, token })
  const rpc = (method, args) => dsh.call(method, args ?? {})
  try {
    // ① 造一个有 completed turn 的会话
    const work = mkdtempSync(join(tmpdir(), 't92-ws-'))
    const created = await rpc('session/create', { request: { cwd: work } })
    const sid = created.sessionId ?? created.value?.sessionId
    log('session/create:', JSON.stringify(created).slice(0, 200))
    const send = await rpc('session/prompt', { request: { requestId: `t92-${Date.now()}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '问一' }] } })
    log('prompt:', JSON.stringify(send).slice(0, 120))
    await new Promise((r) => setTimeout(r, 1500))
    // ② fork：缺省=最新完成轮前缀
    const fork = await rpc('session/fork', { request: { sessionId: sid } })
    log('fork 默认:', JSON.stringify(fork).slice(0, 300))
    // ③ fork atSeq=0
    const fork0 = await rpc('session/fork', { request: { sessionId: sid, atSeq: 0 } })
    log('fork atSeq=0:', JSON.stringify(fork0).slice(0, 300))
    // ④ 子会话能否继续（fork 出的新 id 再发一条）
    const child2 = fork.sessionId ?? fork.value?.sessionId
    if (typeof child2 === 'string' && child2 !== sid) {
      const p2 = await rpc('session/prompt', { request: { requestId: `t92c-${Date.now()}`, sessionId: child2, mode: 'queue', content: [{ type: 'text', text: '分叉后新问' }] } })
      log('子会话 prompt:', JSON.stringify(p2).slice(0, 160))
      await new Promise((r) => setTimeout(r, 1500))
      const tail = await rpc('session/tail', { _request: {}, sessionId: child2 })
      const texts = JSON.stringify(tail).match(/分叉后新问|第二答|第一答/g) ?? []
      log('子会话 tail 关键串:', texts.join(','))
    } else {
      log('fork 未返回新 sessionId——形状见上')
    }
    console.log('PROBE_OK')
  } catch (e) {
    log('ERR', e?.message ?? String(e))
    console.log('PROBE_PARTIAL')
  } finally {
    clearTimeout(timeout); child.kill(); process.exit(0)
  }
}
