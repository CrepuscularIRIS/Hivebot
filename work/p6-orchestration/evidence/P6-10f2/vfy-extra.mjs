import assert from 'node:assert/strict'
import {mkdir, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
const WT='/tmp/bot-wt/P6-10f2', TMP='/tmp/bot-p610f2-vfy'
const {registerCreateBot}=await import(WT+'/app/sdk/src/orchestration/create.mjs')
const {CreateChannel}=await import(WT+'/app/sdk/src/orchestration/main-channel.mjs')
const {Slots}=await import(WT+'/app/sdk/src/orchestration/slots.mjs')
const require=createRequire(WT+'/app/ui/package.json')
const esbuild=require(WT+'/app/ui/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild')
await esbuild.build({stdin:{contents:`export {createWorkerBot} from '${WT}/app/ui/main/m3-meta/orchestrate.ts'; export {BotsMetaStore} from '${WT}/app/ui/main/m3-meta/store.ts'`,resolveDir:WT},bundle:true,platform:'node',format:'cjs',outfile:TMP+'/main.cjs'})
const {createWorkerBot,BotsMetaStore}=require(TMP+'/main.cjs')
const wait=async fn=>{const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw Error('barrier timeout');await new Promise(r=>setTimeout(r,1))}}
let n=0
async function rig(){
 const dir=join(TMP,'extra-'+n++);await mkdir(dir,{recursive:true})
 await writeFile(join(dir,'bots.json'),JSON.stringify({version:1,mainBotId:'main',recipes:{},bots:{w:{createdBy:'main'}}}))
 let tool;const ctx={tools:{register(d){tool=d}},sessionPersistence:{flush:async()=>{}},on(){return ()=>{}}}
 const channel=new CreateChannel({timeoutMs:5000}),sub={peer:'p',queue:[],wake:null};channel.attach(sub)
 const slots=new Slots(3),orch={config:{dataDir:dir},slots,channel,agentOf:async()=>({id:'w'}),delivery:{send:async()=>{}}}
 registerCreateBot(ctx,orch)
 return {tool,channel,sub,slots,orch,dir,start:()=>tool.execute({name:'worker',prompt:'task'},{agent:{id:'main'}})}
}
const a=await rig()
for(let i=0;i<3;i++){
 const p=a.start().catch(e=>e);await wait(()=>a.sub.queue.length===i+1);assert.equal(a.slots.used,1)
 a.channel.respond(a.sub.queue[i].requestId,{error:null},'p');const e=await p
 assert.equal(e.code,'main-unavailable');assert.equal(e.details.outcome,'unknown');assert.equal(e.details.reason,'invalid-response');assert.equal(a.slots.used,0)
 console.log('A2 iteration='+i+' '+JSON.stringify({code:e.code,details:e.details,used:a.slots.used}))
}
const fourth=a.start();await wait(()=>a.sub.queue.length===4);a.channel.respond(a.sub.queue[3].requestId,{value:{sessionId:'w'}},'p');assert.equal((await fourth).sessionId,'w');console.log('A2 fourth create succeeds')
// Explicit strict flag in the CHILDREN, not just their parent.
for(const file of ['null-child.cjs','rpc-child.cjs']){
 const c=spawnSync(process.execPath,['--unhandled-rejections=strict','/tmp/bot-p610f2-rerun/'+file],{env:{HOME:TMP+'/home',PATH:process.env.PATH},encoding:'utf8',timeout:15000})
 assert.equal(c.status,0,c.stderr);console.log('STRICT '+file+' exit='+c.status+' '+c.stdout.trim())
}
// Actual main workspace failure -> SDK tool error, rather than a fabricated channel message.
const b=await rig(),blocked=join(b.dir,'blocked-data');await writeFile(blocked,'not a directory')
const bp=b.start().catch(e=>e);await wait(()=>b.sub.queue.length===1)
const mainError=await createWorkerBot({rpc:async()=>{throw Error('must not RPC')}},{read:()=>({mainBotId:'main'})},b.sub.queue[0],{dataDir:blocked})
assert.equal(mainError.ok,false);b.channel.respond(b.sub.queue[0].requestId,{error:mainError.error},'p');const err=await bp
assert.ok(err.message.includes('ENOTDIR'));assert.ok(!err.message.includes(TMP));assert.match(err.message,/<path>\/workspaces\/[^\s"']+/);assert.deepEqual(err.details,{})
console.log('C1 real ENOTDIR message='+err.message+' details='+JSON.stringify(err.details))
// Additional bad path: session/create fails with structured details; preserve the result for inspection.
const c=await rig(),store=new BotsMetaStore(c.dir);await store.init();await store.patchMainBotId('main')
const cp=c.start().catch(e=>e);await wait(()=>c.sub.queue.length===1)
const secretPath=join(c.dir,'private-data','sessions','worker.json')
const failed=await createWorkerBot({rpc:async()=>({ok:false,error:{code:'storage',message:'read failed '+secretPath,details:{path:secretPath,nested:{cause:'ENOTDIR '+secretPath}}}})},store,c.sub.queue[0],{dataDir:c.dir})
c.channel.respond(c.sub.queue[0].requestId,{error:failed.error},'p');const ce=await cp
assert.ok(!ce.message.includes(TMP));assert.ok(JSON.stringify(ce.details).includes(secretPath));console.log('C1 DETAILS_UNREDACTED '+JSON.stringify({message:ce.message,details:ce.details}));store.close()
// Successful create + failed rename goes into output.render, hence is directly model-visible.
const d=await rig(),ds=new BotsMetaStore(d.dir);await ds.init();await ds.patchMainBotId('main')
const dp=d.start();await wait(()=>d.sub.queue.length===1)
const renamePath=join(d.dir,'private-data','sessions','worker.json')
const success=await createWorkerBot({rpc:async(method,args)=>method==='session/create'?{ok:true,value:{sessionId:args.request.sessionId}}:{ok:false,error:{code:'storage',message:'ENOTDIR rename '+renamePath}}},ds,d.sub.queue[0],{dataDir:d.dir})
d.channel.respond(d.sub.queue[0].requestId,{value:success.value},'p');const dv=await dp
const rendered=d.tool.output.render({},dv);assert.ok(JSON.stringify(rendered).includes(renamePath));console.log('C1 MODEL_VISIBLE_WARN_UNREDACTED '+JSON.stringify(rendered));ds.close()
console.log('EXTRA PROBES COMPLETE (details/warn leaks confirmed)')
