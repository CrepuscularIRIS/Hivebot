// T78 · 原生控件 + 滚动条（ui-quality U5）：
// ① onboarding 6 个裸 <button> 换 kit SandButton（0.78.1 Z 组件锚：主钮 variant primary /
//    Back·Skip secondary + data-variant 落地）；Back span 288×36（sand-bu5dzu/c9qbxq）；
// ② 全局 overlay thin 滚动条（0.78.1 ui 面原子类合并）——真实滚动容器不占布局位
//   （经典≈15px；自绘细条占位恰 8px=0.78.1 ui-12o6m6d 同款）+ 样式表有 ::-webkit-scrollbar 规则。
import { expect, test, type Page } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

const kitButton = (page: Page, sel: string) => page.locator(`.sand-onboarding ${sel}`).first()

test('T78：onboarding 按钮 kit 化（landing + role 页 footer）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({ ready: false, onboardingFirst: true })
  try {
    const { page } = env
    await expect(page.locator('#sand-onboarding-landing-heading')).toBeVisible({ timeout: 30_000 })
    // ① landing：Get started=primary、Skip=secondary，都是 kit 钮（sand-kit-button 类 + data-variant）
    const start = kitButton(page, '[data-action="onboarding-start"]')
    const skip = kitButton(page, '[data-action="onboarding-skip"]')
    await expect(start).toHaveClass(/sand-kit-button/)
    await expect(start).toHaveAttribute('data-variant', 'primary')
    await expect(skip).toHaveClass(/sand-kit-button/)
    await expect(skip).toHaveAttribute('data-variant', 'secondary')
    // ② 走到 role 页（walk 序 meet→computer-demo→jobs→role，nextBtn 走法同 onboarding.spec ④）
    await start.click()
    await expect(page.locator('#sand-onboarding-meet-heading')).toBeVisible({ timeout: 20_000 })
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-computer-demo-heading')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(250)
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-jobs-heading')).toBeVisible({ timeout: 25_000 })
    await page.locator('.sand-onboarding button', { hasText: 'Next' }).first().click()
    await expect(page.locator('#sand-onboarding-role-heading')).toBeVisible({ timeout: 20_000 })
    // ③ role 页 Foot（data-step=scene 名 tools——用当前可见 step 定位）：未选 → Skip=secondary；
    // Back=secondary；两钮 288×36（上游 view.css footer 规则）
    const live = '.sand-onboarding__step:not([aria-hidden])'
    const skipRole = page.locator(`${live} .sand-onboarding__footer [data-action="skip"]`)
    await expect(skipRole).toHaveClass(/sand-kit-button/)
    await expect(skipRole).toHaveAttribute('data-variant', 'secondary')
    await expect(skipRole).toHaveCSS('width', '288px')
    await expect(skipRole).toHaveCSS('height', '36px')
    const back = page.locator(`${live} .sand-onboarding__footer span button`)
    await expect(back).toHaveClass(/sand-kit-button/)
    await expect(back).toHaveAttribute('data-variant', 'secondary')
    await expect(back).toHaveCSS('width', '288px')
    // 选中 role 卡 → 主钮变 Continue=primary
    await page.locator('.sand-onboarding__role-choices button').first().click()
    const cont = page.locator(`${live} .sand-onboarding__footer > button:not([data-action])`)
    await expect(cont).toHaveClass(/sand-kit-button/)
    await expect(cont).toHaveAttribute('data-variant', 'primary')
  } finally {
    await env.stop()
  }
})

test('T78：全局自绘细滚动条（溢出占位 8px·0.78.1 同款 + 规则校验）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    // ① 样式表有自绘滚动条规则（thumb color-mix 45% + width 8px——0.78.1 ui 面原子类）
    const hasRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | undefined
        try { rules = sheet.cssRules } catch { continue }
        if (rules == null) continue
        for (const r of Array.from(rules)) {
          const t = (r as CSSStyleRule).cssText ?? ''
          if (t.includes('::-webkit-scrollbar') && t.includes('8px')) return true
          if (t.includes('::-webkit-scrollbar-thumb') && t.includes('45%')) return true
        }
      }
      return false
    })
    expect(hasRule, '自绘规则含 8px 宽与 45% thumb（非任意规则）').toBe(true)
    // ② 会话列注入溢出后：自绘细条占位恰 8px（0.78.1 占位语义——无 overlay flag，
    //    原版 ui-12o6m6d width:8px 同款占位；经典默认条 ~15px。review MEDIUM 修：先溢出再量宽）
    const list = page.getByRole('region', { name: 'Agent list' })
    await expect(list).toBeVisible({ timeout: 10_000 })
    const overlap = await list.evaluate((el) => {
      const isScroller = (n: HTMLElement) => ['scroll', 'auto'].includes(getComputedStyle(n).overflowY)
      const target = isScroller(el) ? el : ([...el.querySelectorAll<HTMLElement>('*')].find(isScroller) ?? el)
      if (target.scrollHeight <= target.clientHeight) { // 未溢出→注入条目制造溢出（review 探针法）
        for (let i = 0; i < 40 && target.scrollHeight <= target.clientHeight; i += 1) {
          const row = document.createElement('div')
          row.textContent = `t78-overflow-${i}`
          row.style.cssText = 'height:48px'
          target.appendChild(row)
        }
      }
      return { dw: target.offsetWidth - target.clientWidth, overflow: target.scrollHeight > target.clientHeight }
    })
    expect(overlap.overflow, '容器确已溢出（否则宽差无意义）').toBe(true)
    expect(overlap.dw, '自绘细条占位 8px（经典≈15；0.78.1 同款占位）').toBe(8)
  } finally {
    await env.stop()
  }
})
