// T69：Connect apps 内置「Hivebot picks」——全新 HOME、不设 env 源（用户第一次打开的真实路径）：
// 开箱有目录不空页；搜索过滤；needs-sign-in 无 Connect 钮；能装条目真装上（✓Connected + wrapper 入 listBundles）；
// 内置源 Built-in 无删除钮；加用户源后两源可切换。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { serveMarket } from '../support/connectors.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/ui-borders-connect/evidence/T69'
const market = (page: Page) => page.locator('[data-market]')

test('T69：内置 picks——开箱有目录/搜索/needs-sign-in/真安装/Built-in 源', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t69-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.locator('.sand-agents-sidebar__plugins').click()
    await expect(market(page)).toBeVisible()
    await expect(market(page).locator('#sand-plugins-modal-heading')).toHaveText('Connect Apps')

    // ---- 开箱有目录：不出现 No catalog configured；行数 = 内置条目总数（4 可装 + 14 登录 = 18）----
    await expect(page.locator('[data-market-list] .pb-row')).toHaveCount(17, { timeout: 20_000 })
    await expect(page.locator('[data-action="your-plugins"]'), 'T71c：零安装药丸露字 Installed').toContainText('Installed')
    await expect(market(page).getByText('No catalog configured')).toHaveCount(0)
    await page.screenshot({ path: join(OUT, 'connect-list-light.png') })

    // ---- 搜索过滤：memory 只剩相关行 ----
    await page.locator('[data-market-search]').fill('memory')
    await expect(page.locator('[data-market-list] .pb-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('[data-market-list] .pb-row').first()).toContainText('Memory')
    await page.locator('[data-market-search]').fill('')
    await page.waitForTimeout(500)

    // ---- needs-sign-in 行：「Needs sign-in」trailing、无 Connect 钮；详情有说明 ----
    const gmail = page.locator('[data-market-list] .pb-row', { hasText: 'Gmail' }).first()
    await expect(gmail).toBeVisible()
    await expect(gmail.locator('[data-needs-signin]')).toHaveText('Needs sign-in')
    await expect(gmail.locator('button[data-action="connect"]')).toHaveCount(0)
    await gmail.locator('button[aria-label^="Open"]').click()
    await expect(page.locator('[data-market-detail]')).toBeVisible()
    await expect(page.locator('[data-needs-signin-note]')).toBeVisible()
    await page.screenshot({ path: join(OUT, 'connect-signin-detail-light.png') })
    await page.locator('[data-action="market-back"]').click()

    // ---- 能装条目真装上：Memory → Connect → ✓Connected + listBundles 含 wrapper 名 ----
    const memRow = page.locator('[data-market-list] .pb-row', { hasText: 'Memory' }).first()
    await memRow.locator('button[data-action="connect"]').click()
    await expect(memRow.locator('.pb-added')).toBeVisible({ timeout: 60_000 })
    const bundles = await rt.client.call('pluginManager/listBundles', {}) as { bundles?: Array<{ name?: string }> }
    const names = JSON.stringify(bundles)
    expect(names, `listBundles 含 memory wrapper（${names.slice(0, 200)}）`).toContain('@p2sdk-market/modelcontextprotocol__server-memory')

    // ---- Index sources：内置源 Built-in 无删除钮 ----
    await page.locator('[data-action="your-plugins"]').click() // T71：入口收进 Installed 底部
    await page.locator('[data-action="manage-index-sources"]').click()
    await page.locator('[data-index-sources]').waitFor({ state: 'visible', timeout: 5_000 })
    // T71 审修①：从 Installed 进管理页，第一次 Back 回 Installed、第二次回列表（按显示优先级退栈）
    await page.locator('[data-action="market-back"]').click()
    await expect(page.getByRole('heading', { name: 'Installed' })).toBeVisible()
    await page.locator('[data-action="market-back"]').click()
    await expect(page.getByRole('heading', { name: 'Connect Apps' })).toBeVisible()
    await page.locator('[data-action="your-plugins"]').click()
    await page.locator('[data-action="manage-index-sources"]').click()
    await page.locator('[data-index-sources]').waitFor({ state: 'visible', timeout: 5_000 })
    const builtinRow = page.locator('[data-index-item="builtin:hivebot-picks"]')
    await expect(builtinRow).toBeVisible()
    await expect(builtinRow.locator('[data-builtin-source]')).toHaveText('Built-in')
    await expect(builtinRow.locator('[data-action="remove-index"]')).toHaveCount(0)
    await page.screenshot({ path: join(OUT, 'connect-sources-light.png') })

    // ---- 加用户源（fixture HTTP 源）→ 两源可切换 ----
    const server = await serveMarket()
    try {
      const input = page.locator('[data-index-input]')
      await input.click(); await input.fill('')
      await input.pressSequentially(server.realUrl, { delay: 3 })
      await expect(input).toHaveValue(server.realUrl)
      await page.locator('form[data-index-add]').evaluate((f) => f.requestSubmit())
      await expect(page.locator('[data-index-item]')).toHaveCount(2, { timeout: 20_000 })
      await page.locator('[data-action="sources-done"]').click()
      await page.locator('[data-market-list]').waitFor({ state: 'visible', timeout: 10_000 })
      const opts = page.locator('[data-market-source] option')
      await expect(opts).toHaveCount(2, { timeout: 10_000 })
      // 切到用户源可浏览（快照 111 条）
      await page.selectOption('[data-market-source]', server.realUrl)
      await expect(page.locator('[data-market-list] .pb-row').first()).toBeVisible({ timeout: 30_000 })
    } finally {
      await server.close()
    }

    // ---- 暗色一轮（T69b 意见4：补齐 6 张——signin-detail/sources 各加暗色）----
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(500)
    await page.locator('.pb-market .sand-plugins-dialog__close').click()
    await page.locator('.sand-agents-sidebar__plugins').click()
    await expect(market(page)).toBeVisible()
    // fixture 源已关：切回内置源再截（否则停在死源上）
    await page.selectOption('[data-market-source]', 'builtin:hivebot-picks')
    await expect(page.locator('[data-market-list] .pb-row')).toHaveCount(17, { timeout: 20_000 })
    await page.waitForTimeout(400) // T69b 审低2：pb-dialog-in 200ms 入场动画——等完再截，不截过渡帧
    await page.screenshot({ path: join(OUT, 'connect-list-dark.png') })
    // Gmail 详情暗色
    const gmailDark = page.locator('[data-market-list] .pb-row', { hasText: 'Gmail' }).first()
    await gmailDark.locator('button[aria-label^="Open"]').click()
    await expect(page.locator('[data-market-detail]')).toBeVisible()
    await page.screenshot({ path: join(OUT, 'connect-signin-detail-dark.png') })
    await page.locator('[data-action="market-back"]').click()
    // Index sources 暗色
    await page.locator('[data-action="your-plugins"]').click() // T71：入口收进 Installed 底部
    await page.locator('[data-action="manage-index-sources"]').click()
    await page.locator('[data-index-sources]').waitFor({ state: 'visible', timeout: 5_000 })
    // T71 审修①：从 Installed 进管理页，第一次 Back 回 Installed、第二次回列表（按显示优先级退栈）
    await page.locator('[data-action="market-back"]').click()
    await expect(page.getByRole('heading', { name: 'Installed' })).toBeVisible()
    await page.locator('[data-action="market-back"]').click()
    await expect(page.getByRole('heading', { name: 'Connect Apps' })).toBeVisible()
    await page.locator('[data-action="your-plugins"]').click()
    await page.locator('[data-action="manage-index-sources"]').click()
    await page.locator('[data-index-sources]').waitFor({ state: 'visible', timeout: 5_000 })
    await page.screenshot({ path: join(OUT, 'connect-sources-dark.png') })
    await page.locator('[data-action="sources-done"]').click()
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
