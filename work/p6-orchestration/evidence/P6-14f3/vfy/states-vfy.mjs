import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,unlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {resolveWorkerStatus,registerEnvelope,registerWorkerRestriction} from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs';
const root=mkdtempSync('/tmp/bot-p614f3-vfy-states-');
const file=join(root,'bots.json');
const doc=bots=>({version:1,mainBotId:'m',recipes:{},...(bots===undefined?{}:{bots})});
try{
 const cases=[['missing',undefined,'unknown'],['bad-json','{broken','unknown'],['json-null','null','unknown'],['no-version','{}','unknown'],['v2',JSON.stringify({...doc({}),version:2}),'unknown'],['string-v1',JSON.stringify({...doc({}),version:'1'}),'unknown'],['bots-null',JSON.stringify(doc(null)),'unknown'],['bots-array',JSON.stringify(doc([])),'unknown'],['bots-number',JSON.stringify(doc(1)),'unknown'],['no-bots',JSON.stringify(doc()),'main'],['empty-bots',JSON.stringify(doc({})),'main'],['empty-createdBy',JSON.stringify(doc({m:{createdBy:''}})),'main'],['missing-record',JSON.stringify(doc({w:{createdBy:'m'}})),'main'],['worker-even-main-collision',JSON.stringify(doc({m:{createdBy:'other'}})),'worker']];
 for(const [name,text,status] of cases){
   if(text===undefined){try{unlinkSync(file)}catch{}}else writeFileSync(file,text);
   assert.equal(resolveWorkerStatus('m',root),status,name);
   let guard;registerEnvelope({on:(_,fn)=>{guard=fn;return()=>{}}},{config:{dataDir:root}});
   const verdict=await guard({agent:{id:'m'},name:'create_bot',arguments:{}},()=>({kind:'pass'}));
   assert.equal(verdict.kind,status==='main'?'pass':'deny',name);
   console.log(JSON.stringify({name,status,create:verdict.kind}));
 }
 for(const event of ['session/created','agent/created','tools/pre-execute']){
   unlinkSync(file);
   let layers=0,lifts=0;const agent={id:'m',ctx:{tools:{restrict(){layers++;return()=>{lifts++;layers--}}}}};
   const listeners=new Map();const ctx={agents:{list:()=>[agent]},tools:{definitions:()=>[{name:'job_list'}]},on:(e,fn)=>{listeners.set(e,fn);return()=>{}}};
   const off=registerWorkerRestriction(ctx,{config:{dataDir:root}});assert.equal(layers,1);
   writeFileSync(file,JSON.stringify(doc()));
   if(event==='session/created')listeners.get(event)({header:{}});
   if(event==='agent/created')listeners.get(event)({agent:{id:'new'}});
   if(event==='tools/pre-execute')await listeners.get(event)({agent,name:'read'},()=>({kind:'pass'}));
   assert.equal(lifts,1,event);assert.equal(layers,0,event);off();
   console.log(JSON.stringify({recoveryHook:event,lifts,layers}));
 }
 writeFileSync(file,JSON.stringify(doc({m:{createdBy:'other'}})));
 let lifted=0;const worker={id:'m',ctx:{tools:{restrict:()=>()=>{lifted++}}}};const listeners=new Map();
 const off=registerWorkerRestriction({agents:{list:()=>[worker]},tools:{definitions:()=>[{name:'job_list'}]},on:(e,fn)=>{listeners.set(e,fn);return()=>{}}},{config:{dataDir:root}});
 listeners.get('session/created')({header:{}});listeners.get('agent/created')({agent:worker});await listeners.get('tools/pre-execute')({agent:worker,name:'read'},()=>({kind:'pass'}));assert.equal(lifted,0);off();
 console.log('real worker restriction never lifted at any of 3 hooks; PASS');
}finally{rmSync(root,{recursive:true,force:true})}
