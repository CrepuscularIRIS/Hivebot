// T24 · 新建对话框形象区（工单验收）：13 形状 + 11 色板 + 实时预览 + 随机初值 +
// 选形不改色 + Create 后侧栏/会话头头像用选中形象。前置：pnpm build。
import { expect, test } from 'playwright/test'
import { devState, launchProduct } from '../support/ui.ts'

const dlg = (sel: string) => (page: import('playwright/test').Page) => page.locator(`dialog[data-dialog="new-bot"] ${sel}`)

test('① picker 面：13 形状钮（aria-label X character shape）+ 11 色板（X character color）；初值各有选中', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const shapes = dlg('[data-character] [aria-label$=" character shape"]')(page)
    const colors = dlg('[data-character] [aria-label$=" character color"]')(page)
    await expect(shapes).toHaveCount(13)
    await expect(colors).toHaveCount(11)
    const pressedShape = dlg('[aria-pressed="true"][aria-label$=" character shape"]')(page)
    const pressedColor = dlg('[aria-pressed="true"][aria-label$=" character color"]')(page)
    await expect(pressedShape).toHaveCount(1) // 初值随机但恰一个选中
    await expect(pressedColor).toHaveCount(1)
    const preview = dlg('[data-preview]')(page)
    await expect(preview).toHaveAttribute('data-avatar-shape', await pressedShape.first().getAttribute('data-shape') ?? '')
    await expect(preview).toHaveAttribute('data-avatar-color', (await pressedColor.first().getAttribute('data-color')) ?? '')
    // T24b：排列断言——13 个形状钮按 y 分行 = [5,5,3]，末行中心与前两行中心差 <4px（居中）
    const rows = await dlg('[aria-label$=" character shape"]')(page).evaluateAll((btns) => {
      const byRow = new Map<number, number[]>()
      for (const b of btns) { const r = b.getBoundingClientRect(); const key = Math.round(r.y); const near = [...byRow.keys()].find((k) => Math.abs(k - key) < 6) ?? key; byRow.set(near, [...(byRow.get(near) ?? []), r.x + r.width / 2]) }
      return [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, xs]) => xs)
    })
    expect(rows.map((xs) => xs.length), `实排=${rows.map((xs) => xs.length).join('/')}`).toEqual([5, 5, 3])
    const topCenter = (rows[0]![0]! + rows[0]![4]!) / 2
    const lastCenter = (rows[2]![0]! + rows[2]![2]!) / 2
    expect(Math.abs(topCenter - lastCenter)).toBeLessThan(4)
  } finally {
    await env.stop()
  }
})

test('② 选形不改色：点 star 形状 → 预览 shape=star、色不变；再点 violet 色 → 只变色', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const preview = dlg('[data-preview]')(page)
    await expect(preview).toBeVisible({ timeout: 15_000 })
    const colorBefore = await preview.getAttribute('data-avatar-color')
    await dlg('[aria-label="star character shape"]')(page).click()
    await expect(preview).toHaveAttribute('data-avatar-shape', 'star')
    await expect(preview).toHaveAttribute('data-avatar-color', colorBefore ?? '') // T20b 实测：选形不改色
    await dlg('[aria-label="Violet character color"]')(page).click()
    await expect(preview).toHaveAttribute('data-avatar-color', 'violet')
    await expect(preview).toHaveAttribute('data-avatar-shape', 'star')
  } finally {
    await env.stop()
  }
})

test('③ Create → 侧栏与会话头头像用选中形象（shape/color 落进记录）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    const before = (await devState(page)).order
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await dlg('[aria-label="heart character shape"]')(page).click()
    await dlg('[aria-label="Cyan character color"]')(page).click()
    await dlg('[data-action="create-bot"]')(page).click()
    await expect.poll(async () => (await devState(page)).order.length, { timeout: 30_000 }).toBe(before.length + 1)
    const sid = (await devState(page)).order.find((id) => !before.includes(id))!
    // 新 bot 被选中打开 → 侧栏 active 行的头像（AgentAvatar→PersonaMark）带同 shape/color
    const rowAvatar = page.locator('.sand-agent-item[data-active="true"] .sand-grok-bot-mark').first()
    await expect(rowAvatar).toHaveAttribute('data-avatar-shape', 'heart', { timeout: 15_000 })
    await expect(rowAvatar).toHaveAttribute('data-avatar-color', 'cyan')
    // 会话头头像同源
    const headerAvatar = page.locator('.sand-chat-header__avatar .sand-grok-bot-mark').first()
    await expect(headerAvatar).toHaveAttribute('data-avatar-shape', 'heart')
    // reload 后仍在（localStorage 持久化）——reload 恢复上次 active（= 新 bot），不点击
    await page.reload()
    await expect(page.locator('.sand-agent-item[data-active="true"]')).toHaveCount(1, { timeout: 60_000 })
    const afterReload = page.locator('.sand-agent-item[data-active="true"] .sand-grok-bot-mark').first()
    await expect(afterReload).toHaveAttribute('data-avatar-shape', 'heart', { timeout: 20_000 })
    await expect(afterReload).toHaveAttribute('data-avatar-color', 'cyan')
  } finally {
    await env.stop()
  }
})

test('④ 暗色：Black 色板计算背景为白', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const black = dlg('[aria-label="Black character color"]')(page)
    await expect(black).toBeVisible({ timeout: 15_000 })
    await expect(black).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await env.stop()
  }
})

test('⑤ 关掉重开 5 次：初值至少 2 种组合（随机性）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page } = env
    const combos = new Set<string>()
    for (let i = 0; i < 5; i += 1) {
      await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
      const preview = dlg('[data-preview]')(page)
      await expect(preview).toBeVisible({ timeout: 15_000 })
      combos.add(`${await preview.getAttribute('data-avatar-shape')}|${await preview.getAttribute('data-avatar-color')}`)
      await page.locator('dialog[data-dialog="new-bot"] button[aria-label="Close"]').click()
      await expect(preview).toHaveCount(0)
    }
    expect(combos.size, `5 次初值=${[...combos].join(' ; ')}`).toBeGreaterThanOrEqual(2)
  } finally {
    await env.stop()
  }
})
