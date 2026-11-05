// P6-12 真 Loader 用例（PLAN P6-12 验收 ①–⑩ + §11 R2-1 反向）：orchestration.yml
// 挂生产插件（report + taint-guard），fake 模型驱动。覆盖：合批（3 worker 一条
// 通知）、自发回合 0 通知、污染回合全工具拒（bash/write/连接器写/create_bot）
// 与混合回合、R2-1 三反向（审批档位切换/提问迟到答复/schedule 触发不误拒）、
// 真审批 ask 项（eventId=approval/asked.id）→ 作答 → end 项、用户消息先跑、
// 用户停止撤回 + 补投、blocked / max-tokens 照常触发。崩溃恢复（三崩溃点 +
// claim 窗口 + worker 回合中 SIGKILL）在文末独立 describe，多轮 boot 同一 home。
// 口径：fake 游标 per-session 且 boot 归零（P6-09 附 4）——每用例独立 session、
// 重启后全量重写脚本。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from '/tmp/bot-wt/P6-12/app/sdk/node_modules/vitest/dist/index.js'
import { launchRuntime, type Runtime } from '/tmp/bot-wt/P6-12/app/sdk/tests/support/runtime.ts'
import { tmkdir } from '/tmp/bot-wt/P6-12/app/sdk/tests/support/tmp-sweep.ts'
import { connect, type DshClient } from '/tmp/bot-wt/P6-12/app/sdk/examples/lib/client.mjs'

const PKG_ROOT = '/tmp/bot-wt/P6-12/app/sdk'

const home = tmkdir('bot-p612-live-')
const dataDir = join(home, 'data')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(join(home, 'gates'), { recursive: true })
mkdirSync(dataDir, { recursive: true })

const overlay = join(home, 'p612.yml')
writeFileSync(overlay, `\
# P6-12 overlay (orchestration-report-live.test.ts)
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
    - id: p610-inspect
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')).href}'
`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const text = (t: string, paceMs = 5) => ({ paceMs, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: t },
  { type: 'block-end', index: 0, block: { type: 'text', text: t } },
  { type: 'finish', reason: { kind: 'stop' } },
] })
const gatedText = (gateId: string, finishReason: { kind: string, failure?: object } = { kind: 'stop' }) => ({ gateAfterChunk: 1, gateId, chunks: [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '.' },
  { type: 'block-end', index: 0, block: { type: 'text', text: '.' } },
  { type: 'finish', reason: finishReason },
] })
const toolCall = (callId: string, name: string, args: object) => ({ chunks: [
  { type: 'block-start', index: 0, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args).slice(0, 5) },
  { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args).slice(5) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
] })
const sendCall = (callId: string, botId: string, prompt: string) => toolCall(callId, 'send_to_bot', { botId, prompt })
const bashCall = (callId: string, command: string) => toolCall(callId, 'bash', { command, description: 'P6-12 canary' })
const createCall = (callId: string, name: string, prompt: string) => toolCall(callId, 'create_bot', { name, prompt })
const connCall = (callId: string, payload: string) => toolCall(callId, 'p612_conn_write', { payload })
const openGate = (gateId: string) => writeFileSync(join(home, 'gates', gateId), '1')

interface LogEvent {
  seq: number; type: string; id?: string; sourceKind?: string; items?: any[]; turn?: number | null
  reason?: string; isError?: boolean; error?: { message?: string } | null; text?: string; callId?: string
}

const writeScript = (sessionId: string, calls: object[]) => {
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}

import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

interface CrashRt { child: ChildProcess; client: DshClient; dshPid: number | null; output: string }

const crashHome = tmkdir('bot-p612-crash-')
const crashData = join(crashHome, 'data')
mkdirSync(join(crashHome, 'fake', 'scripts'), { recursive: true })
mkdirSync(crashData, { recursive: true })
const fakeOverlay = join(crashHome, 'fake.yml')
writeFileSync(fakeOverlay, `\
# P6-12 crash-suite fake provider overlay
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
    - id: p610-inspect
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')).href}'
`)

