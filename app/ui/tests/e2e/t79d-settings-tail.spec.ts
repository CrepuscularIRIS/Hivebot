// T79d · 设置面收尾四件：connector 行入卡观感/copy 同行/Models 图标/暗色 hover 分档
import { expect, test } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

test('T79d：connector 行卡样式+copy 同行+Models 图标', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    await page.click('button[aria-label="Account"]')
    await page.locator('.ui-menu__content button, [role="menuitem"]').filter({ hasText: 'Settings' }).first().click()
    await expect(page.locator('.sand-settings-nav')).toBeVisible({ timeout: 15_000 })
    // ① connector 行有卡行样式（背景非透明+radius）
    const row = page.locator('[data-connector-preferences]')
    await expect(row).toBeVisible({ timeout: 5_000 })
    const rowStyle = await row.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, radius: s.borderRadius } })
    expect(rowStyle.bg, `卡行背景非透明（${rowStyle.bg}）`).not.toBe('rgba(0, 0, 0, 0)')
    expect(rowStyle.radius, 'radius 14（T57c 卡观感——T79d b）').toContain('14')
    // ③ Models 图标非齿轮（无原版锚降级语义图标）
    const modelsIcon = await page.locator('.sand-settings-nav__item', { hasText: 'Models' }).first().evaluate((el) => el.querySelector('[data-icon-name]')?.getAttribute('data-icon-name') ?? 'none')
    expect(modelsIcon, 'Models 图标=layers（曾 settings-gear）').toBe('layers')
    // ② copy 钮同行（账户卡 body 内 strong/span/钮 rect 竖直重叠）——有邮箱才断
    const copyBtn = page.locator('button[aria-label="Copy email address"]')
    expect(await copyBtn.count(), 'copy 钮存在（无条件——T79d c）').toBeGreaterThan(0)
    const same = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Copy email address"]')!.getBoundingClientRect()
      const email = document.querySelector('.sand-account-card__body > span')?.getBoundingClientRect() ?? null
      if (email == null) return false
      return btn.top < email.bottom - 2 && btn.bottom > email.top + 2
    })
    expect(same, 'copy 钮与 email 同排（垂直重叠）').toBe(true)
    // T79d c：connector 行与相邻真卡样式相等（亮暗）+不粘连（gap>0）
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => { (window as unknown as { desktop: { theme: { set(x: string): void } } }).desktop.theme.set(t) }, theme)
      await page.waitForTimeout(350)
      const cmp = await page.evaluate(() => {
        const row = document.querySelector('[data-connector-preferences]')!.getBoundingClientRect()
        const cards = Array.from(document.querySelectorAll('.sand-settings-group__card'))
        const card = (cards[cards.length - 1] ?? cards[0]).getBoundingClientRect() // 18r：相邻末张卡（曾取第一张=账户卡，margin 删了照绿）
        const rs = getComputedStyle(document.querySelector('[data-connector-preferences]')!)
        const cardEl = (Array.from(document.querySelectorAll('.sand-settings-group__card')).slice(-1)[0] ?? document.querySelector('.sand-settings-group__card')) as HTMLElement
        const cs = getComputedStyle(cardEl)
        return { gap: row.top - card.bottom, rowBg: rs.backgroundColor, cardBg: cs.backgroundColor, rowBorder: rs.borderColor, cardBorder: cs.borderColor, rowRadius: rs.borderRadius, cardRadius: cs.borderRadius }
      })
      expect(cmp.gap, `${theme} 与相邻卡有缝（gap=${cmp.gap}px≥20——18r：曾 >0 空断言 margin 删照绿）`).toBeGreaterThanOrEqual(20)
      expect(cmp.rowBg, `${theme} 底=真卡（${cmp.rowBg} vs ${cmp.cardBg}）`).toBe(cmp.cardBg)
      expect(cmp.rowBorder, `${theme} 边=真卡（${cmp.rowBorder} vs ${cmp.cardBorder}）`).toBe(cmp.cardBorder)
      expect(cmp.rowRadius, `${theme} radius=真卡`).toBe(cmp.cardRadius)
    }
    // ④ 暗色 hover 分档（bg-secondary ≠ 选中 bg-active）
    await page.evaluate(() => { (window as unknown as { desktop: { theme: { set(t: string): void } } }).desktop.theme.set('dark') })
    await page.waitForTimeout(350)
    const idle = page.locator('.sand-settings-nav__item:not([data-active])').first()
    await idle.hover(); await page.waitForTimeout(250)
    const hoverBg = await idle.evaluate((el) => getComputedStyle(el).backgroundColor)
    await page.mouse.move(0, 0); await page.waitForTimeout(250)
    const activeBg = await page.locator('.sand-settings-nav__item[data-active]').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(hoverBg, `暗色 hover（${hoverBg}）≠ 选中（${activeBg}）分档`).not.toBe(activeBg)
  } finally {
    await env.stop()
  }
})
