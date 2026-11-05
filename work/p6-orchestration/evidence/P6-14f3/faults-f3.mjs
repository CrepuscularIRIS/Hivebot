import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {registerEnvelope,registerWorkerRestriction,RESTRICT_TOOLS,judgeWorkerCall} from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs';
const root='/tmp/bot-p614f2-probe/faults';mkdirSync(root,{recursive:true});
const meta=join(root,'bots.json');const valid=()=>writeFileSync(meta,JSON.stringify({version:1,mainBotId:'m',recipes:{},bots:{w:{createdBy:'m'}}}));valid();
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
 if(state==='no-bots')writeFileSync(meta,JSON.stringify({version:1,mainBotId:'m',recipes:{}}));
 if(state==='empty-createdBy')writeFileSync(meta,JSON.stringify({version:1,mainBotId:'m',recipes:{},bots:{w:{createdBy:''}}}));
 const observed=await guard({agent:{id:'w'},name:'subagent',arguments:{}},()=>({kind:'passed'}));
 // f2 修复后：缺文件/坏 JSON → unknown fail closed（deny）。f3（VERIFY-P6-14.f2
 // 阻塞项）翻转：合法 v1 文档省略 bots 键 = 零 worker = 确认非 worker → 放行；
 // createdBy 空 = 记录在册确认非 worker（旧写入器抹除的已知降级）→ 放行。
 // （无 version 键的文档仍 deny——version 不符属损坏，f3 追加节单测。）
 const expectKind = ['empty-createdBy','no-bots'].includes(state) ? 'passed' : 'deny';
 assert.equal(observed.kind,expectKind,`f2 identity ${state}`);
 console.log(`FIXED identity ${state}: kind=${observed.kind}`);
}
// A worker also named mainBotId is still restricted if createdBy remains present.
writeFileSync(meta,JSON.stringify({version:1,mainBotId:'w',recipes:{},bots:{w:{createdBy:'m'}}}));let guard;registerEnvelope({on:(_,fn)=>{guard=fn;return()=>{};}},{config:{dataDir:root}});
assert.equal((await guard({agent:{id:'w'},name:'subagent',arguments:{}},()=>({kind:'passed'}))).kind,'deny');
console.log('REFUTED mainBotId collision: createdBy worker still denied');
// Closed list does not classify configured aliases, even with healthy identity.
assert.equal(judgeWorkerCall('rvw_delegate',{}),null);
console.log('CONFIRMED alias rvw_delegate: no envelope verdict');
// ---- P6-14.f3 追加：契约语义翻转与 unknown 面收窄 ----
// f3：合法 v1 文档省略 bots 键 = 零 worker = 确认非 worker（放行）；version 不符
// 仍 fail closed；bots 键在但非对象（null/数组）= 损坏。
{
 const root='/tmp/bot-p614f3-probe/semantics';mkdirSync(root,{recursive:true});
 const meta=join(root,'bots.json');
 const check=async (doc,kind)=>{writeFileSync(meta,doc);let g;registerEnvelope({on:(_,fn)=>{g=fn;return()=>{};}},{config:{dataDir:root}});
   const v=await g({agent:{id:'w'},name:'create_bot',arguments:{}},()=>({kind:'passed'}));
   assert.equal(v.kind,kind,JSON.stringify(doc));};
 await check(JSON.stringify({version:1,mainBotId:'m',recipes:{}}),'passed');            // 省略 bots 键 → 放行（f3 阻塞项）
 await check(JSON.stringify({version:2,mainBotId:'m',recipes:{},bots:{}}),'deny');      // version 不符 → unknown
 await check(JSON.stringify({version:1,mainBotId:'m',recipes:{},bots:null}),'deny');    // bots 非对象 → 损坏
 await check(JSON.stringify({version:1,mainBotId:'m',recipes:{},bots:[]}),'deny');      // bots 数组 → 损坏
 await check(JSON.stringify({version:1,mainBotId:'m',recipes:{},bots:{w:{createdBy:'m'}}}),'deny'); // 真 worker → 拒
 console.log('f3 semantics: omitted-bots pass; version-mismatch/bad-shape/worker deny');
}
// f3：恢复撤销——unknown 窗口挂的 restrict 在文件恢复健康后撤销（agent/created 触发）
{
 const root='/tmp/bot-p614f3-probe/recovery';mkdirSync(root,{recursive:true});
 const meta=join(root,'bots.json');unlinkSync(meta); // 幂等：清掉上轮残留，确保从「文件缺失」起步
 const restricted=[],lifted=[];
 const mkAgent=id=>({id,ctx:{tools:{restrict:()=>{restricted.push(id);return()=>lifted.push(id)}}}});
 const listeners=new Map();
 const ctx={agents:{list:()=>[mkAgent('m1')]},tools:{definitions:()=>[{name:'job_list'}]},logger:{warn:()=>{}},on:(n,f)=>{listeners.set(n,[...(listeners.get(n)??[]),f]);return()=>{}}};
 registerWorkerRestriction(ctx,{config:{dataDir:root}});
 assert.deepEqual(restricted,['m1'],'missing file → fail-closed restrict');
 writeFileSync(meta,JSON.stringify({version:1,mainBotId:'m1',recipes:{}}));
 listeners.get('agent/created').forEach(f=>f({agent:mkAgent('x')}));
 assert.deepEqual(lifted,['m1'],'f3: restrict lifted once identity resolves to non-worker');
 console.log('f3 recovery: restrict lifted after healthy no-bots doc');
}
