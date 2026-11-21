// P6-18 e2e（决策 23）：OS 通知的 Xvfb 降级路径。前置：pnpm build（LEARNINGS 2026-11-03）。
//
// 覆盖边界（如实注明）：Xvfb 没有真实通知守护——Linux/libnotify 下 Notification.isSupported()
// 恒 true（链接期判定；开发探针实测），「守护不可达」的真实信号是 Notification 的 'failed'
// 事件。本 spec 把被测 Electron 的 DBUS_SESSION_BUS_ADDRESS 指到死路径（既逼出降级，也
// 保证测试绝不会往用户真实桌面弹通知），断言：worker 挂起审批 → 恰 1 次通知尝试
// （shown=1 / urgency critical）、failed=1、后续 tick 不重试（恰 1 次）、主进程不崩、
// 汇总台账观测面 __pbotsNotify 可读。真实守护下的弹窗呈现与点击导航（聚焦主窗 +
// pbots:open-worker）Xvfb 内不可证——点击路径由单测 ⑦ 覆盖，真实呈现留给手动验收。
import { expect, test } from '/tmp/bot-wt/P6-18/app/ui/node_modules/playwright/test.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmkdir } from '/tmp/bot-wt/P6-18/app/ui/tests/support/tmp-sweep.ts'
import { launchShell } from '/tmp/bot-wt/P6-18/app/ui/tests/support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/P6-18/app/ui/tests/support/sdk-runtime.ts'
import { PRESETS_PATCH, toolCall, waitProductReady } from '/tmp/bot-wt/P6-18/app/ui/tests/support/ui.ts'

/** 测试插件 overlay：给 worker 投一条任务消息起回合（与 p6-workers.spec 同法）。 */
function peerOverlayPath(): string {
  const dir = tmkdir('bot-p618-patch-')
  const file = join(dir, 'p618-peer.yml')
  writeFileSync(file, `- insert:\n    - id: p618-peer\n      name: '${pathToFileURL('/tmp/bot-wt/P6-18/app/ui/tests/support/p6-peer-plugin.mjs').href}'\n`)
  return file
}

interface NotifyStats {
  supported: boolean
  shown: Array<{ eventId: string; botId: string; kind: string }>
  failed: string[]
  suppressedFocused: string[]
  skippedNonWorker: string[]
  skippedUnsupported: string[]
}

test('P6-18 Xvfb 降级：worker 挂起审批 → 恰 1 次 critical 通知尝试、守护不可达记 failed、不重试不崩', async () => {
  test.setTimeout(180_000)
  const home = tmkdir('bot-p618-')
  const rt: SdkRuntime = await launchSdkRuntime({
    patch: `${PRESETS_PATCH}:${fakeOverlayPath()}:${peerOverlayPath()}`,
    cwd: tmkdir('bot-p618-ws-'),
    dataDir: join(home, 'data'),
  })
  // 先 seed 后起壳（p6-workers 同序）：bots.json 必须在 M3 store init 前就位，
  // 否则 main 内存态无 worker，通知按非 worker 跳过
  const M = randomUUID()
  const W = randomUUID()
  await rt.client.call('session/create', { request: { sessionId: M } })
  await rt.client.call('session/rename', { request: { sessionId: M, title: 'Main Bot' } })
  await rt.client.call('session/create', { request: { sessionId: W } })
  await rt.client.call('session/rename', { request: { sessionId: W, title: 'Stuck worker' } })
  mkdirSync(join(home, 'data'), { recursive: true })
  writeFileSync(join(home, 'data', 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: { [W]: { createdBy: M } } }))
  const shell = await launchShell({
    home,
    env: {
      PBOTS_DSH_HANDOFF: rt.handoff,
      // 死总线：通知守护必不可达（降级路径），且杜绝弹到用户真实桌面
      // NO spec-level DBus override: wrapper guard must supply it.
    },
  })
  try {
    const { page, app } = shell
    const bus = await app.evaluate(() => process.env.DBUS_SESSION_BUS_ADDRESS)
    expect(bus).toBe('unix:path=/tmp/bot-wt/P6-18/app/ui/.build/e2e-dead-bus')
    console.log('GUARD inherited Electron bus:', bus, 'pid:', app.process().pid)
    await waitProductReady(page)

    // Xvfb 下窗口默认聚焦（探针实测）→ blur 后再触发，确保走「非聚焦 → 发通知」分支
    // （app.evaluate 的执行上下文无 require，走 __pbotsNotify 的 testBlurWindow 注入钩子）
    expect(await app.evaluate(() => (globalThis as { __pbotsNotify?: { testBlurWindow(): boolean } }).__pbotsNotify!.testBlurWindow())).toBe(false)

    const stats = (): Promise<NotifyStats> => app.evaluate(() => {
      const n = (globalThis as { __pbotsNotify?: { stats: never } }).__pbotsNotify
      return n?.stats as never
    })

    // worker 回合卡审批（真 shell-ask waterfall → $events → m1Ledger → notify 巡检）
    rt.writeScriptCalls(W, [toolCall('bash', { command: 'git push origin docs', description: 'publish docs' }, 'p618-c1')])
    await rt.client.call('p615/control', { request: { op: 'deliver', sessionId: W, id: 'pbots-assign:as1', text: 'Publish the docs.', source: { kind: 'pbots-main', assignmentId: 'as1', mainBotId: M } } })

    await expect.poll(async () => (await stats()).shown.length, { timeout: 30_000 }).toBe(1)
    const s1 = await stats()
    expect(s1.shown[0]).toMatchObject({ botId: W, kind: 'approval' })
    expect(typeof s1.shown[0]!.eventId).toBe('string')
    // Xvfb 降级边界：isSupported 恒 true，守护不可达以 failed 呈现（libnotify 连不上）
    expect(s1.supported).toBe(true)
    await expect.poll(async () => (await stats()).failed.length, { timeout: 10_000 }).toBe(1)
    const s2 = await stats()
    expect(s2.failed[0]).toBe(s2.shown[0]!.eventId)
    expect(s2.skippedNonWorker).toEqual([]) // 是 worker（createdBy 判定通过），没走非 worker 分支
    expect(s2.skippedUnsupported).toEqual([])

    // 恰 1 次：再等几个巡检周期（tick 1s），不重试（同 eventId 重连补发也不重发）
    await page.waitForTimeout(3_000)
    const s3 = await stats()
    expect(s3.shown).toHaveLength(1)
    expect(s3.failed).toHaveLength(1)

    console.log('GUARD stats:', JSON.stringify(s3))
    await page.locator('.sand-agent-item[aria-label="Stuck worker"]').click()
    await expect(page.locator('[aria-label="Local tool permissions"]')).toBeVisible({ timeout: 20000 })
    await page.screenshot({ path: '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-18/guard-worker.png' })
    // 主进程与页面仍活着（降级不崩）
    expect(await page.evaluate(() => 21 * 2)).toBe(42)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
