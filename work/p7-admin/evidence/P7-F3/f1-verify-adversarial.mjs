import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {HostRecovery} from './f1-verify-source/app/sdk/src/admin/host.mjs'
import {Reporter} from './f1-verify-source/app/sdk/src/orchestration/report.mjs'
import {Delivery} from './f1-verify-source/app/sdk/src/orchestration/delivery.mjs'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const root=mkdtempSync(join(tmpdir(),'bot-f3f1-adversarial-'))
writeFileSync(join(root,'bots.json'),JSON.stringify({version:1,mainBotId:'main',bots:{worker:{createdBy:'main'}}}))
const worker=()=>[{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:0,inserted:[{id:'pbots-assign:one',kind:'pbots-main'}]},{type:'turn/start',turn:1},{type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:1,inserted:[]},{type:'turn/end',turn:1,reason:'completed'}]
async function fixture(){
 const host=new HostRecovery(async()=>({issues:[]})),peer={};let ticket=host.attach(peer);await host.prepare(peer,ticket.challenge);host.complete(peer,ticket.challenge)
 const counts={followup:0,flush:0,read:0};const logs={main:[],worker:worker()};
 const agent={id:'main',status:'idle',inbox:{nextTurn:[],nextStep:[]},followup(m){counts.followup++;logs.main.push({type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:0,inserted:[{id:m.id,kind:'pbots-worker',items:m.source.items}]})}}
 const ctx={on:()=>()=>{},agents:{get:id=>id==='main'?agent:undefined},sessionPersistence:{async flush(){}}}
 const delivery=new Delivery(ctx,()=>host.current);delivery.readLog=async id=>{counts.read++;return logs[id]}
 const orch={ctx,config:{dataDir:root},get recovery(){return host.current},async agentOf(){return agent},delivery}
 const reporter=new Reporter(orch,{batchWindowMs:5});const flush=reporter.flush.bind(reporter);reporter.flush=(...args)=>{counts.flush++;return flush(...args)}
 return {host,peer,ctx,logs,counts,delivery,reporter,async next(open=true){ticket=host.attach(peer);if(open){await host.prepare(peer,ticket.challenge);host.complete(peer,ticket.challenge)}return ticket},close(){reporter.stop();host.stop()}}
}
try{
 // Actual Delivery.followup has occurred, but disk flush cannot confirm it. Deliberately do not record the effect in logs.
 const f=await fixture(),entered=Promise.withResolvers(),release=Promise.withResolvers();
 f.ctx.sessionPersistence.flush=async()=>{entered.resolve();await release.promise;throw new Error('injected persistence failure after followup')}
 const original=f.ctx.agents.get('main').followup;f.ctx.agents.get('main').followup=()=>{f.counts.followup++}
 const run=f.reporter.flush('boot').catch(e=>e);await entered.promise;await f.next();await Promise.all(Array.from({length:100},()=>f.reporter.flush('concurrent')));f.reporter.scheduleFlush();await sleep(15);release.resolve();const error=await run;assert.equal(error.unconfirmedStart,true);await sleep(40);assert.equal(f.counts.followup,1);assert.equal(f.reporter.reconcilePending,false);assert.equal(f.reporter.flushing,false);const stable=f.counts.flush;await sleep(40);assert.equal(f.counts.flush,stable);console.log('PASS real Delivery old followup=1, unconfirmedStart propagated; 100 concurrent triggers and pending window cause no replay/no busy loop');f.close()
 for(const mode of ['stop','dispose','third-generation','concurrent']){
  const f=await fixture(),entered=Promise.withResolvers(),release=Promise.withResolvers();let blocked=false
  const read=f.delivery.readLog;f.delivery.readLog=async id=>{if(!blocked){blocked=true;entered.resolve();await release.promise}return read(id)}
  let dispose;if(mode==='dispose')dispose=f.reporter.start()
  const old=mode==='dispose'?null:f.reporter.flush('boot');await entered.promise;await f.next();f.reporter.scheduleFlush();await sleep(15)
  await Promise.all(Array.from({length:50},()=>f.reporter.flush('concurrent')))
  let last;if(mode==='third-generation')last=await f.next(false)
  if(mode==='stop')f.reporter.stop();if(mode==='dispose')dispose()
  release.resolve();if(old)await old;await sleep(40)
  if(mode==='stop'||mode==='dispose'){
   await f.next();f.reporter.scheduleFlush();await f.reporter.flush('late');await sleep(20);assert.equal(f.counts.followup,0);assert.equal(f.reporter.timer,null)
  }else if(mode==='third-generation'){
   assert.equal(f.counts.followup,0);const before=f.counts.flush;await sleep(40);assert.equal(f.counts.flush,before);await f.host.prepare(f.peer,last.challenge);f.host.complete(f.peer,last.challenge);await sleep(40);assert.equal(f.counts.followup,1);await f.reporter.flush('manual');assert.equal(f.counts.followup,1)
  }else{assert.equal(f.counts.followup,1);await f.reporter.flush('manual');assert.equal(f.counts.followup,1)}
  const before=f.counts.flush;await sleep(40);assert.equal(f.counts.flush,before);console.log('PASS '+mode+' pending reconcile: followup='+f.counts.followup+'; no autonomous repeat; flushing='+f.reporter.flushing);f.close()
 }
}finally{rmSync(root,{recursive:true,force:true})}
