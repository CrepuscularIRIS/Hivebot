import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchRuntime } from '/tmp/bot-wt/P6-14/app/sdk/tests/support/runtime.ts'
import { connect } from '/tmp/bot-wt/P6-14/app/sdk/examples/lib/client.mjs'
const pkg = '/tmp/bot-wt/P6-14/app/sdk'
const evidence = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14'
const root = mkdtempSync('/tmp/bot-p614-vfy-probe-')
process.env.HOME = join(root, 'home')
mkdirSync(process.env.HOME)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const text = value => ({ chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: value }, { type: 'block-end', index: 0, block: { type: 'text', text: value } }, { type: 'finish', reason: { kind: 'stop' } }] })
const batch = calls => ({ chunks: [...calls.flatMap((c,i) => [{ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: c.id, name: c.name, argumentsDelta: JSON.stringify(c.args) }, { type: 'block-end', index: i, block: { type: 'tool-call', id: c.id, name: c.name, arguments: JSON.stringify(c.args) } }]), { type: 'finish', reason: { kind: 'tool-calls' } }] })
async function run(enabled) {
  const dir = join(root, enabled ? 'enabled' : 'default')
  const home = join(dir, 'sdk'), data = join(dir, 'data')
  const ws = join(process.env.HOME, enabled ? 'enabled-ws' : 'default-ws')
  for (const p of [join(home,'fake','scripts'), data, ws]) mkdirSync(p,{recursive:true})
  const overlay = join(dir,'overlay.yml')
  writeFileSync(overlay, `- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p2sdk-fake-llm\n      name: '${pathToFileURL(join(pkg,'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            name: P2 Fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: vfy-inspect\n      name: '${pathToFileURL(join(evidence,'vfy-inspect.mjs')).href}'\n`)
  let rt, answerer
  try {
    rt = await launchRuntime({env:{ P2SDK_HOME: home, PBOTS_DATA_DIR: data, P2SDK_ORCH_DATA_DIR: data, P2SDK_PATCH: (enabled ? join(pkg,'profile/patches/orchestration.yml')+':' : '')+overlay }})
    const control = request => rt.client.call('p610/control',{ request })
    const log = async id => (await control({op:'read',sessionId:id})).events
    const create = async label => {
      const cwd = join(ws,label); mkdirSync(cwd,{recursive:true})
      return (await rt.client.call('session/create',{request:{agentPreset:'standard',cwd}})).sessionId
    }
    const script = (id,calls) => writeFileSync(join(home,'fake','scripts',id+'.json'),JSON.stringify({calls}))
    const frames=[], answered=new Set()
    answerer = await connect({baseUrl:rt.baseUrl,token:rt.token,interactions:'answer'})
    const stream = await answerer.socket.open('$events',{})
    void (async()=>{for await(const f of stream)frames.push(f)})().catch(()=>{})
    async function turn(id,label,approve=false) {
      const before=(await log(id)).length
      await rt.client.call('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId:id,mode:'queue',content:[{type:'text',text:label}]}})
      const deadline=Date.now()+60000
      while(Date.now()<deadline){
        if(approve) for(const f of frames.filter(f=>f.type==='waterfall'&&f.event==='approval/request'&&f.agentId===id&&!answered.has(f.eventId))){
          answered.add(f.eventId)
          await answerer.call('$events/result',{clientId:frames.find(x=>x.type==='ready')?.clientId??'',eventId:f.eventId,outcome:{kind:'result',value:'allowed-once'}})
        }
        const seg=(await log(id)).slice(before)
        if(seg.some(e=>e.type==='turn/end'))return seg
        await sleep(100)
      }
      throw new Error('turn timeout '+label)
    }
    const M=await create('main'),W=await create('worker')
    writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{},bots:{[W]:{createdBy:M}}}))
    for(const id of [M,W]){script(id,[text('warm')]);await turn(id,'warm')}
    const lists={main:await control({op:'vfy-list',sessionId:M}),worker:await control({op:'vfy-list',sessionId:W})}
    console.log(JSON.stringify({mode:enabled?'enabled':'default',sessionIds:{M,W},toolLists:lists}))
    const coord=['create_bot','send_to_bot','stop_bot']
    for(const name of coord){ assert.equal(lists.main.names.includes(name),enabled);assert.equal(lists.worker.names.includes(name),false) }
    if(!enabled){console.log('PASS default chain: coordinator tools absent; worker metadata does not load envelope');return}
    const prior=(await rt.client.call('session/list',{_request:{}})).items.length
    const calls=[
      {id:'vf1',name:'subagent_fork',args:{description:'vfy',prompt:'never spawn'}},
      {id:'vf2',name:'workflow',args:{script:'return 1',meta:{name:'vfy',description:'vfy'}}},
      {id:'vf3',name:'schedule_delete',args:{}},
      {id:'vf4',name:'job_kill',args:{job_id:'invalid-p614'}},
      {id:'vc1',name:'create_bot',args:{name:'forbidden',prompt:'never'}},
      {id:'vc2',name:'send_to_bot',args:{botId:'invalid',prompt:'never'}},
      {id:'vc3',name:'stop_bot',args:{botId:'invalid'}},
    ]
    script(W,[text('warm'),batch(calls),text('done')])
    const denied=await turn(W,'four sampled entrances + direct coordinators')
    const results=denied.filter(e=>e.type==='tool/result')
    assert.equal(results.length,7)
    for(const r of results){assert.equal(r.isError,true);assert.match(r.text,/pbots\/forbidden/)}
    for(const r of results.filter(e=>e.callId.startsWith('vc')))assert.match(r.text,/coordinator/)
    assert.equal(denied.filter(e=>e.type==='approval/asked').length,0)
    assert.equal((await rt.client.call('session/list',{_request:{}})).items.length,prior)
    console.log('PASS four sampled entrances + invalid arguments fail before schema/side effect; 7 results; no child session',JSON.stringify(results))
    const B=await create('bash')
    writeFileSync(join(data,'bots.json'),JSON.stringify({version:1,mainBotId:M,recipes:{},bots:{[W]:{createdBy:M},[B]:{createdBy:M}}}))
    const args={command:'printf p614-vfy-order',description:'p614 same command'}
    script(B,[batch([{id:'bg',name:'bash',args:{...args,run_in_background:true}}]),text('bg done'),batch([{id:'fg',name:'bash',args:{...args,run_in_background:false}}]),text('fg done')])
    const bg=await turn(B,'bg'),fg=await turn(B,'fg',true)
    assert.equal(bg.filter(e=>e.type==='approval/asked').length,0)
    assert.match(bg.find(e=>e.type==='tool/result').text,/run_in_background/)
    assert.ok(fg.some(e=>e.type==='approval/asked'))
    assert.equal(fg.find(e=>e.type==='tool/result').isError,false)
    console.log('PASS exact order differential',JSON.stringify({bg,fg}))
    const restriction=await control({op:'vfy-restrict',sessionId:W})
    const restricted={main:await control({op:'vfy-list',sessionId:M}),worker:await control({op:'vfy-list',sessionId:W})}
    console.log('SCOPED_RESTRICT_PROBE',JSON.stringify({restriction,mainBefore:lists.main.names,workerBefore:lists.worker.names,mainAfter:restricted.main.names,workerAfter:restricted.worker.names}))
    if(restriction.ok){
      assert.ok(lists.worker.names.includes('subagent')&&lists.worker.names.includes('workflow'))
      assert.ok(!restricted.worker.names.includes('subagent')&&!restricted.worker.names.includes('workflow'))
      assert.deepEqual(restricted.main,lists.main)
      console.log('CONFIRMED builder assertion false: profile plugin reaches agent.ctx.tools.restrict; worker-only restriction succeeds; main unchanged')
      await control({op:'vfy-restrict',sessionId:W,clear:true})
      assert.deepEqual(await control({op:'vfy-list',sessionId:W}),lists.worker)
    }
  } finally {answerer?.close(); await rt?.stop(); if(rt)rmSync(rt.handoff,{recursive:true,force:true})}
}
try {await run(true);await run(false)} finally {rmSync(root,{recursive:true,force:true})}
