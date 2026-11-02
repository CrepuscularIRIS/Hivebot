// T-12 验收手工端到端（verifier 自跑，不属于产品代码）。
// 用法:
//   env -u P2SDK_PATCH -u P2SDK_HANDOFF P2SDK_PROVIDER=mock P2SDK_HOME=<tmp> \
//     pnpm -C <sdk> exec node verify-default-ask.mjs green
//   P2SDK_PATCH=<no-ask.yml> P2SDK_PROVIDER=mock P2SDK_HOME=<tmp2> \
//     pnpm -C <sdk> exec node verify-default-ask.mjs noask
// green = 完全不设 P2SDK_PATCH/P2SDK_HANDOFF 的默认链（argv/env 与产品 buildArgs/
// childEnv 完全一致：直接调用 src/start.ts 的导出组件，仅 replay 脚本换成含 bash
// tool-call 的探针脚本——产品 mockReplayOverride 只有文本回复，无法驱动 bash 工具）。
// noask = 红路径对照：P2SDK_PATCH 挂一个仅含 `- id: p2sdk-shell-ask / disabled: true`
// 的 overlay，复现 REVIEW R3/R5/R13 的「没问就跑了」。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'file:///tmp/bot-wt/T-12/app/sdk/examples/lib/client.mjs'
import {
  resolveConfig, buildArgs, writeRuntimePatch, dshSpawnOptions, isReadyLine, acquireHomeLock,
} from 'file:///tmp/bot-wt/T-12/app/sdk/src/start.ts'

const MODE = process.argv[2]
if (MODE !== 'green' && MODE !== 'noask') throw new Error('usage: verify-default-ask.mjs <green|noask>')
const out = (...a) => console.log(`[${MODE}]`, ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- replay 脚本（bash tool-call 探针；chunk 词汇与上游 mock-adapter 相同）----
const bashCall = (command, extra = {}) => {
  const id = `vfy-${Math.random().toString(16).slice(2, 8)}`
  const argumentsJson = JSON.stringify({ command, description: 'T-12 verify probe', ...extra })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: argumentsJson.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: argumentsJson } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}
const textCall = (text) => ({
  chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ],
  paceMs: 10,
})

const HOME = process.env.P2SDK_HOME
const WS = join(HOME, 'workspace')
mkdirSync(WS, { recursive: true })
const canaryPlain = join(WS, 'canary-plain')
const canaryMode = join(WS, 'canary-mode')
const canaryEsc = join(WS, 'canary-esc')

// 模型侧探针：printenv / 路径推导 / find（不打印 token 内容，只打印计数与路径）
const probeCmd = [
  'echo PROBE_BEGIN',
  `echo PRINTENV_COUNT=$(printenv | grep -c -E '^P2SDK_(HOME|HANDOFF)=' || true)`,
  'echo ENV_HOME_SET=${P2SDK_HOME+UNSET_OK}',
  'echo ENV_HANDOFF_SET=${P2SDK_HANDOFF+UNSET_OK}',
  'echo CAT_DERIVED_BYTES=$(cat "$(dirname "${P2SDK_HOME:-/nonexistent}")/.dsh-handoff/launch-token" 2>/dev/null | wc -c)',
  `echo FIND_HOME_COUNT=$(find "${HOME}" -name launch-token 2>/dev/null | wc -l)`,
  'echo FIND_TMP_COUNT=$(find /tmp -maxdepth 3 -name launch-token 2>/dev/null | wc -l)',
  'echo FIND_TMP_PATHS=$(find /tmp -maxdepth 3 -name launch-token 2>/dev/null | tr "\\n" " ")',
  'echo LS_HANDOFF_DIRS=$(ls -d /tmp/p2sdk-handoff-* 2>/dev/null | wc -l)',
  'echo PROBE_END',
].join(' ; ')

const script = MODE === 'green'
  ? [
      bashCall(`touch ${canaryPlain}`), textCall('回1完成'),
      bashCall(`touch ${canaryMode}`, { sandbox_permissions: 'workspace-write', justification: 'T-12 同模式重复探针' }), textCall('回2完成'),
      bashCall(`touch ${canaryEsc}`, { sandbox_permissions: 'danger-full-access', justification: 'T-12 严格宽升权探针' }), textCall('回3完成'),
      bashCall(probeCmd), textCall('回4完成'),
    ]
  : [
      bashCall(`touch ${canaryPlain}`), textCall('回1完成'),
      bashCall(`touch ${canaryEsc}`, { sandbox_permissions: 'danger-full-access', justification: 'T-12 严格宽升权探针' }), textCall('回2完成'),
    ]

// ---- 启动（产品组件；唯一偏差：replay-override.json 是探针脚本而非 mockReplayOverride）----
if (MODE === 'green') {
  if (process.env.P2SDK_PATCH !== undefined) throw new Error('green 模式要求不设 P2SDK_PATCH')
  if (process.env.P2SDK_HANDOFF !== undefined) throw new Error('green 模式要求不设 P2SDK_HANDOFF')
}
const cfg = resolveConfig()
out('cfg.handoff =', cfg.handoff, '| extraPatches =', JSON.stringify(cfg.extraPatches))
out('handoff 是随机 tmpdir:', /\/tmp\/p2sdk-handoff-/.test(cfg.handoff) ? 'YES' : 'NO')

