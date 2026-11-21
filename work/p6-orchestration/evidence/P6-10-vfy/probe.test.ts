import { describe, it, expect } from '/tmp/bot-wt/P6-10/app/ui/node_modules/vitest/dist/index.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BotsMetaStore } from '/tmp/bot-wt/P6-10/app/ui/main/m3-meta/store.ts'
import { createWorkerBot, deriveBots } from '/tmp/bot-wt/P6-10/app/ui/main/m3-meta/orchestrate.ts'
import { registerM3Meta } from '/tmp/bot-wt/P6-10/app/ui/main/m3-meta/index.ts'
import { registerM1Api } from '/tmp/bot-wt/P6-10/app/ui/main/m1-api/index.ts'
import { launchRuntime } from '/tmp/bot-wt/P6-10/app/sdk/tests/support/runtime.ts'
import { registerCreateBot } from '/tmp/bot-wt/P6-10/app/sdk/src/orchestration/create.mjs'
import { CreateChannel } from '/tmp/bot-wt/P6-10/app/sdk/src/orchestration/main-channel.mjs'
import { Slots } from '/tmp/bot-wt/P6-10/app/sdk/src/orchestration/slots.mjs'
const root = mkdtempSync('/tmp/bot-p610-probe-')
process.env.HOME = root
const dir = (name: string) => { const d = join(root, name); mkdirSync(d, {recursive:true}); return d }

describe('independent P6-10 probes', () => {
  it('main-only boundary: renderer M1 cannot call either orchestration endpoint', async () => {
    let upstream = 0
    const handler = registerM1Api({ dsh: {rpc: async () => { upstream++; return {ok:true,value:{}} } } as any })
    for (const method of ['pbots/orchestration.requests', 'pbots/orchestration.respond']) {
      const r = await handler({method, args:{request:{requestId:'forged'}}})
      expect(r).toMatchObject({ok:false,error:{code:'pbots/forbidden'}})
    }
    expect(upstream).toBe(0)
    console.log('M1 denied both endpoints; upstream calls=0')
  })

  it('#20 worker promotion denied and authority unchanged', async () => {
    const store = new BotsMetaStore(dir('promotion')); await store.init(); await store.patchMainBotId('main'); await store.putBot('worker','main')
    const dsh = {rpc: async () => ({ok:true,value:{items:[{sessionId:'main'},{sessionId:'worker'}],presets:[]}})} as any
    const m3 = registerM3Meta({store,dsh})
    expect(await m3.handler({op:'patch',mainBotId:'worker'})).toMatchObject({ok:false,error:{code:'pbots/invalid-args'}})
    expect(store.read().mainBotId).toBe('main'); store.close()
    console.log('worker promotion rejected; mainBotId=main')
  })

  it('actual create execute: timeout unknown, slot reclaimed, no automatic retry; no-subscriber and capacity paths', async () => {
    const dataDir = dir('timeouts'); writeFileSync(join(dataDir,'bots.json'),JSON.stringify({version:1,mainBotId:'main',recipes:{}}))
    let definition: any
    const ctx = {tools:{register:(d:any)=>{definition=d}}, sessionPersistence:{flush:async()=>{}}, on:()=>()=>{}}
    const slots = new Slots(1); const channel = new CreateChannel({timeoutMs:500}); const sub = {peer:'main-peer',queue:[] as any[],wake:null}; channel.attach(sub)
    registerCreateBot(ctx,{config:{dataDir}, slots,channel} as any)
    for (let i=0;i<4;i++) {
      const start=performance.now()
      await expect(definition.execute({name:'w',prompt:'p'},{agent:{id:'main'}})).rejects.toMatchObject({code:'main-unavailable',details:{reason:'timeout',outcome:'unknown'}})
      expect(performance.now()-start).toBeLessThan(1500); expect(slots.used).toBe(0)
    }
    expect(sub.queue).toHaveLength(4)
    expect(()=>channel.respond(sub.queue[0].requestId,{value:{sessionId:'late'}},'main-peer')).toThrow()
    channel.detach()
    await expect(definition.execute({name:'w',prompt:'p'},{agent:{id:'main'}})).rejects.toMatchObject({code:'main-unavailable'})
    expect(slots.used).toBe(0)
    expect(slots.reserve()).toBe(true)
    await expect(definition.execute({name:'w',prompt:'p'},{agent:{id:'main'}})).rejects.toMatchObject({code:'pbots/capacity'})
    expect(slots.used).toBe(1); slots.release()
    console.log('4 x 500ms timeout; outcome=unknown; 4 requests only; used=0; stale respond denied; capacity preserves existing reservation')
  })

  it('missing worker session metadata is skipped AND logged once (PLAN ⑫)', () => {
    const logs:string[]=[]
    const rows=deriveBots([{sessionId:'main',running:false,updatedAt:0}],{mainBotId:'main',recipes:{},bots:{missing:{createdBy:'main'}}},m=>logs.push(m))
    expect(rows.map(r=>r.id)).toEqual(['main'])
    console.log('missing worker rows=',rows.map(r=>r.id),'logs=',logs)
    expect(logs).toHaveLength(1)
  })

  it('real Loader + production createWorkerBot: list/title/workspace/default preset; post-crash durability', async () => {
    const dataDir=dir('real-data'); const sdkHome=dir('real-sdk'); const store=new BotsMetaStore(dataDir); await store.init()
    let rt=await launchRuntime({env:{P2SDK_HOME:sdkHome,P2SDK_ORCH_DATA_DIR:dataDir}})
    const adapter = () => ({rpc:async(method:string,args:unknown)=>{try{return {ok:true,value:await rt.client.call(method,args)}}catch(error:any){return {ok:false,error:{code:error.code??'err',message:String(error.message)}}}}})
    try {
      const main=(await rt.client.call('session/create',{request:{}}) as any).sessionId; await store.patchMainBotId(main)
      const r=await createWorkerBot(adapter() as any,store,{name:'验收员',prompt:'test',mainBotId:main},{dataDir})
      console.log('production createWorkerBot result=',r)
      expect(r.ok).toBe(true); if(!r.ok)return
      expect(r.value.warn).toBeUndefined()
      let list:any=await rt.client.call('session/list',{_request:{}})
      const row=list.items.find((s:any)=>s.sessionId===r.value.sessionId)
      console.log('real worker list row=',JSON.stringify(row))
      expect(row).toBeDefined(); expect(row.projections.values.title).toBe('验收员')
      expect(row.cwd).toBe(join(dataDir,'workspaces',r.value.sessionId))
      expect(row.projections.values.agentPreset).toBe('standard')
      await rt.client.call('session/prompt',{request:{sessionId:r.value.sessionId,requestId:'vfy-first',mode:'queue',content:[{type:'text',text:'check'}]}})
      await rt.stop()
      rt=await launchRuntime({env:{P2SDK_HOME:sdkHome,P2SDK_ORCH_DATA_DIR:dataDir}})
      list=await rt.client.call('session/list',{_request:{}})
      expect(list.items.some((s:any)=>s.sessionId===r.value.sessionId)).toBe(true)
    } finally {await rt.stop();store.close()}
  })
})
