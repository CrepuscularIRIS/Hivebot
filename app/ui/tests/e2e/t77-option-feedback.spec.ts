// T77 · 选项反馈（ui-quality C 行）：侧栏右键菜单项换原版原语（左对齐透明行 ui-menu__row，
// 非 SandButton 灰底药丸）+ hover .12s ease-out（RE-UI-LAYOUT §1.2 navItem 族）；transition 在
// overrides 层补（上游 css 不动）。侧栏 bot 行 hover 同族（同 token 同 timing）。
import { expect, test } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

test('T77：右键菜单项=menu-row 原语（非药丸钮）+ hover 底 + .12s 过渡', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    // 右键 bot 行开菜单
    const row = page.locator('.sand-agent-item').first()
    await row.click({ button: 'right' })
    const menuRow = page.locator('.ui-menu__content [data-component="menu-row"]').first()
    await expect(menuRow).toBeVisible({ timeout: 10_000 })
    // ① 原语：menu-row 且不是 kit 药丸钮
    await expect(menuRow).toHaveAttribute('role', 'menuitem')
    const cls = await menuRow.evaluate((el) => el.className)
    expect(cls, '菜单项是 ui-menu__row 原语').toContain('ui-menu__row')
    expect(cls, '不再挂 kit 药丸').not.toContain('sand-kit-button')
    // ② 左对齐（justify-content flex-start / text-align left）
    const just = await menuRow.evaluate((el) => getComputedStyle(el).justifyContent)
    expect(['normal', 'flex-start', 'start'], `左对齐（normal=视觉 flex-start）：${just}`).toContain(just.toLowerCase())
    // ③ hover 底变化 + .12s ease-out 过渡（RE-UI-LAYOUT §1.2 CSSR L7298/7399）
    const before = await menuRow.evaluate((el) => getComputedStyle(el).backgroundColor)
    await menuRow.hover()
    await page.waitForTimeout(250) // 等 .12s 过渡完成（hover 后立刻量还在起点）
    const after = await menuRow.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(after, 'hover 出底').not.toBe(before)
    const trans = await menuRow.evaluate((el) => `${getComputedStyle(el).transitionDuration}|${getComputedStyle(el).transitionProperty}`)
    expect(trans, 'bg/color .12s 过渡').toContain('0.12s')
    // ④ 透明底起步（非药丸灰底）
    expect(before === 'rgba(0, 0, 0, 0)' || before.endsWith('00)'), '未 hover 是透明/近透明底').toBe(true)
  } finally {
    await env.stop()
  }
})

test('T77：侧栏 bot 行 hover 反馈在位（.12s 过渡 + hover 规则）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    const row = page.locator('.sand-agent-item').first() // 单 bot=当前选中行（选中底与 hover 同值是正常态——值变化断言在多 bot 环境才有意义）
    await row.hover()
    const dur = await row.evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(dur, 'hover 过渡 .12s（RE-UI-LAYOUT §1.2）').toContain('0.12s')
    const hasRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | undefined
        try { rules = sheet.cssRules } catch { continue }
        if (rules == null) continue
        for (const r of Array.from(rules)) {
          const t = (r as CSSStyleRule).selectorText ?? ''
          if (t.includes('.sand-agent-item:hover') || t.includes('.sand-agent-item[aria-current')) return true
        }
      }
      return false
    })
    expect(hasRule, 'hover 底规则存在（样式表）').toBe(true)
  } finally {
    await env.stop()
  }
})