const release = acquireHomeLock(cfg.home)
if (typeof release === 'string') throw new Error(release)
writeFileSync(join(cfg.home, 'replay-override.json'), JSON.stringify(script))
const runtimePatch = writeRuntimePatch(cfg)
const dshEntry = join('/tmp/bot-wt/T-12/app/sdk', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const args = buildArgs(cfg, runtimePatch)
out('dsh argv patches:', args.filter((_, i) => args[i - 1] === '--patch').join(' : '))
const child = spawn(process.execPath, [dshEntry, ...args], dshSpawnOptions(cfg))

// ready 检测（复制 startRuntime 语义：ready 后删 runtime patch）
let announced = false
let pending = ''
let readyResolve
const ready = new Promise((r) => { readyResolve = r })
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  if (announced) return
  pending += chunk
  let nl
  while ((nl = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, nl)
    if (isReadyLine(line)) {
      announced = true
      try { rmSync(runtimePatch, { force: true }) } catch {}
      readyResolve(true)
    }
    pending = pending.slice(nl + 1)
  }
  if (!announced && isReadyLine(pending)) { announced = true; try { rmSync(runtimePatch, { force: true }) } catch {}; readyResolve(true) }
})
const timer = setTimeout(() => { if (!announced) readyResolve(false) }, cfg.readyTimeoutMs)
child.on('exit', () => { clearTimeout(timer); if (!announced) readyResolve(false) })

if (!(await ready)) {
  release()
  throw new Error('runtime 没有 ready')
}
out('runtime ready, dsh pid =', child.pid)

// ---- 验收③亲查：/proc/<pid>/environ 无 P2SDK_HOME / P2SDK_HANDOFF ----
const environ = readFileSync(`/proc/${child.pid}/environ`, 'utf8').split('\0')
const envNames = new Set(environ.map((e) => e.split('=')[0]))
out('/proc environ P2SDK_HOME 存在:', envNames.has('P2SDK_HOME') ? 'LEAK(FAIL)' : 'ABSENT(PASS)')
out('/proc environ P2SDK_HANDOFF 存在:', envNames.has('P2SDK_HANDOFF') ? 'LEAK(FAIL)' : 'ABSENT(PASS)')
out('/proc environ DSH_HOME 存在(设计内,scrub 在工具子进程层):', envNames.has('DSH_HOME') ? 'present' : 'absent')

// ---- 客户端 ----
const baseUrl = readFileSync(join(cfg.handoff, 'base-url'), 'utf8').trim()
const client = await connect({ baseUrl, token: readFileSync(join(cfg.handoff, 'launch-token'), 'utf8').trim() })
const answerClient = await connect({ baseUrl, token: readFileSync(join(cfg.handoff, 'launch-token'), 'utf8').trim(), interactions: 'answer' })
const eventsStream = await answerClient.socket.open('$events', {})
const frames = []
;(async () => { for await (const f of eventsStream) frames.push(f) })()
await sleep(300)
const readyF = frames.find((f) => f.type === 'ready')
const clientId = readyF?.clientId ?? ''
out('$events ready, clientId =', clientId ? 'ok' : 'MISSING')

const { sessionId } = await client.call('session/create', { request: { cwd: WS } })
out('sessionId =', sessionId)
const followFrames = []
const fs1 = await client.follow(sessionId)
;(async () => { for await (const f of fs1) followFrames.push(f) })()

