import {it,expect} from '/tmp/bot-wt/P6-10/app/ui/node_modules/vitest/dist/index.js'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {launchRuntime} from '/tmp/bot-wt/P6-10/app/sdk/tests/support/runtime.ts'
const pkg='/tmp/bot-wt/P6-10/app/sdk'
it('manual worker turn contributes to shared capacity',async()=>{
 const root=mkdtempSync('/tmp/bot-p610-manual-');process.env.HOME=root;const data=join(root,'data');mkdirSync(data);mkdirSync(join(root,'fake','scripts'),{recursive:true})
 const overlay=join(root,'patch.yml');writeFileSync(overlay,`- id: agent-default-model
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
    - id: p610-inject
      name: 'file:///home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10-vfy/inject.mjs'
`)
 const rt=await launchRuntime({env:{P2SDK_HOME:root,P2SDK_ORCH_DATA_DIR:data,P2SDK_PATCH:`${pkg}/profile/patches/orchestration.yml:${overlay}`}})
 try {
  const main=(await rt.client.call('session/create',{request:{}}) as any).sessionId
  const w=(await rt.client.call('session/create',{request:{}}) as any).sessionId
  writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:main,recipes:{},bots:{[w]:{createdBy:main}}}))
  writeFileSync(join(root,'fake','scripts',`${w}.json`),JSON.stringify({calls:[{paceMs:2000,chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'working'},{type:'block-end',index:0,block:{type:'text',text:'working'}},{type:'finish',reason:{kind:'stop'}}]}]}))
  await rt.client.call('session/prompt',{request:{sessionId:w,requestId:'manual-worker',mode:'queue',content:[{type:'text',text:'run manually'}]}})
  await new Promise(r=>setTimeout(r,300))
  const list:any=await rt.client.call('session/list',{_request:{}})
  expect(list.items.find((s:any)=>s.sessionId===w).running).toBe(true)
  const slots:any=await rt.client.call('p610/control',{request:{op:'slots'}})
  console.log('manual worker running=true, shared slots=',slots)
  expect(slots.used).toBe(1)
 }finally{await rt.stop()}
},90000)
