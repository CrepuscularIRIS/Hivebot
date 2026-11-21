// B38d（T-D）：多 bot 快速切换压测——12 bot、200ms 连切、错投检查（每 bot 回复含自身标识）
import { expect, test } from 'playwright/test'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { botItem, composer, createBots, openBot, send, textCall, waitProductReady } from '../support/ui.ts'

test('B38d 压测：12 bot 200ms 连切无错投', async () => {
  test.setTimeout(300_000)
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b38d-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const N = 12
    const bots = Array.from({ length: N }, (_, i) => ({ title: `SW-${String(i).padStart(2, '0')}` }))
    const ids = await createBots(page, bots) as string[]
    // 每 bot：开→写 script→发（send 前即时写，避免 script 被更早轮消耗）
    for (let i = 0; i < N; i++) {
      await openBot(page, bots[i].title)
      rt.writeScriptCalls(ids[i], [textCall([`MARKER bot-${i} 回复标识。`])])
      await send(page, `q${i}`)
    }
    await page.waitForTimeout(1500)
    // 压测：3 轮快速连切（200ms 间隔）
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < N; i++) {
        await botItem(page, bots[i].title).click()
        await page.waitForTimeout(200)
      }
    }
    // 终态校验：每个 bot 打开后，最后一条 assistant 消息必须是自身 MARKER（无错投/无串台）
    let checked = 0
    for (let i = 0; i < N; i++) {
      await openBot(page, bots[i].title)
      await page.waitForTimeout(350)
      const msgs = page.locator('.sand-message[data-role="assistant"]')
      const count = await msgs.count()
      if (count > 0) {
        const last = await msgs.last().textContent()
        expect(last, `bot ${i} 末条 assistant 应含自身 MARKER，实得: ${last?.slice(0, 60)}`).toContain(`bot-${i}`)
        checked++
      }
    }
    expect(checked).toBe(N)
    // 草稿还原：bot 0 输入未发送文本→切走→切回→草稿在
    await openBot(page, bots[0].title)
    const editor = composer(page)
    await editor.click()
    await page.keyboard.type('draft-should-survive-38d', { delay: 10 })
    await botItem(page, bots[1].title).click()
    await page.waitForTimeout(300)
    await botItem(page, bots[0].title).click()
    await page.waitForTimeout(500)
    await expect(editor).toContainText('draft-should-survive-38d')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
