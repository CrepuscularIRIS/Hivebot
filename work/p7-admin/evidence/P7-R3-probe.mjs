// P7-R3 local installed-host probe. NOT a product deletion journey.
// Upstream MIT: https://github.com/deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, readlinkSync, symlinkSync, existsSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
const repo='/home/lingxufeng/bot', wt='/tmp/bot-wt/P7-R3', sdk=join(repo,'app/sdk')
const sha='fb1517a6c5785f01d556d6324313b904a083f8c0'
assert.equal(execFileSync('git',['-C',wt,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sha)
// Main's already-installed launcher is used without modifying/linking node_modules.
// Refuse source drift from the detached task tree, including every SDK source/profile/support file.
function sourceInventory(base) {
 const rows=[]
 for(const d of ['src','profile','scripts','examples/lib','tests/support/fake']) walk(join(base,d),d)
 function walk(p,r){for(const n of readdirSync(p).sort()){const q=join(p,n),s=lstatSync(q),k=join(r,n);if(s.isDirectory())walk(q,k);else if(s.isFile())rows.push([k,hash(readFileSync(q))]);else if(s.isSymbolicLink())rows.push([k,readlinkSync(q)])}}
 return rows
}
const hash=b=>createHash('sha256').update(b).digest('hex')
const sourceBefore=sourceInventory(sdk)
assert.deepEqual(sourceBefore,sourceInventory(join(wt,'app/sdk')))
const {connect}=await import(pathToFileURL(join(sdk,'examples/lib/client.mjs')))
const root=mkdtempSync('/tmp/bot-P7-R3-'), home=join(root,'home'), runtime=join(root,'runtime'), workspace=join(root,'workspace'), handoff=join(root,'handoff')
for(const p of [home,runtime,workspace,handoff,join(root,'tmp'),join(root,'data'),join(workspace,'subdir'),join(workspace,'empty'),join(workspace,'.hidden')])mkdirSync(p,{recursive:true})
writeFileSync(join(workspace,'binary.bin'),Buffer.from([0,255,128,1,0,13,10]))
writeFileSync(join(workspace,'.hidden','keep'),'hidden fixture\n')
writeFileSync(join(workspace,'subdir','中文.txt'),'nested fixture\n')
symlinkSync('subdir/中文.txt',join(workspace,'link'))
function inventory(p){const out=[];function walk(q){const s=lstatSync(q),r=relative(p,q)||'.';if(s.isSymbolicLink())out.push({path:r,type:'symlink',target:readlinkSync(q)});else if(s.isDirectory()){out.push({path:r,type:'directory'});for(const n of readdirSync(q).sort())walk(join(q,n))}else if(s.isFile())out.push({path:r,type:'file',bytes:s.size,sha256:hash(readFileSync(q))});else out.push({path:r,type:'other',mode:s.mode})}walk(p);return out}
const before=inventory(workspace)
const summary={task:'P7-R3',base:sha,scope:'installed host RPC; native sessions + createdBy fixture, NOT M3/UI deletion',sourceMirrorDigest:hash(JSON.stringify(sourceBefore)),checks:[],observations:[],stages:[],inventoryBefore:before}
const check=(name,yes)=>{assert(yes,name);summary.checks.push(name)}
const observer=join(root,'observer.mjs'), hot=join(root,'hot.mjs'), patch=join(root,'probe.yml')
writeFileSync(hot,`import {appendFileSync} from 'node:fs';export const name='p7-r3-hot';export function apply(ctx){appendFileSync(process.env.P2SDK_R3_ROOT+'/hot.jsonl',JSON.stringify({kind:'apply'})+'\\n');ctx.effect(()=>()=>appendFileSync(process.env.P2SDK_R3_ROOT+'/hot.jsonl',JSON.stringify({kind:'dispose'})+'\\n'))}\n`)
writeFileSync(observer,`import {existsSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {Delivery} from ${JSON.stringify(pathToFileURL(join(sdk,'src/orchestration/delivery.mjs')).href)}
export const name='p7-r3-observer';export const inject=['agents','sessions','sessionController','sessionPersistence','workspaceRegistry']
export function apply(ctx){
 const root=process.env.P2SDK_R3_ROOT, stage=process.env.P2SDK_R3_STAGE, delivery=new Delivery(ctx)
 const log=x=>appendFileSync(root+'/'+stage+'-events.jsonl',JSON.stringify(x)+'\\n')
 ctx.on('session/event',(s,e)=>log({sid:s.id,type:e.type,reason:e.reason??e.data?.reason}))
 ctx.on('workspace/session-stop',({sessionId})=>{log({kind:'stop',sid:sessionId,archivedAtDispatch:ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)});if(existsSync(root+'/fail-stop')&&readFileSync(root+'/fail-stop','utf8')===sessionId){log({kind:'stop-failure-injected',sid:sessionId});throw Error('P7_R3_SYNTHETIC_STOP_FAILURE')}})
 let busy=false
 const timer=setInterval(async()=>{if(busy||!existsSync(root+'/command.json'))return;const c=JSON.parse(readFileSync(root+'/command.json','utf8')),file=root+'/result-'+c.seq+'.json';if(existsSync(file))return;busy=true;try{let value;if(c.op==='state')value={archived:[...ctx.workspaceRegistry.archivedSessionIds],hmr:!!ctx.get('hmr')};else if(c.op==='log')value=await delivery.readLog(c.sid);else if(c.op==='hmr')value=await ctx.get('hmr').runExclusive(()=>ctx.get('hmr').reconcileProfile());else if(c.op==='digest'){await ctx.sessionPersistence.flush();const h=await ctx.sessionPersistence.open(c.sid,'read');try{const all=[];for(let i=0;;){const {events}=await h.read(i,512);if(!events.length)break;all.push(...events);i+=events.length}value={events:all.length,sha256:createHash('sha256').update(JSON.stringify(all)).digest('hex')}}finally{await h.close()}}else if(c.op==='followup'){const r=await ctx.sessionController.resolveAgent(c.sid);if('error'in r)throw r.error;value=await delivery.send(r.agent,{id:'p7-r3-'+c.seq,source:{kind:'pbots-main',assignmentId:'p7-r3-fixture',mainBotId:'fixture-main'},content:[{type:'text',text:'late followup probe'}]})}else throw Error('unknown probe op');writeFileSync(file,JSON.stringify({ok:true,value}))}catch(e){writeFileSync(file,JSON.stringify({ok:false,error:String(e)}))}finally{busy=false}},25)
 ctx.effect(()=>()=>clearInterval(timer))
}
`)
function writePatch(noHmr=false){writeFileSync(patch,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- id: hmr\n  config:\n    base: '${root}'\n    root: ['${hot}']\n${noHmr?'- id: hmr\n  disabled: true\n':''}- insert:\n    - id: p7-r3-fake\n      name: '${pathToFileURL(join(sdk,'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p7-r3-observer\n      name: '${pathToFileURL(observer).href}'\n    - id: p7-r3-hot\n      name: '${pathToFileURL(hot).href}'\n`)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,label,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await sleep(50)}throw Error('timeout: '+label)}
let child,client,stage,workspaceStream,seq=0
const readLines=p=>existsSync(p)?readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]
const events=()=>readLines(join(root,stage+'-events.jsonl'))
const requests=()=>readLines(join(runtime,'fake/requests.jsonl'))
async function command(op,sid){const n=String(++seq),file=join(root,'result-'+n+'.json');writeFileSync(join(root,'command.json'),JSON.stringify({seq:n,op,sid}));await until(()=>existsSync(file),op);const r=JSON.parse(readFileSync(file,'utf8'));assert(r.ok,r.error);return r.value}
async function boot(label,noHmr=false){stage=label;writePatch(noHmr);let output='';child=spawn(process.execPath,[join(sdk,'scripts/start.mjs')],{cwd:wt,env:{PATH:process.env.PATH,HOME:home,TMPDIR:join(root,'tmp'),PBOTS_DATA_DIR:join(root,'data'),P2SDK_PROVIDER:'mock',P2SDK_HOME:runtime,P2SDK_HANDOFF:handoff,P2SDK_PORT:'0',P2SDK_PATCH:patch,P2SDK_R3_ROOT:root,P2SDK_R3_STAGE:stage,DSH_TELEMETRY_MODE:'DISABLED'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b});await until(()=>{if(child.exitCode!==null)throw Error('owned launcher early exit '+child.exitCode);return output.includes('[p2sdk] ready http')},'boot',60000);client=await connect({baseUrl:readFileSync(join(handoff,'base-url'),'utf8').trim(),token:readFileSync(join(handoff,'launch-token'),'utf8').trim()});summary.stages.push({label,ready:true});return()=>output}
async function stop(){workspaceStream?.cancel();workspaceStream=undefined;client?.close();client=undefined;if(!child)return;if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await until(()=>child.exitCode!==null||child.signalCode!==null,'owned launcher exit',15000);summary.stages.at(-1).exit={code:child.exitCode,signal:child.signalCode};child=undefined}
function text(s,gate){return {chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:s},{type:'block-end',index:0,block:{type:'text',text:s}},{type:'finish',reason:{kind:'stop'}}],...(gate?{gateAfterChunk:1,gateId:gate}:{})}}
function script(sid,calls){mkdirSync(join(runtime,'fake/scripts'),{recursive:true});writeFileSync(join(runtime,'fake/scripts',sid+'.json'),JSON.stringify({calls}))}
async function session(cwd=workspace,calls=[text('fixture history'),text('independent worker'),text('extra fixture')]){const {sessionId}=await client.call('session/create',{request:{cwd}});script(sessionId,calls);return sessionId}
async function prompt(sid){return client.call('session/prompt',{request:{requestId:randomUUID(),sessionId:sid,mode:'queue',content:[{type:'text',text:'local fixture only'}]}})}
async function ended(sid){await until(()=>events().some(r=>r.sid===sid&&r.type==='turn/end'),'turn/end')}
async function archive(sid,stopActivity){return client.call('workspace/archiveSession',{request:{sessionId:sid,...(stopActivity===undefined?{}:{stopActivity})}})}
async function unarchive(sid){return client.call('workspace/unarchiveSession',{request:{sessionId:sid}})}
async function refusal(fn,needle){try{await fn();throw Error('expected refusal '+needle)}catch(e){check(needle+' refusal',String(e).includes(needle))}}
try{
 const output=await boot('first');const workspaceFrames=[];workspaceStream=await client.socket.open('workspace/follow',{});void(async()=>{try{for await(const f of workspaceStream)workspaceFrames.push(f)}catch(e){summary.observations.push({kind:'workspace-stream-end',error:String(e)})}})();await until(()=>workspaceFrames.some(f=>f.type==='baseline'),'workspace baseline')
 const parent=await session(), a=await session(), b=await session(join(workspace,'subdir'))
 // Fixture mirrors ordinary session/create + external createdBy metadata; no subagent-origin header.
 writeFileSync(join(root,'data','bots.json'),JSON.stringify({version:1,mainBotId:parent,recipes:{},bots:{[a]:{createdBy:parent},[b]:{createdBy:parent}}}))
 for(const sid of [a,b]){await prompt(sid);await ended(sid)}
 const historyA=await command('log',a), historyB=await command('log',b), digestA=await command('digest',a),digestB=await command('digest',b);summary.observations.push({kind:'full-persistence-digests',root:digestA,subdir:digestB})
 check('both ordinary-session worker fixtures have native persisted history',historyA.length>0&&historyB.length>0)
 await refusal(()=>archive('p7-r3-unknown'),'session/not-found')
 await archive(a);await archive(b);await until(()=>workspaceFrames.some(f=>f.type==='archived'&&f.archivedSessionIds.includes(a)&&f.archivedSessionIds.includes(b)),'archive stream');check('workspace/follow publishes archived roster projection',true);check('full raw persisted history digests retained on archive',JSON.stringify(await command('digest',a))===JSON.stringify(digestA)&&JSON.stringify(await command('digest',b))===JSON.stringify(digestB))
 check('root and subdir native sessions archived', (await command('state')).archived.includes(a)&&(await command('state')).archived.includes(b))
 check('archive retains root history byte projection',JSON.stringify(await command('log',a))===JSON.stringify(historyA))
 check('archive retains subdir history byte projection',JSON.stringify(await command('log',b))===JSON.stringify(historyB))
 const listing=await client.call('session/list',{_request:{}})
 summary.observations.push({kind:'session-list-shape',keys:Object.keys(listing),archivedVisible:JSON.stringify(listing).includes(a)})
 const n=requests().filter(x=>x.sessionId===a).length
 await command('followup',a);await sleep(500)
 check('archived late followup invokes zero model requests',requests().filter(x=>x.sessionId===a).length===n);summary.observations.push({kind:'archived-followup-turn-reasons',reasons:(await command('log',a)).filter(e=>e.type==='turn/end').map(e=>e.reason)})
 await unarchive(a);check('unarchive retains history', (await command('log',a)).length>=historyA.length)
 const live=await session(workspace,[text('active fixture','hold')]);await prompt(live)
 await until(()=>requests().some(r=>r.sessionId===live),'active request')
 await refusal(()=>archive(live),'workspace/session-active')
 check('refused active archive leaves archive ids unchanged',!(await command('state')).archived.includes(live))
 await archive(live,true);await ended(live)
 check('stop provider observes archive already committed',events().some(r=>r.kind==='stop'&&r.sid===live&&r.archivedAtDispatch))
 const liveN=requests().filter(x=>x.sessionId===live).length
 await command('followup',live);await sleep(500)
 check('stopped archived session late followup has zero model requests',requests().filter(x=>x.sessionId===live).length===liveN)
 const failed=await session();writeFileSync(join(root,'fail-stop'),failed)
 const stopResult=await archive(failed,true)
 await until(()=>events().some(r=>r.kind==='stop-failure-injected'&&r.sid===failed),'stop failure injection')
 const count=events().filter(r=>r.kind==='stop'&&r.sid===failed).length
 await archive(failed,true)
 check('repeat archive does NOT retry failed stop provider',events().filter(r=>r.kind==='stop'&&r.sid===failed).length===count)
 summary.observations.push({kind:'stop-failure',rpcResolved:true,archiveReturned:stopResult.archivedSessionIds.includes(failed),warningObserved:output().includes('P7_R3_SYNTHETIC_STOP_FAILURE'),requirement:'FAIL: upstream RPC resolve does not certify complete stop; wrapper must verify settlement and mark partial/unknown'})
 await archive(parent,true)
 check('archive main does not archive ordinary createdBy worker fixture',!(await command('state')).archived.includes(a))
 const beforeA=requests().filter(x=>x.sessionId===a).length
 await prompt(a);await until(()=>requests().filter(x=>x.sessionId===a).length>beforeA,'independent worker after parent archive');await sleep(300)
 check('ordinary worker still reaches model after parent archive (createdBy is NOT subagent lineage)',requests().filter(x=>x.sessionId===a).length>beforeA)
 const state=await command('state');summary.observations.push({kind:'host-hmr',present:state.hmr})
 const plugins=await client.call('pluginManager/listPlugins',{})
 const row=plugins.find(x=>x.moduleName===pathToFileURL(hot).href||String(x.entryId).includes('p7-r3-hot'))
 check('plugin inventory exposes fixture row',!!row)
 summary.observations.push({kind:'fixture-plugin',row})
 const toggle=await client.call('pluginManager/setPluginEnabled',{id:row.entryId,enabled:false})
 summary.observations.push({kind:'hmr-toggle',result:toggle,hotLifecycle:readLines(join(root,'hot.jsonl'))});writeFileSync(hot,readFileSync(hot,'utf8').replace("kind:'apply'","kind:'apply-v2'"));await until(()=>readLines(join(root,'hot.jsonl')).some(e=>e.kind==='dispose')&&readLines(join(root,'hot.jsonl')).some(e=>e.kind==='apply-v2'),'module HMR dispose/reapply');summary.observations.push({kind:'real-module-hmr',watchRoot:'probe fixture module only',lifecycle:readLines(join(root,'hot.jsonl'))});check('real HMR disposes and activates changed module without SDK restart',true)
 const protectedRows=plugins.filter(x=>x.readOnlyReason==='management-required')
 check('plugin query exposes management-required protections',protectedRows.length>0)
 const denied=await client.call('pluginManager/setPluginEnabled',{id:protectedRows[0].entryId,enabled:false})
 summary.observations.push({kind:'protected-disable',application:denied.application,error:denied.error})
 const archiveBefore=[...(await command('state')).archived].sort()
 check('full workspace inventory unchanged before restart',JSON.stringify(inventory(workspace))===JSON.stringify(before))
 await stop();await boot('restored')
 check('archive ids persist through owned SDK restart',JSON.stringify([...(await command('state')).archived].sort())===JSON.stringify(archiveBefore))
 check('full raw subdir history digest survives restart',JSON.stringify(await command('digest',b))===JSON.stringify(digestB));check('history survives restart for archived subdir fixture',JSON.stringify(await command('log',b))===JSON.stringify(historyB))
 await unarchive(b)
 check('unarchive after restart restores same history',JSON.stringify(await command('log',b))===JSON.stringify(historyB))
 summary.inventoryAfter=inventory(workspace)
 check('complete SHA256/directories/readlink/binary inventory unchanged',JSON.stringify(summary.inventoryAfter)===JSON.stringify(before))
 await stop();await boot('no-hmr',true)
 const no=await command('state');summary.observations.push({kind:'no-hmr-stage',present:no.hmr})
 if(!no.hmr){const ps=await client.call('pluginManager/listPlugins',{}),r=ps.find(x=>x.moduleName===pathToFileURL(hot).href);if(r){const v=await client.call('pluginManager/setPluginEnabled',{id:r.entryId,enabled:true});summary.observations.push({kind:'restart-required',result:v});check('no-HMR returns restart-required/no-hmr',v.application==='restart-required'&&v.restartReason==='no-hmr')}}
 summary.completed=true
}catch(e){summary.completed=false;summary.error=String(e);process.exitCode=1}
finally{
 try{await stop()}catch(e){summary.stopError=String(e);process.exitCode=1}
 try{check('installed-launcher SDK source mirror unchanged through probe',JSON.stringify(sourceInventory(sdk))===JSON.stringify(sourceBefore))}catch(e){summary.sourceDrift=String(e);process.exitCode=1}
 if(!child){rmSync(root,{recursive:true,force:true});summary.cleanup='only owned launcher stopped; only unique probe root removed'}
 console.log(JSON.stringify(summary,null,2))
}
