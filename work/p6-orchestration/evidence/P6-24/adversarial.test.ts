import {it, expect} from '/tmp/bot-wt/P6-24/app/sdk/node_modules/vitest/dist/index.js'
import {mkdtempSync, mkdirSync, symlinkSync, realpathSync, writeFileSync, readFileSync, readdirSync, lstatSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {Slots} from '/tmp/bot-wt/P6-24/app/sdk/src/orchestration/slots.mjs'
import {registerCreateBot} from '/tmp/bot-wt/P6-24/app/sdk/src/orchestration/create.mjs'
import {BotsMetaStore} from '/tmp/bot-wt/P6-24/app/ui/main/m3-meta/store.ts'
import {createWorkerBot} from '/tmp/bot-wt/P6-24/app/ui/main/m3-meta/orchestrate.ts'

it('concurrent declarations for the same file must reject one before main creation', async()=>{
 const dir=mkdtempSync('/tmp/bot-p624-race-')
 writeFileSync(join(dir,'bots.json'), JSON.stringify({version:1,mainBotId:'main',recipes:{}}))
 let tool:any; const handlers:any={}; const pending:any[]=[]
 const ctx:any={tools:{register:(d:any)=>{tool=d;return ()=>{}}},sessionPersistence:{flush:async()=>{}},on:(name:string,fn:any)=>{(handlers[name]??=[]).push(fn);return ()=>{}}}
 const orch:any={config:{dataDir:dir},slots:new Slots(3),channel:{request:()=>new Promise(resolve=>pending.push(resolve))},agentOf:async(id:string)=>({id}),delivery:{send:async()=>{}}}
 registerCreateBot(ctx,orch)
 const invoke=(name:string)=>tool.execute({name,prompt:'task',artifacts:['shared.txt']},{agent:{id:'main'}})
 const jobs=[invoke('a'),invoke('b')]
 const all=Promise.allSettled(jobs)
 for(let n=0;n<200 && pending.length<2;n++) await new Promise(r=>setTimeout(r,5))
 console.log('CONCURRENT_SAME_FILE mainRequests=',pending.length,'slots=',orch.slots.used)
 pending.forEach((resolve,i)=>resolve({sessionId:'w'+i}))
 const results=await all
 console.log('CONCURRENT_SAME_FILE outcomes=',results.map(r=>r.status==='fulfilled'?'created':r.reason.code))
 for (const fn of handlers['session/event']??[]) for(let i=0;i<pending.length;i++) fn({id:'w'+i},{type:'turn/end'})
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect(results.filter(r=>r.status==='rejected').map((r:any)=>r.reason.code)).toEqual(['pbots/busy'])
})

it('subdir pointing to another bot must fail closed; deletion inventory is byte-level',async()=>{
 const dir=mkdtempSync('/tmp/bot-p624-subdir-');const main=join(dir,'workspaces','main');const other=join(dir,'workspaces','other')
 mkdirSync(main,{recursive:true});mkdirSync(other,{recursive:true});symlinkSync(other,join(main,'out'),'dir')
 writeFileSync(join(main,'binary.bin'),Buffer.from([0,255,254,128,1]));writeFileSync(join(main,'text.txt'),'unchanged')
 const store=new BotsMetaStore(dir);await store.init();await store.patchMainBotId('main');const calls:any[]=[]
 const dsh:any={rpc:async(method:string,args:any)=>{calls.push({method,args});if(method==='session/list')return {ok:true,value:{items:[{sessionId:'main',cwd:main}]}};return {ok:true,value:{sessionId:args.request.sessionId}}}}
 try{
 const result=await createWorkerBot(dsh,store,{name:'w',prompt:'p',mainBotId:'main',subdir:'out'},{dataDir:dir})
 console.log('SUBDIR_SYMLINK',JSON.stringify(result),'actualCwd=',realpathSync(join(main,'out')),'other=',other,'sessionCreate=',calls.filter(c=>c.method==='session/create').length)
 const inventory=()=>readdirSync(main).sort().map(name=>{const p=join(main,name);return [name,lstatSync(p).isSymbolicLink()?'symlink:'+realpathSync(p):createHash('sha256').update(readFileSync(p)).digest('hex')]})
 const before=inventory();store.close();const meta=JSON.parse(readFileSync(join(dir,'bots.json'),'utf8'));delete meta.bots;writeFileSync(join(dir,'bots.json'),JSON.stringify(meta));const after=inventory()
 expect(after).toEqual(before);console.log('BYTE_INVENTORY',JSON.stringify({before,after,equal:true}))
 expect(result.ok,'existing symlink subdir must not grant another bot workspace').toBe(false)
 expect(calls.filter(c=>c.method==='session/create')).toHaveLength(0)
 }finally{store.close()}
})
