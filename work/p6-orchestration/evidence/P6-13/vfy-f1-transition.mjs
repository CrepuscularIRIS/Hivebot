import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { registerStopBot } from '/tmp/bot-wt/P6-13/app/sdk/src/orchestration/stop.mjs'

const root = mkdtempSync('/tmp/bot-p613f1-transition-')
let tool, status = 'idle', resolves = 0
const cancels = []
const save = createdBy => writeFileSync(join(root, 'bots.json'), JSON.stringify({version:1, mainBotId:'main', bots:{worker:{createdBy}}}))
const orch = {
  config:{dataDir:root}, turns:{classify:()=>({tainted:false})},
  agentOf:async id => {
    assert.equal(id, 'worker'); resolves++
    return {status, cancel:(...args)=>cancels.push(args)}
  },
}
registerStopBot({tools:{register:d=>{tool=d}}, on:()=>{throw Error('unexpected listener')}}, orch)
const stop = () => tool.execute({botId:'worker'}, {agent:{id:'main'}})
try {
  save('main')
  for (let i=0;i<3;i++) assert.equal((await stop()).wasRunning, false)
  assert.equal(cancels.length, 0)
  console.log('PASS repeated idle stops: cancel=0; resolves='+resolves)
  status='running'
  assert.deepEqual(await stop(), {sessionId:'worker', accepted:true, wasRunning:true, note:'stop requested; the worker turn is being interrupted (settles at its turn end)'})
  assert.deepEqual(cancels, [[{kind:'user'}, {keepInbox:true}]])
  assert.equal(resolves,4)
  console.log('PASS same target idle -> running: exactly one cancel with user/keepInbox:true; target freshly resolved')
  status='idle'
  await stop()
  assert.equal(cancels.length,1)
  save('other')
  const before=resolves
  await assert.rejects(stop(),e=>e.code==='pbots/forbidden')
  assert.equal(resolves,before); assert.equal(cancels.length,1)
  console.log('PASS bad path: ownership revoked after idle success -> forbidden, zero additional session/cancel touches')
} finally { rmSync(root,{recursive:true,force:true}) }
