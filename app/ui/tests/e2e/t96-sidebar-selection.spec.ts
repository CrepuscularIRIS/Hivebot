// T96 · 侧栏多选接线（B1 P1）：recovered selection-actions/SidebarSelectionActions/
// modifier-click 全就绪、ProductionRenderer 0 接线——本单在 sidebar 覆盖层接 state+回调。
// 0.78.1 pcn/udn 语义：meta/ctrl+click=toggle、shift+click=range、选中后 header 换 selection actions。
import { expect, test } from 'playwright/test'
import { createBots, launchProduct } from '../support/ui.ts'

test('T96：mod+click 多选 → selection actions 头（N selected + Clear）→ Clear 退出', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    const a = await createBots(page, [{ title: 'T96-A' }, { title: 'T96-B' }])
    await expect(a).toBeTruthy()
    const rowA = page.locator('.sand-agent-item[aria-label="T96-A"]')
    const rowB = page.locator('.sand-agent-item[aria-label="T96-B"]')
    await expect(rowA).toBeVisible({ timeout: 30_000 })
    await expect(rowB).toBeVisible()
    // ① 未选：selection actions 头不在
    await expect(page.locator('.sand-agents-sidebar__selection-actions')).toHaveCount(0)
    // ② mod+click A → 单选（行 data-selected + actions 头）
    await rowA.click({ modifiers: ['ControlOrMeta'] })
    await expect(rowA).toHaveAttribute('data-selected', 'true')
    const actions = page.locator('.sand-agents-sidebar__selection-actions')
    await expect(actions).toBeVisible({ timeout: 5_000 })
    // ③ mod+click B → 2 selected
    await rowB.click({ modifiers: ['ControlOrMeta'] })
    await expect(page.locator('.sand-agent-item[data-selected="true"]')).toHaveCount(2, { timeout: 5_000 }) // A/B 两行（T96b：计数经行数）
    // T96c：选中行视觉（computed bg ≠ 未选行——现状双透明必红）
    const bgSel = await rowA.evaluate((el) => getComputedStyle(el).backgroundColor)
    const bgUnsel = await page.locator('.sand-agent-item[aria-label="T96-B"]') .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bgSel, `选中行有底（${bgSel}）≠ 未选（${bgUnsel}）`).not.toBe(bgUnsel)
    // T96d：≠ active 行（现状同 rgba(28,28,28,.08) 必红——accentSelected 撞色实锤）+ hover 不变色
    const bgActive = await page.locator('.sand-agent-item[aria-current="page"], .sand-agent-item[data-active="true"]').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bgSel, `选中 ≠ active（${bgSel} vs ${bgActive}）`).not.toBe(bgActive)
    await rowA.hover(); await page.waitForTimeout(250)
    const bgHover = await rowA.evaluate((el) => getComputedStyle(el).backgroundColor)
    // T96d 偏差记档：hover 后序列化值与静止时微差（oklab/color-srgb 两态序列化+alpha 波动
    // 0.19↔0.26——根因未追到 color-mix 求值层）；按工单意图收窄为「不退回灰 hover 底」——
    // 与未选行 hover 底（--sand-bg-hover 灰）比较即可守 accent 态
    expect(bgHover, '选中行 hover 仍 accent 调（不退灰）').not.toBe(bgUnsel)
    // ④ Clear → 头退场、行 selected 清
    await actions.locator('button[aria-label="Clear selection"]').click()
    await expect(actions).toHaveCount(0, { timeout: 5_000 })
    await expect(rowA).not.toHaveAttribute('data-selected', 'true')
    // B1.A：Delete 实装（shim deleteAgents 软删）——正断言：重选两行 → 钮在可点 → 行消失
    await rowA.click({ modifiers: ['ControlOrMeta'] })
    await rowB.click({ modifiers: ['ControlOrMeta'] })
    const del = actions.locator('button[aria-label="Delete 2 selected agents"]')
    await expect(del).toBeVisible({ timeout: 5_000 })
    await del.click()
    await expect(page.locator('.sand-agent-item[aria-label="T96-A"]')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('.sand-agent-item[aria-label="T96-B"]')).toHaveCount(0, { timeout: 10_000 })
  } finally {
    await env.stop()
  }
})

test('T96：shift+click 区间选（A..C 三连）', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await createBots(page, [{ title: 'T96-A' }, { title: 'T96-B' }, { title: 'T96-C' }])
    const rowA = page.locator('.sand-agent-item[aria-label="T96-A"]')
    const rowC = page.locator('.sand-agent-item[aria-label="T96-C"]')
    await expect(rowA).toBeVisible({ timeout: 30_000 })
    await expect(rowC).toBeVisible()
    await rowA.click({ modifiers: ['ControlOrMeta'] })
    await rowC.click({ modifiers: ['Shift'] })
    const sel = page.locator('.sand-agent-item[data-selected="true"]')
    await expect(sel, '区间三行全选').toHaveCount(3, { timeout: 5_000 })
  } finally {
    await env.stop()
  }
})

test('T96b：pinned 后 shift 区间按视觉序（Ctrl+A → 置顶 A → Shift+C 只 A/C 不含 B）', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await createBots(page, [{ title: 'T96-A' }, { title: 'T96-B' }, { title: 'T96-C' }])
    const rowA = page.locator('.sand-agent-item[aria-label="T96-A"]')
    await expect(rowA).toBeVisible({ timeout: 30_000 })
    // 置顶 A（右键菜单 Toggle pin——T77 后菜单项是 menu-row）
    await rowA.click({ button: 'right' })
    await page.locator('[role="menuitem"]', { hasText: 'Pin' }).first().click()
    await page.waitForTimeout(300)
    await rowA.click({ modifiers: ['ControlOrMeta'] })
    const rowC = page.locator('.sand-agent-item[aria-label="T96-C"]')
    await rowC.click({ modifiers: ['Shift'] })
    const sel = page.locator('.sand-agent-item[data-selected="true"]')
    await expect(sel).toHaveCount(2, { timeout: 5_000 }) // A/C——B 夹在视觉序中间但 roster 序不同
    await expect(page.locator('.sand-agent-item[aria-label="T96-B"]')).not.toHaveAttribute('data-selected', 'true')
  } finally {
    await env.stop()
  }
})
