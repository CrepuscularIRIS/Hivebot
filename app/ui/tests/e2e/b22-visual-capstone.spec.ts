// B22 视觉收官：B18–B21 新面基准图组（General 全行/Tasks 岛+看板/older 状态行/composer）
import { mkdirSync } from 'node:fs'
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { textCall, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
const OUT = 'test-output/B22'

test('B22：新面基准图组', async () => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b22-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // ① General 设置面全行（B18 产物）
    await page.keyboard.press('ControlOrMeta+,')
    const dlg = page.locator('.sand-settings-dialog')
    await expect(dlg).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.sand-settings-general')).toBeVisible({ timeout: 8_000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/b22-general.png` })
    await page.keyboard.press('Escape')

    // ② Tasks 岛侧栏行 + ③ 看板空态（B21 产物）
    await page.waitForTimeout(400)
    const island = page.locator('.sand-tasks-island-row__button')
    await expect(island).toBeVisible({ timeout: 8_000 })
    await page.screenshot({ path: `${OUT}/b22-tasks-island.png` })
    await island.click()
    const board = page.locator('.sand-task-board')
    await expect(board).toBeVisible({ timeout: 8_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/b22-task-board.png` })
    // 关看板回对话
    const close = board.locator('button[aria-label*="Close" i], button[aria-label*="close" i]').first()
    if (await close.isVisible({ timeout: 2_000 }).catch(() => false)) await close.click()
    await page.waitForTimeout(300)

    // ④ older 状态行（B19 产物）：灌长史再滚顶
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    const calls: Array<ReturnType<typeof textCall>> = []
    for (let i = 1; i <= 220; i++) calls.push(textCall([`older-${i}：历史轮次文本，用于分页触发与状态行对照。`]))
    rt.writeScriptCalls(sid!, calls)
    await editor(page).click()
    await page.keyboard.type('你好', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await page.waitForTimeout(4_000)
    const scroller = page.locator('.sand-transcript-scroller, [class*="transcript"] [class*="scroll"], .sand-conversation-scroll').first()
    if (await scroller.isVisible({ timeout: 3_000 }).catch(() => false)) await scroller.evaluate((el) => { el.scrollTop = 0 })
    await page.waitForTimeout(1_200)
    await page.screenshot({ path: `${OUT}/b22-older-history.png` })

    // ⑤ composer 常态（含输入中文）
    await editor(page).click()
    await page.keyboard.type('视觉收官', { delay: 3 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/b22-composer.png` })
  } finally { await shell.stop(); await rt.stop() }
})
