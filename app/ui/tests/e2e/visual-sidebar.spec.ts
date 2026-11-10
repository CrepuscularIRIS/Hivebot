// P5-11 ③④（A13 侧栏折叠）行为迁到 renderer-grok（U6）：0.18 的折叠是「compact sidebar」开关（mod+b，global-keyboard-shortcuts.ts），
// 折叠宽 88（SIDEBAR_LAYOUT_BOUNDS.collapsedWidth；0.78.1 为 78，差异表 → P5-55）：条目只剩头像（data-collapsed）、名字与搜索隐藏、
// 新建钮变圆钮；跨重载保持；展开回到折叠前的展开宽（不是默认）。旧版「容器 ≤130px 自动折叠 / 拖回阈值」0.18 无此行为，记差异表。
// A1 头部：New / Search 钮可达名 + 头部与条目的亮暗截图。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { MAIN_TITLE, botItem, createBots, evidenceOut, launchProduct } from '../support/ui.ts'

const OUT = evidenceOut('P5-11')
const sidebar = (page: Page) => page.locator('aside.sand-agents-sidebar')
const width = (page: Page): Promise<number> => sidebar(page).evaluate((el) => Math.round(el.getBoundingClientRect().width))

async function theme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: mode })
  await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
}

async function dragTo(page: Page, dx: number): Promise<void> {
  const b = (await page.locator('.sand-sidebar-resize-handle').boundingBox())!
  const y = b.y + b.height / 2
  await page.mouse.move(b.x + b.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + dx, y, { steps: 5 })
  await page.mouse.up()
}

test('A13 折叠：mod+b 折叠 88 → 只剩头像、名字 / 搜索隐藏；跨重载保持；展开回到折叠前的展开宽；A1 头部可达名（亮暗）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await createBots(page, [{ title: 'A13-X', preset: 'p2-alpha' }])
    // A1：头部 New / Search 按可达名可定位
    await expect(page.locator('.sand-agents-sidebar__header button[aria-label="New"]')).toBeVisible()
    await expect(page.locator('button.sand-agents-sidebar__search[aria-label="Search"]')).toBeVisible()
    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      await page.screenshot({ path: join(OUT, `sidebar-expanded-${mode}.png`) })
    }
    await theme(page, 'light')

    // 先把展开宽调成非默认（320 左右），之后验证「展开回到折叠前的展开宽」
    await dragTo(page, 40)
    const expanded = await width(page)
    expect(expanded).toBeGreaterThan(300)

    // 折叠（mod+b）：宽 88、行 data-collapsed、名字与搜索隐藏
    await botItem(page, MAIN_TITLE).focus()
    await page.keyboard.press('Control+b')
    await expect(sidebar(page)).toHaveAttribute('data-sidebar-collapsed', 'true')
    await expect.poll(() => width(page)).toBe(88)
    await expect(page.locator('.sand-agent-item[data-collapsed="true"]')).toHaveCount(2)
    await expect(page.locator('.sand-agent-item__name')).toHaveCount(0)
    await expect(page.locator('.sand-agents-sidebar__search')).toHaveCount(0)
    await expect(page.locator('.sand-agent-item [data-grok-state]')).toHaveCount(2) // 只剩头像（persona 仍在）
    for (const b of await page.locator('.sand-agent-item').all()) await expect(b).toHaveAttribute('aria-label', /.+/) // 折叠态可达名
    for (const mode of ['light', 'dark'] as const) {
      await theme(page, mode)
      await page.screenshot({ path: join(OUT, `sidebar-collapsed-${mode}.png`) })
    }
    await theme(page, 'light')

    // 持久化：折叠跨重载保持
    await page.reload()
    await expect(botItem(page, MAIN_TITLE)).toBeVisible({ timeout: 60_000 })
    await expect(sidebar(page)).toHaveAttribute('data-sidebar-collapsed', 'true')
    await expect.poll(() => width(page)).toBe(88)

    // 展开：回到折叠前的展开宽（不是默认 280）
    await botItem(page, MAIN_TITLE).focus()
    await page.keyboard.press('Control+b')
    await expect(sidebar(page)).not.toHaveAttribute('data-sidebar-collapsed', 'true')
    await expect.poll(() => width(page)).toBe(expanded)
    await expect(page.locator('.sand-agent-item__name')).toHaveCount(2)
  } finally {
    await env.stop()
  }
})
