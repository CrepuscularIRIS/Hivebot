import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, renameSync, symlinkSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { launchRuntime } from '/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts';
const PKG='/home/lingxufeng/bot/app/sdk';
const E='/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-25-rvw';
const root=mkdtempSync('/tmp/vfy-r-p625-b/run-');
const ws=join(root,'workspace'), outside=join(root,'outside'), home=join(root,'home'), dsh=join(root,'dsh'), barriers=join(root,'barriers');
for(const d of [ws,outside,home,dsh,barriers]) mkdirSync(d,{recursive:true});
for(const k of Object.keys(process.env)) if(/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)) delete process.env[k];
const N=200;
for(let i=0;i<N;i++){mkdirSync(join(ws,'d'+i));mkdirSync(join(outside,'o'+i));}
// An outer waterfall observer waits for the real guard + shell-ask verdict.
// Only after allow is produced does the independent harness process replace d.
const plugin=join(root,'barrier-plugin.mjs');
writeFileSync(plugin,`import {writeFileSync,existsSync,appendFileSync} from 'node:fs';\nimport {basename,dirname,join} from 'node:path';\nexport const name='p625-b-barrier';\nexport function apply(ctx){ctx.on('tools/pre-execute',async(exec,next)=>{const decision=await next();if(exec.name==='write'){const path=exec.arguments.file_path;appendFileSync(${JSON.stringify(join(root,'gates.jsonl'))},JSON.stringify({path,decision})+'\\n');if(decision?.kind==='allow'&&basename(path)==='x'){const id=basename(dirname(path));writeFileSync(join(${JSON.stringify(barriers)},id+'.ready'),'');const end=Date.now()+60000;while(!existsSync(join(${JSON.stringify(barriers)},id+'.go'))){if(Date.now()>end)throw Error('barrier timeout '+id);await new Promise(r=>setTimeout(r,5));}}}return decision;},true)}\n`);
const patch=join(root,'fake.yml');
writeFileSync(patch,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(PKG,'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p625-b-barrier\n      name: '${pathToFileURL(plugin).href}'\n`);
function batch(paths){const chunks=[];for(const [index,path]of paths.entries()){const id='p625-b-'+Math.random().toString(16).slice(2);const args=JSON.stringify({file_path:path,content:'outside-marker'});chunks.push({type:'block-start',index,blockType:'tool-call'},{type:'tool-call-delta',index,id,name:'write',argumentsDelta:args},{type:'block-end',index,block:{type:'tool-call',id,name:'write',arguments:args}});}chunks.push({type:'finish',reason:{kind:'tool-calls'}});return {chunks,paceMs:0};}
const done={chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'done'},{type:'block-end',index:0,block:{type:'text',text:'done'}},{type:'finish',reason:{kind:'stop'}}],paceMs:0};
let rt,feed;const cards=[];let drain;let result;
try{
 rt=await launchRuntime({env:{HOME:home,P2SDK_HOME:dsh,PBOTS_DATA_DIR:join(root,'data'),P2SDK_PATCH:patch}});
 feed=await rt.client.socket.open('$events',{});void(async()=>{for await(const f of feed)if(f.type==='waterfall'&&f.event==='approval/request')cards.push({event:f.event,agentId:f.agentId});})().catch(()=>{});
 const {sessionId}=await rt.client.call('session/create',{request:{cwd:ws}});
 const paths=Array.from({length:N},(_,i)=>join(ws,'d'+i,'x'));
 mkdirSync(join(dsh,'fake/scripts'),{recursive:true});
 // 20-call chunks keep each fake output modest, same session for stale-allow checks.
 const calls=[];for(let j=0;j<N;j+=20)calls.push(batch(paths.slice(j,j+20)),done);
 for(let j=0;j<N;j+=20)calls.push(batch(paths.slice(j,j+20)),done);
 calls.push(batch([join(ws,'control')]),done);
 writeFileSync(join(dsh,'fake/scripts',sessionId+'.json'),JSON.stringify({calls}));
 const rounds=[];const swapped=new Set();
 for(let turn=0;turn<21;turn++){
  const stream=await rt.client.follow(sessionId);const frames=[];drain=(async()=>{for await(const f of stream)frames.push(f)})().catch(()=>{});
  await rt.client.call('session/prompt',{request:{requestId:'p625-b-'+turn,sessionId,mode:'queue',content:[{type:'text',text:'P6-25 B isolated probe '+turn}]}});
  const end=Date.now()+180000;
  while(!frames.some(f=>f.type==='event'&&f.event?.type==='turn/end')){
   for(const file of readdirSync(barriers).filter(n=>n.endsWith('.ready'))){const id=file.slice(0,-6);if(swapped.has(id))continue;renameSync(join(ws,id),join(ws,id+'.old'));symlinkSync(join(outside,'o'+id.slice(1)),join(ws,id));swapped.add(id);writeFileSync(join(barriers,id+'.go'),'');}
   if(Date.now()>end)throw Error('turn timeout '+turn);
   await new Promise(r=>setTimeout(r,5));
  }
  stream.cancel();
  const messages=frames.filter(f=>f.type==='event'&&f.event?.type==='tool/result').map(f=>f.event.data?.message);
  const texts=messages.map(m=>({error:m?.isError===true,text:(m?.content??[]).map(c=>c.text??'').join('\n')}));
  rounds.push({turn,phase:turn<10?'race':turn<20?'same-path-recheck':'control',results:texts});
  console.log(JSON.stringify({turn,phase:rounds.at(-1).phase,results:messages.length,errors:texts.filter(t=>t.error).length,swapped:swapped.size}));
 }
 const hits=Array.from({length:N},(_,i)=>join(outside,'o'+i,'x')).filter(p=>existsSync(p)&&readFileSync(p,'utf8')==='outside-marker');
 const gates=readFileSync(join(root,'gates.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 result={commit:'be374843f45a87a1fe77ec67d042ab8563b7715a',root,trials:N,swapped:swapped.size,outsideWrites:hits.length,hitRate:hits.length/N,cards:cards.length,raceSuccess:rounds.slice(0,10).flatMap(r=>r.results).filter(r=>!r.error).length,recheckDenied:rounds.slice(10,20).flatMap(r=>r.results).filter(r=>r.error&&r.text.includes('write-outside-workspace')).length,controlInside:existsSync(join(ws,'control')),rounds,gates};
 writeFileSync(join(E,'B-results.json'),JSON.stringify(result,null,2));
 copyFileSync(plugin,join(E,'B-barrier-plugin.mjs'));
 console.log('SUMMARY '+JSON.stringify({...result,rounds:undefined,gates:undefined}));
 assert.equal(result.swapped,N);assert.equal(result.outsideWrites,N);assert.equal(result.raceSuccess,N);assert.equal(result.recheckDenied,N);assert.equal(result.cards,0);assert.equal(result.controlInside,true);
}finally{
 feed?.cancel();rt?.client.close();
 if(rt){const reap=spawnSync('/home/lingxufeng/bot/scripts/bot-reap',['--match',root],{encoding:'utf8'});writeFileSync(join(E,'B-cleanup.txt'),reap.stdout+reap.stderr);if(reap.status!==0)console.error('reap status',reap.status);rmSync(rt.handoff,{recursive:true,force:true});}
 // No tokens or runtime files are copied into evidence; keep only repro script/results.
 rmSync(root,{recursive:true,force:true});
}