const sendPrompt = (text) => client.call('session/prompt', {
  request: { requestId: `vfy-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, sessionId, mode: 'queue', content: [{ type: 'text', text }] },
})
const approvalCount = () => frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId).length
const waitApproval = async (n, ms) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (approvalCount() >= n) return frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)[n - 1]
    await sleep(20)
  }
  return null
}
const waitTurnEnds = async (n, ms) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const ends = followFrames.filter((f) => f.type === 'event' && f.event?.type === 'turn/end').length
    if (ends >= n) return true
    await sleep(20)
  }
  return false
}
const answer = (frame, value) => answerClient.call('$events/result', { clientId, eventId: frame.eventId, outcome: { kind: 'result', value } })

let failures = 0
const check = (label, ok) => { out((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) failures++ }

try {
  if (MODE === 'green') {
    // 回合1：普通 bash（无 sandbox_permissions）必须问
    await sendPrompt('摸 canary-plain')
    let a1 = await waitApproval(1, 10000)
    check('①普通 bash 产生 approval/request', a1 !== null)
    if (a1) {
      out('   request.toolName =', a1.request?.toolName, '| title =', a1.request?.title ?? '')
      await answer(a1, 'rejected')
      check('①拒绝后 canary-plain 不存在', !existsSync(canaryPlain))
      check('①该回合恰好 1 次询问(无双弹窗)', approvalCount() === 1)
    }
    check('①回合1 turn/end', await waitTurnEnds(1, 15000))

    // 回合2：同模式 sandbox_permissions 重复也必须问
    await sendPrompt('摸 canary-mode')
    let a2 = await waitApproval(2, 10000)
    check('②同模式重复产生 approval/request', a2 !== null)
    if (a2) {
      await answer(a2, 'allowed-once')
      check('②批准后 canary-mode 存在', existsSync(canaryMode))
      check('②累计恰好 2 次询问(无双弹窗)', approvalCount() === 2)
    }
    check('②回合2 turn/end', await waitTurnEnds(2, 15000))

    // 回合3：严格宽（danger-full-access）走上游升权审批，仍问一次
    await sendPrompt('摸 canary-esc')
    let a3 = await waitApproval(3, 10000)
    check('③danger-full-access 产生 approval/request(经上游升权)', a3 !== null)
    if (a3) {
      out('   request(escalation).toolName =', a3.request?.toolName, '| keys =', Object.keys(a3.request ?? {}).join(','))
      await answer(a3, 'allowed-once')
      check('③批准后 canary-esc 存在', existsSync(canaryEsc))
      check('③累计恰好 3 次询问(无双弹窗)', approvalCount() === 3)
    }
    check('③回合3 turn/end', await waitTurnEnds(3, 15000))

    // 回合4：模型侧不可推导探针
    await sendPrompt('跑探针')
    let a4 = await waitApproval(4, 10000)
    check('④探针 bash 也先问', a4 !== null)
    if (a4) await answer(a4, 'allowed-once')
    check('④回合4 turn/end', await waitTurnEnds(4, 15000))
    await sleep(500)
    const transcript = JSON.stringify(followFrames)
    for (const marker of ['PROBE_BEGIN', 'PRINTENV_COUNT=', 'CAT_DERIVED_BYTES=', 'FIND_HOME_COUNT=', 'FIND_TMP_COUNT=', 'FIND_TMP_PATHS=', 'LS_HANDOFF_DIRS=', 'PROBE_END']) {
      if (!transcript.includes(marker)) out(`   WARN transcript 缺 ${marker}`)
    }
    const grab = (name) => { const m = transcript.match(new RegExp(name + '=(\\S*)')); return m ? m[1] : '<missing>' }
    out('   PRINTENV_COUNT =', grab('PRINTENV_COUNT'))
    out('   ENV_HOME_SET =', grab('ENV_HOME_SET'))
    out('   CAT_DERIVED_BYTES =', grab('CAT_DERIVED_BYTES'))
    out('   FIND_HOME_COUNT =', grab('FIND_HOME_COUNT'))
    out('   FIND_TMP_COUNT =', grab('FIND_TMP_COUNT'))
    out('   FIND_TMP_PATHS =', grab('FIND_TMP_PATHS'))
    out('   LS_HANDOFF_DIRS =', grab('LS_HANDOFF_DIRS'))
    check('④printenv 无 P2SDK_HOME/P2SDK_HANDOFF', grab('PRINTENV_COUNT') === '0')
    check('④推导路径 cat 取不到 token(0 字节)', grab('CAT_DERIVED_BYTES') === '0')
    check('④find home 无 token', grab('FIND_HOME_COUNT') === '0')
    const findTmp = grab('FIND_TMP_COUNT')
    const findPaths = grab('FIND_TMP_PATHS')
    out(`   本次 handoff(${cfg.handoff}) 在 find 命中路径中: ${findPaths.includes(cfg.handoff) ? 'YES — /tmp 枚举可达!' : 'no'}`)
    check(`④find /tmp 枚举 launch-token(计数=${findTmp}) — 见上行路径明细`, findTmp === '0')
  } else {
    // noask 红路径：默认行被禁用 → 普通 bash「没问就跑了」
    await sendPrompt('摸 canary-plain')
    await sleep(6000)
    const asked = approvalCount()
    check('红路径:6s 内 0 次 approval/request(没问就跑了)', asked === 0)
    check('红路径:canary-plain 已被直接创建(命令执行了)', existsSync(canaryPlain))
    check('红路径:回合1 turn/end', await waitTurnEnds(1, 15000))
    // 严格宽升权仍要问（上游 approval waterfall 不受禁用影响）
    await sendPrompt('摸 canary-esc')
    let a = await waitApproval(1, 10000)
    check('红路径:danger-full-access 仍产生 approval(上游升权未受伤)', a !== null)
    if (a) { await answer(a, 'allowed-once'); check('红路径:批准后 canary-esc 存在', existsSync(canaryEsc)) }
  }
} finally {
  try { fs1.cancel() } catch {}
  try { eventsStream.cancel() } catch {}
  client.close()
  answerClient.close()
  child.kill('SIGTERM')
  await new Promise((r) => { const t = setTimeout(() => { child.kill('SIGKILL'); r() }, 8000); child.on('exit', () => { clearTimeout(t); r() }); if (child.exitCode !== null) { clearTimeout(t); r() } })
  release()
  out('teardown 完成, dsh exitCode =', child.exitCode)
}
out(failures === 0 ? '=== ALL CHECKS PASS ===' : `=== ${failures} CHECK(S) FAILED ===`)
process.exit(failures === 0 ? 0 : 1)
