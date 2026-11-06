// 独立真实 FS 探针；只在指定阶段挂屏障/注入 EIO，不模拟 ledger 状态。
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
let gate: {stage: string, entered: () => void, wait: Promise<void>, fail?: boolean} | undefined
let fault: 'sync' | 'partial' | 'zero' | undefined
async function pause(stage: string) {
  if (gate?.stage !== stage) return
  const g = gate; gate = undefined; g.entered(); await g.wait
  if (g.fail) throw new Error('verify EIO '+stage)
}
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return {...fs,
    readFile: async (...args: any[]) => { await pause('read'); return (fs.readFile as any)(...args) },
    rename: async (...args: any[]) => { await pause('rename'); return (fs.rename as any)(...args) },
    open: async (...args: any[]) => {
      const h = await (fs.open as any)(...args)
      const kind = args[1] === 'r' ? 'dir' : args[1] === 'wx' ? 'repair' : 'append'
      return {
        appendFile: async (data: any) => {
          await pause(kind+'-before')
          if (fault === 'zero') { fault = undefined; throw new Error('verify zero-byte EIO') }
          if (fault === 'partial') { fault = undefined; await h.appendFile(Buffer.from(data).subarray(0,17)); throw new Error('verify partial EIO') }
          await h.appendFile(data)
          await pause(kind+'-after')
        },
        sync: async () => { await pause(kind+'-sync'); if(fault==='sync'){fault=undefined;throw new Error('verify sync EIO after REAL append')}; await h.sync() },
        close: async () => { await pause(kind+'-close'); await h.close() },
      }
    },
  }
})
import { OperationsLedger } from '/tmp/bot-wt/P7-F1f2-verify/app/ui/main/admin/operations.ts'
const req = {action:'modify',actor:'verify',turnCategory:'user' as const,generation:1,dedupeKey:'same-key'}
const dirs: string[] = []; const ledgers: OperationsLedger[] = []
const make = () => {const d=mkdtempSync(join(tmpdir(),'bot-verify-f1f2-'));dirs.push(d);return d}
const ledger = (d: string) => {const l=new OperationsLedger(d);ledgers.push(l);return l}
const rows = (l: OperationsLedger) => readFileSync(l.file,'utf8').trim().split('\n').map(x=>JSON.parse(x))
function deferred(){let resolve!:()=>void; const promise=new Promise<void>(r=>resolve=r);return {promise,resolve}}
function block(stage:string,fail=false){const entered=deferred(),release=deferred();gate={stage,entered:entered.resolve,wait:release.promise,fail};return {entered:entered.promise,release:release.resolve}}
const result = (p:Promise<any>) => p.then(value=>({value}),error=>({error:error.code ?? error.message}))
afterEach(()=>{fault=undefined;gate=undefined;for(const l of ledgers.splice(0))l.close();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true})})

