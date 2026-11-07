import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchProduct } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/ours'

test.skip(!process.env.PBOTS_SHOT, '截图专用：PBOTS_SHOT=1')

test('T32 截图：六页亮暗（等 heading 可见后再等 900ms——不截淡入过程）', async () => {
  test.setTimeout(300_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page, rt } = env
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'default.json'), JSON.stringify({ calls: Array.from({ length: 5 }, () => ({ chunks: [
      { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'Hi' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'Hi' } },
      { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }, { type: 'finish', reason: { kind: 'stop' } },
    ], paceMs: 30 })) }))
    const shot = async (name: string): Promise<void> => { await page.waitForTimeout(900); await page.screenshot({ path: join(OUT, name) }) }
    await page.locator('[data-action="onboarding-start"]').click()
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await shot(`onboarding-meet.${mode}.png`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-computer-demo-heading')).toBeVisible({ timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await shot(`onboarding-computer-demo.${mode}.png`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-jobs-heading')).toBeVisible({ timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await shot(`onboarding-jobs.${mode}.png`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-role-heading')).toBeVisible({ timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await shot(`onboarding-role.${mode}.png`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('[data-choice="engineering"]').click()
    await page.locator('.sand-onboarding__step:not([aria-hidden]) .sand-onboarding__footer button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-attribution-heading')).toBeVisible({ timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await shot(`onboarding-attribution.${mode}.png`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('.sand-onboarding__step:not([aria-hidden]) button[data-action="skip"]').click()
    await expect(page.locator('#sand-onboarding-connect-heading')).toBeVisible({ timeout: 20_000 })
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      await shot(`onboarding-connect.${mode}.png`)
    }
    await page.emulateMedia({ colorScheme: 'light' })
  } finally { await env.stop() }
})
