import {it,expect} from '/tmp/bot-wt/P6-10/app/ui/node_modules/vitest/dist/index.js'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {launchRuntime} from '/tmp/bot-wt/P6-10/app/sdk/tests/support/runtime.ts'
const pkg='/tmp/bot-wt/P6-10/app/sdk'
it('P6-10 when/execute rejects create_bot in a pbots-worker claimed turn',async()=>{
 const root=mkdtempSync('/tmp/bot-p610-taint-');process.env.HOME=root
 const dataDir=join(root,'data');mkdirSync(dataDir);mkdirSync(join(root,'fake','scripts'),{recursive:true})
 const overlay=join(root,'overlay.yml');writeFileSync(overlay,`- id: agent-default-model
  config: {provider: p2fake, model: p2fake}
- insert:
    - id: p2sdk-fake-llm
      name: 'file://${pkg}/tests/support/fake/plugin.mjs'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - {id: p2fake, contextWindow: 131072}
    - id: p610-inject
      name: 'file:///home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10-vfy/inject.mjs'
`)
 const rt=await launchRuntime({env:{P2SDK_HOME:root,P2SDK_ORCH_DATA_DIR:dataDir,P2SDK_PATCH:`${pkg}/profile/patches/orchestration.yml:${overlay}`}})
 try {
  const M=(await rt.client.call('session/create',{request:{agentPreset:'standard'}}) as any).sessionId
  writeFileSync(join(dataDir,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{}}))
  writeFileSync(join(root,'fake','scripts',`${M}.json`),JSON.stringify({calls:[{chunks:[
   {type:'block-start',index:0,blockType:'tool-call'},
   {type:'tool-call-delta',index:0,id:'tainted-create',name:'create_bot',argumentsDelta:JSON.stringify({name:'bad',prompt:'p'})},
   {type:'block-end',index:0,block:{type:'tool-call',id:'tainted-create',name:'create_bot',arguments:JSON.stringify({name:'bad',prompt:'p'})}},
   {type:'finish',reason:{kind:'tool-calls'}}
  ]}]}))
  let requestCount=0
  const stream=await rt.client.socket.open('pbots/orchestration.requests',{})
  const pump=(async()=>{try{for await(const item of stream){if((item as any).ready)continue;requestCount++;await rt.client.call('pbots/orchestration.respond',{request:{requestId:(item as any).requestId,error:{code:'test/reached-main',message:'must not reach main'}}})}}catch{}})()
  await new Promise(r=>setTimeout(r,50))
  await rt.client.call('p610/control',{request:{op:'inject',sessionId:M}})
  let events:any[]=[];const deadline=Date.now()+10000
  while(Date.now()<deadline){events=((await rt.client.call('p610/control',{request:{op:'read',sessionId:M}})) as any).events;if(events.some(e=>e.type==='tool/result'))break;await new Promise(r=>setTimeout(r,100))}
  stream.cancel();await pump
  console.log('tainted claimed user/message=',events.filter(e=>e.type==='user/message'),'tool results=',events.filter(e=>e.type==='tool/result'),'main create requests=',requestCount)
  expect(events.some(e=>e.type==='user/message'&&e.sourceKind==='pbots-worker')).toBe(true)
  expect(requestCount).toBe(0)
 }finally{await rt.stop()}
},90000)
