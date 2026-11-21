// T93 探针事实（扩 T92）：F1 切点/F2 继承/F3 续发。跑法同 T92（evidence/T92-fork-probe.mjs）。
// 口径：gateway 单参方法 {request:{…}}；session/events 取内容；fake 三条一次灌（T85d 教训）。
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = '/home/lingxufeng/bot'
const SDK_ROOT = join(REPO, 'app/sdk')
const home = mkdtempSync(join(tmpdir(), 't93-home-'))
const handoff = mkdtempSync(join(tmpdir(), 't93-handoff-'))
const dir = mkdtempSync(join(tmpdir(), 't93-data-'))
const call = (text) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
], paceMs: 60 })
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
writeFileSync(join(home, 'fake', 'scripts', 'default.json'), JSON.stringify({ calls: [call('答一'), call('答二'), call('分叉后答')] })) // 三条一次灌（覆盖竞态 T85d 教训）
const log = (...a) => console.log('[t93]', ...a)

const child = spawn(process.execPath, [join(SDK_ROOT, 'scripts', 'start.mjs')], {
  env: { ...process.env, P2SDK_PROVIDER: 'mock', P2SDK_HOME: home, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0', P2SDK_PATCH: '', P2SDK_DATA_DIR: dir, P2SDK_READY_TIMEOUT_MS: '60000' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
const probe = { started: false }
child.stdout.on('data', (d) => { out += d; const m = out.match(/\[p2sdk\] ready (http\S+)/); if (m && !probe.started) void start(m[1]) })
child.stderr.on('data', (d) => { out += d })
const timeout = setTimeout(() => { log('TIMEOUT'); child.kill(); process.exit(2) }, 120_000)

async function start() {
  probe.started = true
  const { readFileSync: rf } = await import('node:fs')
  const baseUrl = rf(join(handoff, 'base-url'), 'utf8').trim()
  const token = rf(join(handoff, 'launch-token'), 'utf8').trim()
  const dsh = await (await import('file://' + join(SDK_ROOT, 'examples', 'lib', 'client.mjs'))).connect({ baseUrl, token })
  const rpc = (m, a) => dsh.call(m, a ?? {})
  try {
    const work = mkdtempSync(join(tmpdir(), 't93-ws-'))
    const created = await rpc('session/create', { request: { cwd: work } })
    const sid = created.sessionId
    await rpc('session/rename', { request: { sessionId: sid, title: 'T93-改名' } }).catch((e) => log('rename 不支持?', String(e).slice(0, 120)))
    const send = async (t) => rpc('session/prompt', { request: { requestId: `t93-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text: t }] } })
    // 三条已在开头一次灌（T85d：中途覆盖有消费竞态——第三条留给 fork 后子会话消费）
    await send('问一'); await new Promise((r) => setTimeout(r, 1200))
    await send('问二'); await new Promise((r) => setTimeout(r, 1500))
    const evs = await rpc('session/events', { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 200 } }).catch((e) => { log('events ERR', String(e).slice(0, 200)); return null })
    if (evs == null) throw new Error('session/events 不可用')
    const flat = JSON.stringify(evs)
    log('events 原样（截 600）:', flat.slice(0, 600))
    // F1：找最后一条用户 prompt 的 seq —— 从 events 结构里挖（实测定形态）
    const items = (evs.records ?? []).map((r) => r.event ?? r).filter(Boolean)
    // fork：atSeq 取「问二 seq 前一个」（含/不含实测——先试 seq-1，子应含问答一不含问答二）
    // atSeq 语义扫描（不是 event seq——atSeq=20 子仍含 seq23；扫值定边界规律）
    for (const at of [0, 1, 2, 5, 10, 15, 20, 21, 23]) {
      const f = await rpc('session/fork', { request: { sessionId: sid, atSeq: at } }).catch((e) => ({ err: String(e).slice(0, 80) }))
      if (f.err != null) { log('scan atSeq', at, '→ ERR', f.err); continue }
      const ce = await rpc('session/events', { request: { address: { kind: 'session', sessionId: f.sessionId }, maxMessages: 200 } })
      const mx = Math.max(...(ce.records ?? []).map((r) => (r.event ?? r).seq ?? -1))
      log('scan atSeq', at, '→ 子 cursor', ce.cursor, 'maxSeq', mx)
    }
    // M4：父选非默认模型（fork 前）——子快照 modelSelection 比对
    const SEL = { provider: 'p2fake', model: 'p2fake-nondefault' }
    await rpc('session/selectModel', { request: { sessionId: sid, provider: SEL.provider, model: SEL.model } }).catch((e) => log('selectModel 预置失败:', String(e).slice(0, 100)))
    // M5 内容级：rollback.ts 边界算法 import 复用——切「上一条用户消息之前」
    const { lastUserMessage } = await import('file:///tmp/bot-wt/T93/app/ui/renderer-grok/shim/src/rollback.ts')
    const recs = (evs.records ?? []).map((r) => r.event ?? r)
    const lu = lastUserMessage(recs)
    log('M5 lastUserMessage =', JSON.stringify(lu))
    let boundary = -1
    for (const e of recs) { if (e.type === 'turn/end' && lu != null && e.seq < lu.seq) boundary = Math.max(boundary, e.seq) }
    const fx = await rpc('session/fork', { request: { sessionId: sid, atSeq: boundary } })
    const fxEv = await rpc('session/events', { request: { address: { kind: 'session', sessionId: fx.sessionId }, maxMessages: 200 } })
    const userTexts = (fxEv.records ?? []).map((r) => r.event ?? r).filter((e) => e.type === 'user/message' && String((e.data ?? {}).source?.kind ?? '') === 'user').map((e) => JSON.stringify((e.data ?? {}).content ?? ''))
    const hasOne = userTexts.some((t) => t.includes('问一'))
    const hasTwo = userTexts.some((t) => t.includes('问二'))
    log('F1 含 问一 =', hasOne, '；F1 不含 问二 =', !hasTwo, '（boundary=', boundary, '）')
    if (!hasOne || hasTwo) { log('FACTS_FAIL: F1'); process.exit(1) }
    const fork = await rpc('session/fork', { request: { sessionId: sid } })
    const child1 = fork.sessionId
    log('默认 fork → 子', child1)
    // F2 model：子快照比对（session/list 投影）
    const snap = await rpc('session/list', { _request: {} }).then((l) => ((l.value ?? {}).items ?? []).find((i) => i.sessionId === child1)).catch(() => null)
    const modelInherited = JSON.stringify(snap ?? {}).includes(SEL.model)
    log('F2 model inherited=', modelInherited ? 'yes' : 'no')
    // M4 补证：子快照 modelSelection 原样（回执记字段名，rollback 按此取）
    const proj = snap ?? {}
    log('F2 子快照整键 =', JSON.stringify(Object.keys(proj)))
    // M4 落地：对子重放 selectModel（同参数）验证可设
    const selChild = await rpc('session/selectModel', { request: { sessionId: child1, provider: SEL.provider, model: SEL.model } }).catch((e) => ({ err: String(e).slice(0, 100) }))
    log('F2 子 selectModel 重放 =', selChild.err != null ? `ERR ${selChild.err}` : JSON.stringify(selChild))
    const childEvents = await rpc('session/events', { request: { address: { kind: 'session', sessionId: child1 }, maxMessages: 200 } })
    const defChildSeqs = (childEvents.records ?? []).map((r) => (r.event ?? r).seq ?? -1)
    log('F1 默认 fork：子 cursor', childEvents.cursor, 'maxSeq', Math.max(...defChildSeqs), '父 cursor', evs.cursor)

    // F3 续发（fake 游标疑 per-session：子会话独立计数——此刻父空闲，重灌单条安全）
    await (await import('node:fs')).promises.writeFile(join(home, 'fake', 'scripts', 'default.json'), JSON.stringify({ calls: [call('分叉后答')] }))
    await rpc('session/prompt', { request: { requestId: `t93c-${Date.now()}`, sessionId: child1, mode: 'queue', content: [{ type: 'text', text: '分叉后新问' }] } })
    await new Promise((r) => setTimeout(r, 1800))
    const after = await rpc('session/events', { request: { address: { kind: 'session', sessionId: child1 }, maxMessages: 200 } })
    const afterFlat = JSON.stringify(after)
    // F3 口径：子 cursor 增长 + 新 user prompt 事件出现（fork 后有新输入）；正文由单测层验
    const grew = Number(after.cursor) > Number(childEvents.cursor)
    const newUserEv = /user\/message|inbox/.test(afterFlat) && Number(after.cursor) > Number(childEvents.cursor) + 2
    log('F3 续发：子 cursor', childEvents.cursor, '→', after.cursor, '增长 =', grew, '（新事件显著 =', newUserEv, '）')
    const f3Texts = (after.records ?? []).map((r) => r.event ?? r).map((e) => JSON.stringify(e.data ?? {})).join('')
    // F3 口径（fake 单 session 录制限制）：「unrecorded session (#2)」错误=模型调用到达子会话
    // ——dsh 侧子会话活性实证（真实回复内容需多 session 录制，超出探针范围记档）
    const childAlive = f3Texts.includes('unrecorded session (#2)') || f3Texts.includes('分叉后答')
    log('F3 子会话活性（模型调用到达 #2）=', childAlive)
    if (!childAlive) { log('FACTS_FAIL: F3'); process.exit(1) }
    console.log('FACTS_OK')
  } catch (e) {
    log('ERR', e?.message ?? String(e))
    process.exitCode = 1
  } finally {
    clearTimeout(timeout); child.kill(); process.exit(process.exitCode ?? 0)
  }
}
