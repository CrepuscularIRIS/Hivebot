import {it,expect} from '/home/lingxufeng/bot/app/ui/node_modules/vitest'
import {createShimData as before} from './parent-data'
import {createShimData as after} from './data-probe'
it('cancel-first transient inconsistency is unchanged across parent and target, then both converge',async()=>{
 const snapshots=[]
 for(const [label,create] of [['5930660',before],['2746c31',after]] as const){
  const d=create({authId:'probe',api:async()=>({ok:true,value:{items:['m','w'].map(sessionId=>({sessionId}))}}),metaApi:async()=>({ok:true,value:{mainBotId:'m',bots:{w:{createdBy:'m'}}}})})
  await d.probe.loadRoster()
  const follow=(type:string,data:object)=>d.probe.onFollowItem('w',{type:'event',event:{type,data}})
  d.probe.onFollowItem('w',{type:'snapshot',header:{},records:[]})
  follow('tool/call',{callId:'c',name:'bash'});follow('approval/asked',{id:'same',callId:'c'})
  d.probe.onEventsItem({type:'waterfall',event:'approval/request',eventId:'same',agentId:'w',request:{callId:'c'}})
  d.probe.onEventsItem({type:'cancel',eventId:'same'})
  const transient={pending:d.ui.askPending('w','same'),rank:d.ui.workerRank('w')}
  follow('approval/decided',{id:'same',outcome:'rejected'})
  const settled={pending:d.ui.askPending('w','same'),rank:d.ui.workerRank('w')}
  snapshots.push({transient,settled});console.log(label,JSON.stringify({transient,settled}))
 }
 expect(snapshots[0]).toEqual(snapshots[1])
 expect(snapshots[1]).toEqual({transient:{pending:true,rank:4},settled:{pending:false,rank:4}})
})
