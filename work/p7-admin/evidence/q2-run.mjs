// Run directly with node. Real start.mjs host; no auth file is read.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, appendFileSync, copyFileSync, rmSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const evidence=dirname(fileURLToPath(import.meta.url)), sdk='/home/lingxufeng/bot/app/sdk', reap='/home/lingxufeng/bot/scripts/bot-reap'
const root=mkdtempSync('/tmp/bot-q2-schedule-'), home=join(root,'runtime'), osHome=join(root,'home')
for(const p of [home,osHome,join(root,'workspace'),join(home,'fake','scripts'),join(home,'gates')])mkdirSync(p,{recursive:true})
const out=join(evidence,'q2-results.jsonl');writeFileSync(out,'')
const emit=(tag,value)=>{appendFileSync(out,JSON.stringify({tag,at:new Date().toISOString(),value})+'\n');console.log(tag,JSON.stringify(value))}
let seq=0,child,currentPid,bootCount=0
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(test,timeout=20000){const end=Date.now()+timeout;do{if(await test())return;await sleep(100)}while(Date.now()<end);throw new Error('condition timeout')}
async function cmd(op,params={}){
 const n=++seq,tmp=join(root,'command-tmp.json');writeFileSync(tmp,JSON.stringify({seq:n,op,...params}));renameSync(tmp,join(root,'command.json'))
 const p=join(root,`result-${n}.json`);await until(()=>existsSync(p));const result=JSON.parse(readFileSync(p,'utf8'));emit(op,result);return result
}
function script(gate=false){return {chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'Q2 probe'},{type:'block-end',index:0,block:{type:'text',text:'Q2 probe'}},{type:'finish',reason:'stop'}],paceMs:5,...gate?{gateAfterChunk:1,gateId:'hold'}:{}}}
writeFileSync(join(home,'fake','scripts','default.json'),JSON.stringify({calls:Array.from({length:30},()=>script())}))
const patch=join(root,'probe.yml')
writeFileSync(patch,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: scripted\n- insert:\n    - id: q2-fake\n      name: 'file://${sdk}/tests/support/fake/plugin.mjs'\n      config:\n        providers:\n          - id: p2fake\n            models:\n              - id: scripted\n                contextWindow: 131072\n    - id: q2-probe\n      name: 'file://${evidence}/q2-host-plugin.mjs'\n`)
async function boot(){
 if(existsSync(join(root,'probe-ready.json')))unlinkSync(join(root,'probe-ready.json'))
 const log=join(evidence,`q2-boot-${++bootCount}.log`);writeFileSync(log,'')
 child=spawn(process.execPath,[join(sdk,'scripts','start.mjs')],{cwd:root,env:{PATH:process.env.PATH,HOME:osHome,PBOTS_DATA_DIR:join(root,'data'),P2SDK_HOME:home,P2SDK_HANDOFF:join(root,'handoff'),P2SDK_PORT:'0',P2SDK_PROVIDER:'mock',P2SDK_PATCH:patch,P2SDK_Q2_ROOT:root},stdio:['ignore','pipe','pipe']})
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>appendFileSync(log,b))
 await until(()=>{if(child.exitCode!==null)throw new Error('host exited; see '+log);return existsSync(join(root,'probe-ready.json'))},60000)
 const r=JSON.parse(readFileSync(join(root,'probe-ready.json'),'utf8'));currentPid=r.pid;emit('boot',r)
}
async function stop(){
 if(existsSync(join(root,'command.json')))unlinkSync(join(root,'command.json'))
 const targets=[currentPid,child?.pid].filter(Boolean).map(String)
 if(targets.length)execFileSync(reap,targets,{cwd:root,encoding:'utf8',timeout:25000});currentPid=undefined
}
const claims=()=>existsSync(join(root,'claims.jsonl'))?readFileSync(join(root,'claims.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]
const history=async(sessionId,id)=>(await cmd('history',{request:{sessionId,id,limit:100}})).value
try{
 emit('runtime-root',root);await boot()
 const session=(await cmd('session',{cwd:join(root,'workspace')})).value;assert(session?.sessionId);const sid=session.sessionId
 const bad=await cmd('create',{sessionId:sid,request:{title:'every two seconds',prompt:'Q2',every_seconds:2}});assert.equal(bad.ok,false);assert.equal(bad.error.code,'frequency_too_high')
 const once=(await cmd('create',{sessionId:sid,request:{title:'two second delivery',prompt:'Q2-after',after_seconds:2}})).value
 await until(()=>claims().some(c=>c.agentId===sid&&c.message?.source?.kind==='schedule'),15000)
 const onceHistory=await history(sid,once.id);assert.equal(onceHistory.records.length,1);emit('once-claim',claims().find(c=>c.message?.source?.kind==='schedule'))
 await cmd('delete',{request:{sessionId:sid,id:once.id}})
 const recurring=(await cmd('create',{sessionId:sid,request:{title:'real minute recurrence',prompt:'Q2-recurring',every_seconds:60}})).value
 writeFileSync(join(home,'fake','scripts',`${sid}.json`),JSON.stringify({calls:[script(),script(true),...Array.from({length:10},()=>script())]}))
 await sleep(122000)
 const during=await cmd('inspect',{sessionId:sid}),overlapHistory=await history(sid,recurring.id);emit('overlap',{agent:during.value,history:overlapHistory})
 assert.equal(during.value.status,'running');assert.equal(overlapHistory.records.length,2)
 const deleted=await cmd('delete',{request:{sessionId:sid,id:recurring.id}});assert.equal(deleted.value.deleted,true)
 writeFileSync(join(home,'gates','hold'),'');await sleep(63000)
 const catalog=(await cmd('catalog')).value;assert.equal(catalog.length,0)
 const recClaims=claims().filter(c=>c.message?.content?.some(b=>b.text?.includes('Q2-recurring')));emit('delete-observation',{seconds:63,recurringClaims:recClaims.length,catalog,claims:recClaims});assert.equal(recClaims.length,2)
 const persisted=(await cmd('create',{sessionId:sid,request:{title:'restart recovery',prompt:'Q2-restart',every_seconds:60}})).value
 emit('before-stop',persisted);await stop();emit('offline-start',{waitSeconds:125});await sleep(125000)
 await boot();await until(()=>claims().some(c=>c.message?.content?.some(b=>b.text?.includes('Q2-restart'))),20000)
 const restored=(await cmd('catalog')).value.find(t=>t.id===persisted.id);assert(restored)
 const recovered=await history(sid,persisted.id);assert.equal(recovered.records.length,1);assert.equal(recovered.records[0].scheduledAt,new Date(Date.parse(persisted.scheduledAt)+60000).toISOString())
 emit('restart-latest-only',{persisted,restored,history:recovered});await cmd('delete',{request:{sessionId:sid,id:persisted.id}})
 emit('PASS',{every2:'rejected as expected',every60:'delivered twice while first model turn blocked',restart:'latest missed only',deleted:'no new recurrence after delete'})
}catch(e){emit('FAIL',{message:e.message,stack:e.stack});process.exitCode=1}
finally{
 try{await stop()}catch(e){emit('cleanup-error',e.message);process.exitCode=1}
 if(existsSync(join(root,'claims.jsonl')))copyFileSync(join(root,'claims.jsonl'),join(evidence,'q2-claims.jsonl'))
 rmSync(root,{recursive:true,force:true});emit('cleanup',execFileSync(reap,['--dry-run','--match','bot-q2-schedule-'],{encoding:'utf8'}))
}
