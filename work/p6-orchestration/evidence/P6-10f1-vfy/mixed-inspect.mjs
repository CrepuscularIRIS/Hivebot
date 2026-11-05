import Inspect from '/tmp/bot-wt/P6-10/app/sdk/tests/support/orchestration-create-inspect.mjs'
export default class MixedInspect extends Inspect {
  constructor(ctx) {
    super(ctx)
    this.claims = []
    ctx.on('agent/inbox/claimed', ({agent,message,turn}) => {
      this.claims.push({agent:agent.id, turn, kind:message?.source?.kind ?? 'user', id:message.id})
    })
  }
  async control(request) {
    if(request.op === 'claims') return {claims:this.claims.filter(c=>c.agent===request.sessionId)}
    return super.control(request)
  }
}
Object.defineProperty(MixedInspect.prototype,'@deepseek-ai/dsh-typert-protocol/remote-methods',{value:{version:1,methods:[{method:'control',invocation:{kind:'direct'}}]}})