it('B1 adapted: first sync EIO retains bytes, permanently blocks retry, reopen restores only original ID and finish',async()=>{
 const d=make(),l=ledger(d);await l.init();fault='sync'
 await expect(l.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 const bytes=readFileSync(l.file),id=rows(l)[0].operationId
 for(let i=0;i<3;i++)await expect(l.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 await expect(l.finishOperation(id,{outcome:'completed'})).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 await expect(l.recordReceipt(id,2)).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 await l.init() // init 不得使同一失败实例复活
 await expect(l.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 expect(()=>l.readOperations()).toThrow(/APPEND_FAILED/);expect(readFileSync(l.file)).toEqual(bytes)
 l.close();const fresh=ledger(d);await fresh.init()
 expect(await fresh.beginOperation(req)).toEqual({created:false,operationId:id,status:'inProgress'})
 await fresh.finishOperation(id,{outcome:'completed'});await fresh.recordReceipt(id,2)
 fresh.close();const reopened=ledger(d);await reopened.init()
 expect(await reopened.beginOperation(req)).toEqual({created:false,operationId:id,status:'completed'})
 expect(rows(reopened).filter(x=>x.type==='begin')).toHaveLength(1)
 console.log('B1 actual: one durable begin, retries rejected APPEND_FAILED, reopen same ID, finish/receipt persisted')
})
it('B2 adapted: old reference cannot write or release replacement lock',async()=>{
 const d=make(),old=ledger(d);await old.init();old.close();const fresh=ledger(d);await fresh.init()
 await expect(old.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_CLOSED'})
 await expect(old.init()).rejects.toMatchObject({code:'PBOTS_OPS_CLOSED'})
 old.close();expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/)
 expect((await fresh.beginOperation(req)).created).toBe(true);expect(rows(fresh)).toHaveLength(1)
})
// 每个阶段分别验证：已启动任务允许结算，三个排队的不同写 API + init 全拒，锁直到 close handle 完成。
it.each(['append-before','append-after','append-sync','append-close'])('close at %s retains lock and rejects queued begin/finish/receipt/init',async(stage)=>{
 const d=make(),old=ledger(d);await old.init();const b=block(stage)
 const active=result(old.beginOperation(req));await b.entered
 const queue=[result(old.beginOperation({...req,dedupeKey:'queued'})),result(old.finishOperation('queued',{outcome:'completed'})),result(old.recordReceipt('queued',2)),result(old.init())]
 old.close();expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/)
 await expect(old.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_CLOSED'})
 b.release();expect((await active).value.created).toBe(true)
 expect(await Promise.all(queue)).toEqual(Array(4).fill({error:'PBOTS_OPS_CLOSED'}))
 const fresh=ledger(d);await fresh.init();expect((await fresh.beginOperation(req)).created).toBe(false)
 expect(rows(fresh).filter(x=>x.type==='begin')).toHaveLength(1)
 await expect(old.finishOperation(rows(fresh)[0].operationId,{outcome:'completed'})).rejects.toMatchObject({code:'PBOTS_OPS_CLOSED'})
 console.log('close phase',stage,'active settled; queued 4 rejected; only then replacement acquired')
})
it.each(['read','repair-before','repair-sync','rename','dir-sync'])('close during init torn-tail repair at %s retains lock',async(stage)=>{
 const d=make(),seed=ledger(d);await seed.init();const {operationId}=await seed.beginOperation(req);seed.close()
 appendFileSync(seed.file,Buffer.from('{"中文":"好').subarray(0,-1))
 const old=ledger(d),b=block(stage),active=result(old.init());await b.entered
 const queued=result(old.beginOperation(req));old.close();expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/)
 b.release();expect(await active).toEqual({value:undefined});expect(await queued).toEqual({error:'PBOTS_OPS_CLOSED'})
 const fresh=ledger(d);await fresh.init();expect((await fresh.beginOperation(req)).operationId).toBe(operationId)
 expect(fresh.readOperations().tailTruncated).toBe(true);expect(rows(fresh).filter(x=>x.type==='repaired')).toHaveLength(1)
 console.log('repair phase',stage,'replacement acquired only after init settled, original ID retained')
})
it('close+failed inflight sync does not revive; replacement owns actual durable begin',async()=>{
 const d=make(),old=ledger(d);await old.init();const b=block('append-sync',true)
 const active=result(old.beginOperation(req));await b.entered;const bytes=readFileSync(old.file)
 const queued=result(old.beginOperation(req));old.close();expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/)
 b.release();expect(await active).toEqual({error:'PBOTS_OPS_APPEND_FAILED'});expect(await queued).toEqual({error:'PBOTS_OPS_CLOSED'})
 expect(readFileSync(old.file)).toEqual(bytes);const fresh=ledger(d);await fresh.init()
 expect((await fresh.beginOperation(req)).operationId).toBe(rows(fresh)[0].operationId)
 await expect(old.init()).rejects.toMatchObject({code:'PBOTS_OPS_CLOSED'});old.close();expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/)
})
it('partial append EIO fails closed and real torn bytes repaired only on reopen; zero-byte EIO permits retry',async()=>{
 const d=make(),l=ledger(d);await l.init();fault='zero'
 await expect(l.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 expect((await l.beginOperation(req)).created).toBe(true)
 fault='partial';await expect(l.beginOperation({...req,dedupeKey:'partial'})).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 const bytes=readFileSync(l.file);await expect(l.beginOperation(req)).rejects.toMatchObject({code:'PBOTS_OPS_APPEND_FAILED'})
 expect(readFileSync(l.file)).toEqual(bytes);l.close();const fresh=ledger(d);await fresh.init()
 expect(fresh.readOperations().tailTruncated).toBe(true);expect(fresh.readOperations().inProgress).toHaveLength(1)
 expect((await fresh.beginOperation(req)).created).toBe(false)
})
it('close before init starts rejects it without filesystem work',async()=>{
 const d=make(),old=ledger(d),active=result(old.init());old.close()
 expect(()=>new OperationsLedger(d)).toThrow(/LOCKED/);expect(await active).toEqual({error:'PBOTS_OPS_CLOSED'})
 const fresh=ledger(d);await fresh.init();expect((await fresh.beginOperation(req)).created).toBe(true)
})
it('normal independent controls: concurrent dedupe, newline repair, UTF8 repair, view/undo/receipt',async()=>{
 const d=make(),l=ledger(d);await l.init();const r=await Promise.all(Array.from({length:12},()=>l.beginOperation(req)))
 expect(r.filter(x=>x.created)).toHaveLength(1);const id=r[0].operationId
 await l.finishOperation(id,{outcome:'completed',undo:{handle:'restore:verify'}});expect(l.readUndo(id)?.handle).toBe('restore:verify')
 await expect(l.recordReceipt(id,1)).rejects.toThrow(/INVALID_STATE/);await l.recordReceipt(id,2)
 const view=l.readOperations();l.close();writeFileSync(l.file,readFileSync(l.file,'utf8').trimEnd())
 const fresh=ledger(d);await fresh.init();expect(fresh.readOperations()).toEqual(view)
 expect(fresh.readUndo(id)).toEqual({handle:'restore:verify'});await expect(fresh.recordReceipt(id,3)).rejects.toThrow(/INVALID_STATE/)
 fresh.close();appendFileSync(l.file,Buffer.from('{"中文":"好').subarray(0,-1))
 const repaired=ledger(d);await repaired.init();expect(repaired.readOperations().completed).toHaveLength(1);expect(repaired.readOperations().tailTruncated).toBe(true)
})
