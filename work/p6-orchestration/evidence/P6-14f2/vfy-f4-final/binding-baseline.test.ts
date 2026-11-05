// P6-14.f4（VERIFY-P6-14.f3 阻塞项）：首连**超时**分支放行 restore 闸门前同样必须
// 等 store.init —— 否则首个 session/create 在 bots.json 尚不存在时到达 dsh、身份判
// unknown。生产接线级测试：超时分支函数体从 main/index.ts 原文提取执行（与 f3 验收
// 探针同法，不手写平行实现，防测试与产品漂移）；init 受控挂起，超时放行 + 后台重连
// 成功后首会话仍须等到骨架落盘（identity=main）才到达 dsh。
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {},
  ipcMain: { handle: () => {}, on: () => {} },
  MessageChannelMain: {},
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} },
}))

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wireRestoreOnReconnect, wrapM1WithOrchestration } from '/tmp/bot-wt/P6-14f2/app/ui/main/index'
import { registerM3Meta } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta'
import { BotsMetaStore } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/store'
import { createReadyGate } from '/tmp/bot-wt/P6-14f2/app/ui/main/ready'
import { restoreGated } from '/tmp/bot-wt/P6-14f2/app/ui/main/m3-meta/ensure'
import { resolveWorkerStatus } from '/tmp/bot-wt/P6-14f2/app/sdk/src/orchestration/envelope.mjs'
import { tmkdir } from '/tmp/bot-wt/P6-14f2/app/ui/tests/support/tmp-sweep.ts'

describe('P6-14.f4 启动闸门：全部放行路径先等 store.init', () => {
  it('首连超时分支：init 未完成前闸门不放行；就位后首会话 identity=main 且 bots.json 已存在', async () => {
    const root = tmkdir('bot-p614f4-gate-')
    let release!: () => void
    const ioPending = new Promise<void>((r) => { release = r })
    // 受控 I/O 延迟的真 store（f3 探针同法）：init 挂起直到 release
    class SlowStore extends BotsMetaStore {
      override async init(): Promise<void> { await ioPending; await super.init() }
    }
    const store = new SlowStore(root)
    const calls: Array<{ method: string; identity: string; fileExists: boolean }> = []
    const listeners: Array<(g: number) => void> = []
    const dsh = {
      onConnected(fn: (g: number) => void) { listeners.push(fn) },
      async rpc(method: string, args: unknown) {
        const id = (args as { request?: { sessionId?: string } })?.request?.sessionId
        calls.push({
          method,
          identity: resolveWorkerStatus(String(id), root),
          fileExists: existsSync(join(root, 'bots.json')),
        })
        return { ok: true, value: { sessionId: id } }
      },
    }
    const ready = createReadyGate({ dshConfigured: true })
    ready.setWindowReady()
    const m3 = registerM3Meta({ store, dsh })
    wireRestoreOnReconnect(dsh, m3, ready, () => {})
    const m1 = restoreGated(
      ready,
      wrapM1WithOrchestration(async () => { throw new Error('unexpected base call') }, dsh as never, store, root),
    )
    try {
      // 生产超时分支原文执行（VERIFY-P6-14.f3 复现同法）
      const src = readFileSync("/tmp/bot-wt/P6-14f2/app/ui/main/index.ts", 'utf8')
      const body = src.match(/dshStart\?\.catch\(\(error\) => \{([\s\S]*?)\n      \}\)/)?.[1]
      expect(body, 'main/index.ts 中 dshStart 超时分支形态改变：请同步本测试提取正则').toBeTruthy()
      new Function('ready', 'm3', 'error', body!)(ready, m3, new Error('injected first-connect timeout'))
      // 超时后后台重连成功（U-28 R3/R4 路径）
      for (const fn of [...listeners]) fn(1)
      let completed = false
      const request = (m1 as unknown as (req: unknown) => Promise<unknown>)(
        { method: 'session/create', args: { request: { agentPreset: 'standard' } } },
      ).then((v) => { completed = true; return v })
      await new Promise((r) => { setTimeout(r, 50) })
      // 核心：init 未完成前闸门不放行（f3 反例在此翻绿）
      expect(completed).toBe(false)
      expect(calls).toEqual([])
      release()
      await m3.init
      await request
      // 首会话到达 dsh 时骨架已落盘、身份判 main
      expect(calls).toHaveLength(1)
      expect(calls[0].fileExists).toBe(true)
      expect(calls[0].identity).toBe('main')
    } finally {
      release()
      await m3.init
      store.close()
    }
  })
})
