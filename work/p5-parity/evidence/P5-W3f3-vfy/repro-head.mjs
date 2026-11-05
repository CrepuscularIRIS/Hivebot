// 验收员独立验证：head(6ffce9c) 的 R1 / R4 行为（真实产品源码，非测试副本）。
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import * as plugin from '/tmp/bot-wt/P5-W3f3/app/sdk/src/policy/shell-ask.mjs'
import { issuePermit } from '/tmp/bot-wt/P5-W3f3/app/sdk/src/policy/request-net.mjs'

const WS = '/tmp/p5w3f3-vfy-ws'
mkdirSync(WS, { recursive: true })
const TIERS = { default: 'allow', bash: 'sandbox-allow', read: 'workspace-read', read_image: 'workspace-read', glob: 'workspace-read', grep: 'workspace-read', present: 'workspace-read', write: 'workspace-write', edit: 'workspace-write', web_fetch: 'allow', web_search: 'allow', mcp: 'ask' }
const ASK = Symbol('ask')
const isAsk = (d) => d !== null && typeof d === 'object' && d.kind === 'ask'

function fakeCtx(effectiveMode, approval, withFs) {
  const listeners = []
  return {
    listeners,
    on(event, listener) { listeners.push({ event, listener }) },
    get(name) {
      if (name === 'sandboxPolicy' && effectiveMode !== undefined) return { resolve: () => ({ mode: effectiveMode, workspaceRoot: WS }) }
      if (name === 'approval' && approval !== undefined) return approval
      if (name === 'fs' && withFs) return { resolve: async (raw) => ({ targetKey: raw.startsWith('/') ? raw : join(WS, raw) }) }
      return undefined
    },
  }
}
const nextResult = Symbol('next')
const next = () => nextResult
const listenerOf = (opts) => {
  const ctx = fakeCtx(opts.mode, opts.approval, opts.fs)
  plugin.apply(ctx, opts.config)
  return ctx.listeners[0].listener
}
const newEnv = () => {
  const root = mkdtempSync(join(tmpdir(), 'p5w3f3-head-'))
  mkdirSync(join(root, 'handoff')); mkdirSync(join(root, 'data'))
  writeFileSync(join(root, 'handoff', 'launch-token'), 'unit-token\n')
  const statePath = join(root, 'data', 'policy-state.json')
  return { root, statePath, config: { handoff: join(root, 'handoff'), policyStatePaths: [statePath], tiers: TIERS } }
}
const INSTANCE = plugin.instanceOf('unit-token')
const fmt = (d) => (d === nextResult ? 'NEXT(放行)' : isAsk(d) ? `ASK(${d.reason.slice(0, 40)})` : JSON.stringify(d))
let pass = 0; let fail = 0
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} · ${label}`); ok ? pass++ : fail++ }

// ── R1 head：删除后 fail closed ──
console.log('R1 head: ask 会话，provisioned(paused) → 删除状态文件')
{
  const e = newEnv()
  writeFileSync(e.statePath, JSON.stringify({ version: 1, paused: true, instance: INSTANCE }))
  const l = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  const before = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  rmSync(e.statePath)
  const aRead = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  const aWrite = await l({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)
  check(`删除前 read 出卡`, isAsk(before))
  check(`删除后 read 仍出卡（fail closed，base 是 NEXT）`, isAsk(aRead))
  check(`删除后 write 仍出卡（base 是 NEXT）`, isAsk(aWrite))
  const marker = join(dirname(e.statePath), '.p2sdk-policy-state-seen')
  check(`伴生标记已落盘`, statSync(marker).isFile())
  console.log(`  data 目录内容: ${readdirSync(dirname(e.statePath))}`)
  rmSync(e.root, { recursive: true, force: true })
}
console.log('R1 head: never 会话（委派子代理）删除后仍 deny')
{
  const e = newEnv()
  writeFileSync(e.statePath, JSON.stringify({ version: 1, paused: true, instance: INSTANCE }))
  const l = listenerOf({ mode: 'workspace-write', approval: { overrideOf: () => 'never', config: {} }, fs: true, config: e.config })
  const before = await l({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next)
  rmSync(e.statePath)
  const after = await l({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next)
  check(`删除前 deny`, before?.kind === 'deny')
  check(`删除后仍 deny（base 是 NEXT 复活）`, after?.kind === 'deny')
  rmSync(e.root, { recursive: true, force: true })
}
console.log('R1 head: 标记文件本身被删（同进程）→ latch 守门')
{
  const e = newEnv()
  writeFileSync(e.statePath, JSON.stringify({ version: 1, paused: true, instance: INSTANCE }))
  const l = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next) // 触发写标记
  rmSync(e.statePath)
  rmSync(join(dirname(e.statePath), '.p2sdk-policy-state-seen'))
  const aRead = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  check(`状态+标记双删后同进程 read 仍出卡（进程内 latch）`, isAsk(aRead))
  rmSync(e.root, { recursive: true, force: true })
}
console.log('R1 head: 重启（新 apply 闭包）凭伴生标记守门；标记也没了 → 回到 missing（申报上限）')
{
  const e = newEnv()
  writeFileSync(e.statePath, JSON.stringify({ version: 1, paused: true, instance: INSTANCE }))
  const first = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  await first({ name: 'read', arguments: { file_path: 'a.txt' } }, next) // 写标记
  rmSync(e.statePath)
  const restarted = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  const r1 = await restarted({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  check(`重启后凭标记仍出卡`, isAsk(r1))
  rmSync(join(dirname(e.statePath), '.p2sdk-policy-state-seen'))
  const restarted2 = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  const r2 = await restarted2({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  check(`标记也删除后重启 → 回 NEXT（= 申报的已知上限：整目录轮换等同从未存在）`, r2 === nextResult)
  rmSync(e.root, { recursive: true, force: true })
}
console.log('R1 head: 从未 provision（Q-013 missing 语义不回归）')
{
  const e = newEnv() // statePath 从未写入
  const l = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  const r = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  const w = await l({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)
  check(`missing 时 read 放行`, r === nextResult)
  check(`missing 时 write 放行`, w === nextResult)
  check(`data 目录无伴生文件`, readdirSync(dirname(e.statePath)).length === 0)
  rmSync(e.root, { recursive: true, force: true })
}
console.log('R1 head: 有效状态（paused:false）放行——门开着不回归')
{
  const e = newEnv()
  writeFileSync(e.statePath, JSON.stringify({ version: 1, paused: false, instance: INSTANCE }))
  const l = listenerOf({ mode: 'workspace-write', fs: true, config: e.config })
  const r = await l({ name: 'read', arguments: { file_path: 'a.txt' } }, next)
  check(`有效状态 read 放行`, r === nextResult)
  rmSync(e.root, { recursive: true, force: true })
}

// ── R4 head：原子抢占 ──
console.log('R4 head: 一张许可恰授权一次，第二次出卡；产物 wrapper 可认领')
{
  const dir = mkdtempSync(join(tmpdir(), 'p5w3f3-head-permit-'))
  const CMD = 'printf x >> log.txt; curl https://example.com'
  issuePermit({ dir, session: 'vfy-r4h', command: CMD })
  const l = listenerOf({ mode: 'workspace-write', config: { permitDir: dir, tiers: TIERS } })
  const b = (listener) => listener({ name: 'bash', agent: { session: { header: { id: 'vfy-r4h' } } }, arguments: { command: CMD, description: 'x' } }, next)
  const b1 = await b(l)
  const b2 = await b(l)
  check(`第 1 次 bash 放行（恰一次授权）`, b1 === nextResult)
  check(`第 2 次同命令 bash 出卡（base 是放行）`, isAsk(b2))
  const names = readdirSync(dir)
  check(`permit-* 已原子移走`, names.filter((n) => n.startsWith('permit-')).length === 0)
  const claim = names.find((n) => n.startsWith('claim-') && n.endsWith('.json'))
  check(`claim-*.json 产物存在`, claim !== undefined)
  const permitJson = JSON.parse(readFileSync(join(dir, claim), 'utf8'))
  check(`产物 session/argvHash 不变（wrapper 认领条件）`, permitJson.session === 'vfy-r4h' && typeof permitJson.argvHash === 'string')
  console.log(`  目录: ${names.join(', ')}`)
  rmSync(dir, { recursive: true, force: true })
}
console.log(`== 汇总: ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail === 0 ? 0 : 1)
