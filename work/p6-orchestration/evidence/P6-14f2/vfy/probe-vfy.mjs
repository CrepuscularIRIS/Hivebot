import {mkdirSync,writeFileSync,readFileSync,unlinkSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {connect} from '/tmp/bot-wt/P6-14f2/app/sdk/examples/lib/client.mjs';
const root=mkdtempSync('/tmp/bot-p614f2-vfy-probe-'), pkg='/tmp/bot-wt/P6-14f2/app/sdk';
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
 .replace("this.connWrites = 0", "this.audit = []; ctx.on('agent/created', ({agent}) => this.audit.push({type:'agent/created', id:String(agent.id)})); ctx.on('session/created', s => this.audit.push({type:'session/created', id:String(s.id), header:s.header}), true); ctx.on('session/event', ({session,event}) => this.audit.push({type:event.type, id:String(session.id)})); this.connWrites = 0")
 .replace("const { op } = request", "const { op } = request; if(op === 'snapshot') return {audit:this.audit, sessions:this.ctx.sessions.list().map(s=>String(s.id)), agents:this.ctx.agents.list().map(a=>({id:String(a.id),names:this.ctx.tools.definitions(a).map(t=>t.name)}))}"));
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
 const w=`session-${crypto.randomUUID()}`;writeBots(w);
 if(mode==='missing')unlinkSync(join(data,'bots.json'));
 if(mode==='corrupt')writeFileSync(join(data,'bots.json'),'{broken');
 if(mode==='empty-createdBy')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:'review-main',bots:{[w]:{createdBy:''}},recipes:{}}));
 if(mode==='healthy-main')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:w,bots:{},recipes:{}}));
 if(mode==='production-main')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:w,recipes:{}}));
 if(mode==='recovery')unlinkSync(join(data,'bots.json'));
 const ws=join(home,`preassigned-${Date.now()}`);mkdirSync(ws);
 await client.call('session/create',{request:{sessionId:w,agentPreset:'standard',cwd:ws}});
 if(mode==='recovery')writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:w,bots:{},recipes:{}}));
 const tool=mode==='production-main'?'create_bot':mode==='rename'?'rvw_delegate':['missing','corrupt'].includes(mode)?'subagent':'job_list';
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
 assert(!snap.audit.some(e=>e.type==='agent/created'&&e.id!==w),'child agent created');
 assert(!snap.audit.some(e=>['turn/start','tool/call'].includes(e.type)&&e.id!==w),'child executed');
 assert.deepEqual(snap.sessions,[w],'veto must unpublish child live session');
 const visible=await control({op:'visible',sessionId:w,tool:'job_list'});
 if(mode==='rename'){assert.equal(extras.length,1);assert(orphanEvidence.every(x=>!x.events.some(e=>['turn/start','tool/call'].includes(e.type))));}
 if(['missing','corrupt'].includes(mode))assert.equal(after,before,'identity failure created child');
 const results=events.filter(e=>e.type==='tool/result');
 console.log(JSON.stringify({mode,worker:w,tool,before,after,results,childEvents,visible,orphanEvidence,snapshot:snap},null,2));
 if(mode==='recovery'){assert.equal(results.length,1);assert.equal(results[0].error?.code,'UNKNOWN_TOOL');assert.equal(visible.visible,false);} else if(['empty-createdBy','healthy-main'].includes(mode)){assert(results.length===1);assert(results.every(e=>!e.isError));assert.equal(visible.visible,true);} else if(mode==='normal'){assert(results.every(e=>e.isError));assert.equal(after,before);}
 else{assert(results.every(e=>e.isError),'f2: bypass must be denied');assert(!results.some(e=>!e.isError&&/started subagent/.test(e.text??'')),'f2: no started subagent');}
 writeFileSync(join(base,'result.json'),JSON.stringify({mode,worker:w,tool,before,after,results,childEvents,visible,orphanEvidence,snapshot:snap},null,2));
}finally{
 client?.close();
 const reaped=spawnSync('/home/lingxufeng/bot/scripts/bot-reap',['--match',base],{encoding:'utf8'});console.log('cleanup',reaped.stdout,reaped.stderr);
 writeFileSync(join(base,'runtime.log'),stdout+'\n'+stderr); rmSync(root,{recursive:true,force:true});
}
