// T30 截图（PBOTS_SHOT=1 门——queue 提议⑦）
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchProduct } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/ours'

test.skip(!process.env.PBOTS_SHOT, '截图专用：PBOTS_SHOT=1 跑')

test('T30 六态截图', async () => {
  test.setTimeout(240_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => { /* noop */ })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
      const dlg = page.locator('dialog[data-dialog="new-bot"]')
      await expect(dlg.locator('h2')).toBeVisible()
      // empty：flower + gray
      await dlg.locator('[aria-label="flower character shape"]').click()
      await dlg.locator('[aria-label="Gray character color"]').click()
      await dlg.screenshot({ path: join(OUT, `create-dialog.${mode}-empty.png`) })
      // named：house + orange + 名字
      await dlg.locator('[aria-label="house character shape"]').click()
      await dlg.locator('[aria-label="Orange character color"]').click()
      await dlg.getByRole('textbox', { name: 'Bot name' }).fill('Research Helper')
      await page.waitForTimeout(400) // T30db：disabled→enabled 过渡帧
      await dlg.screenshot({ path: join(OUT, `create-dialog.${mode}-named.png`) })
      // shape3：square
      await dlg.locator('[aria-label="square character shape"]').click()
      await dlg.screenshot({ path: join(OUT, `create-dialog.${mode}-shape3.png`) })
      await dlg.locator('button[aria-label="Close"]').click()
    }
    // T30c (b)：暗色 + Black 预览一张
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const d2 = page.locator('dialog[data-dialog="new-bot"]')
    await expect(d2.locator('h2')).toBeVisible()
    await d2.locator('[aria-label="Black character color"]').click()
    await d2.locator('[aria-label="blob character shape"]').click()
    await d2.screenshot({ path: join(OUT, 'create-dialog.dark-black.png') })
    await d2.locator('button[aria-label="Close"]').click()
    await page.emulateMedia({ colorScheme: 'light' })
  } finally { await env.stop() }
})
