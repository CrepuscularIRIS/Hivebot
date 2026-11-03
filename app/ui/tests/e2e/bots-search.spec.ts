// P5-11 ②：侧栏搜索（R2 A2：头部 search 钮 + 侧栏内任意可打印键触发）；名字子串过滤、大小写不敏感、无匹配空态、Esc 归还焦点；
// 输入法组合 / 修饰键 / composer 内打字不触发。定稿 work/p5-parity/ui/P5-11-final.md。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { createViaDialog, evidenceOut, launchProduct } from '../support/ui.ts'

test('A2 搜索：可打印键带入 → 子串过滤 → 清空 → 无匹配 → Esc；IME / 修饰键 / composer 不触发', async () => {
  test.setTimeout(90_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await createViaDialog(page, 'p2-alpha')
    await createViaDialog(page, 'p2-beta')
    const items = page.locator('.bot-list .bot-item')
    const input = page.locator('[data-sidebar-search]')
    await expect(items).toHaveCount(3)
    const names = await page.locator('.bot-title').allTextContents()
    expect(new Set(names).size).toBe(3) // 3 个 bot 名各异
    const alpha = names.find((n) => n.toLowerCase().includes('alpha'))!
    expect(names.filter((n) => n.toLowerCase().includes('alpha'))).toHaveLength(1)

    // composer 里打字不被侧栏抢
    await page.locator('[data-composer]').focus()
    await page.keyboard.type('al')
    await expect(input).toHaveCount(0)
    await page.locator('[data-composer]').fill('')

    // 输入法组合中 / 带修饰键：不触发、不吞键
    await items.first().focus()
    for (const init of [{ key: 'a', isComposing: true }, { key: 'b', ctrlKey: true }, { key: 'c', metaKey: true }]) {
      const prevented = await items.first().evaluate((el, i) => !el.dispatchEvent(new KeyboardEvent('keydown', { ...i, bubbles: true, cancelable: true })), init)
      expect(prevented, JSON.stringify(init)).toBe(false)
    }
    await expect(input).toHaveCount(0)

    // 侧栏聚焦时敲可打印键 → 搜索框原位出现并带入该字符（首字符不重复）；大小写不敏感
    await items.first().focus()
    await page.keyboard.press('Shift+A')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('A')
    await page.keyboard.type('LPHA')
    await expect(input).toHaveValue('ALPHA')
    await expect(items).toHaveCount(1)
    await expect(items.first().locator('.bot-title')).toHaveText(alpha)
    await expect(page.locator('[data-search-count]')).toHaveText('1 个结果')
    await page.screenshot({ path: join(evidenceOut('P5-11'), 'sidebar-search-light.png') })

    // 清空 → 3 条，框保持打开且聚焦
    await page.click('[data-action="search-clear"]')
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()
    await expect(items).toHaveCount(3)

    // 无匹配 → 空态文案
    await page.keyboard.type('zz')
    await expect(items).toHaveCount(0)
    await expect(page.locator('[data-roster-state="no-match"]')).toHaveText('没有名字含「zz」的 Bot')
    await expect(page.locator('[data-roster-state="empty"]')).toHaveCount(0)

    // Esc → 清空并关闭，列表恢复，焦点回 search 钮
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(items).toHaveCount(3)
    await expect(page.locator('[data-action="search"]')).toBeFocused()

    // 点 search 钮 → 空框聚焦；Enter 选首条匹配，查询保留
    await page.click('[data-action="search"]')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('')
    await page.keyboard.type('beta')
    await page.keyboard.press('Enter')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toHaveAttribute('aria-selected', 'true')
    await expect(input).toHaveValue('beta')

    // 折叠 → 搜索关闭并清空，折叠态敲字不触发
    await page.click('[data-action="search-clear"]')
    await page.keyboard.press('Escape')
    await page.click('[data-action="collapse-sidebar"]')
    await items.first().focus()
    await page.keyboard.press('b')
    await expect(input).toHaveCount(0)
    await page.click('[data-action="collapse-sidebar"]')
  } finally {
    await env.stop()
  }
})
