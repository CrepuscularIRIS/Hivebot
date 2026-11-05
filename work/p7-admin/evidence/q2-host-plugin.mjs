// Q-2 host probe. Commands/results contain no credentials.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
export const name='q2-host-probe'
export const inject=['agents','sessions','storageDomain','sessionPersistence','sessionController','schedule','tools']
const root=process.env.P2SDK_Q2_ROOT
writeFileSync(join(root,'probe-loaded.json'),JSON.stringify({pid:process.pid}))
export function apply(ctx){
 const tools=agent=>['schedule_create','schedule_list','schedule_delete','schedule_update'].map(k=>[k,!!ctx.tools.get(k,agent)])
 // Cordis can apply a dynamically loaded plugin after the root ready event.
 writeFileSync(join(root,'probe-ready.json'),JSON.stringify({pid:process.pid,services:Object.fromEntries(inject.map(k=>[k,!!ctx.get(k)]))}))
 ctx.on('agent/inbox/claimed',({agent,message,turn})=>appendFileSync(join(root,'claims.jsonl'),JSON.stringify({at:Date.now(),agentId:agent.id,turn,message,tools:tools(agent)})+'\n'),{global:true})
 let busy=false
 const poll=setInterval(async()=>{
  if(busy||!existsSync(join(root,'command.json')))return
  const command=JSON.parse(readFileSync(join(root,'command.json'),'utf8'))
  if(existsSync(join(root,`result-${command.seq}.json`)))return
  busy=true
  try{
   let value;const s=ctx.schedule
   if(command.op==='session'){
    value=await ctx.sessionController.create({cwd:command.cwd})
    const resolved=await ctx.sessionController.resolveAgent(value.sessionId)
    if('error' in resolved)throw resolved.error
    value.tools=tools(resolved.agent)
   }else if(command.op==='create')value=await s.create(command.sessionId,command.request)
   else if(command.op==='catalog')value=await s.catalog()
   else if(command.op==='history')value=await s.history(command.request)
   else if(command.op==='delete')value=await s.delete(command.request)
   else if(command.op==='inspect'){
    const r=await ctx.sessionController.resolveAgent(command.sessionId);if('error' in r)throw r.error
    value={status:r.agent.status,nextTurn:r.agent.inbox.nextTurn,nextStep:r.agent.inbox.nextStep,tools:tools(r.agent)}
   }else throw new Error('unknown probe command')
   writeFileSync(join(root,`result-${command.seq}.json`),JSON.stringify({ok:true,at:Date.now(),value}))
  }catch(e){writeFileSync(join(root,`result-${command.seq}.json`),JSON.stringify({ok:false,at:Date.now(),error:{name:e.name,code:e.code,message:e.message,stack:e.stack}}))}
  finally{busy=false}
 },50)
 ctx.effect(()=>()=>clearInterval(poll))
}
