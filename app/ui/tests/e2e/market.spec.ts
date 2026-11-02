// U-23 P-C 市场 E2E（派发验收 ②；裁决 work/p4-ui/ui/PDC-final.md P1–P16）。
// 两个目录源：real = T-19 快照（111 = 21 有坐标 + 90 not-installable）、local = 假 npm registry 上的 1 条可装连接器。
// 预装：以 real 目录里的 pretrip-mcp 同名包装一个 fixture bundle（operator 直连 #15）→ 「已安装 ✓」类有 1 条实例。
// ① 浏览 / 搜索 / 分页 / 切源重置 / 三分类计数（90 仅浏览 / 20 可装 / 1 已装）/ 无启用与源写入口；
// ② 安装旅程：local 条目产品按钮安装（全局串行、可离开页面）→ 重拉 #16 → ✓ →「用它新建 Bot」预勾 → 建 bot 走 #4；
//    real 条目 @agent-infra/mcp-server-filesystem 真 pnpm 解析 → dsh not-bundle → 分类显示「此包不是受支持的连接器包」。
import { expect, test, type Page } from 'playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { LOCAL_PLUGIN, MARKET_SOURCE_PATCH, serveMarket, tempBundle, type MarketServer } from '../support/connectors.ts'
import { PRESETS_PATCH, devState, PDC_EVIDENCE } from '../support/ui.ts'

const PRE_INSTALLED = 'pretrip-mcp'
const NOT_BUNDLE = '@agent-infra/mcp-server-filesystem'

interface Env { server: MarketServer; rt: SdkRuntime; shell: ShellLaunch; page: Page; stop(): Promise<void> }

async function launchMarket(): Promise<Env> {
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: mkdtempSync(join(tmpdir(), 'bot-u23-ws-')),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const pre = (await rt.client.call('pluginManager/installBundle', { spec: tempBundle(PRE_INSTALLED), options: { enabled: false } })) as { application?: string }
  if (pre.application === 'failed') throw new Error(`pre-install failed: ${JSON.stringify(pre).slice(0, 500)}`)
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  await shell.page.waitForSelector('.shell', { timeout: 30_000 })
  return { server, rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop(); await server.close() } }
}

const kinds = async (page: Page): Promise<Record<string, number>> => page.evaluate(() => {
  const out: Record<string, number> = {}
  for (const row of document.querySelectorAll<HTMLElement>('[data-market-list] [data-kind]')) out[row.dataset.kind!] = (out[row.dataset.kind!] ?? 0) + 1
  return out
})

const count = (page: Page): Promise<string | null> => page.textContent('[data-market-count]')

test('P-C ①：浏览 / 搜索 / 分页 / 切源重置 / 三分类 90-20-1 / 无启用与源写入口', async () => {
  test.setTimeout(180_000)
  const env = await launchMarket()
  try {
    const { page } = env
    await page.click('[data-action="market"]')
    await expect(page.locator('[data-market]')).toBeVisible()
    await expect(page.locator('.sidebar .bot-item').first()).toBeVisible() // 侧栏保留（P1）
    await expect(page.locator('[data-action="market"]')).toHaveAttribute('aria-current', 'page')
    // 两个源 → select（P11）
    await expect(page.locator('[data-market-source] option')).toHaveCount(2)
    await expect.poll(() => count(page), { timeout: 20_000 }).toBe('已加载 50 / 111')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-list.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-list-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })

    // 分页：加载更多 ×2 → 111 / 111，按钮消失
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('已加载 100 / 111')
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('已加载 111 / 111')
    await expect(page.locator('[data-action="load-more"]')).toHaveCount(0)

    // 三分类实测（T-19 分野：90 not-installable / 21 有坐标，其中 1 条已装）
    const k = await kinds(page)
    console.log(`[U-23] 三分类实测：${JSON.stringify(k)}`)
    expect(k).toEqual({ browse: 90, installable: 20, installed: 1 })
    await expect(page.locator(`[data-entry="${PRE_INSTALLED}"] .m-ok`)).toContainText('已安装')
    // 仅浏览行无按钮；可装行只有「安装」
    const browseRow = page.locator('[data-market-list] [data-kind="browse"]').first()
    await expect(browseRow.locator('button[data-action]')).toHaveCount(0)
    await expect(browseRow.locator('.m-tag')).toHaveText('仅浏览')

    // P3/P11：无「启用」/「安装并启用」、无目录源写入口
    const body = await page.locator('[data-market]').innerText()
    expect(body).not.toContain('启用')
    expect(await page.locator('[data-market] input:not([data-market-search])').count()).toBe(0)

    // 仅浏览详情：原因常驻、按钮 disabled（P4）
    await browseRow.locator('.m-main').click()
    await expect(page.locator('[data-market-detail] [data-detail-action] button')).toBeDisabled()
    await expect(page.locator('[data-market-detail]')).toContainText('仅供浏览')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-detail-browse.png') })
    await page.click('[data-action="market-back"]')
    await expect(page.locator('[data-market-list]')).toBeVisible()
    await expect.poll(() => count(page)).toBe('已加载 111 / 111') // 返回保留已加载结果（P12）

    // 搜索：200 ms 防抖，重置分页
    await page.fill('[data-market-search]', 'filesystem')
    await expect.poll(async () => {
      const m = (await count(page))?.match(/^已加载 (\d+) \/ (\d+)$/)
      return m === null || m === undefined ? -1 : Number(m[2])
    }).toBeLessThan(111)
    await expect(page.locator(`[data-entry="${NOT_BUNDLE}"]`)).toHaveAttribute('data-kind', 'installable')
    await page.fill('[data-market-search]', 'zzqqxxnomatch')
    await expect(page.locator('[data-market-empty]')).toContainText('没有匹配「zzqqxxnomatch」的条目')
    await page.getByRole('button', { name: '清除搜索' }).click()
    await expect.poll(() => count(page)).toBe('已加载 50 / 111')

    // 切源重置：real 已加载 100 → 切 local → 1 / 1 → 切回 real → 50 / 111
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('已加载 100 / 111')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    await expect.poll(() => count(page)).toBe('已加载 1 / 1')
    await expect(page.locator(`[data-entry="${LOCAL_PLUGIN}"]`)).toHaveAttribute('data-kind', 'installable')
    await page.selectOption('[data-market-source]', env.server.realUrl)
    await expect.poll(() => count(page)).toBe('已加载 50 / 111')

    // 已安装页签 = #16
    await page.click('[data-tab="installed"]')
    await expect(page.locator(`[data-installed-list] [data-bundle="${PRE_INSTALLED}"]`)).toBeVisible()
    await expect(page.locator('[data-tab="installed"]')).toHaveText('已安装 1')

    // 点 bot 离开市场
    await page.locator('.bot-item').first().click()
    await expect(page.locator('[data-market]')).toHaveCount(0)
    await expect(page.locator('[data-composer]')).toBeVisible()
  } finally {
    await env.stop()
  }
})

