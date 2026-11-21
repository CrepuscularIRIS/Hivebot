import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {OperationsLedger, OPERATIONS_JSONL} from '/tmp/bot-wt/P7-F1/app/ui/main/admin/operations.ts';
const root=await fs.mkdtemp(join(process.env.HOME,'f1-extra-'));
const req={action:'modify',actor:'主机器人🙂',turnCategory:'user',generation:1,before:{name:'测试🙂'}};
let failures=0;
try {
 for(const mode of ['none','append','sync','rename','directory-sync']) {
  const dir=join(root,mode); await fs.mkdir(dir); const path=join(dir,OPERATIONS_JSONL);
  let l=new OperationsLedger(dir); await l.init(); const b=await l.beginOperation(req); l.close();
  const prefix=await fs.readFile(path); const torn=Buffer.from('{"finish":"中文🙂').subarray(0,-1); await fs.appendFile(path,torn); const original=await fs.readFile(path);
  const realOpen=fs.open,realRename=fs.rename;
  fs.open=async(...args)=>{const h=await realOpen(...args); const tmp=args[1]==='wx'; const directory=args[1]==='r'; return {appendFile:async data=>{if(tmp&&mode==='append'){await h.appendFile(data.subarray(0,7));throw Error('injected partial append EIO');}return h.appendFile(data);},sync:async()=>{if((tmp&&mode==='sync')||(directory&&mode==='directory-sync'))throw Error('injected sync EIO');return h.sync();},close:()=>h.close()};};
  fs.rename=async(...args)=>{if(mode==='rename')throw Error('injected rename EIO');return realRename(...args);}; syncBuiltinESMExports();
  try {
   l=new OperationsLedger(dir); await l.init();
   if(mode!=='none'){assert.throws(()=>l.readOperations(),/injected/);await assert.rejects(l.beginOperation(req),/injected/);if(mode!=='directory-sync')assert.deepEqual(await fs.readFile(path),original);}
   l.close(); fs.open=realOpen;fs.rename=realRename;syncBuiltinESMExports();
   for(let i=0;i<2;i++) {l=new OperationsLedger(dir);await l.init();const v=l.readOperations();assert.equal(v.tailTruncated,true);assert.deepEqual(v.inProgress[0].before,req.before);assert.equal(v.inProgress[0].actor,req.actor);assert.equal(v.inProgress[0].operationId,b.operationId);const bytes=await fs.readFile(path);assert.deepEqual(bytes.subarray(0,prefix.length),prefix);const repairs=bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse).filter(x=>x.type==='repaired');assert.equal(repairs.length,1);assert.equal(repairs[0].droppedBytes,torn.length);if(i===1){const next=await l.beginOperation({...req,dedupeKey:'after-repair'});assert.equal(next.created,true);}l.close();}
   assert.deepEqual((await fs.readdir(dir)).filter(x=>x.endsWith('.tmp')),[]);
   console.log(`PASS ${mode}: prefixBytes=${prefix.length} droppedBytes=${torn.length} repairCount=1 reopen=2 appendAfterRepair=true`);
  }catch(e){failures++;console.log('FAIL '+mode+' '+e.stack);}finally{fs.open=realOpen;fs.rename=realRename;syncBuiltinESMExports();l.close();}
 }
 console.log('SUMMARY failures='+failures);
}finally{await fs.rm(root,{recursive:true,force:true});}
process.exitCode=failures?1:0;
