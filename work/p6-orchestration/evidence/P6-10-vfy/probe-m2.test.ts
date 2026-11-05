import {it,expect} from '/tmp/bot-wt/P6-10/app/ui/node_modules/vitest/dist/index.js'
import {fakeDsh,fakeEvent,pagePort,startMuxBackend,makeChannelPair} from '/tmp/bot-wt/P6-10/app/ui/tests/unit/m2/support.ts'
import {registerM2Mux} from '/tmp/bot-wt/P6-10/app/ui/main/m2-mux/index.ts'
it('M2 rejects both orchestration endpoints before forwarding to real WS backend',async()=>{
 const backend=await startMuxBackend();const socket=await backend.open()
 try {
  const dsh=fakeDsh();const handler=registerM2Mux({dsh:dsh.conn,makeChannel:makeChannelPair});dsh.setLive(socket)
  const {event,posts}=fakeEvent();handler(event,{requestId:'p610'})
  await new Promise(r=>setTimeout(r,50));const port=pagePort(posts);port.start()
  for(const [i,endpoint] of ['pbots/orchestration.requests','pbots/orchestration.respond'].entries()){
   const id=`denied-${i}`
   const response=new Promise<any>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('no denial frame')),2000);port.on('message',e=>{const f=JSON.parse(String(e.data));if(f.streamId===id){clearTimeout(t);resolve(f)}})})
   port.postMessage(JSON.stringify({type:'open',streamId:id,endpoint}))
   expect(await response).toMatchObject({type:'error',error:{code:'pbots/forbidden'}})
   expect(backend.received.some(f=>f.type==='open'&&f.streamId===id)).toBe(false)
  }
  console.log('M2 denied both orchestration endpoints; backend received no forged open')
  port.close()
 }finally{socket.close();await backend.stop()}
})
