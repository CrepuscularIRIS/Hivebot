import {it, expect} from '/tmp/bot-wt/P6-10/app/ui/node_modules/vitest/dist/index.js'
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {launchRuntime} from '/tmp/bot-wt/P6-10/app/sdk/tests/support/runtime.ts'
import {Slots} from '/tmp/bot-wt/P6-10/app/sdk/src/orchestration/slots.mjs'
import {registerCreateBot} from '/tmp/bot-wt/P6-10/app/sdk/src/orchestration/create.mjs'
const pkg='/tmp/bot-wt/P6-10/app/sdk'
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function until(fn:()=>Promise<boolean>,label:string){const deadline=Date.now()+30000;while(!await fn()){if(Date.now()>deadline)throw Error(label);await pause(30)}}
const text=(paceMs:number)=>({paceMs,chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'working'},{type:'block-end',index:0,block:{type:'text',text:'working'}},{type:'finish',reason:{kind:'stop'}}]})
const create=()=>({chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:'edge-create',name:'create_bot',argumentsDelta:JSON.stringify({name:'fifth',prompt:'work'})},{type:'block-end',index:0,block:{type:'tool-call',id:'edge-create',name:'create_bot',arguments:JSON.stringify({name:'fifth',prompt:'work'})}},{type:'finish',reason:{kind:'tool-calls'}}]})

for(const pendingFirst of [false,true]) it(`independent real Loader: ${pendingFirst?'pending worker ends first without over-release or ghost slot':'holder ends first, pbots/capacity and zero main requests'}`,async()=>{
 const home=mkdtempSync('/tmp/bot-p610f1a-edge-');process.env.HOME=home
 const data=join(home,'data');mkdirSync(data);mkdirSync(join(home,'fake','scripts'),{recursive:true})
 const overlay=join(home,'overlay.yml');writeFileSync(overlay,`- id: agent-default-model
  config: {provider: p2fake, model: p2fake}
- insert:
    - id: p2sdk-fake-llm
      name: 'file://${pkg}/tests/support/fake/plugin.mjs'
      config:
        providers:
          - id: p2fake
            name: fake
            models:
              - {id: p2fake, contextWindow: 131072}
    - id: p610-edge
      name: 'file://${pkg}/tests/support/orchestration-create-inspect.mjs'
`)
 const rt=await launchRuntime({env:{P2SDK_HOME:home,P2SDK_ORCH_DATA_DIR:data,P2SDK_PATCH:`${pkg}/profile/patches/orchestration.yml:${overlay}`}})
 let stream:any,pump:any;let requests=0
 try{
  const M=(await rt.client.call('session/create',{request:{}}) as any).sessionId
  const workers:string[]=[];for(let i=0;i<4;i++)workers.push((await rt.client.call('session/create',{request:{}}) as any).sessionId)
  writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{},bots:Object.fromEntries(workers.map(w=>[w,{createdBy:M}]))}))
  const script=(id:string,calls:any[])=>writeFileSync(join(home,'fake','scripts',`${id}.json`),JSON.stringify({calls}))
  const ctl=async(op:string,id=M)=>(await rt.client.call('p610/control',{request:{op,sessionId:id}})) as any
  const slots=async()=>(await ctl('slots')).used
  const rows=async()=>(await rt.client.call('session/list',{_request:{}}) as any).items.filter((v:any)=>workers.includes(v.sessionId))
  const running=async()=>(await rows()).filter((v:any)=>v.running).length
  const prompt=(id:string,tag:string)=>rt.client.call('session/prompt',{request:{sessionId:id,requestId:tag,mode:'queue',content:[{type:'text',text:'run'}]}})
  // Start each holder and observe it running before starting the next, making worker 4 the pending one.
  for(const [i,W] of workers.entries()){
   script(W,[text(i===(pendingFirst?3:0)?250:2500)])
   await prompt(W,`edge-${i}`)
   await until(async()=>(await rows()).find((v:any)=>v.sessionId===W)?.running===true,`worker ${i} running`)
  }
  expect(await running()).toBe(4);expect(await slots()).toBe(3)
  const ended=workers[pendingFirst?3:0]
  await until(async()=>(await rows()).find((v:any)=>v.sessionId===ended)?.running===false,'selected first worker idle')
  expect(await running()).toBe(3);expect(await slots()).toBe(3)
  console.log('EDGE first ended',pendingFirst?'pending':'holder','running=3 slots=3')
  stream=await rt.client.socket.open('pbots/orchestration.requests',{});const iter=stream[Symbol.asyncIterator]();expect((await iter.next()).value.ready).toBe(true)
  pump=(async()=>{try{for(;;){const n=await iter.next();if(n.done)break;requests++;await rt.client.call('pbots/orchestration.respond',{request:{requestId:n.value.requestId,error:{code:'test/unexpected-main',message:'capacity must reject'}}})}}catch{}})()
  script(M,[create(),text(5)]);await prompt(M,'edge-main')
  await until(async()=>(await ctl('read')).events.some((e:any)=>e.type==='turn/end'),'main end')
  const results=(await ctl('read')).events.filter((e:any)=>e.type==='tool/result')
  expect(results).toHaveLength(1);expect(results[0].isError).toBe(true);expect(JSON.stringify(results[0])).toContain('pbots/capacity');expect(requests).toBe(0)
  console.log('EDGE rejected',JSON.stringify(results),'main requests=',requests)
  await until(async()=>await running()===0,'all workers idle');expect(await slots()).toBe(0)
  script(workers[0],[text(100)]);await prompt(workers[0],'edge-again');await until(async()=>await slots()===1,'restarted holder occupies one')
  await until(async()=>await running()===0,'restarted holder idle');expect(await slots()).toBe(0)
  console.log('EDGE all ended slots=0; next manual turn 1→0; no ghost slots')
 }finally{stream?.cancel();await pump;await rt.stop();rmSync(home,{recursive:true,force:true})}
},90000)

