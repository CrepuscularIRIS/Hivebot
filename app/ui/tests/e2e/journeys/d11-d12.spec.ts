// U-31 全旅程收尾（PLAN U-31 ②③；P5-54 起跑在 renderer-grok 上）：D12① 生产 build 下 renderer 网络日志里 pbots-app:// 以外请求数
// === 0（含 127.0.0.1，任何 http(s)/ws(s) 即 FAIL）；window + DOM 全文搜 launch token 命中 0；
// D12② DOM 无 Sign in / computer / SSH / billing；D11/D9 DOM 复扫（会话设置无改 preset / 连接器入口、无 never 类）；
// D12③ 截图存证：4 页（会话 / 插件市场 overlay / 设置 overlay / 会话设置 pane）× 亮暗共 8 张 → gitignored app/ui/test-output/U-31/。
// 0.18 的账户区是本地 profile（Pbots · pbots-local@pbots.local，菜单只剩 Settings / About，P5-52），不是登录入口。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { launchShell } from '../../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket } from '../../support/connectors.ts'
import { PRESETS_PATCH, createBots, evidenceOut, finalAssistant, openBot, send, textCall, waitProductReady } from '../../support/ui.ts'

const EVIDENCE = evidenceOut('U-31')
const FORBIDDEN = ['sign in', 'log out', 'computer', 'ssh', 'billing', 'danger-full-access', '始终允许']

const openPlugins = (page: Page) => page.locator('button', { hasText: 'Plugins' }).first().click()
async function openSettings(page: Page): Promise<void> {
  await page.click('button[aria-label="Account"]')
  await page.locator('[role=menuitem]', { hasText: 'Settings' }).click()
  await expect(page.locator('.sand-settings-panel')).toBeVisible({ timeout: 15_000 })
}

test('D12①/② + D11/D9 DOM + 8 张截图：零外网请求、token 零泄漏、禁区词零命中、4 页亮暗存证', async () => {
  test.setTimeout(240_000)
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: tmkdir('bot-u31-ws-'),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  const env = { rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop(); await server.close() } }
  try {
    const { page } = env
    await waitProductReady(page)
    const [a] = await createBots(page, [{ title: 'U31-A', preset: 'p2-alpha' }])
    await openBot(page, 'U31-A')
    rt.writeScriptCalls(a!, [textCall(['U-31 旅程页存证回复。'])])
    await send(page, '打个招呼')
    await expect(finalAssistant(page).last()).toHaveText('U-31 旅程页存证回复。', { timeout: 30_000 })

    // ---- D12①：renderer 网络日志（挂监听后重载 = 完整一轮页面加载 + 交互请求）----
    const urls: string[] = []
    page.on('request', (req) => { urls.push(req.url()) })
    await page.reload()
    await waitProductReady(page)
    await openPlugins(page)
    await page.waitForTimeout(800)
    const pluginsText = (await page.locator('body').innerText()).toLowerCase()
    await page.keyboard.press('Escape')
    await openSettings(page)
    // 设置里的「Execution on Local Computer」是本地工具审批档（L-AP，P5-52 交 P5-31 改文案/下拉），不是 computer-use 入口：扫描前剔除该卡文案
    const settingsText = (await page.locator('.sand-settings-panel').innerText()).toLowerCase()
      .replace(/execution on local computer/g, '').replace(/run tasks on your computer/g, '')
    await page.locator('.sand-settings-panel__close').click()
    await openBot(page, 'U31-A')
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('aside.sand-info-pane[data-open]')
    await expect(pane).toBeVisible()
    const paneText = (await pane.innerText()).toLowerCase()
    const historical = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))
    const all = [...urls, ...historical]
    expect(all.length, '收集到网络请求（非空证据）').toBeGreaterThan(0)
    const foreign = all.filter((u) => !u.startsWith('pbots-app://') && !u.startsWith('data:'))
    expect(foreign, `pbots-app:// 以外的请求必须为 0（got ${JSON.stringify(foreign.slice(0, 5))}）`).toEqual([])

    // token 零泄漏：DOM 全文 + window 上序列化可见的 dev 状态 + 顶层标量
    const domHtml = await page.evaluate(() => document.documentElement.outerHTML)
    const devJson = await page.evaluate(() => JSON.stringify((window as unknown as { __pbotsDev?: { state: unknown } }).__pbotsDev?.state ?? null))
    expect(domHtml.includes(rt.token), 'DOM 全文不含 launch token').toBe(false)
    expect(devJson.includes(rt.token), 'window dev 状态不含 launch token').toBe(false)
    const windowScan = await page.evaluate(() => {
      const parts: string[] = []
      for (const key of Object.keys(window)) {
        try { const v = (window as unknown as Record<string, unknown>)[key]; if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') parts.push(String(v)) } catch { /* getter 抛错跳过 */ }
      }
      return parts.join('\n')
    })
    expect(windowScan.includes(rt.token), 'window 顶层标量不含 launch token').toBe(false)

    // ---- D12② / D9 / D11 DOM 扫描（会话页 + 插件 overlay + 设置 overlay + 会话设置 pane）----
    const bodyText = (await page.locator('body').innerText()).toLowerCase()
    for (const [scope, text] of [['body', bodyText], ['plugins', pluginsText], ['settings', settingsText], ['pane', paneText]] as const) {
      for (const word of FORBIDDEN) expect(text, `${scope} 不应出现「${word}」（D12②/D9）`).not.toContain(word)
    }
    // D11：会话设置里没有改 preset / 连接器 / 权限的入口
    for (const word of ['preset', 'connector', 'permission']) expect(paneText, `D11 pane 不应出现「${word}」`).not.toContain(word)

    // ---- D12③：4 页 × 亮/暗 8 张截图 ----
    const shots = async (name: string): Promise<void> => {
      for (const mode of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: mode })
        await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
        await page.screenshot({ path: join(EVIDENCE, `${name}-${mode}.png`) })
      }
      await page.emulateMedia({ colorScheme: 'light' })
    }
    await shots('info-pane') // 第 4 页：会话设置 pane（此刻正开着）
    await page.keyboard.press('Escape')
    await openSettings(page)
    await shots('settings') // 第 3 页：设置 overlay
    await page.locator('.sand-settings-panel__close').click()
    await openPlugins(page)
    await page.waitForTimeout(500)
    await shots('market') // 第 2 页：插件市场 overlay
    await page.keyboard.press('Escape')
    await openBot(page, 'U31-A')
    await shots('session') // 第 1 页：会话
  } finally {
    await env.stop()
  }
})
