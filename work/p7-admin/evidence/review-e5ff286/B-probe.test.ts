// vitest globals enabled: avoid loading a second mocks API from evidence directory
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
let failSync = false
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, open: async (...args: any[]) => {
    const h = await (fs.open as any)(...args)
    return { appendFile: (...a: any[]) => (h.appendFile as any)(...a), close: () => h.close(), sync: async () => {
      if (failSync) { failSync = false; throw new Error('B injected fsync EIO after REAL append') }
      await h.sync()
    } }
  } }
})
import { OperationsLedger } from '/tmp/bot-wt/P7-review-B/app/ui/main/admin/operations.ts'
import { wireAdminChannel } from '/tmp/bot-wt/P7-review-B/app/ui/main/admin/channel.ts'
const req = { action: 'modify', actor: 'test', turnCategory: 'user' as const, generation: 1, dedupeKey: 'same-key' }
const make = () => mkdtempSync(join(tmpdir(), 'bot-review-B-'))
const rows = (l: OperationsLedger) => readFileSync(l.file, 'utf8').trim().split('\n').map(JSON.parse)
it('B1: fsync-failed first append must not create duplicate durable dedupe keys on retry', async () => {
 const dir = make(); const l = new OperationsLedger(dir)
 try {
  await l.init(); failSync = true
  await expect(l.beginOperation(req)).rejects.toThrow(/APPEND_FAILED/)
  const second = await l.beginOperation(req)
  let finishError=''; try { await l.finishOperation(second.operationId, {outcome:'completed'}) } catch(e:any) { finishError=e.message }
  const begins = rows(l).filter(r => r.type === 'begin')
  l.close(); const reopened = new OperationsLedger(dir)
  try { await reopened.init(); const retry = await reopened.beginOperation(req)
   console.log('B1 OBSERVED', JSON.stringify({beginIds:begins.map(r=>r.operationId), retryId:second.operationId, finishError, replay:retry, view:reopened.readOperations()}))
   expect(begins).toHaveLength(1)
  } finally { reopened.close() }
 } finally { l.close(); rmSync(dir,{recursive:true,force:true}) }
})
it('B2: closed ledger must not remain a writer after replacement instance acquires lock', async () => {
 const dir=make(); const old=new OperationsLedger(dir); let fresh:OperationsLedger|undefined
 try {
  await old.init(); old.close(); fresh=new OperationsLedger(dir); await fresh.init()
  const a=await old.beginOperation(req); const b=await fresh.beginOperation(req)
  console.log('B2 OBSERVED',JSON.stringify({closedWriter:a,replacementWriter:b,rows:rows(fresh)}))
  expect(a.created && b.created).toBe(false)
 } finally { old.close(); fresh?.close(); rmSync(dir,{recursive:true,force:true}) }
})
it('B-controls: intact no-newline and UTF8 torn tail, concurrent dedupe and old receipts', async () => {
 const dir=make(); let l=new OperationsLedger(dir)
 try {
  await l.init(); const [a,b]=await Promise.all([l.beginOperation(req),l.beginOperation(req)])
  expect([a,b].filter(x=>x.created)).toHaveLength(1)
  await expect(l.recordReceipt(a.operationId,1)).rejects.toThrow(/INVALID_STATE/)
  l.close(); writeFileSync(l.file,readFileSync(l.file,'utf8').trimEnd())
  l=new OperationsLedger(dir); await l.init(); expect(l.readOperations().inProgress).toHaveLength(1)
  l.close(); const torn=Buffer.from('{"中文":"好'); appendFileSync(l.file,torn.subarray(0,torn.length-1))
  l=new OperationsLedger(dir); await l.init(); expect(l.readOperations().tailTruncated).toBe(true)
  expect(l.readOperations().inProgress).toHaveLength(1)
 } finally { l.close(); rmSync(dir,{recursive:true,force:true}) }
})
it('B-bridge lifecycle: close retains listeners but does not resubscribe on connect', async () => {
 const listeners:Function[]=[]; let opened=0, cancelled=0
 const dsh={onConnected:(f:Function)=>listeners.push(f),ready:async()=>({openStream:()=>{opened++;return{cancel:()=>cancelled++}}}),rpc:async()=>({ok:true})}
 for(let i=0;i<5;i++){const w=wireAdminChannel({dsh,verify:()=>({ok:true}),dispatch:async()=>({value:{}}),currentGeneration:()=>1}); await Promise.resolve(); w.close()}
 for(const f of listeners)f(2);await Promise.resolve()
 console.log('B bridge retained=',listeners.length,'opened=',opened,'cancelled=',cancelled)
 expect(opened).toBe(5)
})
