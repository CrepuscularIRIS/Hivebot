import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {realpathSync} from 'node:fs'
import {TurnOrigin} from '/home/lingxufeng/bot/app/sdk/src/orchestration/turn-origin.mjs'
const base='/home/lingxufeng/bot/app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-agent-loop@0.2.2-alpha.2_04206c7ddbce35230b2bfbbb790058fc/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js'
const require=createRequire(base)
const {interruptedTurnClosers}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')).href)
const events=[{seq:0,time:1,type:'turn/start',data:{turn:7}},{seq:1,time:2,type:'user/message',data:{id:'report',source:{kind:'pbots-worker'},content:[{type:'text',text:'report'}]}},{seq:2,time:3,type:'step/start',data:{turn:7,step:1}}]
const before=new TurnOrigin();before.record('main',7,'pbots-worker');assert.equal(before.classify('main').tainted,true)
const closers=interruptedTurnClosers(events)
assert(closers.some(e=>e.type==='turn/end'&&e.data.turn===7&&e.data.reason.kind==='interrupted'))
console.log('INSTALLED HOST RECOVERY '+JSON.stringify(closers))
const after=new TurnOrigin();after.record('main',8,'pbots-worker');assert.equal(after.classify('main').tainted,true);after.record('main',9,'');assert.equal(after.classify('main').tainted,false)
console.log('REFUTED same tainted turn continues across SDK restart: host closes turn 7; new pending worker report claim taints turn 8; clean user claim clears turn 9')
console.log('Recovery implementation: '+realpathSync(base)+':1739-1745; tools.resolve after inbox.claim:670-673')
