// T26 · onboarding 引导（A 段）：首启（清 localStorage）→ 0.18 六步流程出现 →
// setSeen 落盘 → 重启不再进 → skip。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

const onboardingRoot = (page: Page) => page.locator('[id^="sand-onboarding-"]').first()

// 0.18 上游 gate（ProductionRenderer:2134）：未 seen 且 roster 非空（e2e 恒有 main bot）
// → 自动 setSeen(true) 跳过引导——「老账号不重进引导」的原版语义。①=该 gate 生效（此前
// getSeen 恒 true 时 seen 键永不落盘——本格同时证明 onboarding 面真的接上了 localStorage）。
test('① 未 seen + 已有 bot → 自动落 seen 且不进引导（0.18 gate 语义）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => window.localStorage.removeItem('pbots.shim.onboarding-seen'))
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#sand-onboarding-meet-heading')).toHaveCount(0)
    // gate 自动写 seen（:2135 setSeen(true)——经我们接的 localStorage 面）
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('pbots.shim.onboarding-seen')), { timeout: 15_000 }).toBe('1')
  } finally {
    await env.stop()
  }
})

test('② setSeen 面：写 0 后 reload，gate 重估（有 bot 仍自动回 1）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => window.localStorage.setItem('pbots.shim.onboarding-seen', '0'))
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('pbots.shim.onboarding-seen')), { timeout: 15_000 }).toBe('1')
  } finally {
    await env.stop()
  }
})

test('③ 老用户（seen=1）启动不进 onboarding，主界面照常', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.evaluate(() => window.localStorage.setItem('pbots.shim.onboarding-seen', '1'))
    await page.reload()
    await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#sand-onboarding-meet-heading')).toHaveCount(0)
  } finally {
    await env.stop()
  }
})
