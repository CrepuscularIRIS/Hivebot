import { describe, it, expect } from 'vitest'
import { getEventListeners } from 'node:events'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Slots } from '../../src/orchestration/slots.mjs'
import { CreateChannel, default as Plugin } from '../../src/orchestration/main-channel.mjs'
import { registerCreateBot } from '../../src/orchestration/create.mjs'
import { wireOrchChannel } from '/home/lingxufeng/bot/app/ui/main/m3-meta/orch-channel.ts'
import { BotsMetaStore } from '/home/lingxufeng/bot/app/ui/main/m3-meta/store.ts'
import { BotsMetaStore as OldStore } from '/tmp/vfy-r-p610-d/old-store.ts'

const root = '/tmp/vfy-r-p610-d/probe-data'
mkdirSync(root, {recursive:true})
const delay = (ms = 0) => new Promise(r => setTimeout(r, ms))
function rig(label: string) {
  const dir = join(root, label); mkdirSync(dir,{recursive:true})
  writeFileSync(join(dir,'bots.json'), JSON.stringify({version:1,mainBotId:'main',recipes:{}}))
  const handlers = new Map<string, Set<any>>()
  let tool: any
  const ctx: any = {
    tools:{register(d:any){tool=d;return ()=>{}}},
    sessionPersistence:{flush:async()=>{}},
    on(name:string,fn:any){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name)!.add(fn);return ()=>handlers.get(name)!.delete(fn)},
  }
  const orch: any = {config:{dataDir:dir},slots:new Slots(1),channel:new CreateChannel({timeoutMs:8}),agentOf:async()=>({id:'worker'}),delivery:{send:async()=>{}}}
  registerCreateBot(ctx,orch)
  const size = () => [...handlers.values()].reduce((n,s)=>n+s.size,0)
  const fire = (type:string) => {for(const fn of [...handlers.get('session/event')??[]])fn({id:'worker'},{type})}
  return {dir,ctx,orch,tool,size,fire}
}

describe('D failure path bookkeeping',()=>{
  it('invalid/forbidden/capacity/timeout/main-error/flush/agent/delivery failure restore slots and request listeners',async()=>{
    for(const mode of ['invalid','forbidden','capacity','timeout','main-error','flush','agent','delivery']) {
      const r=rig(mode); const before=r.size()
      const args = mode==='invalid'?{name:'',prompt:'p'}:{name:'w',prompt:'p'}
      const agent = mode==='forbidden'?{id:'not-main'}:{id:'main'}
      if(mode==='capacity')r.orch.slots.reserve()
      const sub={peer:'main-peer',queue:[],wake:null}
      if(mode==='timeout')r.orch.channel.attach(sub)
      else r.orch.channel.request=async()=>{if(mode==='main-error')throw new Error('main-create-failed');return {sessionId:'worker'}}
      if(mode==='flush')r.ctx.sessionPersistence.flush=async()=>{throw new Error('disk full')}
      if(mode==='agent')r.orch.agentOf=async()=>{throw new Error('gone')}
      if(mode==='delivery')r.orch.delivery.send=async()=>{throw new Error('delivery failed')}
      for(let i=0;i<5;i++)await expect(r.tool.execute(args,{agent})).rejects.toBeDefined()
      expect(r.size(),mode).toBe(before)
      expect(r.orch.slots.used,mode).toBe(mode==='capacity'?1:0)
      expect(r.orch.slotHolds.size,mode).toBe(0)
      expect(r.orch.channel.pending.size,mode).toBe(0)
      r.orch.channel.detach()
      console.log(`FAILURE mode=${mode} iterations=5 listeners=${r.size()} baseline=${before} slots=${r.orch.slots.used} pending=0 holds=0`)
    }
  })
  it('successful repeated create + end does not accumulate one-shot listeners',async()=>{
    const r=rig('success');const baseline=r.size()
    r.orch.channel.request=async()=>({sessionId:'worker'})
    for(let i=0;i<10;i++){
      await r.tool.execute({name:'w',prompt:'p'},{agent:{id:'main'}})
      expect(r.size()).toBe(baseline+1)
      r.fire('turn/start');r.fire('turn/end')
      expect(r.size()).toBe(baseline);expect(r.orch.slots.used).toBe(0)
    }
    console.log('SUCCESS loops=10 slots=0 holds=0 listeners restored')
  })
  it('stream abort clears pending timers and abort listener',async()=>{
    const controller = new AbortController()
    const channel = new CreateChannel({timeoutMs:30000})
    const owner:any={ctx:{invocation:{peer:'p',signal:controller.signal}},channel}
    const stream = Plugin.prototype.requests.call(owner)
    await stream.next()
    const pending=channel.request({kind:'create-bot'}).catch((e:any)=>e)
    await stream.next()
    const waiting=stream.next()
    expect(getEventListeners(controller.signal,'abort')).toHaveLength(1)
    controller.abort();await waiting
    const error=await pending
    expect(error.details.reason).toBe('stream-closed')
    expect(channel.pending.size).toBe(0)
    expect(channel.subscribed).toBe(false)
    expect(getEventListeners(controller.signal,'abort')).toHaveLength(0)
    console.log('ABORT pending=0 subscribed=false abort-listeners=0')
  })
})

