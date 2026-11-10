// P5-11 ② 侧栏搜索（R2 A2）的语义迁到 renderer-grok：0.18 的侧栏 Search 钮（及其上的可打印键）打开搜索面板
// （command palette，sidebar-search-trigger.ts），名字子串过滤、大小写不敏感、无匹配空态、Esc 关闭、Enter 打开首条匹配；
// 修饰键 / composer 内打字不触发。旧版「搜索框原位出现、带入首字符、计数文案」是 dsh 时代构件，差异记 REPORT-P5-54 → P5-55。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { botItem, composer, createBots, evidenceOut, launchProduct } from '../support/ui.ts'

test('A2 搜索：Search 钮 / 可打印键打开 → 子串过滤（大小写不敏感）→ 清空 → 无匹配 → Esc；Enter 打开首条；修饰键 / composer 不触发', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await createBots(page, [{ title: 'Alpha 研究', preset: 'p2-alpha' }, { title: 'Beta 写作', preset: 'p2-beta' }])
    const palette = page.locator('section.sand-command-palette')
    const input = palette.locator('input[aria-label="Search"]')
    const searchBtn = page.locator('.sand-agents-sidebar__search')
    const agentOption = (name: string) => palette.locator('[role="option"]', { hasText: name })

    // composer 里打字不被侧栏抢
    await composer(page).click()
    await page.keyboard.type('al')
    await expect(palette).toHaveCount(0)
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')

    // 修饰键 / 空格：不打开（mod+b 等是全局快捷键，由全局层消费，这里只断言搜索不被触发）
    await searchBtn.focus()
    for (const init of [{ key: 'j', ctrlKey: true }, { key: 'c', metaKey: true }, { key: 'd', altKey: true }]) {
      await searchBtn.evaluate((el, i) => { el.dispatchEvent(new KeyboardEvent('keydown', { ...i, bubbles: true, cancelable: true })) }, init)
    }
    await expect(palette).toHaveCount(0)

    // 侧栏 Search 钮聚焦时敲可打印键 → 面板打开、输入框聚焦
    await page.keyboard.press('Shift+A')
    await expect(palette).toBeVisible()
    await expect(input).toBeFocused()
    await input.fill('ALPHA')
    await expect(agentOption('Alpha 研究')).toHaveCount(1)
    await expect(agentOption('Beta 写作')).toHaveCount(0)
    await page.screenshot({ path: join(evidenceOut('P5-11'), 'sidebar-search-light.png') })

    // 清空 → 两个 bot 都回来
    await input.fill('')
    await expect(agentOption('Alpha 研究')).toHaveCount(1)
    await expect(agentOption('Beta 写作')).toHaveCount(1)

    // 无匹配 → 空态
    await input.fill('zzqq')
    await expect(palette.locator('[role="option"]')).toHaveCount(0)
    await expect(palette).toContainText('No results')

    // Esc → 关闭
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)

    // 点 Search 钮 → 空框聚焦；Enter 打开首条匹配
    await searchBtn.click()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('')
    await input.fill('beta')
    await expect(palette.locator('[role="option"]').first()).toContainText('Beta 写作')
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(botItem(page, 'Beta 写作')).toHaveAttribute('data-active', 'true')
  } finally {
    await env.stop()
  }
})
