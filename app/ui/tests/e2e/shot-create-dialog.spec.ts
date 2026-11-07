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
      await dlg.screenshot({ path: join(OUT, `create-dialog.${mode}-named.png`) })
      // shape3：square
      await dlg.locator('[aria-label="square character shape"]').click()
      await dlg.screenshot({ path: join(OUT, `create-dialog.${mode}-shape3.png`) })
      await dlg.locator('button[aria-label="Close"]').click()
    }
    await page.emulateMedia({ colorScheme: 'light' })
  } finally { await env.stop() }
})
