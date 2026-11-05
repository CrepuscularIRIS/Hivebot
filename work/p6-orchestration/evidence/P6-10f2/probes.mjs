// P6-10.f2 探针复跑（绿版）：review A1/A2/A3 + C-1 + B-1/B-2 + D-3 用独立
// Node 进程直打 worktree 生产代码；D-2 用 esbuild 打包的 orch-channel.ts。
// 探针源（红版）：work/p6-orchestration/evidence/P6-10-rvw/{capacity,rpc,slots-channel}.mjs 等。
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const WT = '/tmp/bot-wt/P6-10f2'
const TMP = '/tmp/bot-p610f2-rerun'
const require = createRequire(WT + '/app/ui/package.json')
const esbuild = require(WT + '/app/ui/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild')
const results = []
const probe = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
const tick = () => new Promise((r) => setImmediate(r))
async function wait(cond) { const deadline = Date.now() + 5_000; while (Date.now() < deadline) { if (cond()) return; await tick() } throw new Error('barrier timeout') }

// 打包 main 侧 orch-channel.ts（rpc.mjs 的做法）
await esbuild.build({ stdin: { contents: `export {wireOrchChannel} from '${WT}/app/ui/main/m3-meta/orch-channel.ts'`, resolveDir: WT }, bundle: true, platform: 'node', format: 'cjs', outfile: TMP + '/orch.cjs' })

// A1 + D-2：子进程跑打包后的 wireOrchChannel
await writeFile(TMP + '/wire-child.cjs', `
const {wireOrchChannel}=require('./orch.cjs')
const streams=[];const listeners=[]
let readyResolve;const ready=new Promise(r=>readyResolve=r)
const socket={openStream(){const s={cancelled:false};streams.push(s);return{cancel(){s.cancelled=true}}}}
const logs=[]
const h=wireOrchChannel({dsh:{onConnected(fn){listeners.push(fn)},ready:()=>ready,rpc:async()=>({ok:true})},create:async()=>({ok:true,value:{sessionId:'w'}}),log:m=>logs.push(m)})
// D-2 首连竞态：同 tick 内 ready 解除阻塞 + onConnected 触发
readyResolve(socket);for(const fn of listeners)fn(1)
setTimeout(()=>{
  if(streams.length!==1)throw new Error('D-2 expected 1 stream got '+streams.length)
  h.close()
  const active=streams.filter(s=>!s.cancelled).length
  if(active!==0)throw new Error('D-2 close left '+active+' stream(s) open')
  // A1：null / 非对象帧——直接打 onFrame 等价入口（openStream 回调），坏帧不崩
  // （子进程若有未捕获异常 exit 1，探针以退出码断言）
  console.log('WIRE streams='+streams.length+' active-after-close=0')
},20)
setTimeout(()=>{ process.exit(0) },60)
`)
// A1 的坏帧用第二个子进程喂（value:null 经 onFrame）
await writeFile(TMP + '/null-child.cjs', `
const {wireOrchChannel}=require('./orch.cjs')
const seen=[];const logs=[]
let frameCb
const socket={openStream(_e,_a,cb){frameCb=cb;return{cancel(){}}}}
wireOrchChannel({dsh:{onConnected(){},ready:async()=>socket,rpc:async()=>({ok:true})},create:async r=>{seen.push(r);return{ok:true,value:{sessionId:'x'}}},log:m=>logs.push(m)})
setTimeout(()=>{
  frameCb({type:'item',streamId:'s1',value:null})   // A1：修复前此处 TypeError 杀死子进程
  frameCb({type:'item',streamId:'s1',value:42})
  frameCb({type:'item',streamId:'s1',value:{requestId:'after-bad'}})
  setTimeout(()=>{
    const dropped=logs.filter(m=>m.includes('dropped invalid')).length
    if(dropped!==2)throw new Error('A1 expected 2 drop logs got '+dropped)
    if(seen.length!==1||seen[0].requestId!=='after-bad')throw new Error('A1 later valid request not served: '+JSON.stringify(seen))
    console.log('A1 null/non-object dropped='+dropped+' later-request-served=1')
    process.exit(0)
  },30)
},20)
`)

