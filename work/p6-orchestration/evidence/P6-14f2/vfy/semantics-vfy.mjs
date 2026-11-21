import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {resolveWorkerStatus,registerEnvelope,registerWorkerRestriction,RESTRICT_TOOLS} from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs';
const root=mkdtempSync('/tmp/bot-p614f2-vfy-semantics-');
try {
 for (const state of ['unknown','empty-createdBy','healthy-main']) {
  const dir=join(root,state);await import('node:fs/promises').then(fs=>fs.mkdir(dir));
  if(state!=='unknown')writeFileSync(join(dir,'bots.json'),JSON.stringify({version:1,mainBotId:'m',recipes:{},bots:state==='empty-createdBy'?{m:{createdBy:''}}:{}}));
  const listeners=new Map(),restricted=[];
  const agent={id:'m',ctx:{tools:{restrict:({deny})=>{restricted.push(deny);return ()=>{}}}}};
  const ctx={agents:{list:()=>[agent]},tools:{definitions:()=>RESTRICT_TOOLS.map(name=>({name}))},on:(name,f)=>{listeners.set(name,f);return ()=>{}}};
  registerWorkerRestriction(ctx,{config:{dataDir:dir}});registerEnvelope(ctx,{config:{dataDir:dir}});
  const status=resolveWorkerStatus('m',dir);
  const guard=await listeners.get('tools/pre-execute')({agent,name:'subagent',arguments:{}},()=>({kind:'pass'}));
  assert.equal(status,state==='unknown'?'unknown':'main');
  assert.equal(restricted.length,state==='unknown'?1:0);
  assert.equal(guard.kind,state==='unknown'?'deny':'pass');
  console.log(JSON.stringify({state,status,restrictLayers:restricted.length,denyCount:restricted[0]?.length??0,guard:guard.kind}));
 }
 assert.equal(RESTRICT_TOOLS.length,17);
 console.log('PASS tri-state initial conditions; unknown closes both layers, known non-worker remains unrestricted');
} finally {rmSync(root,{recursive:true,force:true});}
