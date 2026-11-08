import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchProduct } from '../e2e/../support/ui.ts'

// T26 探针（countAgents=0 变异下——真首启语义；不进常规 suite：文件名不带回主回归）
test('landing 封面 → Get started → meet 步（0.79.3 七步前奏链路）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => window.localStorage.removeItem('pbots.shim.onboarding-seen'))
    await page.reload()
    const landing = page.locator('#sand-onboarding-landing-heading')
    await expect(landing).toBeVisible({ timeout: 30_000 })
    await expect(landing).toHaveText('Welcome to Grok Bot')
    await page.screenshot({ path: join('/home/lingxufeng/bot/work/grok-0.79.3-re/ours', 'onboarding-landing.light.png') })
    await page.locator('[data-action="onboarding-start"]').click()
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: join('/home/lingxufeng/bot/work/grok-0.79.3-re/ours', 'onboarding-meet.light.png') })
  } finally {
    await env.stop()
  }
})