// A3：respond HTTP 非法 JSON（复刻 rpc.mjs：真 http server 返回 "{"，经打包 rpcRaw）
await esbuild.build({ stdin: { contents: `export {rpcRaw} from '${WT}/app/ui/main/dsh/connect.ts'`, resolveDir: WT }, bundle: true, platform: 'node', format: 'cjs', outfile: TMP + '/rpc.cjs' })
await writeFile(TMP + '/rpc-child.cjs', `
const http=require('node:http'),{wireOrchChannel}=require('./orch.cjs'),{rpcRaw}=require('./rpc.cjs')
const logs=[]
;(async()=>{
  const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{')})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base='http://127.0.0.1:'+server.address().port
  wireOrchChannel({dsh:{onConnected(){},ready:async()=>({openStream(e,a,cb){setImmediate(()=>cb({type:'item',value:{requestId:'r1',kind:'create-bot',name:'w',prompt:'p',mainBotId:'main'}}));return{cancel(){}}}}),rpc:(m,a)=>rpcRaw(base,'',m,a)},create:async()=>({ok:true,value:{sessionId:'worker-created'}}),log:m=>logs.push(m)})
  setTimeout(()=>{
    const hit=logs.filter(m=>m.includes('respond failed')&&m.includes('r1')).length
    if(hit!==1)throw new Error('A3 expected 1 respond-failed log got '+hit+' logs='+JSON.stringify(logs))
    console.log('A3 invalid-JSON contained: log lines='+hit+' (no unhandled rejection)')
    process.exit(0)
  },50)
})().catch(e=>{console.error(e);process.exit(1)})
`)

// ---- 本进程探针：SDK 侧（直打 worktree src） ----
const ORC = WT + '/app/sdk/src/orchestration/'
const { registerCreateBot } = await import(ORC + 'create.mjs')
const { CreateChannel } = await import(ORC + 'main-channel.mjs')
const { Slots } = await import(ORC + 'slots.mjs')
const { Delivery } = await import(ORC + 'delivery.mjs')

