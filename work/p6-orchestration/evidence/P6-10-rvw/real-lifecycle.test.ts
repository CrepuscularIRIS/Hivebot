import { it, expect } from 'vitest'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchRuntime } from '/home/lingxufeng/bot/app/sdk/tests/support/runtime.ts'
import { DshConnection } from '/home/lingxufeng/bot/app/ui/main/dsh/connect.ts'
import { DshMuxSocket } from '/home/lingxufeng/bot/app/ui/main/dsh/socket.ts'
import { wireOrchChannel, ORCH_REQUESTS_ENDPOINT } from '/home/lingxufeng/bot/app/ui/main/m3-meta/orch-channel.ts'
const sleep = (ms:number) => new Promise(r=>setTimeout(r,ms))
it('real SDK: duplicate startup subscription, close retains stream, stop clears owned processes and lock',async()=>{
  const home='/tmp/vfy-r-p610-d/lifecycle-runtime';mkdirSync(home,{recursive:true})
  const rt=await launchRuntime({env:{P2SDK_HOME:home,P2SDK_PATCH:'/home/lingxufeng/bot/app/sdk/profile/patches/orchestration.yml',P2SDK_ORCH_DATA_DIR:join(home,'data')}})
  const launcherPid=rt.child.pid!
  const dshPid=Number(readFileSync(join(home,'launcher.lock'),'utf8').trim().split('\n')[1].split(':')[0])
  let opens=0,cancels=0
  const logs:string[]=[]
  const dsh = new DshConnection({baseUrl:rt.baseUrl,token:rt.token,interactions:'answer',makeSocket:(url,cookie)=>{
    const socket=new DshMuxSocket(url,cookie)
    const original=socket.openStream.bind(socket)
    socket.openStream=(...args:any[])=>{
      opens++
      const stream=original(...args)
      return {cancel(){cancels++;stream.cancel()}}
    }
    return socket
  }})
  const channel=wireOrchChannel({dsh,create:async()=>({ok:true,value:{sessionId:'not-used'}}),log:m=>logs.push(m)})
  let contender:any
  try {
    await dsh.start();await sleep(100)
    expect(opens).toBe(2)
    expect(logs.some(s=>s.includes('already holds'))).toBe(true)
    channel.close();await sleep(50)
    contender=await rt.client.socket.open(ORCH_REQUESTS_ENDPOINT,{})
    const result=await contender[Symbol.asyncIterator]().next().then((v:any)=>({value:v}), (e:any)=>({error:String(e.message)}))
    expect(result.error).toContain('already holds')
    console.log(`REAL-SUBSCRIPTION opens=${opens} cancels=${cancels} after-close-new-peer=${result.error}`)
  } finally {
    contender?.cancel();channel.close();dsh.stop();await rt.stop()
  }
  await sleep(150)
  const launcherAlive=existsSync(`/proc/${launcherPid}`)
  const dshAlive=existsSync(`/proc/${dshPid}`)
  const lock=existsSync(join(home,'launcher.lock'))
  console.log(`REAL-CLEANUP launcher-alive=${launcherAlive} sdk-alive=${dshAlive} launcher-lock=${lock}`)
  expect(launcherAlive).toBe(false);expect(dshAlive).toBe(false);expect(lock).toBe(true) // start.ts:790-793 deliberately keeps a reclaimable dead-pid record
  const again=await launchRuntime({env:{P2SDK_HOME:home,P2SDK_PATCH:'/home/lingxufeng/bot/app/sdk/profile/patches/orchestration.yml',P2SDK_ORCH_DATA_DIR:join(home,'data')}})
  await again.stop()
  console.log('REAL-LOCK stale record reclaimed on same-home restart')
},120000)
