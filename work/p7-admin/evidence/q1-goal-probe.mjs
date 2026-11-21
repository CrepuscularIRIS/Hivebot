import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { connect } from '/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs'
const repo='/home/lingxufeng/bot', sdk=join(repo,'app/sdk'), evidence=join(repo,'work/p7-admin/evidence')
const root=mkdtempSync('/tmp/bot-p7q1-'), home=join(root,'runtime'), userHome=join(root,'home'), work=join(root,'workspace')
for(const p of [home,userHome,work,join(root,'handoff')]) mkdirSync(p,{recursive:true})
for(const stage of ['first','second']) writeFileSync(join(evidence,`observer-${stage}.jsonl`),'')
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const overlay=join(root,'probe.yml')
writeFileSync(overlay,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: 'file://${sdk}/tests/support/fake/plugin.mjs'\n      config:\n        providers:\n          - id: p2fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p7q1-observer\n      name: 'file://${evidence}/q1-goal-observer.mjs'\n`)
function tool(name,args,id=name){const a=JSON.stringify(args);return {chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:a},{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:a}},{type:'finish',reason:{kind:'tool-calls'}}]}}
function text(s,gate){return {chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:s},{type:'block-end',index:0,block:{type:'text',text:s}},{type:'finish',reason:{kind:'stop'}}],...(gate?{gateAfterChunk:1,gateId:gate}:{})}}
function script(sid,calls){const d=join(home,'fake/scripts');mkdirSync(d,{recursive:true});writeFileSync(join(d,`${sid}.json`),JSON.stringify({calls}))}
function records(stage){const p=join(evidence,`observer-${stage}.jsonl`);return existsSync(p)?readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]}
async function wait(fn,label){const end=Date.now()+30000;while(Date.now()<end){const v=fn();if(v)return v;await sleep(50)}throw Error('timeout '+label)}
let client, child
async function boot(stage){
 let output='';child=spawn(process.execPath,[join(sdk,'scripts/start.mjs')],{cwd:work,env:{PATH:process.env.PATH,HOME:userHome,PBOTS_DATA_DIR:join(root,'data'),P2SDK_PROVIDER:'mock',P2SDK_HOME:home,P2SDK_HANDOFF:join(root,'handoff'),P2SDK_PORT:'0',P2SDK_PATCH:overlay,P2SDK_Q1_EVIDENCE:evidence,P2SDK_Q1_STAGE:stage,DSH_TELEMETRY_MODE:'DISABLED'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b});
 await wait(()=>output.includes('[p2sdk] ready http') || (child.exitCode!==null&&(()=>{throw Error(output)})()),'boot');
 writeFileSync(join(evidence,`boot-${stage}.log`),output)
 // Only the freshly generated temporary host handshake is consumed in-process; no real credentials or token values are emitted.
 client=await connect({baseUrl:readFileSync(join(root,'handoff/base-url'),'utf8').trim(),token:readFileSync(join(root,'handoff/launch-token'),'utf8').trim()});
 assert(records(stage).some(r=>r.type==='services'&&r.goals&&r.sessionProjections));
}
async function stop(){client?.close();client=null;execFileSync(join(repo,'scripts/bot-reap'),['--match',root],{encoding:'utf8'});if(child)await wait(()=>child.exitCode!==null||child.signalCode!==null,'shutdown');child=null}
async function prompt(sid,msg){return client.call('session/prompt',{request:{requestId:`q1-${Date.now()}`,sessionId:sid,mode:'queue',content:[{type:'text',text:msg}]}})}
const summary={root,head:execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim()}
try{
 await boot('first');const {sessionId:sid}=await client.call('session/create',{request:{cwd:work}});summary.sessionId=sid;
 script(sid,[tool('create_goal',{objective:'Q1 verify headless goal mount',max_goal_rounds:4}),text('human turn done'),tool('get_goal',{}),text('round one complete'),tool('get_goal',{},'get-goal-round2'),text('round two running','hold-one')]);
 await prompt(sid,'Create a long-running goal and continue it automatically.');
 // A gate in the fake provider keeps the second goal round running, with active+armed unchanged for restart assertions.
 await wait(()=>records('first').some(r=>r.type==='event'&&r.event.type==='user/message'&&r.event.data.source.kind==='goal'&&r.event.data.source.round===2),'goal round two');
 await wait(()=>{const p=join(home,'fake/requests.jsonl');return existsSync(p)&&readFileSync(p,'utf8').trim().split('\n').length>=6},'round model call');
 summary.beforeRestart=records('first').findLast(r=>r.goal?.roundsStarted===2).goal;
 assert.equal(summary.beforeRestart.activation,'armed');assert.equal(summary.beforeRestart.phase,'active');
 await stop();
 await boot('second');script(sid,[tool('get_goal',{}),text('status only'),tool('update_goal',{goal_id:summary.beforeRestart.id,revision:summary.beforeRestart.revision,action:'resume'}),text('human resume done'),tool('get_goal',{}),text('round two running','hold-two')]);
 await prompt(sid,'Read goal status only; do not resume.');
 await wait(()=>records('second').some(r=>r.type==='status'&&r.status==='idle'&&r.goal),'restored idle');
 summary.afterRestart=records('second').findLast(r=>r.type==='status'&&r.status==='idle'&&r.goal).goal;
 for(const k of ['id','revision','phase','roundsStarted']) assert.equal(summary.afterRestart[k],summary.beforeRestart[k],k);
 assert.equal(summary.afterRestart.activation,'disarmed');await sleep(600);
 assert(!records('second').some(r=>r.type==='event'&&r.event.type==='user/message'&&r.event.data.source.kind==='goal'));
 await prompt(sid,'Continue the existing goal; explicitly resume it.');
 await wait(()=>records('second').some(r=>r.type==='event'&&r.event.type==='user/message'&&r.event.data.source.kind==='goal'&&r.event.data.source.round===3),'rearmed third round');
 summary.afterResume=records('second').findLast(r=>r.goal?.roundsStarted===3).goal;
 assert.equal(summary.afterResume.activation,'armed');assert.equal(summary.afterResume.revision,summary.beforeRestart.revision+1);
 assert(records('first').some(r=>r.type==='event'&&r.event.type==='turn/end'&&r.goal?.roundsStarted===1));
 summary.completedGoalRound=1;summary.pass=true;
} catch(error){summary.pass=false;summary.error=String(error);throw error}
finally{await stop();writeFileSync(join(evidence,'q1-goal-result.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));}
