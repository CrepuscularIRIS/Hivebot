// P7-R2: local-only probe. Run with app/sdk/node_modules/.bin/node; no inherited secrets.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const repo = '/home/lingxufeng/bot', wt = '/tmp/bot-wt/P7-R2', sdk = join(wt, 'app/sdk')
const { connect } = await import(pathToFileURL(join(sdk, 'examples/lib/client.mjs')))
const root = mkdtempSync('/tmp/bot-P7-R2-')
const home = join(root, 'home'), runtime = join(root, 'runtime'), workspace = join(root, 'workspace')
const bundle = join(root, 'profile/skills'), handoff = join(root, 'handoff')
for (const dir of [home, runtime, workspace, bundle, handoff]) mkdirSync(dir, { recursive: true })
const summary = { task: 'P7-R2', base: execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [], stages: [] }
const check = (name, value) => { assert(value, name); summary.checks.push(name) }
function putSkill(dir, name, body) {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, 'SKILL.md'), body)
}
putSkill(join(workspace, '.agents/skills'), 'p7-project', '---\nname: p7-project\ndescription: Local probe only\n---\nP7_PROJECT_BODY\n')
for (const kind of ['create', 'maintain']) {
  const name = `${kind}-verification-skill`
  const body = readFileSync(join(repo, 'repos/cursor__plugins/pstack/skills', name, 'SKILL.md'), 'utf8')
  putSkill(bundle, name, body)
  // Probe-only adapter: preserve body, enable model loading under P6 delegated source.
  putSkill(bundle, `${name}-adapted`, body.replace(`name: ${name}\n`, `name: ${name}-adapted\n`).replace('disable-model-invocation: true', 'disable-model-invocation: false'))
}
const plugin = join(root, 'observer.mjs')
writeFileSync(plugin, `import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { Delivery } from ${JSON.stringify(pathToFileURL(join(sdk, 'src/orchestration/delivery.mjs')).href)}
import { buildAssignMessage } from ${JSON.stringify(pathToFileURL(join(sdk, 'src/orchestration/assignment.mjs')).href)}
export const name='p7-r2-probe'
export const inject=['agents','sessionController','sessionPersistence','skills']
export function apply(ctx) {
 const root=process.env.P2SDK_R2_ROOT, stage=process.env.P2SDK_R2_STAGE
 const delivery=new Delivery(ctx)
 const log=data=>appendFileSync(join(root,stage+'-events.jsonl'),JSON.stringify(data)+'\\n')
 ctx.on('session/event',(session,event)=>log({sid:session.id,event}))
 ctx.on('llm/stream',(options,next)=>{log({sid:options.sessionId,input:JSON.stringify({system:options.system,messages:options.messages})});return next()})
 let busy=false
 const timer=setInterval(async()=>{
  if(busy||!existsSync(join(root,'command.json')))return
  const c=JSON.parse(readFileSync(join(root,'command.json'),'utf8')), out=join(root,'result-'+c.seq+'.json')
  if(existsSync(out))return
  busy=true
  try {
   const r=await ctx.sessionController.resolveAgent(c.sid);if('error' in r)throw r.error
   let value
   if(c.op==='list')value=(await ctx.skills.list({cwd:c.cwd,scope:r.agent})).map(s=>({name:s.name,invocation:s.invocation,provider:s.provider}))
   else if(c.op==='assign')value=await delivery.send(r.agent,buildAssignMessage({assignmentId:c.seq,mainBotId:'probe-main',text:c.text}))
   else if(c.op==='log')value=await delivery.readLog(c.sid)
   else throw Error('unknown local probe command')
   writeFileSync(out,JSON.stringify({ok:true,value}))
  }catch(e){writeFileSync(out,JSON.stringify({ok:false,error:String(e)}))}finally{busy=false}
 },25)
 ctx.effect(()=>()=>clearInterval(timer))
}
`)
const patch = join(root, 'probe.yml')
writeFileSync(patch, `- id: agent-default-model\n  config:\n    provider: p2fake\n    model: p2fake\n- insert:\n    - id: p7-r2-fake\n      name: '${pathToFileURL(join(sdk, 'tests/support/fake/plugin.mjs')).href}'\n      config:\n        providers:\n          - id: p2fake\n            models:\n              - id: p2fake\n                contextWindow: 131072\n    - id: p7-r2-probe\n      name: '${pathToFileURL(plugin).href}'\n`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label, ms = 45000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) { const value = fn(); if (value) return value; await sleep(50) }
  throw Error(`timeout: ${label}`)
}
let child, client, stage, seq = 0
function events() {
  const file = join(root, `${stage}-events.jsonl`)
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
}
async function command(op, sid, more = {}) {
  const n = String(++seq), file = join(root, `result-${n}.json`)
  writeFileSync(join(root, 'command.json'), JSON.stringify({ seq: n, op, sid, ...more }))
  await until(() => existsSync(file), op)
  const result = JSON.parse(readFileSync(file, 'utf8')); assert(result.ok, result.error)
  return result.value
}
function text(s) { return { chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: s }, { type: 'block-end', index: 0, block: { type: 'text', text: s } }, { type: 'finish', reason: { kind: 'stop' } }] } }
function tool(name) {
  const args = JSON.stringify({ name })
  return { chunks: [{ type: 'block-start', index: 0, blockType: 'tool-call' }, { type: 'tool-call-delta', index: 0, id: 'load', name: 'skill', argumentsDelta: args }, { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'load', name: 'skill', arguments: args } }, { type: 'finish', reason: { kind: 'tool-calls' } }] }
}
function script(sid, calls) {
  mkdirSync(join(runtime, 'fake/scripts'), { recursive: true })
  writeFileSync(join(runtime, 'fake/scripts', `${sid}.json`), JSON.stringify({ calls }))
}
async function session(calls) {
  const { sessionId } = await client.call('session/create', { request: { cwd: workspace } })
  script(sessionId, calls)
  return sessionId
}
async function completed(sid) { await until(() => events().some(r => r.sid === sid && r.event?.type === 'turn/end'), 'turn/end') }
async function boot(label, mounted) {
  stage = label
  let output = ''
  child = spawn(process.execPath, [join(sdk, 'scripts/start.mjs')], {
    cwd: workspace,
    env: { PATH: process.env.PATH, HOME: home, PBOTS_DATA_DIR: join(root, 'data'), P2SDK_PROVIDER: 'mock', P2SDK_HOME: runtime, P2SDK_HANDOFF: handoff, P2SDK_PORT: '0', P2SDK_PATCH: patch, P2SDK_R2_ROOT: root, P2SDK_R2_STAGE: stage, DSH_TELEMETRY_MODE: 'DISABLED', ...(mounted ? { DSH_BUNDLED_SKILL_DIR: bundle } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', b => { output += b }); child.stderr.on('data', b => { output += b })
  await until(() => { if (child.exitCode !== null) throw Error(`runtime early exit ${child.exitCode}`); return output.includes('[p2sdk] ready http') }, 'runtime ready', 60000)
  // Consume only this probe's newly generated handoff, never emit its values.
  client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token: readFileSync(join(handoff, 'launch-token'), 'utf8').trim() })
  summary.stages.push({ label, boot: 'ready', bundledRoot: mounted })
}
async function stop() {
  client?.close(); client = undefined
  if (!child) return
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM') // only our spawn; launcher forwards to its own child
  await until(() => child.exitCode !== null || child.signalCode !== null, 'owned launcher exit', 15000)
  summary.stages.at(-1).exit = { code: child.exitCode, signal: child.signalCode }
  child = undefined
}
try {
  await boot('default', false)
  const sid = await session([text('no side effects')])
  const defaults = await command('list', sid, { cwd: workspace })
  check('default project .agents/skills discovered', defaults.some(s => s.name === 'p7-project'))
  check('bare profile/skills NOT auto-discovered', !defaults.some(s => s.name === 'create-verification-skill'))
  await stop()
  await boot('bundled', true)
  const sid2 = await session([text('no side effects')])
  const mounted = await command('list', sid2, { cwd: workspace })
  check('DSH_BUNDLED_SKILL_DIR discovers both original and adapted playbooks', ['create', 'maintain'].every(k => ['', '-adapted'].every(suffix => mounted.some(s => s.name === `${k}-verification-skill${suffix}`))))
  for (const name of ['create-verification-skill', 'create-verification-skill-adapted', 'maintain-verification-skill-adapted']) {
    const sid = await session([tool(name), text('MODEL_CLAIM_ONLY')])
    await command('assign', sid, { text: `/${name}\nProbe loading only. Do not execute the playbook.` })
    await completed(sid)
    const logs = await command('log', sid)
    check(`${name}: P6 pbots-main source preserved`, logs.some(e => e.type === 'user/message' && e.sourceKind === 'pbots-main'))
    const result = logs.find(e => e.type === 'tool/result')
    if (name.endsWith('-adapted')) check(`${name}: real skill tool loaded body`, result && !result.isError && result.text.includes('verification skill'))
    else {
      check('original: model tool invocation refused', result?.isError && result.text.includes('not available for model invocation'))
      check('pbots-main slash text does NOT cause explicit user skill injection', !events().some(e => e.sid === sid && e.input?.includes('# Create a verification skill')))
    }
    const { foldAssignments } = await import(pathToFileURL(join(sdk, 'src/orchestration/assignment.mjs')))
    const { resultTextFor } = await import(pathToFileURL(join(sdk, 'src/orchestration/report.mjs')))
    const assignment = [...foldAssignments(logs).assignments.values()][0]
    check(`${name}: P6 assignment fold + report tail usable`, assignment?.ended === 'completed' && resultTextFor(logs, assignment.turn) === 'MODEL_CLAIM_ONLY')
  }
  const explicit = await session([text('explicit user load only')])
  await client.call('session/prompt', { request: { requestId: `r2-${++seq}`, sessionId: explicit, mode: 'queue', content: [{ type: 'text', text: '/create-verification-skill\nDo not execute, probe load only.' }] } })
  await completed(explicit)
  check('original: genuine user slash invocation injects body', events().some(e => e.sid === explicit && e.input?.includes('# Create a verification skill')))
  summary.pass = true
} catch (error) {
  summary.pass = false; summary.error = String(error); process.exitCode = 1
} finally {
  try { await stop(); summary.cleanup = 'owned launcher stopped; temporary runtime removed' }
  catch (error) { summary.cleanup = String(error); summary.pass = false; process.exitCode = 1 }
  if (!child) rmSync(root, { recursive: true, force: true })
  console.log(JSON.stringify(summary, null, 2))
}
