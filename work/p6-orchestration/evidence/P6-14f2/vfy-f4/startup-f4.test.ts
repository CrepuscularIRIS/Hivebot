// P6-14.f4 复跑 f3 的 startup 对抗探针（VERIFY-P6-14f3/vfy/startup.test.ts 同法），
// 断言改为 f4 修复后的语义：**两条分支**（首连正常 / 首连超时+重连）在 store.init
// 完成前都不放行首会话；就位后 session/create 到达 dsh 时 bots.json 已存在、身份 main。
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
vi.mock('electron', () => ({ app:{}, BrowserWindow:{getAllWindows:()=>[]}, dialog:{}, ipcMain:{handle:()=>{},on:()=>{}}, MessageChannelMain:{}, protocol:{handle:()=>{},registerSchemesAsPrivileged:()=>{}} }))
import { wireRestoreOnReconnect, wrapM1WithOrchestration } from '/tmp/bot-wt/P6-14f2/app/ui/main/index'
import { registerM3Meta } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/index'
import { BotsMetaStore } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/store'
import { createReadyGate } from '/tmp/bot-wt/P6-14f2/app/ui/main/ready'
import { restoreGated } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/ensure'
import { resolveWorkerStatus } from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs'

for (const timeout of [false, true]) it(`f4 gate: init pending; first connect timeout=${timeout}; session/create held until bots.json exists`, async () => {
  const root = mkdtempSync('/tmp/bot-p614f4-vfy-startup-')
  let release!: () => void
  const ioPending = new Promise<void>(r => { release = r })
  class SlowStore extends BotsMetaStore { async init() { await ioPending; await super.init() } }
  const store = new SlowStore(root)
  const calls: any[] = []
  const listeners: Array<(g: number) => void> = []
  const dsh = {
    onConnected(fn: (g: number) => void) { listeners.push(fn) },
    async rpc(method: string, args: any) {
      const id = args?.request?.sessionId
      calls.push({ method, identity: resolveWorkerStatus(String(id), root), fileExists: existsSync(join(root, 'bots.json')) })
      return { ok: true, value: { sessionId: id } }
    },
  }
  const ready = createReadyGate({ dshConfigured: true }); ready.setWindowReady()
  const m3 = registerM3Meta({ store, dsh: dsh as never })
  wireRestoreOnReconnect(dsh as never, m3, ready, () => {})
  const m1 = restoreGated(ready, wrapM1WithOrchestration(async () => { throw Error('unexpected base') }, dsh as never, store, root))
  try {
    if (timeout) {
      // 生产首连超时 catch 函数体原文执行（非平行实现）
      const src = readFileSync('/tmp/bot-wt/P6-14f2/app/ui/main/index.ts', 'utf8')
      const body = src.match(/dshStart\?\.catch\(\(error\) => \{([\s\S]*?)\n      \}\)/)?.[1]
      expect(body).toBeTruthy()
      new Function('ready', 'm3', 'error', body!)(ready, m3, Error('injected first-connect timeout'))
    }
    for (const fn of listeners) fn(1)
    let completed = false
    const request = m1({ method: 'session/create', args: { request: { agentPreset: 'standard' } } } as never).then(v => { completed = true; return v })
    await new Promise(r => setTimeout(r, 50))
    // f4 核心断言：无论正常还是超时分支，init 未完成前首会话被闸门挂起
    expect(completed).toBe(false)
    expect(calls).toEqual([])
    release(); await m3.init; await request
    expect(calls).toHaveLength(1)
    expect(calls[0].fileExists).toBe(true)
    expect(calls[0].identity).toBe('main')
    console.log(`f4 PASS timeout=${timeout}: gate held; first session/create saw`, JSON.stringify(calls[0]))
  } finally { release(); await m3.init; store.close(); rmSync(root, { recursive: true, force: true }) }
})
