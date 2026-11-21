// P7-R1 finite local-only host probe. No product changes, external service or credential reads.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, renameSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const sdk = '/home/lingxufeng/bot/app/sdk', evidence = dirname(fileURLToPath(import.meta.url))
const root = mkdtempSync('/tmp/bot-P7-R1-'), home = join(root, 'home'), runtime = join(root, 'runtime')
for (const p of [home, runtime, join(root, 'tmp'), join(root, 'workspace'), join(runtime, 'fake/scripts')]) mkdirSync(p, { recursive: true })
const output = join(evidence, 'P7-R1-raw-2.jsonl')
writeFileSync(output, '')
const emit = (tag, value) => { appendFileSync(output, JSON.stringify({ tag, at: new Date().toISOString(), value }) + '\n'); console.log(tag, JSON.stringify(value)) }
const packages = {
 schedule: '@deepseek-ai+dsh-schedule@0.2.2-alpha.2_4a48717f67e8a6b8febb28d598132875/node_modules/@deepseek-ai/dsh-schedule',
 loop: '@deepseek-ai+dsh-agent-loop@0.2.2-alpha.2_04206c7ddbce35230b2bfbbb790058fc/node_modules/@deepseek-ai/dsh-agent-loop',
}
for (const [name, p] of Object.entries(packages)) {
 const file = join(sdk, 'node_modules/.pnpm', p, 'lib/index.js')
 emit('artifact', { name, file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label, ms = 15000) { const deadline = Date.now() + ms; do { const value = fn(); if (value) return value; await sleep(25) } while (Date.now() < deadline); throw Error('timeout: ' + label) }
const text = { chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'P7-R1 local successful no-side-effect response' }, { type: 'block-end', index: 0, block: { type: 'text', text: 'P7-R1 local successful no-side-effect response' } }, { type: 'finish', reason: 'stop' }] }
writeFileSync(join(runtime, 'fake/scripts/default.json'), JSON.stringify({ calls: Array.from({ length: 30 }, () => text) }))
const plugin = join(root, 'observer.mjs')
writeFileSync(plugin, `import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
export const name='p7-r1-observer'
export const inject=['agents','sessions','sessionController','schedule']
export function apply(ctx) {
 const root=process.env.P2SDK_R1_ROOT, stage=process.env.P2SDK_R1_STAGE
 const log=(tag,value)=>appendFileSync(join(root,stage+'-events.jsonl'),JSON.stringify({tag,at:Date.now(),value})+'\\n')
 async function receipts(sid,mid) {
  const catalog=(await ctx.schedule.catalog()).filter(t=>t.sessionId===sid)
  const histories=await Promise.all(catalog.map(async t=>({id:t.id,status:t.status,history:await ctx.schedule.history({sessionId:sid,id:t.id,limit:100})})))
  return {mid,catalog,histories,matches:histories.filter(h=>h.history.records?.some(r=>r.messageId===mid)).map(h=>h.id)}
 }
 ctx.on('agent/inbox/inserted',p=>log('queued',{sid:p.agent.id,message:p.message}),{global:true})
 ctx.on('agent/inbox/claimed',p=>{
  log('claimed',{sid:p.agent.id,turn:p.turn,message:p.message})
  receipts(p.agent.id,p.message.id).then(v=>log('claim-receipts',v)).catch(e=>log('observer-error',String(e)))
 },{global:true})
 ctx.on('agent/pre-step',async(p,next)=>{
  for(const m of p.messages)if(m.source?.kind==='schedule')log('prestep-receipts',{sid:p.agent.id,turn:p.turn,...await receipts(p.agent.id,m.id)})
  return next()
 },{global:true})
 ctx.on('session/event',(session,event)=>{if(event.type==='turn/end')log('turn-end',{sid:session.id,event})})
 let busy=false
 const timer=setInterval(async()=>{
  if(busy||!existsSync(join(root,'command.json')))return
  const c=JSON.parse(readFileSync(join(root,'command.json'),'utf8')),dest=join(root,'result-'+c.seq+'.json')
  if(existsSync(dest))return
  busy=true
  try {
   let value
   if(c.op==='session')value=await ctx.sessionController.create({cwd:join(root,'workspace')})
   else if(c.op==='create')value=await ctx.schedule.create(c.sid,c.request)
   else if(c.op==='catalog')value=await ctx.schedule.catalog()
   else if(c.op==='history')value=await ctx.schedule.history(c.request)
   else if(c.op==='delete')value=await ctx.schedule.delete(c.request)
   else if(c.op==='receipts')value=await receipts(c.sid,c.mid)
   else if(c.op==='inspect'||c.op==='maintenance-start'||c.op==='maintenance-release'||c.op==='user-spoof') {
    const r=await ctx.sessionController.resolveAgent(c.sid);if('error' in r)throw r.error
    if(c.op==='maintenance-start') {
     let release;const gate=new Promise(resolve=>release=resolve)
     ctx._r1Release=release;ctx._r1Maintenance=r.agent.runMaintenance(()=>gate)
     value={maintenance:true}
    }else if(c.op==='maintenance-release') {ctx._r1Release();await ctx._r1Maintenance;value={released:true}}
    else if(c.op==='user-spoof') {r.agent.followup({id:'r1-human-spoof-'+c.seq,role:'user',content:[{type:'text',text:c.text}],source:{kind:'user'}});value={queued:true}}
    else value={status:r.agent.status,nextTurn:r.agent.inbox.nextTurn,nextStep:r.agent.inbox.nextStep}
   }else throw Error('unknown local probe command')
   writeFileSync(dest,JSON.stringify({ok:true,value}))
  } catch(e) {writeFileSync(dest,JSON.stringify({ok:false,error:{message:String(e),code:e.code}}))} finally {busy=false}
 },25)
 ctx.effect(()=>()=>clearInterval(timer))
 writeFileSync(join(root,stage+'-ready'), 'ready')
}
`)
const patch = join(root, 'probe.yml')
writeFileSync(patch, `- id: agent-default-model\n  config:\n    provider: p2fake\n    model: scripted\n- insert:\n    - id: p7-r1-fake\n      name: 'file://${sdk}/tests/support/fake/plugin.mjs'\n      config:\n        providers:\n          - id: p2fake\n            models:\n              - id: scripted\n                contextWindow: 131072\n    - id: p7-r1-observer\n      name: 'file://${plugin}'\n`)
let child, stage, seq = 0
const allEvents = []
function events() { const p = join(root, stage + '-events.jsonl'); return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [] }
async function command(op, more = {}) {
 const n = ++seq, temp = join(root, 'command-tmp.json'), out = join(root, `result-${n}.json`)
 writeFileSync(temp, JSON.stringify({ seq: n, op, ...more })); renameSync(temp, join(root, 'command.json'))
 await until(() => existsSync(out), op)
 const result = JSON.parse(readFileSync(out, 'utf8')); emit('command-' + op, result); assert(result.ok, JSON.stringify(result.error)); return result.value
}
async function boot(label) {
 stage = label; let ready = false, bytes = 0
 child = spawn(process.execPath, [join(sdk, 'scripts/start.mjs')], { cwd: root, env: {
  PATH: '/usr/bin:/bin', HOME: home, TMPDIR: join(root, 'tmp'), PBOTS_DATA_DIR: join(root, 'data'),
  P2SDK_HOME: runtime, P2SDK_HANDOFF: join(root, 'handoff'), P2SDK_PORT: '0', P2SDK_PROVIDER: 'mock', P2SDK_PATCH: patch,
  P2SDK_R1_ROOT: root, P2SDK_R1_STAGE: stage, DSH_TELEMETRY_MODE: 'DISABLED',
 }, stdio: ['ignore', 'pipe', 'pipe'] })
 for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { bytes += b.length; if (String(b).includes('[p2sdk] ready http')) ready = true })
 await until(() => { if (child.exitCode !== null) throw Error('owned host exited: ' + child.exitCode); return ready && existsSync(join(root, stage + '-ready')) }, 'boot', 45000)
 emit('boot', { stage, ready: true, logBytesNotRetained: bytes })
}
async function stop() {
 if (!child) return
 if (existsSync(join(root, 'command.json'))) rmSync(join(root, 'command.json'))
 if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM') // test framework only: exact child spawned here; launcher drains its own child.
 await until(() => child.exitCode !== null || child.signalCode !== null, 'owned child exit', 15000)
 emit('child-exit', { stage, code: child.exitCode, signal: child.signalCode })
 allEvents.push(...events().map(r => ({ stage, ...r }))); child = undefined
}
function files(dir) { return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]) : [] }
try {
 await boot('normal')
 const sid = (await command('session')).sessionId
 const normal = await command('create', { sid, request: { title: 'normal legal control', prompt: 'Reply harmlessly; routine A only.', after_seconds: 1 } })
 await until(() => events().some(e => e.tag === 'claimed' && e.value.message.source?.kind === 'schedule'), 'normal delivery')
 const claim = events().find(e => e.tag === 'claimed' && e.value.message.source?.kind === 'schedule').value
 let association
 for (let retry = 0; retry < 30; retry++) {
  association = await command('receipts', { sid, mid: claim.message.id }); if (association.matches.length) break; await sleep(50)
 }
 assert.deepEqual(association.matches, [normal.id])
 await until(() => events().some(e => e.tag === 'turn-end' && e.value.sid === sid), 'normal completed turn')
 emit('normal-success', { sid, id: normal.id, messageId: claim.message.id, committedAssociation: association.matches, fakeTurnCompleted: true, productAdmissionProven: false })
 await command('user-spoof', { sid, text: claim.message.content[0].text })
 await until(() => events().some(e => e.tag === 'claimed' && e.value.message.id.startsWith('r1-human-spoof')), 'spoof claimed')
 const spoof = events().find(e => e.tag === 'claimed' && e.value.message.id.startsWith('r1-human-spoof')).value
 const fakeMatch = await command('receipts', { sid, mid: spoof.message.id })
 assert.equal(fakeMatch.matches.length, 0); assert.equal(spoof.message.source.kind, 'user')
 emit('spoof-control', { sameBody: spoof.message.content[0].text === claim.message.content[0].text, source: spoof.message.source, receiptMatches: fakeMatch.matches })
 // Native runMaintenance gates an Agent without a model or a new scheduler.
 await until(() => events().filter(e => e.tag === 'turn-end' && e.value.sid === sid).length >= 2, 'spoof completed')
 await command('maintenance-start', { sid })
 const queued = await command('create', { sid, request: { title: 'revoked while queued', prompt: 'Old queued delivery; never fresh authorization.', after_seconds: 1 } })
 await until(() => events().some(e => e.tag === 'queued' && e.value.message.content[0]?.text.includes(queued.id)), 'queued old delivery')
 const before = await command('inspect', { sid })
 assert(before.nextTurn.some(m => m.content[0]?.text.includes(queued.id)))
 await command('delete', { request: { sessionId: sid, id: queued.id } })
 const after = await command('inspect', { sid })
 assert(after.nextTurn.some(m => m.content[0]?.text.includes(queued.id)))
 await command('maintenance-release', { sid })
 await until(() => events().some(e => e.tag === 'claimed' && e.value.message.content[0]?.text.includes(queued.id)), 'deleted delivery still claimed')
 const old = events().find(e => e.tag === 'claimed' && e.value.message.content[0]?.text.includes(queued.id)).value
 const missing = await command('history', { request: { sessionId: sid, id: queued.id, limit: 100 } })
 assert.equal(missing.code, 'schedule_not_found')
 emit('delete-old-delivery', { messageId: old.message.id, source: old.message.source, stillClaimed: true, history: missing })
 const a = await command('create', { sid, request: { title: 'batch A', prompt: 'A; busy Assignment is external to schedule.', every_seconds: 60 } })
 const b = await command('create', { sid, request: { title: 'batch B', prompt: 'B; idle routine.', every_seconds: 60 } })
 await stop()
 // Finite offline-recovery fixture: only modify this probe's schedule storage, not clock or upstream.
 const paths = files(join(runtime, 'storages')).filter(p => p.endsWith('.json'))
 let fixtureFiles = 0
 for (const p of paths) {
  const raw = readFileSync(p, 'utf8')
  if (!raw.includes(a.id) || !raw.includes(b.id)) continue
  let edited = raw
  const due = new Date(Date.now() - 2000).toISOString()
  for (const r of [a, b]) edited = edited.replaceAll(r.scheduledAt, due)
  assert.notEqual(edited, raw); writeFileSync(p, edited); fixtureFiles++
 }
 assert.equal(fixtureFiles, 1, 'exactly one owned schedule document edited')
 emit('offline-fixture', { count: fixtureFiles, taskIds: [a.id, b.id], note: 'Native create every60; graceful stop; scheduledAt made overdue in owned storage only. Not 60s wall-clock acceptance.' })
 await boot('recovered-batch')
 await until(() => events().some(e => e.tag === 'claimed' && e.value.message.content[0]?.text.startsWith('[SCHEDULE REMINDER BATCH]')), 'recovered batch')
 const batch = events().find(e => e.tag === 'claimed' && e.value.message.content[0]?.text.startsWith('[SCHEDULE REMINDER BATCH]')).value
 let full
 for (let retry = 0; retry < 30; retry++) {
  full = await command('receipts', { sid, mid: batch.message.id }); if (full.matches.length === 2) break; await sleep(50)
 }
 assert.deepEqual([...full.matches].sort(), [a.id, b.id].sort())
 emit('batch-full', { messageId: batch.message.id, source: batch.message.source, matches: full.matches, body: batch.message.content[0].text })
 // Public deletion creates a true partial history view for the same authentic batch.
 await command('delete', { request: { sessionId: sid, id: a.id } })
 const partial = await command('receipts', { sid, mid: batch.message.id })
 assert.deepEqual(partial.matches, [b.id])
 emit('batch-partial', { messageId: batch.message.id, matches: partial.matches, missingA: true, completeBatchFlagExists: false })
 await stop()
 await boot('restart-after-delete')
 const survivor = await command('receipts', { sid, mid: batch.message.id })
 assert.deepEqual(survivor.matches, [b.id])
 const deletedHistory = await command('history', { request: { sessionId: sid, id: a.id, limit: 100 } })
 assert.equal(deletedHistory.code, 'schedule_not_found')
 emit('restart-old-receipt', { oldMessageId: batch.message.id, matches: survivor.matches, deletedHistory, generationInReceipt: false, note: 'Retained receipt is not fresh execution authorization.' })
 await command('delete', { request: { sessionId: sid, id: b.id } })
 emit('PASS', { normalDelivery: true, spoofDistinguished: true, committedBatchLookup: true, partialBatchInsufficient: true, deletedQueueNotRetracted: true, minSafeProductAdmission: 'BLOCKED/NOT IMPLEMENTED', pauseNativeAPI: 'absent in inspected alpha.2 interface' })
} catch (e) { emit('FAIL', { message: String(e), stack: e.stack }); process.exitCode = 1 }
finally {
 try { await stop() } catch (e) { emit('cleanup-failure', String(e)); process.exitCode = 1 }
 for (const e of allEvents) appendFileSync(join(evidence, 'P7-R1-events-2.jsonl'), JSON.stringify(e) + '\n')
 if (!child) { rmSync(root, { recursive: true, force: true }); emit('cleanup', { ownedRuntimeRemoved: true, noCredentialFilesRead: true }) }
}
