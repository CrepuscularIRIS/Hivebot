// U-31 全旅程收尾（PLAN U-31 ②③）：D12① 生产 build 下 renderer 网络日志里 pbots-app:// 以外请求数
// === 0（含 127.0.0.1，任何 http(s)/ws(s) 即 FAIL）；window + DOM 全文搜 launch token 命中 0；
// D12② DOM 无 Sign in/account/computer/SSH/billing；D11/D9 DOM 复扫（无改 preset/连接器入口、无 never 类）；
// D12③ 截图存证：4 页（会话/市场/设置/新建对话框）× 亮/暗共 8 张 → work/p4-ui/evidence/U-31/。
import { expect, test } from 'playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { launchShell } from '../../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket } from '../../support/connectors.ts'
import { PRESETS_PATCH, createViaDialog, devState, send, textCall } from '../../support/ui.ts'

/** 截图与证据一律写主仓 work/（LEARNINGS 2026-11-02：worktree 内的 work/ 随 remove 丢失）。 */
const EVIDENCE = ((): string => {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: __dirname, encoding: 'utf8' }).trim()
  const dir = join(dirname(common), 'work', 'p4-ui', 'evidence', 'U-31')
  mkdirSync(dir, { recursive: true })
  return dir
})()

test('D12①/② + D11/D9 DOM + 8 张截图：零外网请求、token 零泄漏、禁区词零命中、4 页亮暗存证', async () => {
  test.setTimeout(240_000)
  // 市场页需要目录源（P-C 渲染条件）：serveMarket + MARKET_SOURCE_PATCH（market.spec 同款）
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: mkdtempSync(join(tmpdir(), 'bot-u31-ws-')),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  const env = { rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop(); await server.close() } }
  try {
    const { page } = env
    await page.waitForSelector('.shell', { timeout: 30_000 })
    const a = await createViaDialog(page, 'p2-alpha')
    rt.writeScriptCalls(a, [textCall(['U-31 旅程页存证回复。'])])
    await send(page, '打个招呼')
    await expect(page.locator(`[data-pane="${a}"] .bubble.assistant.final`)).toHaveText('U-31 旅程页存证回复。', { timeout: 30_000 })

    // ---- D12①：renderer 网络日志（挂监听后重载 = 完整一轮页面加载 + 交互请求）----
    const urls: string[] = []
    page.on('request', (req) => { urls.push(req.url()) })
    await page.reload()
    await page.waitForSelector('.shell', { timeout: 30_000 })
    await page.click('[data-action="market"]')
    await expect(page.locator('[data-market]')).toBeVisible({ timeout: 20_000 })
    const marketText = ((await page.locator('[data-market]').innerText())).toLowerCase() // 市场页正文（离开前取）
    await page.locator('.bot-item').first().click()
    await page.click('[data-action="toggle-info-pane"]')
    await expect(page.locator('[data-info-pane]')).toBeVisible()
    // 历史资源（重载前已发生的）经 performance entries 一并纳入
    const historical = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))
    const all = [...urls, ...historical]
    expect(all.length, '收集到网络请求（非空证据）').toBeGreaterThan(0)
    const foreign = all.filter((u) => !u.startsWith('pbots-app://'))
    expect(foreign, `pbots-app:// 以外的请求必须为 0（got ${JSON.stringify(foreign.slice(0, 5))}）`).toEqual([])

    // token 零泄漏：DOM 全文 + window 上序列化可见的 dev 状态
    const domHtml = await page.evaluate(() => document.documentElement.outerHTML)
    const devJson = await page.evaluate(() => JSON.stringify((window as unknown as { __pbotsDev?: unknown }).__pbotsDev ?? null))
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

    // ---- D12② / D9 / D11 DOM 扫描（会话页正文 + 市场页正文）----
    const bodyText = ((await page.locator('body').innerText())).toLowerCase()
    for (const [scope, text] of [['body', bodyText], ['[data-market]', marketText]] as const) {
      for (const word of ['sign in', 'account', '账号', 'computer', 'ssh', 'billing', 'danger-full-access', '始终允许']) {
        expect(text, `${scope} 不应出现「${word}」（D12②/D9）`).not.toContain(word)
      }
    }
    // D11：pane 内唯一表单控件是模型 select（无改 preset/连接器入口）
    const paneControls = await page.locator('[data-info-pane] select, [data-info-pane] input, [data-info-pane] [data-action="set-main"]').evaluateAll((els) => els.map((e) => e.tagName.toLowerCase() + (e.getAttribute('data-action') ? `[data-action="${e.getAttribute('data-action')}"]` : '')))
    expect(paneControls.filter((c) => !c.startsWith('select')), 'D11：pane 无改 preset/连接器的表单入口（只允许模型 select 与设主 Bot 按钮）').toEqual([])
    // D9：新建对话框 preset 下拉无 never 类
    await page.click('[data-action="new-bot"]')
    const dlgText = (await page.locator('dialog[data-dialog="new-bot"]').innerText()).toLowerCase()
    expect(dlgText).not.toContain('danger-full-access')
    expect(dlgText).not.toContain('never')

    // ---- D12③：4 页 × 亮/暗 8 张截图 ----
    const shots = async (name: string): Promise<void> => {
      for (const mode of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: mode })
        await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
        await page.screenshot({ path: join(EVIDENCE, `${name}-${mode}.png`) })
      }
      await page.emulateMedia({ colorScheme: 'light' })
    }
    await shots('dialog') // 第 4 页：新建对话框（此刻正开着）
    await page.locator('.modal-actions .btn.secondary').click()
    await shots('settings') // 第 3 页：设置 info-pane
    await page.click('[data-action="market"]')
    await expect(page.locator('[data-market]')).toBeVisible()
    await shots('market') // 第 2 页：市场
    await page.locator('.bot-item').first().click()
    await expect(page.locator('[data-composer]')).toBeVisible()
    await shots('session') // 第 1 页：会话
  } finally {
    await env.stop()
  }
})