it('legacy no-bots writer and new writer produce identical bytes across patch/recipe/restart',async()=>{
  const dirs=['old','new'].map(s=>join(root,`bytes-${s}`))
  dirs.forEach(d=>mkdirSync(d,{recursive:true}))
  const stores=[new OldStore(dirs[0]),new BotsMetaStore(dirs[1])]
  for(const s of stores){await s.init();await s.patchMainBotId('main');await s.putRecipe('p2temp-one',{agentPreset:'standard',connectors:['a','b']});s.close()}
  const before=dirs.map(d=>readFileSync(join(d,'bots.json'),'utf8'))
  expect(before[0]).toBe(before[1]);expect(JSON.parse(before[1])).not.toHaveProperty('bots')
  const reopened=[new OldStore(dirs[0]),new BotsMetaStore(dirs[1])]
  for(const s of reopened){await s.init();await s.patchMainBotId(null);await s.putRecipe('p2temp-two',{agentPreset:'standard',connectors:['b']});s.close()}
  expect(readFileSync(join(dirs[0],'bots.json'),'utf8')).toBe(readFileSync(join(dirs[1],'bots.json'),'utf8'))
  expect(existsSync(join(dirs[1],'bots.json.tmp'))).toBe(false)
  console.log('BYTES equal before/after restart, no bots key, tmp absent')
})

it('D probe: delayed initial connection opens two subscriptions and close leaks the first',async()=>{
  const listeners:any[]=[];let readyResolve:any
  const ready=new Promise<any>(r=>readyResolve=r)
  const streams:Array<{cancelled:boolean}> = []
  const socket={openStream(){const stream={cancelled:false};streams.push(stream);return {cancel(){stream.cancelled=true}}}}
  const dsh:any={onConnected(fn:any){listeners.push(fn)},ready:()=>ready,rpc:async()=>({ok:true})}
  const handle=wireOrchChannel({dsh,create:async()=>({ok:true,value:{sessionId:'w'}})})
  // DshConnection.connectOnce resolves ready waiters and emits onConnected in the same tick.
  readyResolve(socket);listeners.forEach(fn=>fn(1));await delay()
  expect(streams.length).toBe(2)
  handle.close()
  expect(streams.filter(s=>!s.cancelled).length).toBe(1)
  console.log(`SUBSCRIPTION generation=1 opens=${streams.length} active-after-close=${streams.filter(s=>!s.cancelled).length}`)
})

it('D probe: timed-out requests retain payloads in an attached but backpressured subscriber queue',async()=>{
  const ch=new CreateChannel({timeoutMs:3})
  const sub={peer:'p',queue:[],wake:null};ch.attach(sub)
  for(let i=0;i<20;i++)await ch.request({kind:'create-bot',name:'w',prompt:'x'.repeat(100000)}).catch(()=>{})
  expect(ch.pending.size).toBe(0)
  expect(sub.queue).toHaveLength(20)
  console.log(`TIMEOUT pending=${ch.pending.size} queued=${sub.queue.length} retained-prompt-chars=${sub.queue.reduce((n,q:any)=>n+q.prompt.length,0)}`)
  ch.detach()
})
