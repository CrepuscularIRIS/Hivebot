import {mkdirSync,writeFileSync,readFileSync,unlinkSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {connect} from '/tmp/bot-wt/P6-14f2/app/sdk/examples/lib/client.mjs';
const root=mkdtempSync('/tmp/bot-p614f3-vfy-probe-'), pkg='/tmp/bot-wt/P6-14f2/app/sdk';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mode=process.argv[2]??'normal';
const base=join(root,mode);mkdirSync(base,{recursive:true});
const home=join(base,'home'),runtime=join(base,'runtime'),data=join(base,'data'),handoff=join(base,'handoff');
for(const p of [home,runtime,data,handoff,join(runtime,'fake/scripts')])mkdirSync(p,{recursive:true});
const plugin=join(root,'inspect.mjs');
writeFileSync(plugin,readFileSync(join(pkg,'tests/support/orchestration-create-inspect.mjs'),'utf8')
 .replace("'../../src/orchestration/slots.mjs'",`'${pkg}/src/orchestration/slots.mjs'`)
 .replace("const PKG_ROOT = join(realpathSync(new URL('..', import.meta.url).pathname), '..')",`const PKG_ROOT = '${pkg}'`)
 .replace("'sessionPersistence']", "'sessionPersistence', 'sessions']")
 .replace("this.connWrites = 0", "this.audit = []; ctx.on('agent/created', ({agent}) => {this.audit.push({type:'agent/created', id:String(agent.id)})}); ctx.on('session/created', s => {this.audit.push({type:'session/created', id:String(s.id), header:s.header})}, true); ctx.on('session/event', ({session,event}) => {this.audit.push({type:event.type, id:String(session.id)})}); this.connWrites = 0")
 .replace("const { op } = request", "const { op } = request; if(op === 'snapshot') return {audit:this.audit, sessions:this.ctx.sessions.list().map(s=>String(s.id)), agents:this.ctx.agents.list().map(a=>({id:String(a.id),names:this.ctx.tools.definitions(a).map(t=>t.name)}))}"));
if(mode==='cold-boot') {
 const {BotsMetaStore}=await import('/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/store.ts');
 const store=new BotsMetaStore(data);await store.init();store.close();
 assert.deepEqual(JSON.parse(readFileSync(join(data,'bots.json'),'utf8')),{version:1,mainBotId:null,recipes:{}});
 console.log('BOOT store.init completed: legal zero-worker skeleton exists before SDK spawn');
}
writeFileSync(plugin, "import {resolveWorkerStatus} from '"+pkg+"/src/orchestration/envelope.mjs';\n"+readFileSync(plugin,'utf8').replace("this.connWrites = 0", "const observe=(id,point)=>{this.audit.push({type:'identity-status',id:String(id),point,status:resolveWorkerStatus(String(id),process.env.P2SDK_ORCH_DATA_DIR)})};ctx.on('session/created',s=>observe(s.id,'session/created'),true);ctx.on('agent/created',({agent})=>observe(agent.id,'agent/created'));ctx.on('tools/pre-execute',async(e,next)=>{observe(e.agent?.id,'tools/pre-execute');return next()},true);this.connWrites = 0"));
let overlay='';
if(mode==='rename'){
 const approval=readFileSync(join(pkg,'profile/patches/approval.yml'),'utf8');
 overlay=approval.slice(approval.indexOf('- id: preset-standard\n'),approval.indexOf('- id: preset-cordis\n')).replace('toolName: subagent\n','toolName: rvw_delegate\n');
 assert(overlay.includes('toolName: rvw_delegate'));
}
overlay+=`\n- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: 'file://${pkg}/tests/support/fake/plugin.mjs'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: rvw-inspect\n      name: 'file://${plugin}'\n`;
writeFileSync(join(base,'overlay.yml'),overlay);
const env={PATH:process.env.PATH,HOME:home,LANG:'C.UTF-8',P2SDK_PROVIDER:'mock',P2SDK_HOME:runtime,P2SDK_HANDOFF:handoff,P2SDK_PORT:'0',PBOTS_DATA_DIR:data,P2SDK_ORCH_DATA_DIR:data,P2SDK_PATCH:`${pkg}/profile/patches/orchestration.yml:${base}/overlay.yml`};
const child=spawn(process.execPath,[join(pkg,'scripts/start.mjs')],{cwd:pkg,env,stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
let client;
const allRestricted=['create_bot','send_to_bot','stop_bot','subagent','subagent_fork','list_subagent_models','send_message','interrupt_agent','list_agents','workflow','job_output','job_list','job_kill','schedule_create','schedule_list','schedule_update','schedule_delete'];
const text=t=>({chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:t},{type:'block-end',index:0,block:{type:'text',text:t}},{type:'finish',reason:{kind:'stop'}}]});
const call=(name,args)=>({chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:'probe-call',name,argumentsDelta:JSON.stringify(args)},{type:'block-end',index:0,block:{type:'tool-call',id:'probe-call',name,arguments:JSON.stringify(args)}},{type:'finish',reason:{kind:'tool-calls'}}]});
const script=(id,calls)=>writeFileSync(join(runtime,'fake/scripts',`${id}.json`),JSON.stringify({calls}));
script('default',[call('job_list',{}),text('child probe finished')]);
try{
 const deadline=Date.now()+90000;
 while(!stdout.includes('[p2sdk] ready http')&&!stderr.includes('[p2sdk] ready http')){if(child.exitCode!==null||Date.now()>deadline)throw Error(`boot failed ${child.exitCode}\n${stdout}\n${stderr}`);await sleep(200);}
 client=await connect({baseUrl:readFileSync(join(handoff,'base-url'),'utf8').trim(),token:readFileSync(join(handoff,'launch-token'),'utf8').trim()});
 const control=request=>client.call('p610/control',{request});
 const newSession=async()=>{const ws=join(home,`ws-${Date.now()}-${Math.random()}`);mkdirSync(ws);return (await client.call('session/create',{request:{agentPreset:'standard',cwd:ws}})).sessionId;};
 const writeBots=w=>writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:'review-main',bots:{[w]:{createdBy:'review-main'}},recipes:{}}));
 async function turn(w,name,args){script(w,[call(name,args),text('done')]);await client.call('session/prompt',{request:{requestId:`r-${Date.now()}`,sessionId:w,mode:'queue',content:[{type:'text',text:'security probe'}]}});const end=Date.now()+45000;for(;;){const ev=(await control({op:'read',sessionId:w})).events;if(ev.some(e=>e.type==='turn/end'))return ev;if(Date.now()>end)throw Error('turn timeout '+JSON.stringify(ev.slice(-8)));await sleep(100);}}
 const w=`session-${crypto.randomUUID()}`;if(mode!=='cold-boot')writeBots(w);
 if(mode==='missing')unlinkSync(join(data,'bots.json'));
 if(mode==='corrupt')writeFileSync(join(data,'bots.json'),'{broken');
 if(mode==='empty-createdBy')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:'review-main',bots:{[w]:{createdBy:''}},recipes:{}}));
 if(mode==='healthy-main')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:w,bots:{},recipes:{}}));
 if(mode==='production-main')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:w,recipes:{}}));
 if(mode==='recovery')unlinkSync(join(data,'bots.json'));
 const ws=join(home,`preassigned-${Date.now()}`);mkdirSync(ws);
 await client.call('session/create',{request:{sessionId:w,agentPreset:'standard',cwd:ws}});
 if(mode==='cold-boot') {
   for(const n of allRestricted.slice(3))assert.equal((await control({op:'visible',sessionId:w,tool:n})).visible,true,'cold-boot table '+n);
   console.log('BOOT before main designation: 14 delegation/job names visible; coordinator tools have their own mainBotId when condition');
   const {BotsMetaStore}=await import('/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/store.ts');
   const store=new BotsMetaStore(data);await store.init();await store.patchMainBotId(w);store.close();
   for(const n of allRestricted)assert.equal((await control({op:'visible',sessionId:w,tool:n})).visible,true,'designated main table '+n);
   console.log('BOOT after production patchMainBotId: all 17 restricted names visible');
 }
 if(mode==='recovery')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:w,bots:{},recipes:{}}));
 const tool=['production-main','cold-boot'].includes(mode)?'create_bot':mode==='rename'?'rvw_delegate':['missing','corrupt'].includes(mode)?'subagent':'job_list';
 const args=tool==='create_bot'?{name:'first worker',prompt:'test normal main'}:tool==='job_list'?{}:{description:'review child',prompt:'reply child probe finished'};
 const beforeList=(await client.call('session/list',{_request:{}})).items; const before=beforeList.length;
 const events=await turn(w,tool,args);
 const afterList=(await client.call('session/list',{_request:{}})).items; const after=afterList.length;
 let childEvents=[];
 const childId=events.find(e=>e.type==='tool/result'&&!e.isError)?.text?.match(/started subagent ([^\s]+)/)?.[1];
 if(childId){const end=Date.now()+20000;for(;;){childEvents=(await control({op:'read',sessionId:childId})).events;if(childEvents.some(e=>e.type==='turn/end')||Date.now()>end)break;await sleep(100);}}
 await sleep(1000);
 const extras=afterList.filter(x=>!beforeList.some(y=>y.sessionId===x.sessionId));
 const orphanEvidence=[];
 for(const x of extras){
   let resumeError='';try{await client.call('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId:x.sessionId,mode:'queue',content:[{type:'text',text:'revive forbidden child'}]}});}catch(e){resumeError=String(e)}
   await sleep(500);
   const log=await control({op:'read',sessionId:x.sessionId});
   orphanEvidence.push({item:x,resumeError,events:log.events});
   assert(!log.events.some(e=>e.type==='turn/start'||e.type==='tool/call'),'orphan executed');
 }
 const snap=await control({op:'snapshot'});
 if(mode==='cold-boot') {
   for(const n of allRestricted)assert.equal((await control({op:'visible',sessionId:w,tool:n})).visible,true,'post-call table '+n);
   console.log('BOOT after create_bot call: all 17 restricted names visible');
   const observations=snap.audit.filter(e=>e.type==='identity-status');
   console.log('BOOT RAW AUDIT',JSON.stringify(snap.audit));assert(observations.length>=3,'identity status observation hooks missing');
   assert(observations.every(e=>e.status==='main'),'boot must have zero unknown/worker status');
   console.log('BOOT ASSERT unknownCount=0',JSON.stringify(observations));
 }
 assert(!snap.audit.some(e=>e.type==='agent/created'&&e.id!==w),'child agent created');
 assert(!snap.audit.some(e=>['turn/start','tool/call'].includes(e.type)&&e.id!==w),'child executed');
 assert.deepEqual(snap.sessions,[w],'veto must unpublish child live session');
 const visible=await control({op:'visible',sessionId:w,tool:'job_list'});
 if(mode==='rename'){assert.equal(extras.length,1);assert(orphanEvidence.every(x=>!x.events.some(e=>['turn/start','tool/call'].includes(e.type))));}
 if(['missing','corrupt'].includes(mode))assert.equal(after,before,'identity failure created child');
 const results=events.filter(e=>e.type==='tool/result');
 console.log(JSON.stringify({mode,worker:w,tool,before,after,results,childEvents,visible,orphanEvidence,snapshot:snap},null,2));
 if(mode==='recovery'){
   // f3：恢复撤销。首调 job_list 的解析仍失败一次（restrict 在该调用的
   // tools/pre-execute（waterfall 先于工具名解析）里被 sweep 撤销，但本次解析
   // 已按旧表快照失败）→ UNKNOWN_TOOL；撤销即刻生效：visible 立即恢复 true，
   // 下一回合 job_list 真实执行成功。
   assert.equal(results.length,1);assert.equal(results[0].error?.code,'UNKNOWN_TOOL'); // 一次性失败（ponytail 上限：一次重试）
   assert.equal(visible.visible,true,'f3: restrict lifted during the failed call\'s pre-execute');
   // 第二回合再调 job_list（脚本按 P5-03 追加不覆盖，fake 游标 per-session 连续）
   const scriptPath=join(runtime,'fake/scripts',`${w}.json`);
   const prev=JSON.parse(readFileSync(scriptPath,'utf8'));
   writeFileSync(scriptPath,JSON.stringify({calls:[...prev.calls,call('job_list',{}),text('recovered')]}));
   await client.call('session/prompt',{request:{requestId:`r2-${Date.now()}`,sessionId:w,mode:'queue',content:[{type:'text',text:'recovery probe 2'}]}});
   let ev2=[];{const end=Date.now()+45000;for(;;){ev2=(await control({op:'read',sessionId:w})).events;if(ev2.filter(e=>e.type==='turn/end').length>=2)break;if(Date.now()>end)throw Error('recovery turn timeout '+JSON.stringify(ev2.slice(-6)));await sleep(100);}}
   const r2=ev2.filter(e=>e.type==='tool/result').pop();
   assert.equal(r2?.isError ?? true,false,'f3: job_list executes after recovery undo');
   console.log('f3 recovery undo: first call one-shot UNKNOWN_TOOL, table restored immediately, second call executed ok');
 } else if(['production-main','cold-boot'].includes(mode)){
   // f3 阻塞复现（VERIFY-P6-14.f2 主 FAIL 项）：合法零 worker 文档（省略 bots 键）
   // 下主 bot 的 create_bot 必须放行——无订阅者时错误是 main-unavailable（通道层），
   // 绝不能是信封的 pbots/forbidden；工具表上 create_bot 可见。
   assert.equal(results.length,1);
   assert.equal(results[0].isError,true,'no subscriber → main-unavailable expected');
   assert(!JSON.stringify(results[0]).includes('pbots/forbidden'),'f3: envelope must NOT veto create_bot under legal zero-worker doc');
   assert(JSON.stringify(results[0]).includes('main-unavailable'),'reached create channel (main-unavailable), not envelope deny');
   const visCreate=await control({op:'visible',sessionId:w,tool:'create_bot'});
   assert.equal(visCreate.visible,true,'f3: create_bot visible on main under omitted-bots doc');
   console.log('f3 production-main: create_bot passed envelope, error = main-unavailable (no subscriber), tool visible =',visCreate.visible);
 } else if(['empty-createdBy','healthy-main'].includes(mode)){assert(results.length===1);assert(results.every(e=>!e.isError));assert.equal(visible.visible,true);} else if(mode==='normal'){assert(results.every(e=>e.isError));assert.equal(after,before);}
 else{assert(results.every(e=>e.isError),'f2: bypass must be denied');assert(!results.some(e=>!e.isError&&/started subagent/.test(e.text??'')),'f2: no started subagent');}
 writeFileSync(join(base,'result.json'),JSON.stringify({mode,worker:w,tool,before,after,results,childEvents,visible,orphanEvidence,snapshot:snap},null,2));
}finally{
 client?.close();
 const reaped=spawnSync('/home/lingxufeng/bot/scripts/bot-reap',['--match',base],{encoding:'utf8'});console.log('cleanup',reaped.stdout,reaped.stderr);
 writeFileSync(join(base,'runtime.log'),stdout+'\n'+stderr); rmSync(root,{recursive:true,force:true});
}
