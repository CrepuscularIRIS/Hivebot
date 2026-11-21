import {sharedSlots} from '/tmp/bot-wt/P6-10/app/sdk/src/orchestration/slots.mjs'
import Inspect from '/tmp/bot-wt/P6-10/app/sdk/tests/support/orchestration-create-inspect.mjs'
export default class Inject extends Inspect {
 async control(request) {
  if(request.op==='slots') return {used:sharedSlots().used}
  if(request.op!=='inject') return super.control(request)
  const agent=this.ctx.agents.get(request.sessionId)
  agent.followup({id:'p610-tainted',role:'user',source:{kind:'pbots-worker',items:[]},content:[{type:'text',text:'worker report data'}]})
  return {ok:true}
 }
}
Object.defineProperty(Inject.prototype,'@deepseek-ai/dsh-typert-protocol/remote-methods',{value:{version:1,methods:[{method:'control',invocation:{kind:'direct'}}]}})
