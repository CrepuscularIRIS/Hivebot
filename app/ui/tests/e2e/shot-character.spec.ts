import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchProduct } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/ours'
const shot = (page: import('playwright/test').Page, name: string) => page.screenshot({ path: join(OUT, name) })

test('T24 截图：形象区三态亮暗', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct()
  try {
    const { page } = env
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
      const dlg = page.locator('dialog[data-dialog="new-bot"]')
      await expect(dlg.locator('[data-character]')).toBeVisible({ timeout: 15_000 })
      await dlg.screenshot({ path: join(OUT, `create-character.${mode}-open.png`) })
      await dlg.locator('[aria-label="square character shape"]').click()
      await page.waitForTimeout(300)
      await dlg.screenshot({ path: join(OUT, `create-character.${mode}-shape3.png`) })
      await dlg.locator('[aria-label="Violet character color"]').click()
      await page.waitForTimeout(300)
      await dlg.screenshot({ path: join(OUT, `create-character.${mode}-recolor.png`) })
      await dlg.locator('button[aria-label="Close"]').click()
      await expect(dlg).toHaveCount(0)
    }
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await env.stop()
  }
})