/** One boot: own overlay carries this round's crashAt（同 id insert 语义不赌，直接自带插件行）. */
async function crashBoot(crashAt?: string): Promise<CrashRt> {
  const orch = join(crashHome, `orch-${crashAt ?? 'plain'}-${Date.now()}.yml`)
  writeFileSync(orch, `\
# P6-12 crash round overlay (crashAt=${crashAt ?? 'none'})
- insert:
    - id: pbots-orchestration
      name: '${pathToFileURL(join(PKG_ROOT, 'src', 'orchestration', 'main-channel.mjs')).href}'
      config:
        crashAt: '${crashAt ?? ''}'
        dataDir: '${crashData}'
`)
  const handoff = tmkdir('bot-p612-hand-')
  rmSync(join(handoff, 'base-url'), { force: true })
  rmSync(join(handoff, 'launch-token'), { force: true })
  let output = ''
  let dshPid: number | null = null
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: {
      ...process.env,
      P2SDK_PROVIDER: 'mock', P2SDK_HOME: crashHome, P2SDK_HANDOFF: handoff,
      P2SDK_PORT: '0', PBOTS_DATA_DIR: crashData, P2SDK_ORCH_DATA_DIR: crashData,
      P2SDK_PATCH: `${fakeOverlay}:${orch}`,
      DSH_TELEMETRY_MODE: 'DISABLED',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => {
    output += c
    const m = /p2sdk: dsh pid (\d+)/.exec(c)
    if (m) dshPid = Number(m[1])
  })
  const deadline = Date.now() + 60_000
  for (;;) {
    if (existsSync(join(handoff, 'launch-token'))) break
    if (child.exitCode !== null) throw new Error(`crash boot exited early (${child.exitCode}):\n${output.slice(-2000)}`)
    if (Date.now() > deadline) throw new Error(`crash boot timed out:\n${output.slice(-2000)}`)
    await sleep(200)
  }
  const client = await connect({ baseUrl: readFileSync(join(handoff, 'base-url'), 'utf8').trim(), token: readFileSync(join(handoff, 'launch-token'), 'utf8').trim() })
  return { child, client, get dshPid() { return dshPid }, get output() { return output } }
}

const crashStop = async (rt: CrashRt, kill = false) => {
  if (kill) {
    if (rt.dshPid !== null) process.kill(rt.dshPid, 'SIGKILL') // 本轮自己 spawn 的 dsh 孙进程（字面 PID）
    if (rt.child.exitCode === null) rt.child.kill('SIGKILL')
  } else if (rt.child.exitCode === null) {
    const exited = new Promise((r) => rt.child.once('exit', r))
    rt.child.kill('SIGTERM')
    const timer = setTimeout(() => rt.child.kill('SIGKILL'), 10_000)
    await exited
    clearTimeout(timer)
  }
  try { rt.client.close() } catch { /* already gone */ }
  await sleep(300) // 让 sqlite 侧文件落定（P6-09 killSdk 同款）
}

