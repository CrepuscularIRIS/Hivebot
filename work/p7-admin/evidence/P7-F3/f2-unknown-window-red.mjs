import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {HostRecovery} from '/tmp/bot-wt/P7-F3/app/sdk/src/admin/host.mjs'
import {Reporter} from '/tmp/bot-wt/P7-F3/app/sdk/src/orchestration/report.mjs'
import {Delivery} from '/tmp/bot-wt/P7-F3/app/sdk/src/orchestration/delivery.mjs'
const root=mkdtempSync(join(tmpdir(),'bot-f3f1-unknown-window-'));const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const host=new HostRecovery(async()=>({issues:[]}));const peer={};let reporter
try{
 writeFileSync(join(root,'bots.json'),JSON.stringify({version:1,mainBotId:'main',bots:{worker:{createdBy:'main'}}}))
 let h=host.attach(peer);await host.prepare(peer,h.challenge);host.complete(peer,h.challenge)
 const entered=Promise.withResolvers(),release=Promise.withResolvers();let followups=0,flushes=0
 const agent={id:'main',status:'idle',inbox:{nextTurn:[],nextStep:[]},followup(){followups++}}
 const logs={main:[],worker:[{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:0,inserted:[{id:'pbots-assign:one',kind:'pbots-main'}]},{type:'turn/start',turn:1},{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:1,inserted:[]},{type:'turn/end',turn:1,reason:'completed'}]}
 const ctx={on:()=>()=>{},agents:{get:id=>id==='main'?agent:undefined},sessionPersistence:{async flush(){if(++flushes===1){entered.resolve();await release.promise;throw new Error('unknown post-followup disk confirmation')}}}}
 const delivery=new Delivery(ctx,()=>host.current);delivery.readLog=async id=>logs[id]
 const orch={ctx,config:{dataDir:root},get recovery(){return host.current},async agentOf(){return agent},delivery}
 reporter=new Reporter(orch);assert.equal(reporter.batchWindowMs,2000)
 const old=reporter.flush('boot').catch(e=>e);await entered.promise;assert.equal(followups,1)
 h=host.attach(peer);await host.prepare(peer,h.challenge);host.complete(peer,h.challenge);reporter.scheduleFlush()
 release.resolve();const error=await old;assert.equal(error.unconfirmedStart,true);assert.notEqual(reporter.timer,null)
 console.log('old followup=1; unconfirmedStart=true; current lease open; recovery-complete default 2s timer still pending')
 await sleep(2150)
 console.log(JSON.stringify({expectedAutomaticFollowups:1,actualAutomaticFollowups:followups,flushes,timer:reporter.timer,result:followups===1?'PASS':'FAIL'}))
 assert.equal(followups,1,'unknown old external effect must not be replayed by already-scheduled recovery window')
}finally{reporter?.stop();host.stop();rmSync(root,{recursive:true,force:true})}