it('actual create execute: both timeout and completed create release adopt pending, duplicate end does not double-release',async()=>{
 const home=mkdtempSync('/tmp/bot-p610f1a-release-');process.env.HOME=home
 try{
  for(const outcome of ['timeout','complete']){
   writeFileSync(join(home,'bots.json'),JSON.stringify({version:1,mainBotId:'main',recipes:{},bots:{manual:{createdBy:'main'},created:{createdBy:'main'}}}))
   const listeners=new Set<any>();let tool:any;let entered:any;const started=new Promise(r=>entered=r);let finish:any
   const pendingRequest=new Promise((resolve,reject)=>finish=outcome==='timeout'?()=>reject(Object.assign(Error('timeout'),{code:'main-unavailable'})):()=>resolve({sessionId:'created'}))
   const ctx={tools:{register:(d:any)=>tool=d},sessionPersistence:{flush:async()=>{}},on:(name:string,fn:any)=>{if(name==='session/event')listeners.add(fn);return()=>listeners.delete(fn)}}
   const slots=new Slots(1)
   const orch:any={config:{dataDir:home},slots,channel:{request:()=>{entered();return pendingRequest}},agentOf:async()=>({id:'created'}),delivery:{send:async()=>{}}}
   registerCreateBot(ctx as any,orch)
   const fire=(id:string,type:string)=>{for(const fn of [...listeners])fn({id},{type})}
   const call=tool.execute({name:'worker',prompt:'task'},{agent:{id:'main'}}).then((v:any)=>({value:v}),(e:any)=>({error:e}))
   await started;expect(slots.used).toBe(1)
   fire('manual','turn/start');expect(orch.slotHolds.has('manual')).toBe(false)
   finish();const result:any=await call
   if(outcome==='timeout')expect(result.error.code).toBe('main-unavailable')
   else{expect(result.value.sessionId).toBe('created');fire('created','turn/start');fire('created','turn/end')}
   expect(slots.used).toBe(1);expect(orch.slotHolds.get('manual')).toBe('turn')
   fire('created','turn/end');expect(slots.used).toBe(1)
   fire('manual','turn/end');expect(slots.used).toBe(0)
   console.log('ACTUAL CREATE',outcome,'release adopts pending; duplicate end preserves slot; final=0')
  }
 }finally{rmSync(home,{recursive:true,force:true})}
})