describe('Verifier three-item crash batches', () => {
  const cRead = async (rt: CrashRt, sessionId: string): Promise<LogEvent[]> =>
    ((await rt.client.call('p610/control', { request: { op: 'read', sessionId } })) as { events: LogEvent[] }).events
  const cPrompt = (rt: CrashRt, sessionId: string, t: string) =>
    rt.client.call('session/prompt', { request: { requestId: `p612c-${Date.now()}-${Math.random().toString(16).slice(2)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: t }] } })
  const cUntil = async (rt: CrashRt, pred: () => Promise<boolean>, label: string, ms = 60_000) => {
    const deadline = Date.now() + ms
    for (;;) {
      if (await pred()) return
      if (rt.child.exitCode !== null) throw new Error(`${label}: SDK exited unexpectedly:\n${rt.output.slice(-1500)}`)
      if (Date.now() > deadline) throw new Error(`${label}: timed out`)
      await sleep(150)
    }
  }
  /** 一个真 assignment：M 派 W、W 跑完（turn/end 落盘）。返回 { M, W, assignmentId }。 */
  async function makeAssignment(rt: CrashRt, paceMs = 5): Promise<{ M: string, W: string, assignmentId: string }> {
    const M = ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }).sessionId
    const W = ((await rt.client.call('session/create', { request: { agentPreset: 'standard' } })) as { sessionId: string }).sessionId
    writeFileSync(join(crashData, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: { [W]: { createdBy: M } } }))
    writeFileSync(join(crashHome, 'fake', 'scripts', `${W}.json`), JSON.stringify({ calls: [text('crash-suite 结果', paceMs)] }))
    writeFileSync(join(crashHome, 'fake', 'scripts', `${M}.json`), JSON.stringify({ calls: [sendCall('cs0', W, '一件事')] }))
    await cPrompt(rt, M, '派活')
    await cUntil(rt, async () => {
      const wLog = await cRead(rt, W)
      return wLog.some((e) => e.type === 'turn/end')
    }, 'worker assignment turn ends')
    const mLog = await cRead(rt, M)
    const sent = mLog.find((e) => e.type === 'tool/result' && e.isError !== true)
    const { assignmentId } = JSON.parse(sent?.text ?? '{}') as { assignmentId: string }
    if (!assignmentId) throw new Error(`no assignmentId in send result: ${sent?.text}`)
    return { M, W, assignmentId }
  }
  /** 报告消息里某键出现的次数。 */
  const keyCount = (log: LogEvent[], key: string) =>
    log.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker')
      .flatMap((e) => e.items ?? []).filter((i: any) => i.key === key).length


  for (const point of ['report-before-send', 'report-after-send', 'report-before-splice', 'claim']) {
    it(point + ': three keys, one batch, exactly once after restart', { timeout: 180_000 }, async () => {
      let rt1, rt2
      try {
        rt1 = await crashBoot(point === 'claim' ? undefined : point)
        const M = ((await rt1.client.call('session/create', { request: { agentPreset: 'standard' } }))).sessionId
        const ws = []
        for (let i=0; i<3; i++) ws.push(((await rt1.client.call('session/create', { request: { agentPreset: 'standard' } }))).sessionId)
        mkdirSync(join(crashHome, 'gates'), {recursive:true})
        writeFileSync(join(crashData,'bots.json'), JSON.stringify({version:1,mainBotId:M,recipes:{},bots:Object.fromEntries(ws.map(w=>[w,{createdBy:M}]))}))
        ws.forEach((w,i)=>writeFileSync(join(crashHome,'fake','scripts',w+'.json'), JSON.stringify({calls:[text('batch result '+i)]})))
        // Consecutive send calls in one main turn; the final gate ensures all three are due before crash.
        writeFileSync(join(crashHome,'fake','scripts',M+'.json'), JSON.stringify({calls:[...ws.map((w,i)=>sendCall('s'+i,w,'task '+i)),gatedText('batch-'+point)]}))
        if(point==='claim') await rt1.client.call('p610/control',{request:{op:'arm-claim-crash',armed:true}})
        await cPrompt(rt1,M,'delegate three')
        await cUntil(rt1,async()=>{
          for(const w of ws) if(!(await cRead(rt1,w)).some(e=>e.type==='turn/end')) return false
          return (await cRead(rt1,M)).filter(e=>e.type==='tool/result').length===3
        },'all three workers complete')
        const keys = (await cRead(rt1,M)).filter(e=>e.type==='tool/result' && !e.isError).map(e=>JSON.parse(e.text).assignmentId+':end').sort()
        expect(keys).toHaveLength(3)
        const exited = new Promise(resolve=>rt1.child.once('exit',resolve))
        writeFileSync(join(crashHome,'gates','batch-'+point),'1')
        await exited
        expect(rt1.child.exitCode).toBe(point==='claim'?88:87)
        rt1.client.close()
        writeFileSync(join(crashHome,'fake','scripts',M+'.json'), JSON.stringify({calls:[text('receive three after restart'),text('should not consume twice')]}))
        rt2 = await crashBoot()
        await cUntil(rt2,async()=>{
          const log = await cRead(rt2,M)
          return keys.every(k=>keyCount(log,k)===1)
        },'all three report keys consumed once')
        await sleep(3500)
        const log = await cRead(rt2,M)
        const batch = log.filter(e=>e.type==='user/message' && e.sourceKind==='pbots-worker')
        expect(batch).toHaveLength(1)
        expect(batch[0].items.map(i=>i.key).sort()).toEqual(keys)
        expect(batch[0].items.every(i=>i.outcome==='completed')).toBe(true)
        for (const key of keys) expect(keyCount(log,key)).toBe(1)
        console.log('CRASH_BATCH evidence',JSON.stringify({point,exit:rt1.child.exitCode,reports:batch.length,keys,items:batch[0].items}))
      } finally {
        if(rt2) await crashStop(rt2)
        if(rt1) await crashStop(rt1)
      }
    })
  }
})
