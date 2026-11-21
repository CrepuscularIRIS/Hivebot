import { createRequire } from 'node:module'
import { realpathSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { recoverAssignments, HostRecovery } from './f1-verify-source/app/sdk/src/admin/host.mjs'
import { Delivery } from './f1-verify-source/app/sdk/src/orchestration/delivery.mjs'
import { foldAssignments } from './f1-verify-source/app/sdk/src/orchestration/assignment.mjs'
const require=createRequire(realpathSync(new URL('./f1-verify-source/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js',import.meta.url)))
const {SESSION_FORMAT_VERSION}=await import(pathToFileURL(require.resolve("@deepseek-ai/dsh-session")))
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const jsonl=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')))
const root=mkdtempSync(join(tmpdir(),'bot-P7-F3-native-'))
let ctx
async function backend(){const c=new Context();await c.plugin(jsonl,{root:join(root,'sessions'),compression:'none'});let p;await c.plugin(Object.assign((inner)=>{p=inner.sessionPersistence},{inject:['sessionPersistence']}));return {ctx:c,p}}
try {
 let first=await backend();ctx=first.ctx
 const h=await first.p.create({version:SESSION_FORMAT_VERSION,id:'worker',createdAt:1,delegationDepth:0,isSeeded:false})
 const events=[
 {type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[{id:'pbots-assign:old',role:'user',content:[{type:'text',text:'synthetic task'}],source:{kind:'pbots-main',form:'relay',assignmentId:'old',mainBotId:'main'}}]}},
 {type:'turn/start',data:{turn:1}},
 {type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}},
 {type:'step/start',data:{turn:1,step:1}},
 {type:'assistant/message',surfaceOp:'append',data:{turn:1,step:1,message:{id:'a',role:'assistant',source:{kind:'model',provider:'verify-fake',model:'verify-fake'},content:[{type:'tool-call',id:'external',name:'bash',arguments:'{"command":"FAKE-NOT-EXECUTED"}'}]}}},
 {type:'tool/call',data:{turn:1,step:1,callId:'external',name:'bash',arguments:'{"command":"FAKE-NOT-EXECUTED"}'}},
 ].map((e,seq)=>({...e,seq,time:1}))
 await h.append(events);await h.close();await first.p.flush();await ctx.fiber.dispose();ctx=undefined
 const second=await backend();ctx=second.ctx
 const c={sessionPersistence:second.p,agents:{get:()=>undefined}}
 const delivery=new Delivery(c);const orch={ctx:c,config:{dataDir:root},delivery,agentOf(){throw new Error('resume forbidden')}}
 writeFileSync(join(root,'bots.json'),JSON.stringify({version:1,mainBotId:'main',bots:{worker:{createdBy:'main'}}}))
 assert.equal(foldAssignments(await delivery.readLog('worker')).assignments.get('old').ended,undefined)
 const host=new HostRecovery(s=>recoverAssignments(orch,s));const peer={};let ticket=host.attach(peer)
 const summary=await host.prepare(peer,ticket.challenge)
 assert.deepEqual(summary.interrupted,[{sessionId:'worker',assignmentId:'old'}]);host.complete(peer,ticket.challenge)
 assert.equal(host.current.open,true)
 let reader=await second.p.open('worker','read');let raw=(await reader.read(0)).events;await reader.close()
 assert.equal(raw.find(e=>e.type==='tool/result').data.error.code,'TOOL_OUTCOME_UNKNOWN')
 assert.equal(foldAssignments(await delivery.readLog('worker')).assignments.get('old').ended,'interrupted')
 assert.deepEqual((await recoverAssignments(orch,new AbortController().signal)).interrupted,[])
 const old=ticket;host.detach(peer);ticket=host.attach(peer)
 assert.throws(()=>host.complete(peer,old.challenge),/stale/);await host.prepare(peer,ticket.challenge);host.complete(peer,ticket.challenge);host.stop()
 console.log('PASS real JSONL cold orphan: native closers durable; unknown external outcome; zero agent resolution; idempotent reread; old challenge rejected')
 writeFileSync(join(root,'bots.json'),JSON.stringify({version:1,mainBotId:'main',bots:{worker:{createdBy:'foreign'}}}))
 const bad=new HostRecovery(s=>recoverAssignments(orch,s));const b=bad.attach(peer);const result=await bad.prepare(peer,b.challenge)
 assert.equal(result.issues[0].reason,'unmatched-main');assert.throws(()=>bad.complete(peer,b.challenge),/not restored/);bad.stop()
 console.log('PASS real JSONL bad relationship: issue returned; recoveryComplete refused; gate closed')
 await ctx.fiber.dispose();ctx=undefined
 const third=await backend();ctx=third.ctx
 const persisted=new Delivery({sessionPersistence:third.p,agents:{get:()=>undefined}})
 assert.equal(foldAssignments(await persisted.readLog('worker')).assignments.get('old').ended,'interrupted')
 console.log('PASS provider disposal/reopen: interrupted Assignment read from actual disk')
}finally{await ctx?.fiber.dispose();rmSync(root,{recursive:true,force:true})}
