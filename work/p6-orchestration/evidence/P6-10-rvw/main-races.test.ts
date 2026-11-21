import {mkdtemp,mkdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {BotsMetaStore} from '/home/lingxufeng/bot/app/ui/main/m3-meta/store.ts'
import {createWorkerBot} from '/home/lingxufeng/bot/app/ui/main/m3-meta/orchestrate.ts'
import {wireOrchChannel} from '/home/lingxufeng/bot/app/ui/main/m3-meta/orch-channel.ts'
const gates=vi.hoisted(()=>({rename:undefined as any}))
vi.mock('node:fs/promises',async(importOriginal)=>{const actual=await importOriginal<any>();return {...actual,rename:async(...args:any[])=>{if(gates.rename)await gates.rename(...args);return actual.rename(...args)}}})
const root='/tmp/vfy-r-p610-b';process.env.HOME=join(root,'home');const defer=()=>Promise.withResolvers<void>();const tick=()=>new Promise(r=>setImmediate(r))
async function wait(f:()=>boolean){for(let i=0;i<200;i++){if(f())return;await tick()}throw Error('barrier timeout')}
async function rig(){const dir=await mkdtemp(join(root,'meta-'));const store=new BotsMetaStore(dir);await store.init();await store.patchMainBotId('A');return{dir,store}}
const req=(mainBotId='A')=>({requestId:'stable-request',kind:'create-bot',name:'worker',prompt:'task',mainBotId})
const fakeDsh=()=>{const calls:any[]=[];return{calls,rpc:async(method:string,args:any)=>{calls.push({method,args});return{ok:true as const,value:{sessionId:args.request.sessionId}}}}}
describe('B adversarial main probes',()=>{
 it('CONFIRMED failed main patch is read before commit, and worker persists against rolled-back identity',async()=>{
  const {dir,store}=await rig();await store.patchMainBotId('B');const delayedRequest=req('B');await store.patchMainBotId('A');const arrived=defer(),release=defer();let first=true;
  gates.rename=async()=>{if(first){first=false;arrived.resolve();await release.promise;throw Error('injected rename failure')}};
  const patch=store.patchMainBotId('B').catch(e=>e);await arrived.promise;
  expect(store.read().mainBotId).toBe('B');expect(JSON.parse(await readFile(store.file,'utf8')).mainBotId).toBe('A');
  const dsh=fakeDsh();const creation=createWorkerBot(dsh,store,delayedRequest,{dataDir:dir});await tick();release.resolve();await patch;
  const result=await creation;gates.rename=undefined;expect(result.ok).toBe(true);const meta=store.read();expect(meta.mainBotId).toBe('A');expect(Object.values(meta.bots!)[0].createdBy).toBe('B');expect(dsh.calls.filter(x=>x.method==='session/create')).toHaveLength(1);
  console.log('DIRTY READ: failed patch A->B; final main=A, createdBy=B, session/create=1');store.close()
 });
 it('REFUTED store concurrent puts lose updates',async()=>{
  const{store}=await rig();await Promise.all(Array.from({length:20},(_,i)=>store.putBot(`w${i}`,'A')));expect(Object.keys(store.read().bots!)).toHaveLength(20);expect(Object.keys(JSON.parse(await readFile(store.file,'utf8')).bots)).toHaveLength(20);store.close();console.log('STORE WRITERS: all 20 worker entries retained')
 });
 it('CONTROL artificially replayed frame creates two sessions; actual SDK generator has no replay',async()=>{
  const{dir,store}=await rig();const dsh=fakeDsh();let onFrame:any;let done=0;const responses:any[]=[];
  const wired=wireOrchChannel({dsh:{onConnected:()=>{},ready:async()=>({openStream(_e:any,_a:any,fn:any){onFrame=fn;return{cancel(){}}}}),rpc:async(_m:any,args:any)=>{responses.push(args);return{ok:responses.length===1}}},create:async request=>{const v=await createWorkerBot(dsh,store,request as any,{dataDir:dir});done++;return v},log:()=>{}});
  await wait(()=>!!onFrame);onFrame({type:'item',value:req()});onFrame({type:'item',value:req()});await wait(()=>done===2&&responses.length===2);
  const ids=dsh.calls.filter(x=>x.method==='session/create').map(x=>x.args.request.sessionId);expect(new Set(ids).size).toBe(2);console.log('ARTIFICIAL DUPLICATE CONTROL (not a production finding): requestId=stable-request, unique sessions='+ids.length);wired.close();store.close()
 });
})
