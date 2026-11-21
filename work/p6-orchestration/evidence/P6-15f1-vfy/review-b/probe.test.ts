import { describe, it, expect } from '/home/lingxufeng/bot/app/ui/node_modules/vitest'
import { createShimData } from './data-probe'
const ev = (type: string, data: object) => ({type:'event',event:{type,data}})
async function setup() {
 const d = createShimData({authId:'probe',api:async () => ({ok:true,value:{items:['m','w'].map(sessionId=>({sessionId,running:false,updatedAt:1}))}}),metaApi:async()=>({ok:true,value:{mainBotId:'m',bots:{w:{createdBy:'m'}}}})})
 let sections=0; d.wire({agents(){},transcript(){},sections(){sections++}})
 await d.probe.loadRoster()
 d.probe.onFollowItem('w',{type:'snapshot',header:{},records:[]})
 const follow=(type:string,data:object)=>d.probe.onFollowItem('w',ev(type,data))
 const waterfall=(id:string,callId:string)=>d.probe.onEventsItem({type:'waterfall',event:'approval/request',eventId:id,agentId:'w',request:{callId,toolName:'bash'}})
 const cancel=(id:string)=>d.probe.onEventsItem({type:'cancel',eventId:id})
 const status=(value:boolean)=>d.probe.onEventsItem({type:'emit',event:'api-session/status',args:['w',value]})
 const group=()=>d.sections()!.find(s=>s.agentIds.includes('w'))!.name
 return {d,follow,waterfall,cancel,status,group,count:()=>sections}
}
describe('P6-15f1 B hostile schedules',()=>{
 it('same identity on two feeds: decided cleans pending even without cancel; duplicates remain idempotent',async()=>{
  const {d,follow,waterfall,cancel}=await setup()
  follow('tool/call',{callId:'c1',name:'bash'}); follow('approval/asked',{id:'same',callId:'c1'})
  waterfall('same','c1');waterfall('same','c1')
  expect(d.ui.askPending('w','same')).toBe(true)
  follow('approval/decided',{id:'same',outcome:'rejected'})
  expect(d.ui.askPending('w','same')).toBe(false);expect(d.ui.workerRank('w')).toBe(4)
  cancel('same');cancel('same'); expect(d.ui.askPending('w','same')).toBe(false)
  console.log('identity: both feeds same id, duplicate request/cancel => settled false, rank4')
 })
 it('cancel ahead of follow decision converges, and read does not dismiss a pending approval',async()=>{
  const {d,follow,waterfall,cancel}=await setup()
  follow('tool/call',{callId:'c',name:'bash'});follow('approval/asked',{id:'same',callId:'c'});waterfall('same','c')
  d.ui.setActive('w');expect(d.ui.askPending('w','same')).toBe(true);expect(d.ui.workerRank('w')).toBe(0)
  cancel('same');expect(d.ui.askPending('w','same')).toBe(true) // audit feed remains pending until decided reaches it
  follow('approval/decided',{id:'same',outcome:'allowed-once'});expect(d.ui.askPending('w','same')).toBe(false);expect(d.ui.workerRank('w')).toBe(4)
 })
 it('two identity aliases for one call converge on follow decision; missing old id does not borrow current new ask',async()=>{
  const {d,follow,waterfall}=await setup()
  follow('tool/call',{callId:'c1',name:'bash'}); follow('approval/asked',{id:'audit1',callId:'c1'});waterfall('gateway1','c1')
  follow('approval/decided',{id:'audit1',outcome:'rejected'})
  expect(d.ui.askPending('w','audit1')).toBe(false);expect(d.ui.askPending('w','gateway1')).toBe(false)
  follow('tool/call',{callId:'c2',name:'bash'});follow('approval/asked',{id:'audit2',callId:'c2'});waterfall('gateway2','c2')
  expect(d.ui.askPending('w','missing1')).toBe(false);expect(d.ui.askPending('w','audit2')).toBe(true);expect(d.ui.askPending('w','gateway2')).toBe(true)
  d.ui.setActive('w');expect(d.ui.workerRank('w')).toBe(0)
  expect(d.agentsPayload().find((x:any)=>x.id==='w')).toBeDefined()
  console.log('missing historical id: Answered while current audit2/gateway2 pending, rank0 survives read => distinct identities, not disagreement')
 })
 it('open/leave/reopen with end/report/status permutations; active read worker never goes Done; late finish remains unread',async()=>{
  let schedules=0
  function permutations(a:string[]):string[][]{return a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[x,...p])):[[]]}
  for(const order of permutations(['leave','finish','report'])){
   const {d,follow,status,group,count}=await setup();d.ui.setActive('w');status(true);follow('turn/start',{})
   for(const step of order){
    if(step==='leave') d.ui.setActive('m')
    if(step==='finish'){follow('turn/end',{reason:{kind:'completed'}});status(false)}
    if(step==='report') d.probe.onFollowItem('m',ev('user/message',{id:'report',content:[],source:{kind:'pbots-worker',items:[]}}))
   }
   expect(group()).toBe(order.indexOf('finish')>order.indexOf('leave')?'Workers':'Done')
   d.ui.setActive('w');expect(group()).toBe('Workers'); const n=count();d.ui.setActive('w');expect(count()).toBe(n)
   status(false); expect(group()).toBe('Workers');d.ui.setActive('m');expect(group()).toBe('Done')
   d.ui.setActive('w');expect(group()).toBe('Workers'); schedules++
  }
  console.log('group schedules',schedules,'all stable incl duplicate setActive/status')
 })
})
