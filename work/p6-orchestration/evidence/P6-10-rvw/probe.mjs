import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from '/home/lingxufeng/bot/app/ui/node_modules/vite/dist/node/index.js'
import { CreateChannel } from '/home/lingxufeng/bot/app/sdk/src/orchestration/main-channel.mjs'
import { registerCreateBot } from '/home/lingxufeng/bot/app/sdk/src/orchestration/create.mjs'
import { Slots } from '/home/lingxufeng/bot/app/sdk/src/orchestration/slots.mjs'
const root = '/tmp/vfy-r-p610-c'
const source = '/home/lingxufeng/bot'
await writeFile(join(root,'electron.mjs'), 'export class MessageChannelMain {}')
const vite = await createServer({ configFile:false, root, cacheDir:join(root,'vite-cache'), resolve:{ alias:{ electron:join(root,'electron.mjs') } }, server:{ middlewareMode:true }, appType:'custom' })
const results=[]
async function probe(name,fn) { await fn(); results.push(name); console.log('PASS '+name) }
const { BotsMetaStore } = await vite.ssrLoadModule(source+'/app/ui/main/m3-meta/store.ts')
const { registerM3Meta } = await vite.ssrLoadModule(source+'/app/ui/main/m3-meta/index.ts')
const { createWorkerBot } = await vite.ssrLoadModule(source+'/app/ui/main/m3-meta/orchestrate.ts')
const { wireOrchChannel } = await vite.ssrLoadModule(source+'/app/ui/main/m3-meta/orch-channel.ts')
const { registerM1Api } = await vite.ssrLoadModule(source+'/app/ui/main/m1-api/index.ts')
const { registerM2Mux } = await vite.ssrLoadModule(source+'/app/ui/main/m2-mux/index.ts')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
function toolHarness(dir,timeoutMs=40) {
  let tool,options
  const listeners=new Map()
  const ctx={ tools:{ register(t,o){tool=t;options=o;return ()=>{}} },on(name,fn){const a=listeners.get(name)??[];a.push(fn);listeners.set(name,a);return ()=>{const i=a.indexOf(fn);if(i>=0)a.splice(i,1)}},sessionPersistence:{flush:async()=>{}} }
  const orch={config:{dataDir:dir},channel:new CreateChannel({timeoutMs}),slots:new Slots(1),agentOf:async()=>({id:'worker'}),delivery:{send:async()=>{}}}
  registerCreateBot(ctx,orch)
  return {tool,options,orch,fire:(name,...args)=>{for(const fn of [...(listeners.get(name)??[])])fn(...args)}}
}
try {
 await probe('M1 rejects both orch endpoints without RPC',async()=>{
  let calls=0; const m1=registerM1Api({dsh:{rpc:async()=>{calls++;return {ok:true}}},log:()=>{}})
  for(const method of ['pbots/orchestration.requests','pbots/orchestration.respond']) assert.equal((await m1({method,args:{}})).error.code,'pbots/forbidden')
  assert.equal(calls,0)
 })
 await probe('M2 rejects orch opens and forged main-stream item/cancel',async()=>{
  let tap,port;const up=[],down=[]
  const socket={setTap(t){tap=t},openStream(endpoint,args,cb){tap?.({type:'open',endpoint,streamId:'main-events'},'up');return {cancel(){}}},onDead(){},sendRaw(frame){up.push(frame)}}
  let reads=0
  const m2=registerM2Mux({dsh:{ready:()=>{reads++;return reads<=2?Promise.resolve(socket):new Promise(()=>{})},rpc:async()=>({ok:true})},deadlineMs:0,makeChannel:()=>({port1:{on(type,fn){if(type==='message')port=fn},start(){},close(){},postMessage(f){down.push(JSON.parse(f))}},port2:{}})})
  m2({senderFrame:{url:'pbots-app://app/'},sender:{isDestroyed:()=>false,postMessage(){}}},{requestId:'p'})
  await wait(10)
  for(const endpoint of ['pbots/orchestration.requests','pbots/orchestration.respond']) port({data:JSON.stringify({type:'open',endpoint,streamId:'attacker-'+endpoint})})
  // The orch main stream is registered by the same tap before renderer tries to use it.
  tap({type:'open',endpoint:'pbots/orchestration.requests',streamId:'orch-main'},'up')
  for(const type of ['item','cancel','end']) port({data:JSON.stringify({type,streamId:'orch-main',value:{requestId:'forged',mainBotId:'main'}})})
  assert.equal(up.length,0);assert.equal(down.length,2);assert.equal(m2.stats.uplinkDropped,3)
 })
 await probe('wrong peer, detach/reconnect old peer and stale request all rejected',async()=>{
  const ch=new CreateChannel({timeoutMs:200});const a={peer:{id:'a'},queue:[]};ch.attach(a)
  const p=ch.request({kind:'create-bot'}).catch(e=>e);const id=a.queue[0].requestId
  assert.throws(()=>ch.respond(id,{value:{sessionId:'evil'}},{id:'a'}),/wrong peer/)
  ch.detach();assert.equal((await p).code,'main-unavailable')
  const b={peer:{id:'b'},queue:[]};ch.attach(b)
  const p2=ch.request({kind:'create-bot'});const id2=b.queue[0].requestId
  assert.throws(()=>ch.respond(id,{value:{}},a.peer),/stale/)
  assert.throws(()=>ch.respond(id2,{value:{}},a.peer),/wrong peer/)
  ch.respond(id2,{value:{sessionId:'good'}},b.peer);assert.equal((await p2).sessionId,'good');ch.detach()
 })
 await probe('non-main execute and absent/corrupt identity are fail closed',async()=>{
  const dir=join(root,'identity');await mkdir(dir,{recursive:true});const f=join(dir,'bots.json')
  const h=toolHarness(dir)
  const args={name:'w',prompt:'p'}
  for(const value of [undefined,'{bad',JSON.stringify({version:2,mainBotId:'main'}),JSON.stringify({version:1,mainBotId:null}),JSON.stringify({version:1,mainBotId:'other'})]){
   if(value===undefined)await unlink(f).catch(()=>{});else await writeFile(f,value)
   assert.equal(await h.options.when({agent:{id:'main'}}),false)
   await assert.rejects(h.tool.execute(args,{agent:{id:'main'}}),/forbidden|unavailable/)
   assert.equal(h.orch.slots.used,0)
  }
 })
 await probe('timeout followed by late success cannot double-release another request slot',async()=>{
  const dir=join(root,'timeout');await mkdir(dir,{recursive:true});await writeFile(join(dir,'bots.json'),JSON.stringify({version:1,mainBotId:'main',recipes:{}}))
  const h=toolHarness(dir,40);const sub={peer:{},queue:[]};h.orch.channel.attach(sub)
  const args={name:'w',prompt:'p'},exec={agent:{id:'main'}}
  await assert.rejects(h.tool.execute(args,exec),/timed out/);assert.equal(h.orch.slots.used,0)
  const p=h.tool.execute(args,exec);await wait(5);assert.equal(h.orch.slots.used,1)
  assert.throws(()=>h.orch.channel.respond(sub.queue[0].requestId,{value:{sessionId:'late'}},sub.peer),/stale/)
  h.fire('session/event',{id:'late'},{type:'turn/end'});assert.equal(h.orch.slots.used,1)
  h.orch.channel.respond(sub.queue[1].requestId,{value:{sessionId:'worker'}},sub.peer);await p
  assert.equal(h.orch.slots.used,1);h.fire('session/event',{id:'worker'},{type:'turn/end'});assert.equal(h.orch.slots.used,0)
  h.fire('session/event',{id:'worker'},{type:'turn/end'});assert.equal(h.orch.slots.used,0);h.orch.channel.detach()
 })
 await probe('#20 rejects clear-main, worker promotion after main switch, and forged metadata patches',async()=>{
  const dir=join(root,'promote');await mkdir(dir,{recursive:true})
  const store=new BotsMetaStore(dir)
  const dsh={rpc:async(method)=>({ok:true,value:method==='session/list'?{items:['main','other','worker'].map(sessionId=>({sessionId}))}:{presets:[]}})}
  const m3=registerM3Meta({store,dsh});await m3.init;await store.patchMainBotId('main');await store.putBot('worker','main')
  for(const req of [{op:'patch',mainBotId:null},{op:'patch'},{op:'patch',mainBotId:'worker'},{op:'patch',mainBotId:'worker',bots:{}},{op:'patch',mainBotId:'worker',createdBy:null}]) assert.equal((await m3.handler(req)).ok,false)
  assert.equal((await m3.handler({op:'patch',mainBotId:'other'})).ok,true)
  assert.equal((await m3.handler({op:'patch',mainBotId:'worker'})).ok,false)
  assert.equal((await m3.handler({op:'patch',mainBotId:'main'})).ok,true)
  assert.deepEqual(store.read().bots,{worker:{createdBy:'main'}});store.close()
 })
 await probe('CONFIRMED: real workspace ENOTDIR leaks internal absolute data path through create tool error',async()=>{
  const dir=join(root,'leak-meta');await mkdir(dir,{recursive:true})
  const store=new BotsMetaStore(dir);await store.init();await store.patchMainBotId('main')
  const blocked=join(root,'private-user-data-blocked');await writeFile(blocked,'not a directory')
  const h=toolHarness(dir,1000);const sub={peer:{},queue:[]};h.orch.channel.attach(sub)
  const p=h.tool.execute({name:'w',prompt:'p'},{agent:{id:'main'}}).catch(e=>e);await wait(10)
  let rpc=0
  const r=await createWorkerBot({rpc:async()=>{rpc++;return {ok:true,value:{}}}},store,sub.queue[0],{dataDir:blocked})
  assert.equal(r.ok,false);assert.equal(rpc,0)
  h.orch.channel.respond(sub.queue[0].requestId,{error:r.error},sub.peer)
  const err=await p;assert.ok(err.message.includes(blocked));assert.ok(err.message.includes('ENOTDIR'));assert.equal(h.orch.slots.used,0)
  console.log('MODEL_VISIBLE_ERROR '+err.message)
  await writeFile(join(root,'leak-output.txt'),err.message+'\n');h.orch.channel.detach();store.close()
 })
 console.log('SUMMARY '+results.length+' probes passed')
} finally { await vite.close() }
// M2 deadline timer belongs to imported production code; let this standalone probe terminate naturally except for that timer.
process.exit(0)
