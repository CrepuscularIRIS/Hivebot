import {it,expect} from '/tmp/bot-wt/P6-10/app/ui/node_modules/vitest/dist/index.js'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {launchRuntime} from '/tmp/bot-wt/P6-10/app/sdk/tests/support/runtime.ts'
const pkg='/tmp/bot-wt/P6-10/app/sdk'
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function until(fn:()=>Promise<boolean>,label:string){const end=Date.now()+30000;while(!await fn()){if(Date.now()>end)throw Error(label);await sleep(50)}}
function setup(){
 const home=mkdtempSync('/tmp/bot-p610f1-extra-');process.env.HOME=home
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
    - id: p610-extra
      name: 'file:///home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f1-vfy/mixed-inspect.mjs'
`)
 const env={P2SDK_HOME:home,P2SDK_ORCH_DATA_DIR:data,P2SDK_PATCH:`${pkg}/profile/patches/orchestration.yml:${overlay}`}
 return {home,data,env,script:(id:string,calls:any[])=>writeFileSync(join(home,'fake','scripts',`${id}.json`),JSON.stringify({calls}))}
}
const text=(paceMs=5)=>({paceMs,chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'working'},{type:'block-end',index:0,block:{type:'text',text:'working'}},{type:'finish',reason:{kind:'stop'}}]})
const create=(id:string,paceMs=5)=>({paceMs,chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name:'create_bot',argumentsDelta:JSON.stringify({name:'w',prompt:'p'})},{type:'block-end',index:0,block:{type:'tool-call',id,name:'create_bot',arguments:JSON.stringify({name:'w',prompt:'p'})}},{type:'finish',reason:{kind:'tool-calls'}}]})
it('real Loader: user steered after worker claim stays tainted in same turn; next pure user turn recovers',async()=>{
 const s=setup();const rt=await launchRuntime({env:s.env})
 let stream:any,pump:any;let requests=0
 try{
  const M=(await rt.client.call('session/create',{request:{agentPreset:'standard'}}) as any).sessionId
  writeFileSync(join(s.data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{}}))
  s.script(M,[create('mixed-denied',500),text(),create('clean-allowed'),text()])
  const ctl=async(op:string)=>(await rt.client.call('p610/control',{request:{op,sessionId:M,tool:'create_bot'}})) as any
  stream=await rt.client.socket.open('pbots/orchestration.requests',{})
  const iter=stream[Symbol.asyncIterator]();expect((await iter.next()).value.ready).toBe(true)
  pump=(async()=>{try{for(;;){const n=await iter.next();if(n.done)break;requests++;await rt.client.call('pbots/orchestration.respond',{request:{requestId:n.value.requestId,error:{code:'test/clean-reached-main',message:'clean turn reached main'}}})}}catch{}})()
  await ctl('inject')
  await until(async()=>(await ctl('claims')).claims.some((c:any)=>c.kind==='pbots-worker'),'worker claimed')
  expect((await ctl('visible')).visible).toBe(false)
  await rt.client.call('session/prompt',{request:{sessionId:M,requestId:'mixed-user-steer',mode:'steer',content:[{type:'text',text:'user joining same turn'}]}})
  await until(async()=>(await ctl('read')).events.some((e:any)=>e.type==='turn/end'),'mixed end')
  const claims=(await ctl('claims')).claims;console.log('MIXED claims',claims)
  const worker=claims.find((c:any)=>c.kind==='pbots-worker');const user=claims.find((c:any)=>c.kind==='user')
  expect(user).toBeDefined();expect(user.turn).toBe(worker.turn)
  expect(requests).toBe(0);expect((await ctl('visible')).visible).toBe(false)
  const events=(await ctl('read')).events;expect(events.find((e:any)=>e.type==='tool/result').isError).toBe(true)
  await rt.client.call('session/prompt',{request:{sessionId:M,requestId:'clean-user',mode:'queue',content:[{type:'text',text:'new clean turn'}]}})
  await until(async()=>(await ctl('read')).events.filter((e:any)=>e.type==='turn/end').length>=2,'clean end')
  expect(requests).toBe(1);expect((await ctl('visible')).visible).toBe(true)
  console.log('MIXED requests=0; clean next turn requests=1; visibility restored=true', (await ctl('read')).events.filter((e:any)=>e.type==='tool/result'))
 }finally{stream?.cancel();await pump;await rt.stop()}
},90000)
it('real Loader: manually running worker occupies 1, SDK crash interrupts it, restart uses 0 then next manual turn 1→0',async()=>{
 const s=setup();let rt=await launchRuntime({env:s.env})
 try{
  const M=(await rt.client.call('session/create',{request:{}}) as any).sessionId
  const W=(await rt.client.call('session/create',{request:{}}) as any).sessionId
  writeFileSync(join(s.data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{},bots:{[W]:{createdBy:M}}}))
  s.script(W,[text(4000)])
  const slots=async()=>((await rt.client.call('p610/control',{request:{op:'slots'}})) as any).used
  const log=async()=>((await rt.client.call('p610/control',{request:{op:'read',sessionId:W}})) as any).events
  const prompt=async(id:string)=>rt.client.call('session/prompt',{request:{sessionId:W,requestId:id,mode:'queue',content:[{type:'text',text:'manual'}]}})
  await prompt('before-crash');await until(async()=>await slots()===1,'worker adopted')
  expect((await rt.client.call('session/list',{_request:{}}) as any).items.find((v:any)=>v.sessionId===W).running).toBe(true)
  await log() // flush running turn to disk before abrupt loss
  const dshPid=Number(readFileSync(join(s.home,'launcher.lock'),'utf8').trim().split('\n')[1].split(':')[0])
  const exited=new Promise<void>(resolve=>rt.child.once('exit',()=>resolve()))
  process.kill(dshPid,'SIGKILL');await exited;rt.client.close()
  rt=await launchRuntime({env:s.env})
  const row=(await rt.client.call('session/list',{_request:{}}) as any).items.find((v:any)=>v.sessionId===W)
  console.log('RESTART interrupted worker', {exists:!!row,running:row?.running,slots:await slots()})
  expect(row).toBeDefined();expect(row.running).toBe(false);expect(await slots()).toBe(0)
  s.script(W,[text(250)])
  const oldEnds=(await log()).filter((e:any)=>e.type==='turn/end').length
  await prompt('after-crash');await until(async()=>await slots()===1,'restart worker re-adopted')
  await until(async()=>(await log()).filter((e:any)=>e.type==='turn/end').length>oldEnds,'restart worker end')
  console.log('RESTART observed first post-restart end', await log())
  await until(async()=>(await rt.client.call('session/list',{_request:{}}) as any).items.find((v:any)=>v.sessionId===W)?.running===false,'restarted manual turn truly idle')
  expect(await slots()).toBe(0)
  console.log('RESTART capacity 1→crash→0→manual next turn 1→0')
 }finally{await rt.stop()}
},90000)

it('capacity overflow: after four manual workers run, one ends but the other three must still fill capacity',async()=>{
 const s=setup();const rt=await launchRuntime({env:s.env})
 try{
  const M=(await rt.client.call('session/create',{request:{}}) as any).sessionId
  const workers:string[]=[]
  for(let i=0;i<4;i++)workers.push((await rt.client.call('session/create',{request:{}}) as any).sessionId)
  writeFileSync(join(s.data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{},bots:Object.fromEntries(workers.map(w=>[w,{createdBy:M}]))}))
  const slots=async()=>((await rt.client.call('p610/control',{request:{op:'slots'}})) as any).used
  const running=async()=>(await rt.client.call('session/list',{_request:{}}) as any).items.filter((v:any)=>workers.includes(v.sessionId)&&v.running).length
  for(const [i,W] of workers.entries()){
   s.script(W,[text(i===0?1000:5000)])
   await rt.client.call('session/prompt',{request:{sessionId:W,requestId:`overflow-${i}`,mode:'queue',content:[{type:'text',text:'manual worker'}]}})
  }
  await until(async()=>await running()===4,'all four workers running')
  console.log('OVERFLOW all workers running=',await running(),'slots=',await slots())
  await until(async()=>await running()===3,'first worker ended')
  const used=await slots();console.log('OVERFLOW after first end running=',await running(),'slots=',used)
  let requests=0
  const stream=await rt.client.socket.open('pbots/orchestration.requests',{})
  const iter=stream[Symbol.asyncIterator]();await iter.next()
  const pump=(async()=>{try{for(;;){const n=await iter.next();if(n.done)break;requests++;await rt.client.call('pbots/orchestration.respond',{request:{requestId:n.value.requestId,error:{code:'test/overflow-reached-main',message:'should be capacity rejected'}}})}}catch{}})()
  try{
   s.script(M,[create('overflow-create'),text()])
   await rt.client.call('session/prompt',{request:{sessionId:M,requestId:'overflow-create',mode:'queue',content:[{type:'text',text:'create a new worker'}]}})
   await until(async()=>((await rt.client.call('p610/control',{request:{op:'read',sessionId:M}})) as any).events.some((e:any)=>e.type==='turn/end'),'overflow main end')
   console.log('OVERFLOW with three running workers main received create requests=',requests)
   expect.soft(used).toBe(3)
   expect(requests).toBe(0)
  }finally{stream.cancel();await pump}
 }finally{await rt.stop()}
},90000)
