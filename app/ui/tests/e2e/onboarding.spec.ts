// T26 · onboarding（A 段+review 修复后语义）：真首启（roster 空+未 seen）→ landing →
// skip 退出补建 main；seen=1 正常启动。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

const seen = (page: Page) => page.evaluate(() => window.localStorage.getItem('pbots.shim.onboarding-seen'))

test('① 真首启：landing 出现（Welcome to Grok Bot + Get started + Skip）——main bot 未建', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.sand-agent-item')).toHaveCount(0) // review HIGH：首启不自动建 main
    expect(await seen(page)).toBeNull()
  } finally {
    await env.stop()
  }
})

test('② Skip：seen 落盘 → 退出引导 → main bot 补建（reloadRoster）→ 主界面可见', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-action="onboarding-skip"]').click()
    await expect(page.locator('#sand-onboarding-landing-heading')).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(seen, { timeout: 10_000 }).toBe('1')
    await expect(page.locator('.sand-agent-item').first(), 'skip 后补建 main bot').toBeVisible({ timeout: 30_000 })
  } finally {
    await env.stop()
  }
})

test('③ 老用户（seen=1）启动：不进引导，main bot 照常建立', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    // launchProduct 起来后第一次 roster：seen 空 → landing。先等 landing 再置 seen 触发 reload？
    // 简化：等 landing 出现（证明首启路径），置 seen 后 reload
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => window.localStorage.setItem('pbots.shim.onboarding-seen', '1'))
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#sand-onboarding-landing-heading')).toHaveCount(0)
  } finally {
    await env.stop()
  }
})
