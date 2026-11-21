// T77b · 选项反馈余量：6 处手写 role=menu 挂 ui-menu__content/ui-menu__row 类
//（吃 T84 入场动画+原版 menu 视觉/hover；不换组件——css 类即动画挂点）+ hover 族非选中值断言。
import { expect, test } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

test('T77b：message-actions More 菜单=ui-menu 原语（动画挂点+row 项）', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    // 发一条消息出 hover 条
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('t77b 问', { delay: 3 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(page.locator('.sand-message[data-role="user"]', { hasText: 't77b 问' })).toBeVisible({ timeout: 30_000 })
    await page.locator('.sand-message').last().hover()
    await page.locator('button[aria-label="More message actions"]').first().click() // 快照实证：More 钮自带该 aria-label（div 同名——button 限定）
    const menu = page.locator('div[aria-label="More message actions"]').first() // div 限定：同名 aria 的 More button 先出现
    await expect(menu).toBeVisible({ timeout: 5_000 })
    // T77b 更正断言：运行时菜单是 workspace/transcript 的 inline 版（上游无 className 挂点）——
    // 类断言改动画断言（吃 T84 = 工单验收①的意图；cards 覆盖版已挂类留未来路径）
    const anim = await menu.evaluate((el) => getComputedStyle(el).animationName)
    expect(anim, '吃 T84 入场动画（属性选择器挂点）').toContain('t84-menu-in')
    const row = menu.locator('[role="menuitem"]').first()
    expect(await row.evaluate((el) => el.className), '不含药丸').not.toContain('sand-kit-button')
    // inline 版行 hover 底（T77b 补：原版 menu item 有底）
    const rBefore = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
    await row.hover(); await page.waitForTimeout(250)
    const rAfter = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(rAfter, '菜单行 hover 出底').not.toBe(rBefore)
  } finally {
    await env.stop()
  }
})

test('T77b：设置左导航 hover 族——非选中行值变 + .12s', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    await page.click('button[aria-label="Account"]')
    await page.locator('.ui-menu__content [role="menuitem"], .ui-menu__content button').filter({ hasText: 'Settings' }).first().click()
    const nav = page.locator('nav.sand-settings-nav')
    await expect(nav).toBeVisible({ timeout: 15_000 })
    // 非选中行（当前 general 高亮，取 Usage/Updates 等非当前项）
    const rows = nav.locator('.sand-settings-nav__item')
    const count = await rows.count()
    const target = rows.nth(Math.min(2, count - 1))
    await target.hover()
    await page.waitForTimeout(250)
    const after = await target.evaluate((el) => getComputedStyle(el).backgroundColor)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(250)
    const before = await target.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(after, 'hover 前后背景不同（非选中行）').not.toBe(before)
    const dur = await target.evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(dur, '.12s 过渡').toContain('0.12s')
  } finally {
    await env.stop()
  }
})

// ===== T77bb：留下的副本补证 + 3 面 hover =====
test('T77bc：palette 行 hover = 原版高亮跟随', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    await page.click('.sand-agents-sidebar__search')
    const rows = page.locator('section.sand-command-palette [role="option"]') // T77bc：只 option（混 button 会拿到 input/标签——aria-selected=false 实证）
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    expect(await rows.count(), '≥2 行可 hover').toBeGreaterThan(1)
    // hover 第 2 行（非默认选中）——原版 onMouseMove→setHighlight（CommandPalette.tsx:374）
    const second = rows.nth(1)
    const firstSelectedBg = await rows.first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const before = await second.evaluate((el) => getComputedStyle(el).backgroundColor)
    await second.hover(); await page.waitForTimeout(300)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    const after = await second.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(after, 'hover 行变选中底').not.toBe(before)
    expect(after, '与 idle 首行选中底同值（production.css:322）').toBe(firstSelectedBg)
  } finally {
    await env.stop()
  }
})
