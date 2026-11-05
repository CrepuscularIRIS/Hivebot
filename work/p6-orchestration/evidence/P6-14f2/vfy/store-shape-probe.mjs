import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {BotsMetaStore} from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/store.ts';
import {resolveWorkerStatus,registerEnvelope} from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs';
const dir=mkdtempSync('/tmp/bot-p614f2-vfy-store-');
const store=new BotsMetaStore(dir);
try {
  await store.init();
  await store.patchMainBotId('main-real-store');
  const disk=JSON.parse(readFileSync(join(dir,'bots.json'),'utf8'));
  assert.equal(Object.hasOwn(disk,'bots'),false);
  let guard;
  registerEnvelope({on:(_,f)=>{guard=f;return ()=>{}}},{config:{dataDir:dir}});
  const status=resolveWorkerStatus('main-real-store',dir);
  const verdict=await guard({agent:{id:'main-real-store'},name:'create_bot',arguments:{name:'worker',prompt:'test'}},()=>({kind:'pass-through'}));
  assert.equal(status,'unknown');
  assert.equal(verdict.kind,'deny');
  console.log(JSON.stringify({finding:'CONFIRMED: real store valid no-worker document misclassified as unknown; main create_bot denied',disk,status,verdict},null,2));
} finally {store.close();rmSync(dir,{recursive:true,force:true});}
