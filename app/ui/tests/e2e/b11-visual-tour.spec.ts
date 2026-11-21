// B11 视觉巡检：多面全开截图（亮/暗）——给人工审阅的基准图组
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { openOutline, textCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

test('B11：多面全开截图（对话+反馈卡+outline+设置）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b11-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    rt.writeScriptCalls(sid!, [textCall(['第一轮：你好，我是你的 Bot。', '这一条有多行文本用于气泡高度对照。'])])
    await editor(page).click()
    await page.keyboard.type('你好', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await page.waitForTimeout(4_000)
    await page.screenshot({ path: 'test-output/B11/b11-chat-feedback.png' })
    // outline 开（先例 helper：右键 bot 行 → Show full conversation）
    const label = await page.locator('.sand-agent-item[data-active="true"]').first().getAttribute('aria-label') ?? ''
    if (label !== '') await openOutline(page, label)
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'test-output/B11/b11-outline.png' })
    // 设置面（先例：t68 settings 锚）
    await page.keyboard.press('Escape')
    await page.click('.sand-agent-item[data-active="true"]')
    await page.waitForTimeout(600)
    const gear = page.locator('button[aria-label="Agent settings"], button[aria-label="View agent settings"], [data-agent-settings]').first()
    if (await gear.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await gear.click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: 'test-output/B11/b11-agent-settings.png' })
    }
  } finally { await shell.stop(); await rt.stop() }
})
