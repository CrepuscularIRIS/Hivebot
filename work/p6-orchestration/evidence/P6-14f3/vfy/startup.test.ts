import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
vi.mock('electron', () => ({ app:{}, BrowserWindow:{getAllWindows:()=>[]}, dialog:{}, ipcMain:{handle:()=>{},on:()=>{}}, MessageChannelMain:{}, protocol:{handle:()=>{},registerSchemesAsPrivileged:()=>{}} }))
import { wireRestoreOnReconnect, wrapM1WithOrchestration } from '/tmp/bot-wt/P6-14f2/app/ui/main/index'
import { registerM3Meta } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/index'
import { BotsMetaStore } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/store'
import { createReadyGate } from '/tmp/bot-wt/P6-14f2/app/ui/main/ready'
import { restoreGated } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/ensure'
import { resolveWorkerStatus } from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs'

for (const timeout of [false,true]) it(`production gate: init pending; first connect timeout=${timeout}`,async()=>{
 const root=mkdtempSync('/tmp/bot-p614f3-vfy-startup-')
 let release!:()=>void
 const ioPending=new Promise<void>(r=>release=r)
 class SlowStore extends BotsMetaStore { async init(){await ioPending;await super.init()} }
 const store=new SlowStore(root)
 const calls:any[]=[];const listeners:Array<(g:number)=>void>=[]
 const dsh={onConnected(fn:(g:number)=>void){listeners.push(fn)},async rpc(method:string,args:any){const id=args?.request?.sessionId;calls.push({method,identity:resolveWorkerStatus(id,root),fileExists:existsSync(join(root,'bots.json'))});return {ok:true,value:{sessionId:id}}}}
 const ready=createReadyGate({dshConfigured:true});ready.setWindowReady()
 const m3=registerM3Meta({store,dsh:dsh as never});wireRestoreOnReconnect(dsh as never,m3,ready,()=>{})
 const m1=restoreGated(ready,wrapM1WithOrchestration(async()=>{throw Error('unexpected base')},dsh as never,store,root))
 try{
   if(timeout){
     // Execute the production first-connect catch body verbatim, not a parallel implementation.
     const src=readFileSync('/tmp/bot-wt/P6-14f2/app/ui/main/index.ts','utf8')
     const body=src.match(/dshStart\?\.catch\(\(error\) => \{([\s\S]*?)\n      \}\)/)?.[1]
     expect(body).toBeTruthy()
     new Function('ready','m3','error',body!)(ready,m3,Error('injected first-connect timeout'))
   }
   for(const fn of listeners)fn(1)
   let completed=false
   const request=m1({method:'session/create',args:{request:{agentPreset:'standard'}}} as never).then(v=>{completed=true;return v})
   await new Promise(r=>setTimeout(r,50))
   if(!timeout){expect(completed).toBe(false);expect(calls).toEqual([])}
   else {expect(completed).toBe(true);expect(calls).toHaveLength(1);expect(calls[0].identity).toBe('unknown');expect(calls[0].fileExists).toBe(false);console.log('CONFIRMED timeout bypass: session/create reached SDK before init',JSON.stringify(calls))}
   release();await m3.init;await request
   expect(existsSync(join(root,'bots.json'))).toBe(true)
   if(!timeout){expect(calls[0].identity).toBe('main');console.log('normal gate holds init before first session/create',JSON.stringify(calls))}
 }finally{release();await m3.init;store.close();rmSync(root,{recursive:true,force:true})}
})
