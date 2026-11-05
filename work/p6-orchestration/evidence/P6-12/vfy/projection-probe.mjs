import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as current from '/tmp/bot-wt/P6-12/app/sdk/src/orchestration/delivery.mjs'
import { computeDue } from '/tmp/bot-wt/P6-12/app/sdk/src/orchestration/pending.mjs'
const root='/tmp/bot-wt/P6-12'
const before=execFileSync('git',['-C',root,'show','9906bcb:app/sdk/src/orchestration/delivery.mjs'],{encoding:'utf8'})
const after=readFileSync(root+'/app/sdk/src/orchestration/delivery.mjs','utf8')
assert.equal(before.slice(before.indexOf('export class Delivery')),after.slice(after.indexOf('export class Delivery')))
const old=await import('data:text/javascript;base64,'+Buffer.from(before).toString('base64'))
const events=[
 {seq:0,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[{id:'pbots-assign:a',source:{kind:'pbots-main'}}]}},
 {seq:1,type:'turn/start',data:{turn:1}},
 {seq:2,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}},
 {seq:3,type:'user/message',data:{id:'pbots-assign:a',source:{kind:'pbots-main'},content:[{type:'text',text:'work'}]}},
 {seq:4,type:'tool/call',data:{turn:1,callId:'c',name:'read'}},
 {seq:5,type:'tool/result',data:{turn:1,message:{toolCallId:'c',content:[{type:'text',text:'tool'}]}}},
 {seq:6,type:'assistant/message',data:{turn:1,message:{content:[{type:'text',text:'a'},{type:'thinking',text:'not public'},{type:'text',text:'b'}]}}},
 {seq:7,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
 {seq:8,type:'approval/asked',data:{id:'ask'}},
 {seq:9,type:'approval/decided',data:{id:'ask',outcome:'allowed-once'}},
 {seq:10,type:'step/start',data:{turn:1,step:1}},
 {seq:11,type:'step/end',data:{turn:1,step:1}},
 {seq:12,type:'unknown',data:{}}
]
const snapshot=JSON.stringify(events)
for(const event of events) {
 const now=current.projectEvent(event), prev=old.projectEvent(event)
 if(event.type==='assistant/message') assert.deepEqual(now,{...prev,turn:1,text:'ab'})
 else assert.deepEqual(now,prev)
}
assert.equal(JSON.stringify(events),snapshot)
const due=(project)=>computeDue({mainId:'m',mainEvents:[],workers:[{workerId:'w',idle:true,events:events.map(project)}]})
assert.deepEqual(due(current.projectEvent),due(old.projectEvent))
console.log('PASS: Delivery class byte-identical to 9906bcb; 12 other event projections unchanged; assistant text-only projection pure; computeDue keys/outcomes unchanged')
