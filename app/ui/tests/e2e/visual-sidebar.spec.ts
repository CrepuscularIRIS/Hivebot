// P5-11 ①③④：侧栏头部 icon 行（R2 A1）与折叠态（R2 A13）computed 断言，亮暗各一遍；定稿 work/p5-parity/ui/P5-11-final.md。
import { expect, test, type Locator, type Page } from 'playwright/test'
import { join } from 'node:path'
import { createViaDialog, evidenceOut, launchProduct } from '../support/ui.ts'

const OUT = evidenceOut('P5-11')

const css = (loc: Locator, props: string[]): Promise<Record<string, string>> =>
  loc.evaluate((el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), props)
const sidebarWidth = (page: Page): Promise<number> => page.locator('.sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))
const centerY = async (loc: Locator): Promise<number> => { const b = (await loc.boundingBox())!; return b.y + b.height / 2 }
// 条目中心 − 列表内容区（扣边框）中心
const offCenterX = (item: Locator): Promise<number> => item.evaluate((el) => {
  const l = el.closest('.bot-list')!, lr = l.getBoundingClientRect(), r = el.getBoundingClientRect()
  return r.x + r.width / 2 - (lr.x + l.clientLeft + l.clientWidth / 2)
})

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

test('A1 头部三钮 24×24 r6 同组贴左 / A13 折叠 78：条目 54·padding 9·只剩头像·主标记入头像区；130 断点；持久化与拖回（亮暗）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await createViaDialog(page, 'p2-alpha')
    const head = page.locator('.sidebar-head')
    const main = page.locator('.bot-item[data-main]')
    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      // ① 从左到右 collapse / search / New Bot；R2：一个 new-actions 组（gap 2）贴左；无品牌位
      const btns = head.locator('button')
      expect(await btns.evaluateAll((els) => els.map((e) => e.getAttribute('data-action')))).toEqual(['collapse-sidebar', 'search', 'new-bot'])
      for (const b of await btns.all()) {
        expect(await css(b, ['width', 'height', 'border-top-left-radius'])).toEqual({ width: '24px', height: '24px', 'border-top-left-radius': '6px' })
      }
      expect(await css(head, ['padding', 'column-gap'])).toEqual({ padding: '12px 16px', 'column-gap': '8px' })
      const xs = await btns.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)))
      const headX = Math.round((await head.boundingBox())!.x)
      expect(xs).toEqual([headX + 16, headX + 16 + 26, headX + 16 + 52])
      await expect(head.locator('.grok-mark')).toHaveCount(0)
      await page.screenshot({ path: join(OUT, `sidebar-expanded-${mode}.png`) })
      const collapseBtn = page.locator('[data-action="collapse-sidebar"]')
      const yExpanded = await centerY(collapseBtn)

      // ③ 折叠：宽 78 → 条目 54 居中 / padding 9 / 只剩头像；search 隐藏
      // P5-11.f1（GU-P5-11 A-M）：头部只断言不变量——collapse 钮中心 y 两态相等（点下不跳），不写死 padding / 高度（P5-16 改 titlebar 档）
      await collapseBtn.click()
      expect(await sidebarWidth(page)).toBe(78)
      await expect(page.locator('[data-action="collapse-sidebar"]')).toHaveAttribute('aria-expanded', 'false')
      const item = page.locator('.bot-item').nth(1)
      expect(Math.round((await item.boundingBox())!.width)).toBe(54)
      expect(Math.abs(await offCenterX(item))).toBeLessThanOrEqual(1)
      expect(Math.abs((await centerY(collapseBtn)) - yExpanded)).toBeLessThanOrEqual(1)
      expect(await css(item, ['padding'])).toEqual({ padding: '9px' })
      await expect(item.locator('.bot-text')).toBeHidden()
      await expect(item.locator('time')).toBeHidden()
      await expect(item.locator('.avatar')).toBeVisible()
      await expect(item).toHaveAttribute('title', /.+/)
      await expect(page.locator('[data-action="search"]')).toBeHidden()
      await expect(page.locator('[data-action="new-bot"]')).toBeVisible()
      expect(await page.locator('.bot-list').evaluate((el) => (el as HTMLElement).offsetHeight === el.clientHeight)).toBe(true) // 无横向滚动条占位
      // 席 C：主 Bot 标记移入头像区域（与头像框相交），不随 trailing 丢失
      const star = (await main.locator('.corner-main').boundingBox())!
      const av = (await main.locator('.avatar').boundingBox())!
      expect(star.x < av.x + av.width && star.x + star.width > av.x && star.y < av.y + av.height && star.y + star.height > av.y).toBe(true)
      await page.screenshot({ path: join(OUT, `sidebar-collapsed-${mode}.png`) })

      // 展开恢复上次展开宽
      await page.click('[data-action="collapse-sidebar"]')
      expect(await sidebarWidth(page)).toBe(280)
      expect(await css(item, ['padding'])).toEqual({ padding: '8px' })
      await expect(item.locator('.bot-text')).toBeVisible()
      expect(await css(head, ['padding'])).toEqual({ padding: '12px 16px' })
      expect(Math.abs((await centerY(collapseBtn)) - yExpanded)).toBeLessThanOrEqual(1)
    }
    await theme(page, 'light')

    // 断点 = 容器 ≤130px（几何全交容器查询，与 JS 宽度无关）
    const item = page.locator('.bot-item').nth(1)
    await page.locator('.sidebar').evaluate((el) => { (el as HTMLElement).style.width = '131px' })
    expect(await css(item, ['padding'])).toEqual({ padding: '8px' })
    await page.locator('.sidebar').evaluate((el) => { (el as HTMLElement).style.width = '130px' })
    expect(await css(item, ['padding'])).toEqual({ padding: '9px' })
    await page.locator('.sidebar').evaluate((el) => { (el as HTMLElement).style.width = '' })

    // 持久化：折叠跨重载保持；展开回到折叠前的展开宽（不是默认）
    const drag = async (dx: number): Promise<void> => {
      const b = (await page.locator('.sidebar > .resizer').boundingBox())!
      await page.mouse.move(b.x + b.width / 2, b.y + 200)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + 200, { steps: 5 })
      await page.mouse.up()
    }
    await drag(40)
    expect(await sidebarWidth(page)).toBe(320)
    await page.click('[data-action="collapse-sidebar"]')
    await page.reload()
    await page.waitForSelector('.shell', { timeout: 30_000 })
    expect(await sidebarWidth(page)).toBe(78)
    await page.click('[data-action="collapse-sidebar"]')
    expect(await sidebarWidth(page)).toBe(320)
    // 折叠态向外拖：小拖不展开，越过阈值恢复展开档
    await page.click('[data-action="collapse-sidebar"]')
    await drag(30)
    expect(await sidebarWidth(page)).toBe(78)
    await drag(200)
    expect(await sidebarWidth(page)).toBe(278)
  } finally {
    await env.stop()
  }
})

// P5-11.f1（GU-P5-11 必须回应 1）：折叠态文字 span display:none，「市场」钮靠 aria-label 保住可达名；图标 aria-hidden 不进名称
test('折叠 78 下「市场」钮可按名称定位，悬停有 title', async () => {
  test.setTimeout(60_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.click('[data-action="collapse-sidebar"]')
    expect(await sidebarWidth(page)).toBe(78)
    const market = page.getByRole('button', { name: '市场', exact: true })
    await expect(market).toBeVisible()
    await expect(market).toHaveAttribute('data-action', 'market')
    await expect(market).toHaveAttribute('title', '市场')
    await expect(market.locator('span')).toBeHidden()
    await expect(market.locator('.icon')).toHaveAttribute('aria-hidden', 'true')
    await market.click()
    await expect(market).toHaveAttribute('aria-current', 'page')
  } finally {
    await env.stop()
  }
})
