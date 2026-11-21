import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerStopBot } from '/tmp/bot-wt/P6-13/app/sdk/src/orchestration/stop.mjs'
const dir = mkdtempSync('/tmp/bot-p613-guards-')
let sessionCalls=0,cancelCalls=0,tainted=false,status='running',def
const orch={config:{dataDir:dir},turns:{classify:()=>({tainted})},agentOf:async()=>{sessionCalls++;return {status,cancel(){cancelCalls++}}}}
const ctx={tools:{register(d){def=d}},on(){throw Error('stop registered event callback')}}
registerStopBot(ctx,orch)
const meta=()=>writeFileSync(join(dir,'bots.json'),JSON.stringify({version:1,mainBotId:'main',recipes:{},bots:{own:{createdBy:'main'},foreign:{createdBy:'other'}}}))
const call=(a,agent={id:'main'})=>def.execute(a,{agent})
try {
 meta()
 for(const [label,args,agent,taint,code] of [
 ['foreign',{botId:'foreign'},{id:'main'},false,'pbots/forbidden'],
 ['tainted',{botId:'own'},{id:'main'},true,'pbots/forbidden'],
 ['identity',{botId:'own'},{id:'other'},false,'pbots/forbidden'],
 ['bad args',{botId:'own',force:true},{id:'main'},false,'pbots/invalid-args'],
 ['null',null,{id:'main'},false,'pbots/invalid-args'],
 ['blank',{botId:' '},{id:'main'},false,'pbots/invalid-args']]){
 tainted=taint;sessionCalls=cancelCalls=0
 await assert.rejects(call(args,agent),e=>e.code===code)
 assert.equal(sessionCalls,0);assert.equal(cancelCalls,0)
 console.log(JSON.stringify({label,code,sessionCalls,cancelCalls,result:'PASS'}))
 }
 tainted=false;status='idle';sessionCalls=cancelCalls=0
 const out=await call({botId:'own'})
 assert.equal(out.accepted,true);assert.equal(out.wasRunning,false)
 console.log(JSON.stringify({label:'idle',out,sessionCalls,cancelCalls,expectedCancelCalls:0,result:cancelCalls===0?'PASS':'FAIL'}))
 const source=readFileSync('/tmp/bot-wt/P6-13/app/sdk/src/orchestration/stop.mjs','utf8')
 assert.equal(/\bctx\.on\s*\(/.test(source),false)
 assert.equal(/\b(?:slots|sharedSlots)\s*[.(]/.test(source),false)
 console.log('PASS static negative design: no ctx.on / slot access; registration ctx.on trap untouched')
 if(cancelCalls!==0) process.exitCode=1
}finally{rmSync(dir,{recursive:true,force:true})}
