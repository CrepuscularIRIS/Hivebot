import { describe, it, expect } from '/home/lingxufeng/bot/app/sdk/node_modules/vitest'
import { authorize } from './verify-runtime/project/app/sdk/src/admin/authority.mjs'
import { AdminChannel } from './verify-runtime/project/app/sdk/src/admin/channel.mjs'
import { createAdminConsumer } from './verify-runtime/project/app/ui/main/admin/consumer.ts'
import { wireAdminChannel } from './verify-runtime/project/app/ui/main/admin/channel.ts'
import { reverifyAdminRequest } from './verify-runtime/project/app/ui/main/admin/policy.ts'

const human = (text, params, target='bot-22') => authorize({turnClass:'user',action:'modify',target,humanUtteranceOfGrant:text,params})
const grant = (text) => ({actions:['install','disable'],scopes:{plugins:['gh-x','gh-y']},grantUtterance:text})
function check(label, actual, expected) { console.log(JSON.stringify({label,actual,expected})); expect(actual).toBe(expected) }
describe('independent A1',()=>{
 it('positive Alice and nested/replaced parameters',()=>{
  check('Alice',human('rename bot-22 to Alice',{name:'Alice'}).decision,'allow')
  for(const params of [{name:'Mallory'},{name:'Alice',model:'x'},{name:'Alice',prompt:'x'},{name:'Alice',cwd:'/fake'},{name:{value:'Alice'}},{payload:{name:'Alice'}},{name:'Alice',payload:{model:'x'}},{name:'Alice',payload:{rows:[{api_key:'SYNTHETIC'}]}}]) {
   const out=human('rename bot-22 to Alice',params); console.log(JSON.stringify({params,out})); expect(out.decision).not.toBe('allow')
  }
 })
 it.each([
  ['never rename bot-22 to Alice',{name:'Alice'},'bot-22'],
  ['rename bot-22 to Alice; do not rename bot-22 to Mallory',{name:'Alice'},'bot-22'],
  ['rename bot-22 to Alice; rename bot-23 to Mallory',{name:'Mallory'},'bot-22'],
  ['rename bot-220 to Alice',{name:'Alice'},'bot-22'],
  ['"rename bot-22 to Alice"',{name:'Alice'},'bot-22'],
  ['rename bot-22 to "Alice"',{name:'Alice'},'bot-22'],
 ])('deny boundary %s',(text,params,target)=>{const out=human(text,params,target);console.log(JSON.stringify({text,params,target,out}));expect(out.decision).not.toBe('allow')})
 it('quoted multi-clause text is data even beside legitimate modify',()=>{
  const text='modify bot-22; "example; rename bot-22 to Mallory; end example"'
  const out=human(text,{name:'Mallory'}); console.log(JSON.stringify({label:'H1-quoted-clause',input:text,params:{name:'Mallory'},out,expected:'not allow'}));expect(out.decision).not.toBe('allow')
 })
})
describe('independent A2',()=>{
 for(const text of ['install gh-x; disable gh-y','install gh-x and disable gh-y','install gh-x then disable gh-y']) {
  it.each([['install','gh-x',true],['disable','gh-y',true],['disable','gh-x',false],['install','gh-y',false]])(`${text} => %s %s`,(action,target,allowed)=>{
   const out=authorize({turnClass:'delegated',action,target,mandate:grant(text)});console.log(JSON.stringify({label:'grant-pair',text,action,target,out,expected:allowed?'allow':'not allow'}));expect(out.decision==='allow').toBe(allowed)
  })
 }
})
describe('independent A3 real bridge',()=>{
 it('same Peer + reverify filters errors/value and retains safe details; stale and wrong peer blocked',async()=>{
  const sdk=new AdminChannel({timeoutMs:1000}); const peer={};const queue=[];sdk.attach({peer,generation:7,queue})
  const rec={originRef:'synthetic-ref',sessionId:'synthetic-session',turnId:'synthetic-turn',generation:7,originClass:'user'}
  const input={token:'SYNTHETIC-ONLY',nested:{PID:987654,keep:'safe'},rows:[{refresh_token:'SYNTHETIC-ONLY',process_id:987655,keep:42}],reason:'ordinary-error'}
  const clean={nested:{keep:'safe'},rows:[{keep:42}],reason:'ordinary-error'}
  const frames=[]; let sink;let count=0;let mode='error';let gen=7
  const consumer=createAdminConsumer({actions:{list:async()=>{count++;return mode==='value'?{value:input}:{error:{code:'safe-upstream',message:'ordinary failure',details:input}}}}})
  const bridge=wireAdminChannel({dsh:{onConnected(){},async ready(){return {openStream(_e,_a,cb){sink=cb;return {cancel(){}}}}},async rpc(method,args){expect(method).toBe('pbots/admin.respond');frames.push(args);const {requestId,...outcome}=args.request;sdk.respond(requestId,outcome,peer);return {ok:true}}},verify:r=>reverifyAdminRequest(r,rec,gen),dispatch:consumer.dispatch,currentGeneration:()=>gen})
  try {
   await new Promise(r=>setImmediate(r))
   const send=async()=>{const p=sdk.request({sessionId:rec.sessionId,turnId:rec.turnId,originRef:rec.originRef,action:'list',params:{}}).then(value=>({value}),error=>({error}));const frame=queue.shift(); expect(()=>sdk.respond(frame.requestId,{value:{wrong:true}},{})).toThrow();expect(sdk.pendingCount()).toBe(1);sink({type:'item',value:frame});return p}
   const first=await send();expect(first.error.code).toBe('safe-upstream');expect(first.error.message).toContain('ordinary failure');expect(first.error.details).toEqual(clean)
   mode='value';expect((await send()).value).toEqual(clean)
   gen=8;const stale=await send();expect(stale.error.code).toBe('stale-generation');expect(count).toBe(2)
   console.log(JSON.stringify({label:'bridge',frames,input,clean,count,pending:sdk.pendingCount()}));expect(JSON.stringify(frames)).not.toContain('SYNTHETIC-ONLY');expect(JSON.stringify(frames)).not.toContain('987654');expect(input.nested.PID).toBe(987654);expect(sdk.pendingCount()).toBe(0)
  } finally {bridge.close();sdk.detach()}
 })
})
