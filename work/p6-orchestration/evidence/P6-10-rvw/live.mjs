import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchRuntime } from '/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts'
import { connect } from '/home/lingxufeng/bot/app/sdk/examples/lib/client.mjs'
const root='/tmp/vfy-r-p610-c',sdk='/home/lingxufeng/bot/app/sdk'
process.chdir(root)
const home=join(root,'runtime'),data=join(root,'live-data')
mkdirSync(join(home,'fake','scripts'),{recursive:true});mkdirSync(data,{recursive:true})
const overlay=join(root,'overlay.yml')
writeFileSync(overlay,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(sdk,'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p610-inspect\n      name: '${pathToFileURL(join(sdk,'tests/support/orchestration-create-inspect.mjs')).href}'\n    - id: pbots-orchestration\n      name: '${pathToFileURL(join(sdk,'src/orchestration/main-channel.mjs')).href}'\n      config:\n        createTimeoutMs: 900\n        dataDir: '${data}'\n`)
const text={chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'done'},{type:'block-end',index:0,block:{type:'text',text:'done'}},{type:'finish',reason:{kind:'stop'}}]}
const call={chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:'probe-call',name:'create_bot',argumentsDelta:JSON.stringify({name:'worker',prompt:'test task'})},{type:'block-end',index:0,block:{type:'tool-call',id:'probe-call',name:'create_bot',arguments:JSON.stringify({name:'worker',prompt:'test task'})}},{type:'finish',reason:{kind:'tool-calls'}}]}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
let rt,other,stream
async function newMain(){
 const {sessionId}=await rt.client.call('session/create',{request:{agentPreset:'standard'}})
 writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:sessionId,recipes:{}}))
 writeFileSync(join(home,'fake/scripts',sessionId+'.json'),JSON.stringify({calls:[call,text]}))
 return sessionId
}
async function startTurn(sessionId){await rt.client.call('session/prompt',{request:{sessionId,requestId:'probe-'+sessionId,mode:'queue',content:[{type:'text',text:'delegate test task'}]}})}
async function toolResult(sessionId){
 for(let n=0;n<150;n++){
  const log=await rt.client.call('p610/control',{request:{op:'read',sessionId}})
  const result=log.events.find(e=>e.type==='tool/result')
  if(result)return result
  await wait(100)
 }
 throw Error('tool result missing')
}
try{
 rt=await launchRuntime({env:{HOME:join(root,'home'),P2SDK_HOME:home,P2SDK_PATCH:overlay,PBOTS_DATA_DIR:data,P2SDK_ORCH_DATA_DIR:data}})
 console.log('LIVE runtime ready')
 const noAuth=await fetch(rt.baseUrl+'/api/pbots/orchestration.respond',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'unauth',method:'pbots/orchestration.respond',payload:{args:{request:{requestId:'fake',value:{}}}}})})
 assert.ok(noAuth.status===401||noAuth.status===403);console.log('PASS unauthenticated respond HTTP '+noAuth.status)
 stream=await rt.client.socket.open('pbots/orchestration.requests',{})
 const iter=stream[Symbol.asyncIterator]();assert.equal((await iter.next()).value.ready,true)
 other=await connect({baseUrl:rt.baseUrl,token:rt.token})
 const main=await newMain();await startTurn(main);const item=(await iter.next()).value
 await assert.rejects(other.call('pbots/orchestration.respond',{request:{requestId:item.requestId,value:{sessionId:'spoofed'}}}),/wrong peer|forbidden/)
 console.log('PASS real gateway wrong peer respond rejected')
 // Real OS ENOTDIR is passed through the channel, then captured from dsh tool/result.
 const {createServer}=await import('/home/lingxufeng/bot/app/ui/node_modules/vite/dist/node/index.js')
 const vite=await createServer({configFile:false,root,cacheDir:join(root,'live-cache'),server:{middlewareMode:true},appType:'custom'})
 try{
  const {BotsMetaStore}=await vite.ssrLoadModule('/home/lingxufeng/bot/app/ui/main/m3-meta/store.ts')
  const {createWorkerBot}=await vite.ssrLoadModule('/home/lingxufeng/bot/app/ui/main/m3-meta/orchestrate.ts')
  const store=new BotsMetaStore(data);await store.init()
  const blocked=join(root,'live-private-data-blocked');writeFileSync(blocked,'file')
  const result=await createWorkerBot({rpc:async()=>{throw Error('unexpected RPC')}},store,item,{dataDir:blocked})
  assert.equal(result.ok,false)
  await rt.client.call('pbots/orchestration.respond',{request:{requestId:item.requestId,error:result.error}})
  const model=await toolResult(main)
  assert.ok(model.text.includes(blocked));assert.ok(model.text.includes('ENOTDIR'))
  console.log('CONFIRMED actual model tool/result text '+model.text)
  writeFileSync(join(root,'live-model-result.json'),JSON.stringify(model,null,2))
  store.close()
 }finally{await vite.close()}
 const timeoutMain=await newMain();await startTurn(timeoutMain);const old=(await iter.next()).value
 const timed=await toolResult(timeoutMain);assert.ok(timed.text.includes('main-unavailable'))
 const slots=await rt.client.call('p610/control',{request:{op:'slots'}});assert.equal(slots.used,0)
 await assert.rejects(rt.client.call('pbots/orchestration.respond',{request:{requestId:old.requestId,value:{sessionId:'late'}}}),/stale|forbidden/)
 console.log('PASS actual timeout -> slots 0; late success rejected')
 // Cancel stream with a pending request, re-subscribe using a new peer, reject all old IDs.
 const detachedMain=await newMain();await startTurn(detachedMain);const detached=(await iter.next()).value
 stream.cancel();const detachedResult=await toolResult(detachedMain);assert.ok(detachedResult.text.includes('main-unavailable'))
 const replacement=await other.socket.open('pbots/orchestration.requests',{});const next=replacement[Symbol.asyncIterator]();assert.equal((await next.next()).value.ready,true)
 await assert.rejects(rt.client.call('pbots/orchestration.respond',{request:{requestId:detached.requestId,value:{sessionId:'old-peer'}}}),/stale|forbidden/)
 replacement.cancel();console.log('PASS real stream cancel/rebind rejects old peer request; no replay')
 console.log('LIVE SUMMARY 5 checks passed')
}finally{
 stream?.cancel();other?.close();rt?.client.close()
 console.log(execFileSync('/home/lingxufeng/bot/scripts/bot-reap',['--match',root],{encoding:'utf8'}))
}
