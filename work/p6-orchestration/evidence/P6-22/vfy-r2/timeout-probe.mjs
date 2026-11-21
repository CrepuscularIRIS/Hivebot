import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const root='/tmp/bot-wt/P6-22/work/p6-orchestration/evidence/D3-orch'
const raw=root+'/rounds/r2/heldout/raw/'
const rows=readFileSync(raw+'attach2-backup-index-3.jsonl','utf8').trim().split('\n').map(JSON.parse)
const [meta,...frames]=rows
const workers=meta.workers.map(w=>({frames:readFileSync(raw+w.raw,'utf8').trim().split('\n').slice(1).map(JSON.parse)}))
const scorer=root+'/score.mjs'; const source=readFileSync(scorer,'utf8')
const mod=source.slice(0,source.indexOf('const selfOnly =')).replaceAll('import.meta.url',JSON.stringify(pathToFileURL(scorer).href))
const { scoreGroup }=await import('data:text/javascript;base64,'+Buffer.from(mod).toString('base64'))
const entry=JSON.parse(readFileSync(root+'/prompts.json','utf8')).cases.find(x=>x.id===meta.promptId)
const result=scoreGroup(entry,meta,frames)
assert.equal(meta.outcome,'timeout'); assert.deepEqual(meta.timeouts,['worker2'])
assert.equal(result.complete,false); assert.equal(result.routeOk,false)
assert.equal(result.scoredTurn.endReason,'completed'); assert.equal(result.turn0.create,1)
assert.equal(result.scoredTurn.create,1); assert.equal(result.scoredTurn.send,0)
assert.equal(meta.retryCount,0); assert.equal(meta.rateLimited,false)
const counts=workers.map(w=>w.frames.filter(f=>f.type==='event'&&f.event.type==='turn/end').length)
assert.deepEqual(counts,[1,1])
for (const w of workers) assert(w.frames.some(f=>f.event?.type==='turn/end'&&f.event.data?.reason?.kind==='completed'))
const events=[...frames,...workers.flatMap(w=>w.frames)]
assert.equal(events.filter(f=>f.event?.type==='llm/retry').length,0)
console.log('raw outcome=timeout; timeouts=[worker2]; retryCount=0; rateLimited=false; llm/retry=0')
console.log('main user turn0 completed create=1; scoring turn completed create=1 send=0; both workers completed; worker turn/end counts=[1,1]')
// Negative-path replay of the exact wait primitive. No SDK/model/process spawn; virtual clock expires its budget.
const run=readFileSync(root+'/run.mjs','utf8'); const start=run.indexOf('async function waitWorkersEnded('); const end=run.indexOf('\n/**',start)
const factory=new Function('Date','sleep','T_WORKER','runtimeExited','rateLimited',run.slice(start,end)+'; return waitWorkersEnded')
let clock=0
const wait=factory({now:()=>{clock+=420001; return clock}},async()=>{},420000,false,false)
const waited=await wait(workers,2,1e12)
assert.equal(waited.ok,false); assert.deepEqual(waited.counts,[1,1])
console.log('BAD-PATH PASS: exact waitWorkersEnded(workers,2) returns {ok:false,counts:[1,1]} although both workers already completed; no load, no model inactivity needed')
// Diagnostic only: never write modified metadata into official scores.
const closedDiagnostic=scoreGroup(entry,{...meta,outcome:'turn/end'},frames)
assert.equal(closedDiagnostic.complete,true); assert.equal(closedDiagnostic.routeOk,false)
console.log('Diagnostic-only outcome override confirms closed main routing violation; official frozen score remains incomplete/invalid, not reclassified or counted correct')
console.log('PASS timeout assertions; no model rerun')
