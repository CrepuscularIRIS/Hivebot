// B31 e2e：SuperAgent 主 bot 委派路由——@Bot 动词 语法改投目标 bot 会话（开关默认关）。
// 语义锚：dsh-superagent-prototype executor/dsh.ts worker-<ticketId> 持久 worker 会话约定。
// rig 模式锚：b5-reply-chain（writeScriptCalls 预写 worker 回复 + ControlOrMeta+Enter 发送）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, createBots, composer, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B31：主 bot @Bot 委派路由到目标会话', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b31-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 两个 bot：B31 Main（主 bot，先建）+ Atlas Worker（worker）
    const [main, atlas] = await createBots(page, [{ title: 'B31 Main' }, { title: 'Atlas Worker' }])
    // 给 Atlas worker 预写回复脚本（被委派的 turn 会有 assistant 回执）
    rt.writeScriptCalls(atlas, [textCall(['采集完成：7 条设计情报已落盘'])])
    // 打开 SuperAgent 路由开关（默认关）+ 把 B31 Main 钉成主 bot（rig 直建会话不触发 shim
    // createAgent 链，mainBotId 停在 boot 会话——ui.setMain 手动钉定，0.78.1 ensureDefaultMainAgent 等价）
    await page.evaluate(([mainId]) => window.pbotsUi.setMain(mainId), [main])
    await page.evaluate(() => localStorage.setItem('pbots.shim.superagent-router', '1'))
    // 在主 bot 会话发委派句
    await page.locator('.sand-agent-item', { hasText: 'B31 Main' }).click({ timeout: 30_000 })
    const editor = composer(page)
    await editor.click()
    await page.keyboard.type('@Atlas Worker 去采集今天的设计情报', { delay: 5 })
    await page.keyboard.press('ControlOrMeta+Enter')
    // 切到 Atlas Worker：user 侧含任务文本（无 @ 前缀），assistant 侧是 worker 回执
    await page.locator('.sand-agent-item', { hasText: 'Atlas Worker' }).click()
    await expect(page.locator('.sand-message[data-role="user"]').last()).toContainText('去采集今天的设计情报', { timeout: 60_000 })
    await expect(page.locator('.sand-message[data-role="user"]').last()).not.toContainText('@Atlas Worker')
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '采集完成' })).toBeVisible({ timeout: 60_000 })
    // 关开关回归：同句直发主 bot，不再投 worker
    await page.evaluate(() => localStorage.setItem('pbots.shim.superagent-router', '0'))
    await page.locator('.sand-agent-item', { hasText: 'B31 Main' }).click()
    await editor.click()
    await page.keyboard.type('@Atlas Worker 去采集', { delay: 5 })
    await page.keyboard.press('ControlOrMeta+Enter')
    // 主 bot 自己的会话收到这条（直发不改投）
    await expect(page.locator('.sand-message[data-role="user"]').last()).toContainText('@Atlas Worker 去采集', { timeout: 60_000 })
    // Atlas 会话不新增第二条 user 消息
    await page.locator('.sand-agent-item', { hasText: 'Atlas Worker' }).click()
    const userCount = await page.locator('.sand-message[data-role="user"]').count()
    expect(userCount).toBe(1)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
