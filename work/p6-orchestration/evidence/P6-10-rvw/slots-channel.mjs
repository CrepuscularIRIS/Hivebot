import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {Delivery} from '/home/lingxufeng/bot/app/sdk/src/orchestration/delivery.mjs'
import {Slots} from '/home/lingxufeng/bot/app/sdk/src/orchestration/slots.mjs'
import {registerCreateBot} from '/home/lingxufeng/bot/app/sdk/src/orchestration/create.mjs'
import {CreateChannel} from '/home/lingxufeng/bot/app/sdk/src/orchestration/main-channel.mjs'
const root='/tmp/vfy-r-p610-b';mkdirSync(join(root,'home'),{recursive:true});process.env.HOME=join(root,'home')
const defer=()=>Promise.withResolvers();const tick=()=>new Promise(r=>setImmediate(r));
async function wait(f){for(let i=0;i<100;i++){if(f())return;await tick()}throw Error('barrier not reached')}
let n=0
function rig(limit=3,options={}){
 const dir=join(root,`data-${++n}`);mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'bots.json'),JSON.stringify({version:1,mainBotId:'main',recipes:{},bots:{w:{createdBy:'main'},x:{createdBy:'main'}}}))
 const handlers=new Map();let tool;let when;
 const ctx={tools:{register(d,o){tool=d;when=o.when}},sessionPersistence:{flush:options.flush??(async()=>{})},on(name,fn){let s=handlers.get(name);if(!s)handlers.set(name,s=new Set());s.add(fn);return()=>s.delete(fn)}}
 const fire=(id,type)=>{for(const fn of [...(handlers.get('session/event')??[])])fn({id},{type})}
 const ch=new CreateChannel({timeoutMs:options.timeoutMs??10000});const sub={peer:'p',queue:[],wake:null};ch.attach(sub)
 const slots=new Slots(limit);const orch={config:{dataDir:dir},slots,channel:ch,agentOf:async()=>({id:'w'}),delivery:{send:options.send??(async()=>{})}}
 registerCreateBot(ctx,orch)
 const start=()=>tool.execute({name:'worker',prompt:'task'},{agent:{id:'main'}})
 const respond=()=>ch.respond(sub.queue[0].requestId,{value:{sessionId:'w'}},'p')
 return {start,respond,fire,slots,orch,ch,sub,when,handlers}
}
// Before channel response: manual worker starts during main's session/create -> rename window.
for(const limit of [1,3]){
 const r=rig(limit);const p=r.start();await wait(()=>r.sub.queue.length);
 r.fire('w','turn/start');r.respond();await p;
 r.fire('w','turn/end');r.fire('w','turn/start');r.fire('w','turn/end'); // manual turn then assigned next turn both finish
 assert.equal(r.slots.used,limit===1?0:1); // at limit=3 the adopted slot is overwritten and leaks
 console.log(JSON.stringify({case:'pre-response-manual-start',limit,afterAllEnded:r.slots.used,holds:[...r.orch.slotHolds]}))
}
// Early end belongs to the manually started turn; the assigned next turn still releases the create reservation.
{
 const gate=defer();let r;r=rig(1,{flush:()=>gate.promise,send:async()=>{r.fire('w','turn/start');r.fire('w','turn/end')}});const p=r.start();await wait(()=>r.sub.queue.length);r.respond();await wait(()=>r.orch.slotHolds.has('w'));
 r.fire('w','turn/start');r.fire('w','turn/end');gate.resolve();await p;
 assert.equal(r.slots.used,0);console.log('REFUTED end-before-listener: subsequent assigned turn ends, used=0')
}
// Actual Delivery.send: followup has started a live turn, but post-followup durability flush fails.
{
 let r;let flushes=0;let followup=false;const fail=defer();
 r=rig(1,{flush:async()=>{flushes++;if(flushes===3)await fail.promise}});
 const agent={id:'w',inbox:{nextTurn:[],nextStep:[]},followup(){followup=true;queueMicrotask(()=>r.fire('w','turn/start'))}};
 r.orch.agentOf=async()=>agent;
 r.orch.delivery=new Delivery({agents:{get:()=>agent},sessionPersistence:{flush:async()=>{flushes++;if(flushes===3)await fail.promise},open:async()=>({read:async()=>({events:[]}),close:async()=>{}})}});
 const p=r.start().catch(e=>e);await wait(()=>r.sub.queue.length);r.respond();await wait(()=>followup&&flushes===3);await tick();
 assert.equal(r.slots.used,1);fail.reject(Error('injected durability failure after followup'));const e=await p;
 assert.equal(e.code,'pbots/orchestration-failed');assert.equal(r.slots.used,0);assert.equal(r.slots.reserve(),true);
 console.log(JSON.stringify({case:'delivery-flush-fails-while-worker-running',runningWorkers:1,usedBeforeNewReserve:0,newCreateAllowed:true,holds:[...r.orch.slotHolds]}));r.slots.release();r.fire('w','turn/end')
}
// Clean path: unrelated pending worker must get the create slot once and release once.
{
 const r=rig(1);const p=r.start();await wait(()=>r.sub.queue.length);r.fire('x','turn/start');r.respond();await p;r.fire('w','turn/start');r.fire('w','turn/end');assert.equal(r.slots.used,1);assert.equal(r.orch.slotHolds.get('x'),'turn');r.fire('x','turn/end');assert.equal(r.slots.used,0);console.log('REFUTED unrelated pending/create release race: used 1 -> 0')
}
// Both timer/respond orderings, duplicate late responds, detach: no double release.
for(const order of ['respond-first','timeout-first','detach-first']){
 const r=rig(1,{timeoutMs:5});const p=r.start().then(x=>({ok:true,x}),error=>({ok:false,error}));await wait(()=>r.sub.queue.length);
 if(order==='respond-first'){r.respond();await p;r.fire('w','turn/start');r.fire('w','turn/end');await new Promise(r=>setTimeout(r,12))}
 else if(order==='timeout-first'){const result=await p;assert.equal(result.error.code,'main-unavailable')}
 else{r.ch.detach();await p}
 assert.throws(()=>r.respond(),/stale|forbidden/);assert.equal(r.slots.used,0);assert.equal(r.ch.pending.size,0);console.log('REFUTED channel double-release '+order+' used=0 pending=0')
}
console.log('all independent slot/channel probes completed')
