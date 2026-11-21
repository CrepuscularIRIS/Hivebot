// T80b 验收 4：真模型 3 会话 × 三问，session 原文取数（assistant/message 行）。
// 用法：node /tmp/t80b-sample.mjs <SDK_ROOT> <runs>
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [, , SDK_ROOT, RUNS_RAW] = process.argv
const RUNS = Number(RUNS_RAW ?? 2)
if (!SDK_ROOT) { console.error('usage: node t80b-sample.mjs <SDK_ROOT> [runs]'); process.exit(2) }
const OUT = '/home/lingxufeng/bot/work/persona-stop-gap/evidence/T80b'
mkdirSync(OUT, { recursive: true })
if (!process.env.LITELLM_MASTER_KEY) { console.error('缺 LITELLM_MASTER_KEY'); process.exit(2) }

const home = mkdtempSync(join(tmpdir(), 't80b-'))
const handoff = mkdtempSync(join(tmpdir(), 't80b-handoff-'))
const work = mkdtempSync(join(tmpdir(), 't80b-work-'))
const child = spawn(process.execPath, [join(SDK_ROOT, 'scripts', 'start.mjs')], {
  env: {
    ...process.env,
    P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0',
    P2SDK_READY_TIMEOUT_MS: '180000',
    P2SDK_LLM_API_KEY: process.env.LITELLM_MASTER_KEY,
    P2SDK_LLM_BASE_URL: 'http://127.0.0.1:4001/',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
child.stdout.on('data', (c) => { output += c })
child.stderr.on('data', (c) => { output += c })
const kill = () => { try { child.kill('SIGTERM') } catch { /* gone */ } }
process.on('exit', kill)

const deadline = Date.now() + 180_000
while (Date.now() < deadline) {
  if (/\[p2sdk\] ready http/.test(output)) break
  await new Promise((r) => setTimeout(r, 300))
}
if (!/\[p2sdk\] ready http/.test(output)) { console.error('runtime not ready'); process.exit(1) }
const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()

const mod = await import(pathToFileURL(join(SDK_ROOT, 'examples', 'lib', 'client.mjs')).href)
const client = await mod.connect({ baseUrl, token })
const QUESTIONS = ['你好', '你叫什么？', '解释一下 TCP 三次握手']

const turn = async (sessionId, q) => {
  const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
  const frames = [...mod.snapshotFrames(snapshot)]
  const ended = (async () => {
    for await (const f of stream) {
      frames.push(f)
      if (f.type === 'event' && f.event?.type === 'turn/end') return true
    }
    return false
  })()
  await client.call('session/prompt', {
    request: { requestId: `t80b-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: q }] },
  })
  const ok = await Promise.race([ended, new Promise((r) => setTimeout(() => r('timeout'), 120_000))])
  stream.cancel()
  return ok === true
}

/** 解 session 文件：systemText + user/assistant 原文（assistant/message 行）。 */
const readSession = (sid) => {
  const dir = execSync(`find ${JSON.stringify(home)} -type d -name '${sid}' -print -quit`, { encoding: 'utf8' }).trim()
  const jsonl = execSync(`zstd -dc ${JSON.stringify(join(dir, 'session.v4.jsonl.zstd'))}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  let systemText = ''
  const users = []
  const assistants = []
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let o; try { o = JSON.parse(line) } catch { continue }
    if (o.type === 'system/message' && systemText === '') systemText = (o.data?.message?.content ?? []).map((b) => b.text ?? '').join('\n')
    if (o.type === 'user/message') users.push((o.data?.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''))
    if (o.type === 'assistant/message') assistants.push((o.data?.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'))
  }
  return { systemText, users, assistants }
}

for (let run = 1; run <= RUNS; run++) {
  const { sessionId } = await client.call('session/create', { request: { cwd: work } })
  await client.call('session/rename', { request: { sessionId, title: '新闻播报' } })
  console.log(`run${run} ${sessionId}`)
  for (const q of QUESTIONS) {
    const ok = await turn(sessionId, q)
    console.log(`  ${q} → turnEnd=${ok}`)
  }
  const { systemText, users, assistants } = readSession(sessionId)
  writeFileSync(join(OUT, `run${run}.json`), JSON.stringify({
    label: `run${run}`, sessionId, systemText,
    turns: QUESTIONS.map((q, i) => ({ question: q, reply: assistants[i] ?? '' })),
    rawCounts: { users: users.length, assistants: assistants.length },
  }, null, 2))
  // 判据速报
  const pivotRe = /有什么.{0,3}可以帮|需要我帮你|能帮你什么|有什么.{0,3}帮你的/
  const greet = assistants[0] ?? ''
  const name = assistants[1] ?? ''
  const tcp = assistants[2] ?? ''
  console.log(`  harness=${(systemText.match(/powered by DeepSeek Harness/g) ?? []).length} coding=${(systemText.match(/coding agent|Reply in three parts/g) ?? []).length} nameLine=${(systemText.match(/Your agent name is "新闻播报"/g) ?? []).length}`)
  console.log(`  greetPivot=${pivotRe.test(greet) ? '有' : '无'} nameOk=${name.includes('新闻播报') && !/Harness|coding agent|编程助手/.test(name)} namePivot=${pivotRe.test(name) ? '有' : '无'}`)
  console.log(`  tcp: #标题=${/^#/m.test(tcp) ? '有' : '无'} 粗体小标题=${/\*\*.+\*\*/.test(tcp.split('\n')[0]) ? '有' : '无'} 无序列表=${/^[-*] /m.test(tcp) ? '有' : '无'} 编号步骤=${(tcp.match(/^\d+[.、] /gm) ?? []).length} 段数=${tcp.split('\n').filter((l) => l.trim()).length}`)
}
client.close()
kill()
await new Promise((r) => setTimeout(r, 800))
process.exit(0)
