import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
export const name = 'p7q1-observer'
export const inject = ['agents', 'goals', 'sessions', 'sessionProjections', 'llm']
export function apply(ctx) {
  const log = (data) => appendFileSync(join(process.env.P2SDK_Q1_EVIDENCE, `observer-${process.env.P2SDK_Q1_STAGE}.jsonl`), JSON.stringify(data) + '\n')
  log({type:'services', goals:!!ctx.goals, sessionProjections:!!ctx.sessionProjections, sessions:!!ctx.sessions})
  ctx.on('agent/created', ({agent}) => log({type:'created', agentId:agent.id, root:ctx.agents.roots().includes(agent), goal:ctx.goals.get(agent) ?? null}))
  ctx.on('agent/status', ({agent,status}) => log({type:'status',agentId:agent.id,status,goal:ctx.goals.get(agent) ?? null}))
  ctx.on('session/event', (session,event) => {
    const agent = ctx.agents.get(session.id)
    if (['goal/change','user/message','turn/end','tool/result'].includes(event.type)) log({type:'event', event, goal:agent ? ctx.goals.get(agent) ?? null : null})
  })
  ctx.on('llm/stream', (options,next) => {
    log({type:'model-input',sessionId:options.sessionId,system:options.system,messages:options.messages,tools:options.tools})
    return next()
  })
}
