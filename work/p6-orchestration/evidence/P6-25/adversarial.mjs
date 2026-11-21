import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchRuntime } from '/tmp/bot-wt/P6-25/app/sdk/tests/support/runtime.ts';
import { connect } from '/tmp/bot-wt/P6-25/app/sdk/examples/lib/client.mjs';
const PKG='/tmp/bot-wt/P6-25/app/sdk';
const E='/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-25';
for (const k of ['P2SDK_LLM_API_KEY','DEEPSEEK_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','LITELLM_MASTER_KEY']) delete process.env[k];
const root=mkdtempSync('/tmp/bot-p625-vfy-');
const ws=join(root,'workspace'), out=join(root,'outside'), home=join(root,'home'), dsh=join(root,'dsh');
for(const d of [ws,out,home,dsh]) mkdirSync(d,{recursive:true});
const spy=join(root,'registry.mjs');
writeFileSync(spy,`import {writeFileSync} from 'node:fs';\nexport const name='p625-registry-probe';\nexport function apply(ctx){ctx.on('tools/pre-execute',async(exec,next)=>{const t=ctx.get('tools');const v=t.view(exec.agent);writeFileSync(${JSON.stringify(join(root,'registry.json'))},JSON.stringify([...v.visible].map(([name,def])=>({name,description:def.description,parameters:def.parameters,input:def.input})),null,2));return next()},true)}\n`);
const patch=join(root,'fake.yml');
writeFileSync(patch,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(PKG,'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p625-registry\n      name: '${pathToFileURL(spy).href}'\n`);
function call(name,args){const id='vfy-'+Math.random().toString(16).slice(2);const a=JSON.stringify(args);return {chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:a},{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:a}},{type:'finish',reason:{kind:'tool-calls'}}],paceMs:5}}
const done={chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'done'},{type:'block-end',index:0,block:{type:'text',text:'done'}},{type:'finish',reason:{kind:'stop'}}],paceMs:5};
let rt,feedClient,feed;
const results=[];
try {
rt=await launchRuntime({env:{HOME:home,P2SDK_HOME:dsh,PBOTS_DATA_DIR:join(root,'data'),P2SDK_PATCH:patch}});
feedClient=await connect({baseUrl:rt.baseUrl,token:rt.token,interactions:'answer'});
feed=await feedClient.socket.open('$events',{});const cards=[];let cid;
void(async()=>{for await(const f of feed){if(f.type==='ready')cid=f.clientId;if(f.type==='waterfall'&&f.event==='approval/request'){cards.push(f);await feedClient.call('$events/result',{clientId:cid,eventId:f.eventId,outcome:{kind:'result',value:'rejected'}})}}})().catch(()=>{});
async function run(label,tool,args,expected='deny',disk){
 const {sessionId}=await rt.client.call('session/create',{request:{cwd:ws}});
 mkdirSync(join(dsh,'fake/scripts'),{recursive:true});writeFileSync(join(dsh,'fake/scripts',sessionId+'.json'),JSON.stringify({calls:[call(tool,args),done]}));
 const stream=await rt.client.follow(sessionId);const frames=[];const drain=(async()=>{for await(const f of stream)frames.push(f)})();
 await rt.client.call('session/prompt',{request:{requestId:'p625-'+Math.random(),sessionId,mode:'queue',content:[{type:'text',text:'independent p625 adversarial probe'}]}});
 const until=Date.now()+90000;while(!frames.some(f=>f.type==='event'&&f.event?.type==='turn/end')){if(Date.now()>until)throw Error('timeout '+label);await new Promise(r=>setTimeout(r,30))}
 stream.cancel();void drain;
 const messages=frames.filter(f=>f.type==='event'&&f.event?.type==='tool/result').map(f=>f.event.data?.message);
 const cardCount=cards.filter(f=>f.agentId===sessionId).length;
 const error=messages[0]?.isError===true;const text=messages.map(m=>(m?.content??[]).map(c=>c.text??'').join('\n')).join('\n');
 const state=disk?{exists:existsSync(disk),content:existsSync(disk)?readFileSync(disk,'utf8'):null}:null;
 const pass=expected==='allow'?(!error&&cardCount===0):expected==='ask'?(error&&cardCount===1):(error&&cardCount===0&&(!state||state.content==='before'||!state.exists));
 const row={label,tool,path:args.file_path,expected,pass,error,cards:cardCount,text,disk:state};results.push(row);console.log(JSON.stringify(row));
 writeFileSync(join(E,'adversarial-results.json'),JSON.stringify(results,null,2));
}
const target=n=>join(out,n);
symlinkSync(out,join(ws,'escape-link'));symlinkSync(ws,join(out,'inside-link'));
writeFileSync(target('edit-existing'),'before');
await run('absolute-host-tmp','write',{file_path:target('absolute'),content:'unexpected'},'deny',target('absolute'));
await run('dotdot-escape','write',{file_path:relative(ws,target('dotdot')),content:'unexpected'},'deny',target('dotdot'));
await run('inside-symlink-to-outside','write',{file_path:join(ws,'escape-link','linked-out'),content:'unexpected'},'deny',target('linked-out'));
await run('outside-symlink-to-inside','write',{file_path:join(out,'inside-link','linked-in'),content:'unexpected'},'deny',join(ws,'linked-in'));
await run('proc-cwd-dotdot','write',{file_path:'/proc/self/cwd/../../../../../../'+target('proc').slice(1),content:'unexpected'},'deny',target('proc'));
await run('edit-existing-outside','edit',{file_path:target('edit-existing'),old_string:'before',new_string:'unexpected'},'deny',target('edit-existing'));
await run('double-slash','write',{file_path:out.replaceAll('/','//')+'//double',content:'unexpected'},'deny',target('double'));
await run('trailing-slash','write',{file_path:target('tail')+'/',content:'unexpected'},'deny',target('tail'));
const upper=join(root,'WORKSPACE');mkdirSync(upper);
await run('case-distinct-workspace','write',{file_path:join(upper,'case'),content:'unexpected'},'deny',join(upper,'case'));
await run('outside-read-still-ask','read',{file_path:target('edit-existing')},'ask');
await run('inside-write','write',{file_path:join(ws,'normal'),content:'before'},'allow',join(ws,'normal'));
// New session needs a successful read before edit; use same scripted session via one tool call batch in next extension if required. Builder spec verifies same-session edit.
await run('never-root-sdk-home','write',{file_path:join(dsh,'guard-target'),content:'unexpected'},'deny',join(dsh,'guard-target'));
// Additional bad path: dangling in-workspace symlink to a missing outside parent.
symlinkSync(join(out,'missing-parent'),join(ws,'dangling'));
await run('dangling-symlink','write',{file_path:join(ws,'dangling','x'),content:'unexpected'},'deny',join(out,'missing-parent','x'));
writeFileSync(join(E,'registry.json'),readFileSync(join(root,'registry.json')));
console.log('SUMMARY '+JSON.stringify({total:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).map(r=>r.label)}));
} finally {try{feed?.cancel();feedClient?.close()}finally{await rt?.stop();rmSync(root,{recursive:true,force:true})}}
if(results.some(r=>!r.pass))process.exitCode=1;
