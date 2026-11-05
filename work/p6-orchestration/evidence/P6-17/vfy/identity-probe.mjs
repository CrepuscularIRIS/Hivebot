import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const sdk='/tmp/bot-wt/P6-17/app/sdk'
const root=mkdtempSync('/tmp/bot-p617-vfy-probe-')
const {connect}=await import(pathToFileURL(join(sdk,'examples/lib/client.mjs')))
const delay=ms=>new Promise(r=>setTimeout(r,ms))
const home=join(root,'home'), data=join(root,'data'), handoff=join(root,'handoff'), rt=join(root,'runtime')
for(const d of [home,data,handoff,rt]) mkdirSync(d,{recursive:true})
const overlay=join(root,'inspect.yml')
writeFileSync(overlay,`- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(sdk,'tests/support/fake/plugin.mjs'))}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p610-inspect\n      name: '${pathToFileURL(join(sdk,'tests/support/orchestration-create-inspect.mjs'))}'\n`)
const patch=[join(sdk,'profile/patches/presets.yml'),overlay,join(sdk,'profile/patches/orchestration.yml')].join(':')
let child,client,output=''
try {
 const env={PATH:process.env.PATH,HOME:home,P2SDK_PROVIDER:'mock',P2SDK_HOME:rt,P2SDK_HANDOFF:handoff,P2SDK_PORT:'0',P2SDK_PATCH:patch,PBOTS_DATA_DIR:data}
 assert(!('P2SDK_ORCH_DATA_DIR' in env))
 child=spawn(process.execPath,[join(sdk,'scripts/start.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']})
 for(const s of [child.stdout,child.stderr]) s.on('data',c=>{output+=c})
 const deadline=Date.now()+60000
 while(!output.includes('[p2sdk] ready http')) {if(child.exitCode!==null||Date.now()>deadline)throw Error(output);await delay(150)}
 client=await connect({baseUrl:readFileSync(join(handoff,'base-url'),'utf8').trim(),token:readFileSync(join(handoff,'launch-token'),'utf8').trim(),interactions:'answer'})
 const sid='p617-identity-probe'
 await client.call('session/create',{request:{sessionId:sid}})
 writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:sid,recipes:{},bots:{}}))
 const visible=()=>client.call('p610/control',{request:{op:'visible',sessionId:sid,tool:'create_bot'}})
 const without=await visible()
 console.log(JSON.stringify({phase:'without P2SDK_ORCH_DATA_DIR',PBOTS_DATA_DIR_has_main:true,visible:without.visible,fallback:join(home,'.config/pbots-ui')}))
 assert.equal(without.visible,false)
 // A/B at the actual fallback path proves identity lookup, not missing plugin.
 const fallback=join(home,'.config/pbots-ui');mkdirSync(fallback,{recursive:true})
 writeFileSync(join(fallback,'bots.json'),readFileSync(join(data,'bots.json')))
 const fallbackResult=await visible()
 console.log(JSON.stringify({phase:'same runtime; identity populated at temporary HOME fallback',visible:fallbackResult.visible}))
 assert.equal(fallbackResult.visible,true)
 console.log('PASS: missing env hides create_bot; temporary HOME fallback identity restores it. No real HOME read.')
} finally {
 client?.close()
 if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(10000)]);if(child.exitCode===null)child.kill('SIGKILL')}
}
