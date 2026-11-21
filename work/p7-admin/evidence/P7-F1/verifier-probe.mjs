import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
const { OperationsLedger, OPERATIONS_JSONL } = await import('/tmp/bot-wt/P7-F1/app/ui/main/admin/operations.ts');
const root = await fs.mkdtemp(join(process.env.HOME, 'probe-'));
const req = (extra={}) => ({action:'modify',actor:'tester',turnCategory:'user',generation:1,...extra});
const file = d => join(d, OPERATIONS_JSONL);
const ledger = async d => { const l = new OperationsLedger(d); await l.init(); return l; };
let failures=0;
async function test(name, run) { const d=join(root,name); await fs.mkdir(d); try { await run(d); console.log('PASS '+name); } catch(e) { failures++; console.log('FAIL '+name+' '+e.stack); } }
try {
 await test('tail-ascii-repair', async d => {
  let l=await ledger(d); const b=await l.beginOperation(req()); l.close();
  await fs.appendFile(file(d),'{"version":1,"type":"finish","operationId":"'+b.operationId+'"');
  l=await ledger(d); assert.equal(l.readOperations().tailTruncated,true); assert.equal(l.readOperations().inProgress[0].operationId,b.operationId);
  assert.equal((await fs.readFile(file(d),'utf8')).trim().split('\n').map(JSON.parse).at(-1).type,'repaired'); l.close();
  l=await ledger(d); assert.equal(l.readOperations().tailTruncated,true); await l.beginOperation(req()); l.close();
 });
 await test('tail-unicode-repair', async d => {
  let l=await ledger(d); const b=await l.beginOperation(req({actor:'主机器人',before:{name:'测试'}})); l.close();
  await fs.appendFile(file(d),'{"version":1,"type":"finish","operationId":"'+b.operationId+'"');
  l=await ledger(d); assert.equal(l.readOperations().tailTruncated,true); l.close();
  l=await ledger(d); try { assert.equal(l.readOperations().inProgress[0].operationId,b.operationId); } finally { l.close(); }
 });
 for (const mode of ['middle-corruption','unknown-version','unknown-version-no-newline']) await test(mode, async d => {
  let l=await ledger(d); await l.beginOperation(req()); l.close();
  const text=await fs.readFile(file(d),'utf8');
  if(mode==='middle-corruption') await fs.writeFile(file(d),text+'{bad}\n'+text);
  else { const v=JSON.parse(text.trim()); v.version=999; await fs.appendFile(file(d),JSON.stringify(v)+(mode==='unknown-version'?'\n':'')); }
  const before=await fs.readFile(file(d)); l=await ledger(d);
  try { assert.throws(()=>l.readOperations(),/PBOTS_OPS_UNTRUSTED/); await assert.rejects(l.beginOperation(req()),/PBOTS_OPS_UNTRUSTED/); assert.deepEqual(await fs.readFile(file(d)),before); } finally { l.close(); }
 });
 await test('missing-file-live', async d=>{ const l=await ledger(d); await l.beginOperation(req()); await fs.unlink(file(d)); try { await assert.rejects(l.beginOperation(req()),/PBOTS_OPS_LOST/); await assert.rejects(fs.stat(file(d)),{code:'ENOENT'}); } finally { l.close(); } });
 await test('concurrent100-undo-four-state-reopen', async d=>{
  let l=await ledger(d); const r=await Promise.all(Array.from({length:100},()=>l.beginOperation(req({dedupeKey:'same'})))); assert.equal(r.filter(x=>x.created).length,1); assert.equal(new Set(r.map(x=>x.operationId)).size,1);
  const completed=await l.beginOperation(req()); await l.finishOperation(completed.operationId,{outcome:'completed'});
  const failed=await l.beginOperation(req()); await l.finishOperation(failed.operationId,{outcome:'failed',error:'offline'});
  const before={name:'old',enabled:true}; let state=structuredClone(before);
  const orig=await l.beginOperation(req({before})); state={name:'new',enabled:false}; await l.finishOperation(orig.operationId,{outcome:'completed',after:state,undo:{handle:'replace-state',restore:before}});
  const handle=l.readUndo(orig.operationId); const u=await l.beginOperation(req({undoOf:orig.operationId,before:state})); state=structuredClone(handle.restore); await l.finishOperation(u.operationId,{outcome:'completed',after:state}); assert.deepEqual(state,before); l.close();
  l=await ledger(d); try { const v=l.readOperations(); assert.deepEqual(v.inProgress.map(x=>x.operationId),[r[0].operationId]); assert.deepEqual(v.completed.map(x=>x.operationId),[completed.operationId,u.operationId]); assert.deepEqual(v.failed.map(x=>x.operationId),[failed.operationId]); assert.deepEqual(v.undone.map(x=>x.operationId),[orig.operationId]); assert.deepEqual(v.completed.find(x=>x.operationId===u.operationId).after,before); assert.deepEqual(l.readUndo(orig.operationId),handle); assert.equal((await l.beginOperation(req({dedupeKey:'same'}))).created,false); } finally { l.close(); }
 });
 await test('fsync-block-and-failure', async d=>{
  const original=fs.open; let release; const gate=new Promise(r=>release=r); const events=[]; let effects=0; let inject=true;
  fs.open=async(...args)=>{ const h=await original(...args); if(!inject) return h; return {appendFile:async data=>{events.push('append'); await h.appendFile(data);},sync:async()=>{events.push('sync-start'); await gate; events.push('sync-fail'); throw Object.assign(new Error('injected fd fsync EIO'),{code:'EIO'});},close:()=>h.close()}; }; syncBuiltinESMExports();
  const l=await ledger(d); try { const p=l.beginOperation(req({dedupeKey:'flush'})).then(r=>{if(r.created) effects++;return r;}); await new Promise(r=>setTimeout(r,30)); assert.deepEqual(events,['append','sync-start']); assert.equal(effects,0); release(); await assert.rejects(p,/PBOTS_OPS_APPEND_FAILED/); assert.equal(effects,0); assert.equal(l.readOperations().inProgress.length,0); console.log('DETAIL fsync '+JSON.stringify({events,effects,physicalBytes:(await fs.stat(file(d))).size})); } finally { inject=false; fs.open=original; syncBuiltinESMExports(); l.close(); }
 });
 await test('repair-audit-fsync-failure-restart', async d=>{
  let l=await ledger(d); await l.beginOperation(req()); l.close(); await fs.appendFile(file(d),'{torn');
  const original=fs.open; fs.open=async()=>{throw new Error('repair open EIO');}; syncBuiltinESMExports();
  try { l=await ledger(d); assert.throws(()=>l.readOperations(),/repair open EIO/); l.close(); } finally { fs.open=original; syncBuiltinESMExports(); }
  l=await ledger(d); try { assert.equal(l.readOperations().tailTruncated,true,'repair must remain visible after failed repair append + restart'); } finally {l.close();}
 });
 console.log('SUMMARY failures='+failures);
} finally { await fs.rm(root,{recursive:true,force:true}); }
process.exitCode=failures?1:0;
