import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {HostRecovery} from './verify-source/app/sdk/src/admin/host.mjs'
import {Reporter} from './verify-source/app/sdk/src/orchestration/report.mjs'
import {Delivery} from './verify-source/app/sdk/src/orchestration/delivery.mjs'
const sleep=(ms=10)=>new Promise(r=>setTimeout(r,ms))
const root=mkdtempSync(join(tmpdir(),'bot-P7-F3-independent-'))
let failures=0
function result(name,actual,expected){console.log(JSON.stringify({name,actual,expected,result:actual===expected?'PASS':'FAIL'}));if(actual!==expected)failures++}
writeFileSync(join(root,'bots.json'),JSON.stringify({version:1,mainBotId:'main',bots:{worker:{createdBy:'main'}}}))
try{
 for(const checkpoint of ['main-agent','main-log','worker-log']){
  const host=new HostRecovery(async()=>({issues:[]}));const p={};let handoff=host.attach(p);await host.prepare(p,handoff.challenge);host.complete(p,handoff.challenge)
  const entered=Promise.withResolvers(),release=Promise.withResolvers();let sends=0,wakes=0
  const logs={main:[],worker:[{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:0,inserted:[{id:'pbots-assign:one',kind:'pbots-main'}]},{type:'turn/start',turn:1},{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:1,inserted:[]},{type:'turn/end',turn:1,reason:'completed'}]}
  const agent={id:'main',status:'idle',inbox:{nextTurn:[],nextStep:[]}}
  const orch={ctx:{on:()=>()=>{},agents:{get:()=>undefined}},config:{dataDir:root},get recovery(){return host.current},async agentOf(){if(checkpoint==='main-agent'){entered.resolve();await release.promise}return agent},delivery:{async readLog(id){if(checkpoint===(id==='main'?'main-log':'worker-log')){entered.resolve();await release.promise}return logs[id]},async send(){sends++},wake(){wakes++}}}
  const reporter=new Reporter(orch,{batchWindowMs:5});const run=reporter.flush('boot');await entered.promise;host.attach({});release.resolve();await run
  result('old lease canceled at '+checkpoint+': send+wake',sends+wakes,0);reporter.stop();host.stop()
 }
 // Valid new lease completes while old read is blocked past the collection window.
 const host=new HostRecovery(async()=>({issues:[]}));const peer={};let h=host.attach(peer);await host.prepare(peer,h.challenge);host.complete(peer,h.challenge)
 const entered=Promise.withResolvers(),release=Promise.withResolvers();let reads=0,sends=0
 const logs={main:[],worker:[{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:0,inserted:[{id:'pbots-assign:one',kind:'pbots-main'}]},{type:'turn/start',turn:1},{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:1,inserted:[]},{type:'turn/end',turn:1,reason:'completed'}]}
 const agent={id:'main',status:'idle',inbox:{nextTurn:[],nextStep:[]}}
 const orch={ctx:{on:()=>()=>{},agents:{get:()=>undefined}},config:{dataDir:root},get recovery(){return host.current},async agentOf(){return agent},delivery:{async readLog(id){if(++reads===1){entered.resolve();await release.promise}return logs[id]},async send(){sends++},wake(){}}}
 const reporter=new Reporter(orch);const old=reporter.flush('boot');await entered.promise
 h=host.attach(peer);await host.prepare(peer,h.challenge);host.complete(peer,h.challenge);reporter.scheduleFlush();await sleep(2100);release.resolve();await old;await sleep(25)
 result('new completed lease automatically reports after old in-flight flush cancellation',sends,1)
 await reporter.flush('manual-control');result('positive control: explicit flush can deliver the valid new generation',sends,1)
 reporter.stop();host.stop()
 // Actual Delivery holds/readLog, each await fences the captured permit.
 for(const stage of ['flush','open','read','close']){
  const hst=new HostRecovery(async()=>({issues:[]}));const peer={};const hand=hst.attach(peer);await hst.prepare(peer,hand.challenge);hst.complete(peer,hand.challenge)
  const entered=Promise.withResolvers(),release=Promise.withResolvers();let calls=0,followups=0
  const at=async name=>{if(name===stage){entered.resolve();await release.promise}}
  const agent={id:'main',inbox:{nextTurn:[],nextStep:[]},followup(){followups++}}
  const ctx={agents:{get:()=>agent},sessionPersistence:{async flush(){if(++calls===1)await at('flush')},async open(){await at('open');return{async read(){await at('read');return{events:[]}},async close(){await at('close')}}}}}
  const delivery=new Delivery(ctx,()=>hst.current);const sent=delivery.send(agent,{id:'pbots-report:x',source:{kind:'pbots-worker'}}).catch(e=>e)
  await entered.promise;hst.attach({});release.resolve();const outcome=await sent
  result('real Delivery '+stage+' cancellation: followup',followups,0);assert(outcome instanceof Error);hst.stop()
 }
}finally{rmSync(root,{recursive:true,force:true})}
console.log('CONFIRMED_FAILURES',failures);process.exitCode=failures?1:0