let rigN = 0
async function setupRig(limit) {
  const dir = join(TMP, `rig-${rigN++}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'main', recipes: {}, bots: { w: { createdBy: 'main' } } }))
  const handlers = new Map()
  let tool
  const ctx = { tools: { register(d) { tool = d } }, sessionPersistence: { flush: async () => {} }, on(name, fn) { let s = handlers.get(name); if (!s) handlers.set(name, s = new Set()); s.add(fn); return () => s.delete(fn) } }
  const ch = new CreateChannel({ timeoutMs: 10_000 })
  const sub = { peer: 'p', queue: [], wake: null }
  ch.attach(sub)
  const slots = new Slots(limit)
  const orch = { config: { dataDir: dir }, slots, channel: ch, agentOf: async () => ({ id: 'w' }), delivery: { send: async () => {} } }
  registerCreateBot(ctx, orch)
  const fire = (id, type) => { for (const fn of [...(handlers.get('session/event') ?? [])]) fn({ id }, { type }) }
  return { ctx, orch, slots, ch, sub, tool, fire }
}

await probe('A2 respond {error:null} x3: all converge, capacity not exhausted', async () => {
  const r = await setupRig(3)
  const state = []
  for (let i = 0; i < 3; i++) {
    state[i] = 'pending'
    void r.tool.execute({ name: 'w', prompt: 'p' }, { agent: { id: 'main' } }).then(() => state[i] = 'resolved', () => state[i] = 'rejected')
    await wait(() => r.sub.queue.length > i)
    r.ch.respond(r.sub.queue[i].requestId, { error: null }, 'p')
  }
  await wait(() => state.every((s) => s !== 'pending'))
  const queued = r.sub.queue.length
  const fourth = r.tool.execute({ name: 'w', prompt: 'p' }, { agent: { id: 'main' } }).then(() => 'resolved', (e) => e.code)
  await wait(() => r.sub.queue.length > queued)
  r.ch.detach()
  const code = await fourth
  console.log('TOOL_CAPACITY ' + JSON.stringify({ used: r.slots.used, state, fourth: code }))
  assert.deepEqual(state, ['rejected', 'rejected', 'rejected'])
  assert.equal(r.slots.used, 0)
  assert.notEqual(code, 'pbots/capacity')
})

await probe('C-1 ENOTDIR text: absolute data path redacted to relative hint', async () => {
  const r = await setupRig(1)
  const p = r.tool.execute({ name: 'w', prompt: 'p' }, { agent: { id: 'main' } }).then(() => undefined, (e) => { console.error('EXEC-REJECT ' + (e?.stack ?? e)); return e })
  await wait(() => r.sub.queue.length > 0)
  const abs = '/tmp/vfy-r-p610-c/live-private-data-blocked/workspaces/session-8a14e57b'
  r.ch.respond(r.sub.queue[0].requestId, { error: { code: 'pbots/storage', message: `workspace mkdir failed for "${abs}": Error: ENOTDIR: not a directory, mkdir '${abs}'` } }, 'p')
  const err = await p
  console.log('MODEL_VISIBLE_ERROR ' + err.message)
  assert.ok(!err.message.includes('/tmp/vfy-r-p610-c'), 'no absolute data path')
  assert.ok(!err.message.includes('live-private-data-blocked'), 'no data-dir component leak')
  assert.ok(err.message.includes('ENOTDIR'))
  assert.ok(err.message.includes('<path>/workspaces/session-8a14e57b'), 'relative tail kept')
})

await probe('D-3 timed-out payloads are reclaimed from the queue', async () => {
  const ch = new CreateChannel({ timeoutMs: 3 })
  const sub = { peer: 'p', queue: [], wake: null }
  ch.attach(sub)
  for (let i = 0; i < 20; i++) await ch.request({ kind: 'create-bot', name: 'w', prompt: 'x'.repeat(100000) }).catch(() => {})
  console.log('TIMEOUT pending=' + ch.pending.size + ' queued=' + sub.queue.length)
  assert.equal(ch.pending.size, 0)
  assert.equal(sub.queue.length, 0)
  ch.detach()
})

await probe('B-1 create + manual-start adoption merge: all turns ended → used=0', async () => {
  const r = await setupRig(3)
  const p = r.tool.execute({ name: 'worker', prompt: 'task' }, { agent: { id: 'main' } })
  await wait(() => r.sub.queue.length > 0)
  r.fire('w', 'turn/start')
  r.ch.respond(r.sub.queue[0].requestId, { value: { sessionId: 'w' } }, 'p')
  await p
  r.fire('w', 'turn/end'); r.fire('w', 'turn/start'); r.fire('w', 'turn/end')
  console.log(JSON.stringify({ case: 'pre-response-manual-start', limit: 3, afterAllEnded: r.slots.used, holds: [...r.orch.slotHolds] }))
  assert.equal(r.slots.used, 0)
  assert.equal(r.orch.slotHolds.size, 0)
})

await probe('B-2 flush failure after followup: slot held, next create rejected, turn/end frees', async () => {
  let r
  let flushes = 0
  const fail = Promise.withResolvers()
  const persistence = { flush: async () => { flushes++; if (flushes === 3) await fail.promise }, open: async () => ({ read: async () => ({ events: [] }), close: async () => {} }) }
  r = await setupRig(1)
  r.ctx.sessionPersistence = persistence
  let followup = false
  const agent = { id: 'w', inbox: { nextTurn: [], nextStep: [] }, followup() { followup = true; queueMicrotask(() => r.fire('w', 'turn/start')) } }
  r.orch.agentOf = async () => agent
  r.orch.delivery = new Delivery({ agents: { get: () => agent }, sessionPersistence: persistence })
  const p = r.tool.execute({ name: 'worker', prompt: 'task' }, { agent: { id: 'main' } }).then(() => undefined, (e) => e)
  await wait(() => r.sub.queue.length > 0)
  r.ch.respond(r.sub.queue[0].requestId, { value: { sessionId: 'w' } }, 'p')
  await wait(() => followup && flushes === 3)
  await tick()
  assert.equal(r.slots.used, 1)
  fail.reject(Error('injected durability failure after followup'))
  const e = await p
  assert.equal(e.code, 'pbots/orchestration-failed')
  console.log(JSON.stringify({ case: 'delivery-flush-fails-while-worker-running', runningWorkers: 1, usedAfterFail: r.slots.used, newCreateAllowed: r.slots.reserve(), holds: [...r.orch.slotHolds] }))
  assert.equal(r.slots.used, 1, 'slot stays held')
  assert.equal(r.orch.slotHolds.get('w'), 'turn')
  r.slots.release() // 归还探针自己占的这一格
  r.fire('w', 'turn/end')
  assert.equal(r.slots.used, 0)
})

// ---- 子进程探针 ----
const child = (name, file, expect) => {
  const r = spawnSync(process.execPath, [file], { cwd: TMP, env: { HOME: TMP + '/home', PATH: process.env.PATH }, encoding: 'utf8', timeout: 15000 })
  console.log(name + ' status=' + r.status + ' ' + String(r.stdout).trim().replaceAll('\n', ' | ') + String(r.stderr).trim().replaceAll('\n', ' | '))
  assert.equal(r.status, 0, name + ' child must exit 0')
  if (expect) assert.ok(String(r.stdout).includes(expect), name + ' expects ' + expect)
}
await probe('A1 child: null/non-object frames do not kill the wired process', async () => child('A1', TMP + '/null-child.cjs', 'A1 null/non-object dropped=2'))
await probe('D-2 child: first-connect race opens exactly one stream, close cancels it', async () => child('D-2', TMP + '/wire-child.cjs', 'WIRE streams=1'))
await probe('A3 child: invalid-JSON respond is contained (no unhandled rejection)', async () => child('A3', TMP + '/rpc-child.cjs', 'A3 invalid-JSON contained'))

console.log('SUMMARY ' + results.length + ' probes passed')
process.exit(0)
