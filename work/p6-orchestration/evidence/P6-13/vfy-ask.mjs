import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {launchRuntime} from '/tmp/bot-wt/P6-13/app/sdk/tests/support/runtime.ts'
const pkg='/tmp/bot-wt/P6-13/app/sdk'
const home=mkdtempSync('/tmp/bot-p613-ask-')
const data=join(home,'data'),workspace=join(home,'workspace')
for(const d of [data,workspace,join(home,'fake','scripts'),join(home,'gates')])mkdirSync(d,{recursive:true})
const overlay=join(home,'vfy.yml')
writeFileSync(overlay,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(pkg,'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p610-inspect\n      name: '${pathToFileURL(join(pkg,'tests/support/orchestration-create-inspect.mjs')).href}'\n`)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const until=async(fn,label)=>{const deadline=Date.now()+45000;while(!await fn()){if(Date.now()>deadline)throw Error('timeout '+label);await sleep(40)}}
const text=t=>({chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:t},{type:'block-end',index:0,block:{type:'text',text:t}},{type:'finish',reason:{kind:'stop'}}]})
const tool=(id,name,args)=>({chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id,name,argumentsDelta:JSON.stringify(args)},{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:JSON.stringify(args)}},{type:'finish',reason:{kind:'tool-calls'}}]})
let rt,W
try{
 rt=await launchRuntime({env:{P2SDK_PATCH:join(pkg,'profile/patches/orchestration.yml')+':'+overlay,P2SDK_HOME:home,PBOTS_DATA_DIR:data,P2SDK_ORCH_DATA_DIR:data}})
 const ctrl=r=>rt.client.call('p610/control',{request:r})
 const log=async id=>(await ctrl({op:'read',sessionId:id})).events
 const session=async()=>(await rt.client.call('session/create',{request:{agentPreset:'standard',cwd:workspace}})).sessionId
 const prompt=(id,t)=>rt.client.call('session/prompt',{request:{requestId:'p613-vfy-'+Date.now(),sessionId:id,mode:'queue',content:[{type:'text',text:t}]}})
 const script=(id,calls)=>writeFileSync(join(home,'fake/scripts',id+'.json'),JSON.stringify({calls}))
 const M=await session();W=await session()
 writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{},bots:{[W]:{createdBy:M}}}))
 const canary=join(workspace,'must-not-exist')
 script(W,[tool('bash-ask','bash',{command:'touch '+canary,description:'p613 pending approval probe'}),text('must not run')])
 script(M,[tool('send','send_to_bot',{botId:W,prompt:'approval work'}),{...text('gated'),gateAfterChunk:1,gateId:'hold'},tool('stop','stop_bot',{botId:W}),text('stop accepted'),text('consume end')])
 await prompt(M,'dispatch')
 await until(async()=>(await log(W)).some(e=>e.type==='approval/asked'),'approval asked')
 await sleep(2600) // ensure Reporter has observed ask while main held in active turn
 assert.equal((await log(W)).some(e=>e.type==='approval/decided'),false)
 assert.equal((await log(W)).some(e=>e.type==='turn/end'),false)
 await prompt(M,'stop pending worker') // queue user first; prevents ask report consumption
 writeFileSync(join(home,'gates/hold'),'1')
 await until(async()=>(await log(M)).some(e=>e.type==='tool/result'&&e.callId==='stop'),'stop result')
 const result=(await log(M)).find(e=>e.type==='tool/result'&&e.callId==='stop')
 assert.notEqual(result.isError,true);assert.equal(JSON.parse(result.text).accepted,true)
 await until(async()=>(await log(W)).some(e=>e.type==='turn/end'),'worker end')
 await until(async()=>(await log(M)).some(e=>e.type==='user/message'&&e.sourceKind==='pbots-worker'),'report')
 await sleep(3500)
 const ml=await log(M),wl=await log(W)
 const items=ml.filter(e=>e.type==='user/message'&&e.sourceKind==='pbots-worker').flatMap(e=>e.items??[])
 console.log(JSON.stringify({stop:JSON.parse(result.text),worker:wl.filter(e=>['approval/asked','approval/decided','turn/end'].includes(e.type)),items,canaryExists:existsSync(canary)}))
 assert.equal(items.length,1);assert.equal(items[0].kind,'end');assert.equal(items[0].outcome,'stopped');assert.equal(existsSync(canary),false)
 console.log('PASS pending ask interrupted: no stale ask delivery, exactly one stopped end, unapproved command never ran')
}finally{
 if(rt){if(W)await rt.client.call('session/cancel',{request:{sessionId:W}}).catch(()=>{});await rt.stop();rmSync(rt.handoff,{recursive:true,force:true})}
 rmSync(home,{recursive:true,force:true})
}
