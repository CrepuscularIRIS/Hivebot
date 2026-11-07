// T26 · onboarding（A 段+review 修复后语义）：真首启（roster 空+未 seen）→ landing →
// skip 退出补建 main；seen=1 正常启动。前置：pnpm build。
import { expect, test, type Page } from 'playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchProduct } from '../support/ui.ts'

const seen = (page: Page) => page.evaluate(() => window.localStorage.getItem('pbots.shim.onboarding-seen'))

const INTRO_TEXT = 'Hi! I am your first bot, ready when you are.'

/** default.json：fake 兜底脚本（plugin 读 {calls:[…]}——裸数组会炸 reading '0'，T25 回执）。 */
const writeDefaultScript = (home: string, replies: string[]): void => {
  const dir = join(home, 'fake', 'scripts')
  const { mkdirSync, writeFileSync: wf } = require('node:fs') as typeof import('node:fs')
  mkdirSync(dir, { recursive: true })
  const call = (text: string) => ({ chunks: [
    { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } },
  ], paceMs: 60 })
  wf(join(dir, 'default.json'), JSON.stringify({ calls: replies.map((r) => call(r)) }))
}

test('① 真首启：landing 出现（Welcome to Grok Bot + Get started + Skip）——main bot 未建', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    const landing = page.locator('#sand-onboarding-landing-heading')
    await expect(landing).toBeVisible({ timeout: 30_000 })
    await expect(landing).toBeInViewport() // T26b #1：封面必须在视口内（曾落文档流底部 y=820 屏外）
    await expect(page.locator('.sand-agent-item')).toHaveCount(0) // review HIGH：首启不自动建 main
    expect(await seen(page)).toBeNull()
  } finally {
    await env.stop()
  }
})

test('② Skip：seen 落盘 → 退出引导 → main bot 补建（reloadRoster）→ 主界面可见', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-action="onboarding-skip"]').click()
    await expect(page.locator('#sand-onboarding-landing-heading')).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => seen(page), { timeout: 10_000 }).toBe('1')
    await expect(page.locator('.sand-agent-item').first(), 'skip 后补建 main bot').toBeVisible({ timeout: 30_000 })
  } finally {
    await env.stop()
  }
})

test('③ 老用户（seen=1）启动：不进引导，main bot 照常建立', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
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

test('④ 六步走完：Get started → Next 到 create → 填名建 bot → hand-off 完成后恰 1 bot + 介绍延后', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page, rt } = env
    writeDefaultScript(rt.home, [INTRO_TEXT])
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeInViewport({ timeout: 30_000 })
    await page.locator('[data-action="onboarding-start"]').click()
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 15_000 })
    // 逐步 Next：meet→computer-demo→jobs→tools→create——每步等下一个 heading 出现
    //（meet 的 beat 动画期间 Next 可能延迟生效，固定 sleep 不可靠）
    const steps = ['computer-demo', 'jobs', 'tools', 'create']
    for (const st of steps) {
      const next = page.locator('main button', { hasText: 'Next' }).first()
      await expect(next).toBeVisible({ timeout: 25_000 })
      await next.click()
      await expect(page.locator(`#sand-onboarding-${st}-heading, [id^="sand-onboarding-${st}"]`).first()).toBeVisible({ timeout: 25_000 })
    }
    // create 步（0.18 view:179）：#sand-onboarding-create-name 输入 + 「Get started」提交钮
    const nameInput = page.locator('#sand-onboarding-create-name')
    await expect(nameInput).toBeVisible({ timeout: 15_000 })
    await nameInput.fill('My First Bot')
    const submit = page.locator('.sand-onboarding__create button', { hasText: 'Get started' })
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()
    // 介绍延后断言：click 返回后 250ms 内无介绍（hand-off 动画+dwell 至少数百 ms——
    // finish 链不可能已完成；3s 检查点会晚于 dwell，实测教训）
    await page.waitForTimeout(250)
    let req = ''
    try { req = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* 可能整个不存在 */ }
    expect(req, 'create 步不发介绍（延后到 seen 落盘后）').not.toContain('bot_introduction_request')
    await page.waitForTimeout(2500)
    // hand-off 完成等主界面：恰 1 bot 且名字对
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('.sand-agent-item').first()).toContainText('My First Bot')
    // hand-off 后介绍发出
    await expect.poll(async () => { try { return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { return '' } }, { timeout: 45_000 }).toContain('bot_introduction_request')
  } finally {
    await env.stop()
  }
})
