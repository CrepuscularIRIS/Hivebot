import {mkdtempSync,appendFileSync,readFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
let barrier: {entered:()=>void,wait:Promise<void>,fail:boolean} | undefined
vi.mock('node:fs/promises',async(original)=>{
 const fs=await original<typeof import('node:fs/promises')>()
 return {...fs,open:async(...args:any[])=>{
  const h=await (fs.open as any)(...args)
  return {appendFile:(...a:any[])=>(h.appendFile as any)(...a),close:()=>h.close(),sync:async()=>{
   if(barrier){const b=barrier;barrier=undefined;b.entered();await b.wait;if(b.fail)throw new Error('verify repair sync EIO')}
   await h.sync()
  }}
 }}
})
import {OperationsLedger} from '/tmp/bot-wt/P7-F1f2-verify/app/ui/main/admin/operations.ts'
const req={action:'modify',actor:'verify',turnCategory:'user' as const,generation:1,dedupeKey:'key'}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve}}
const settled=(p:Promise<any>)=>p.then(value=>({value}),e=>({error:e.code??e.message}))
it.each(['finish','receipt'])('already active %s settles despite close, queued writes cannot run',async(kind)=>{
 const d=mkdtempSync(join(tmpdir(),'bot-verify-extra-'));const old=new OperationsLedger(d);let fresh:OperationsLedger|undefined
 const entered=deferred(),release=deferred()
 try{
  await old.init();const {operationId}=await old.beginOperation(req)
  barrier={entered:entered.resolve,wait:release.promise,fail:false}
  const active=settled(kind==='finish'?old.finishOperation(operationId,{outcome:'completed'}):old.recordReceipt(operationId,2))
  await entered.promise;const queued=settled(old.beginOperation({...req,dedupeKey:'queued'}));old.close()
  expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/);release.resolve()
  expect(await active).toEqual({value:undefined});expect(await queued).toEqual({error:'PBOTS_OPS_CLOSED'})
  fresh=new OperationsLedger(d);await fresh.init();const view=fresh.readOperations()
  if(kind==='finish')expect(view.completed[0].operationId).toBe(operationId)
  else expect(view.inProgress[0].receipt).toBeDefined()
  await expect(old.recordReceipt(operationId,3)).rejects.toThrow(/CLOSED/)
 }finally{release.resolve();old.close();fresh?.close();rmSync(d,{recursive:true,force:true})}
})
it.each(['newline','torn'])('close during failing %s init repair: lock retained, old poisoned, new init can recover',async(mode)=>{
 const d=mkdtempSync(join(tmpdir(),'bot-verify-extra-'));let old=new OperationsLedger(d);let fresh:OperationsLedger|undefined
 const entered=deferred(),release=deferred()
 try{
  await old.init();const {operationId}=await old.beginOperation(req);old.close()
  if(mode==='torn')appendFileSync(old.file,'{"incomplete":')
  else {const fs=await import('node:fs');fs.writeFileSync(old.file,readFileSync(old.file,'utf8').trimEnd())}
  old=new OperationsLedger(d);barrier={entered:entered.resolve,wait:release.promise,fail:true}
  const active=settled(old.init());await entered.promise
  const queued=settled(old.beginOperation(req));old.close();expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/)
  release.resolve();expect(await active).toEqual({value:undefined});expect(await queued).toEqual({error:'PBOTS_OPS_CLOSED'})
  expect(()=>old.readOperations()).toThrow();await expect(old.init()).rejects.toThrow(/CLOSED/)
  fresh=new OperationsLedger(d);await fresh.init();expect((await fresh.beginOperation(req)).operationId).toBe(operationId)
  await fresh.finishOperation(operationId,{outcome:'completed'});expect(fresh.readOperations().completed).toHaveLength(1)
 }finally{release.resolve();old.close();fresh?.close();rmSync(d,{recursive:true,force:true})}
})
