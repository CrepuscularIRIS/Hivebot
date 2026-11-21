import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {registerEnvelope,registerWorkerRestriction,RESTRICT_TOOLS,judgeWorkerCall} from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs';
const root='/tmp/bot-p614f2-probe/faults';mkdirSync(root,{recursive:true});
const meta=join(root,'bots.json');const valid=()=>writeFileSync(meta,JSON.stringify({mainBotId:'m',bots:{w:{createdBy:'m'}}}));valid();
for(const mode of ['throw','missing','definitions-throw']){
 const listeners=new Map(),warnings=[];
 const scopedTools=mode==='missing'?{}:{restrict:()=>{throw Error('synthetic /tmp/internal-private-path no-real-secret')}};
 const worker={id:'w',ctx:{tools:scopedTools}};
 const ctx={agents:{list:()=>[worker]},tools:{definitions:()=>{if(mode==='definitions-throw')throw Error('synthetic registry unavailable');return [{name:'subagent'}];}},logger:{warn:m=>warnings.push(m)},on:(name,fn)=>{listeners.set(name,fn);return()=>{};}};
 registerWorkerRestriction(ctx,{config:{dataDir:root}});
 registerEnvelope(ctx,{config:{dataDir:root}});
 let dispatched=0;const invoke=(id,name,args={})=>listeners.get('tools/pre-execute')({agent:{id},name,arguments:args},()=>{dispatched++;return {kind:'pass-through'};});
 const cases=[...RESTRICT_TOOLS.map(n=>[n,{}]),['bash',{run_in_background:true}],['pwsh',{run_in_background:true}]];
 for(const [name,args]of cases){const v=await invoke('w',name,args);assert.equal(v.kind,'deny');assert(!v.reason.includes('internal-private-path'));assert(!v.reason.includes('no-real-secret'));}
 assert.equal(dispatched,0);
 assert.equal((await invoke('m','subagent')).kind,'pass-through');
 assert.equal((await invoke('w','read')).kind,'pass-through');
 assert.equal(warnings.length,1);
 console.log(`${mode}: ${cases.length} worker calls denied, main subagent + worker read allowed, exception text absent from deny results`);
 // A known name registered after the restrict snapshot remains covered by execute guard.
 assert.equal((await invoke('w','schedule_create')).kind,'deny');
 console.log(`${mode}: late canonical schedule_create denied by execution guard`);
}
// Persisted identity failure: check each distinct readWorkerIds failure shape against real guard.
for(const state of ['missing','bad-json','no-bots','empty-createdBy']){
 valid();let guard;registerEnvelope({on:(_,fn)=>{guard=fn;return()=>{};}},{config:{dataDir:root}});
 assert.equal((await guard({agent:{id:'w'},name:'subagent',arguments:{}},()=>({kind:'passed'}))).kind,'deny');
 if(state==='missing')unlinkSync(meta);
 if(state==='bad-json')writeFileSync(meta,'{invalid');
 if(state==='no-bots')writeFileSync(meta,JSON.stringify({mainBotId:'m'}));
 if(state==='empty-createdBy')writeFileSync(meta,JSON.stringify({mainBotId:'m',bots:{w:{createdBy:''}}}));
 const observed=await guard({agent:{id:'w'},name:'subagent',arguments:{}},()=>({kind:'passed'}));
 // f2 修复后：缺文件/坏 JSON/缺 bots 键 → unknown fail closed（deny）；createdBy 空
 // = 记录在册确认非 worker（旧写入器抹除的已知降级，CONTRACT v1.5）→ 放行
 const expectKind = state==='empty-createdBy' ? 'passed' : 'deny';
 assert.equal(observed.kind,expectKind,`f2 identity ${state}`);
 console.log(`FIXED identity ${state}: kind=${observed.kind}`);
}
// A worker also named mainBotId is still restricted if createdBy remains present.
writeFileSync(meta,JSON.stringify({mainBotId:'w',bots:{w:{createdBy:'m'}}}));let guard;registerEnvelope({on:(_,fn)=>{guard=fn;return()=>{};}},{config:{dataDir:root}});
assert.equal((await guard({agent:{id:'w'},name:'subagent',arguments:{}},()=>({kind:'passed'}))).kind,'deny');
console.log('REFUTED mainBotId collision: createdBy worker still denied');
// Closed list does not classify configured aliases, even with healthy identity.
assert.equal(judgeWorkerCall('rvw_delegate',{}),null);
console.log('CONFIRMED alias rvw_delegate: no envelope verdict');
