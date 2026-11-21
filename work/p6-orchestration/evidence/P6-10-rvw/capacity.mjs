import { mkdir,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const root='/home/lingxufeng/bot/app/sdk/src/orchestration/',dir='/tmp/vfy-r-p610-a/capacity'
await mkdir(dir,{recursive:true});await writeFile(dir+'/bots.json',JSON.stringify({version:1,mainBotId:'main',recipes:{}}))
const {registerCreateBot}=await import(root+'create.mjs'),{CreateChannel}=await import(root+'main-channel.mjs'),{Slots}=await import(root+'slots.mjs')
let tool;const slots=new Slots(3),channel=new CreateChannel({timeoutMs:30}),sub={peer:'main',queue:[],wake:null};channel.attach(sub)
const ctx={tools:{register(d){tool=d}},on(){return ()=>{}},sessionPersistence:{flush:async()=>{}}};registerCreateBot(ctx,{config:{dataDir:dir},slots,channel})
const state=[]
for(let i=0;i<3;i++){
 state[i]='pending';void tool.execute({name:'w',prompt:'p'},{agent:{id:'main'}}).then(()=>state[i]='resolved',()=>state[i]='rejected')
 while(sub.queue.length<=i)await new Promise(r=>setImmediate(r))
 try{channel.respond(sub.queue[i].requestId,{error:null},'main')}catch(e){console.log('RESPOND_THROW',i,e.message)}
}
channel.detach();await new Promise(r=>setTimeout(r,100));
let fourth;try{await tool.execute({name:'w',prompt:'p'},{agent:{id:'main'}})}catch(e){fourth=e.code}
console.log('TOOL_CAPACITY',JSON.stringify({used:slots.used,state,fourth}));assert.deepEqual(state,['pending','pending','pending']);assert.equal(slots.used,3);assert.equal(fourth,'pbots/capacity')