test('P-C ②：安装旅程（串行、可离开页面、重拉 #16 → ✓ →「用它新建」预勾走 #4）+ not-bundle 分类显示', async () => {
  test.setTimeout(300_000)
  const env = await launchMarket()
  try {
    const { page, shell } = env
    await page.click('[data-action="market"]')
    await expect.poll(() => count(page), { timeout: 20_000 }).toBe('已加载 50 / 111')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    const row = page.locator(`[data-entry="${LOCAL_PLUGIN}"]`)
    await row.locator('[data-action="install"]').click()
    await expect(row.locator('.m-busy')).toBeVisible()
    // 全局串行：切到 real 源，所有「安装」按钮 disabled
    await page.selectOption('[data-market-source]', env.server.realUrl)
    await expect.poll(() => count(page)).toBe('已加载 50 / 111')
    const installs = page.locator('[data-market-list] [data-action="install"]')
    expect(await installs.count()).toBeGreaterThan(0)
    expect(await installs.evaluateAll((els) => els.every((b) => (b as HTMLButtonElement).disabled))).toBe(true)
    // 可离开页面：回会话，安装在 store 里继续
    await page.locator('.bot-item').first().click()
    await expect(page.locator('[data-market]')).toHaveCount(0)
    await page.click('[data-action="market"]')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    await expect(row).toHaveAttribute('data-kind', 'installed', { timeout: 120_000 })
    await expect(page.locator('[data-tab="installed"]')).toHaveText('已安装 2') // #16 已重拉
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-installed.png') })

    // 详情 →「用它新建 Bot」：对话框预勾该连接器、不自动提交
    await row.locator('.m-main').click()
    await expect(page.locator('[data-market-detail]')).toContainText('不会全局启用')
    const before = (await devState(page)).order
    await page.click('[data-detail-action] [data-action="new-with"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible()
    await expect(dlg.locator('#new-bot-title')).toHaveText('用它新建 Bot')
    await expect(dlg.locator(`[data-connector-option="${LOCAL_PLUGIN}"] input`)).toBeChecked({ timeout: 15_000 })
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-new-with.png') })
    expect((await devState(page)).order).toEqual(before) // 预填不提交
    await page.click('[data-action="create-bot"]')
    await expect(dlg).toBeHidden({ timeout: 60_000 })
    const sid = (await devState(page)).order.find((id) => !before.includes(id))!
    expect(sid).toBeTruthy()
    await expect.poll(async () => page.getAttribute(`[data-session="${sid}"]`, 'data-preset'), { timeout: 20_000 }).toMatch(/^p2temp-/)
    const meta = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(meta.recipes).map((r) => r.connectors)).toContainEqual([LOCAL_PLUGIN])
    await expect(page.locator(`[data-session="${sid}"]`)).not.toHaveClass(/readonly/)

    // not-bundle：real 条目真 pnpm 解析 → dsh 拒绝 → 分类文案，不再给按钮
    await page.click('[data-action="market"]')
    await expect(page.locator(`[data-market-detail="${LOCAL_PLUGIN}"]`)).toBeVisible() // 回到市场保留上次的详情（P12）
    await page.click('[data-action="market-back"]')
    await page.selectOption('[data-market-source]', env.server.realUrl)
    await page.fill('[data-market-search]', 'filesystem')
    const fs = page.locator(`[data-entry="${NOT_BUNDLE}"]`)
    await fs.locator('[data-action="install"]').click()
    await expect(fs).toHaveAttribute('data-kind', 'unsupported', { timeout: 180_000 })
    await expect(fs.locator('.m-fail')).toHaveText('无法安装')
    await expect(fs.locator('button[data-action]')).toHaveCount(0)
    await fs.locator('.m-main').click()
    await expect(page.locator('[data-market-detail] [data-install-error="not-bundle"]')).toContainText('此包不是受支持的连接器包')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-not-bundle.png') })
  } finally {
    await env.stop()
  }
})
