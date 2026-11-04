// P-C 市场 E2E（P5-57 起 UI 段回到产品界面：renderer-grok 的 footer「Connect apps」→ 覆盖的市场 overlay；
// 定稿 work/p5-parity/ui/P5-57-final.md ①；旧 U-23/U-26 用例语义原样，选择器换 0.78.1 外壳）。
// 目录源：real（T-19 快照 111 条；未预置的有坐标条目在 serve 层打 not-installable → 109 仅浏览 / 1 可装 / 1 已装，
// support/connectors.ts patchRealIndex）、local（假 npm registry：demo-connector 真 dsh bundle + bare-package 裸包）。
// 预装：以 real 目录里的 pretrip-mcp 同名包装一个 fixture bundle（operator 直连 #15）→「Installed」类有 1 条实例。
// ① 浏览 / 搜索 / 分页 / 切源重置 / 三分类 109-1-1 / 无启用与源写入口 / 亮暗截图
// P5-57 按 R-04（RE-market-detail.md）：安装动词 Connect → Connecting… → ✓Connected；已装入口 = 预览条「Your plugins」（无 tab）；详情单列 + Information 卡
// ② UI 安装旅程（串行、可离开、重拉 #16、New bot with this app 预勾走 #4）
// ③ D5 全条款：real 源 filesystem 搜索 → 详情 → UI 安装（__pbotsM1 断言 main 收到 enabled === false）→ 认 wrapper 名 →
//    用它新建（预勾 wrapper）→ X 实调 mcp__…__read_file 出结果；未勾选的 bot Y 工具表无 mcp__*
// ④ not-bundle：local 裸包真 pnpm → 结构化拒 → unsupported + 文案
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT, type Target } from '../support/contrast.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { BARE_PLUGIN, LOCAL_PLUGIN, MARKET_SOURCE_PATCH, serveMarket, tempBundle, type MarketServer } from '../support/connectors.ts'
import { FS_PLUGIN, WRAPPER, approveConnectorCall, mcpCall } from '../support/connector-call.ts'
import { PRESETS_PATCH, botItem, devState, evidenceOut, finalAssistant, send, textCall, waitProductReady } from '../support/ui.ts'

const PRE_INSTALLED = 'pretrip-mcp'
const HELLO_TEXT = 'u26-d5-connector-evidence'
const EVIDENCE = evidenceOut('P5-57')

/** request/header 工具表（T-03 探针模式，app/sdk market.test.ts requestToolNames 同款）：返回一轮文本回复请求里的工具名。 */
async function requestToolNames(rt: SdkRuntime, sessionId: string): Promise<string[]> {
  rt.writeScriptCalls(sessionId, [textCall(['工具表探针'])])
  const frames: Array<{ type?: string; event?: { type?: string; data?: { header?: { tools?: Array<{ name: string }> } } } }> = []
  const client = rt.client as unknown as {
    follow(sid: string, opts: { assistantStream: boolean }): Promise<AsyncIterable<object> & { cancel(): void }>
  }
  const stream = await client.follow(sessionId, { assistantStream: true })
  const drained = (async () => { for await (const f of stream) frames.push(f as never) })()
  try {
    await rt.client.call('session/prompt', {
      request: { requestId: `u26-probe-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '列工具' }] },
    })
    await expect.poll(() => frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end'), { timeout: 30_000 }).toBe(true)
  } finally {
    stream.cancel()
    void drained
  }
  return frames.filter((f) => f.type === 'event' && f.event?.type === 'request/header')
    .flatMap((f) => f.event?.data?.header?.tools?.map((t) => t.name) ?? [])
}

interface Env { server: MarketServer; rt: SdkRuntime; shell: ShellLaunch; page: Page; stop(): Promise<void> }

async function launchMarket(): Promise<Env> {
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: tmkdir('bot-u23-ws-'),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const pre = (await rt.client.call('pluginManager/installBundle', { spec: tempBundle(PRE_INSTALLED), options: { enabled: false } })) as { application?: string }
  if (pre.application === 'failed') throw new Error(`pre-install failed: ${JSON.stringify(pre).slice(0, 500)}`)
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  await waitProductReady(shell.page)
  return { server, rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop(); await server.close() } }
}

const MARKET_TARGETS: Target[] = [
  { id: '市场 Not available', sel: '[data-market-list] [data-kind="browse"] .pb-status' },
  { id: '市场条目副题', sel: '[data-market-list] .pb-row__desc' },
  { id: '市场计数', sel: '[data-market-count]' },
]
const market = (page: Page) => page.locator('[data-market]')
const pill = (page: Page) => page.locator('.sand-agents-sidebar__plugins')
const dlg = (page: Page) => page.locator('dialog[data-dialog="new-bot"]')
const openMarket = async (page: Page): Promise<void> => {
  await pill(page).click()
  await expect(market(page)).toBeVisible()
}
const count = (page: Page): Promise<string | null> => page.textContent('[data-market-count]')
const kinds = async (page: Page): Promise<Record<string, number>> => page.evaluate(() => {
  const out: Record<string, number> = {}
  for (const row of document.querySelectorAll<HTMLElement>('[data-market-list] [data-kind]')) out[row.dataset.kind!] = (out[row.dataset.kind!] ?? 0) + 1
  return out
})

test('P-C ①：入口 Connect apps → 浏览 / 搜索 / 分页 / 切源重置 / 三分类 109-1-1 / 无启用与源写入口', async () => {
  test.setTimeout(180_000)
  const env = await launchMarket()
  try {
    const { page } = env
    await expect(pill(page)).toContainText('Connect apps') // A15 文案（icon 字形另占一个私用区字符）
    await openMarket(page)
    await expect(market(page).locator('#sand-plugins-modal-heading')).toHaveText('Connect Apps')
    await expect(market(page)).toHaveAttribute('aria-modal', 'true')
    // D1：0.78.1 模态几何（900 宽封顶、r14、1px 描边、无阴影）
    const box = await market(page).evaluate((el) => { const cs = getComputedStyle(el); return { r: cs.borderTopLeftRadius, b: cs.borderTopWidth, shadow: cs.boxShadow, w: el.getBoundingClientRect().width } })
    expect(box).toMatchObject({ r: '14px', b: '1px', shadow: 'none' })
    expect(box.w).toBeLessThanOrEqual(900)
    await expect(page.locator('[data-market-source] option')).toHaveCount(2) // 两个源 → select（P11）
    await expect.poll(() => count(page), { timeout: 20_000 }).toBe('Showing 50 of 111')
    await page.screenshot({ path: join(EVIDENCE, 'market-list-light.png') })
    // P5-41.f1 ④：可连接条目排在首屏（不被 109 条 Not available 埋掉）
    await expect(page.locator('[data-market-list] [data-kind]').first()).not.toHaveAttribute('data-kind', 'browse')
    const light = await AUDIT(page, MARKET_TARGETS)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(600) // 主题过渡（对照台同口径）
    await page.screenshot({ path: join(EVIDENCE, 'market-list-dark.png') })
    const dark = await AUDIT(page, MARKET_TARGETS)
    await page.emulateMedia({ colorScheme: 'light' })
    // P5-41.f1 ①：市场次级文字对比度（theme-dual 默认 profile 无目录源，列表态在这里审）
    for (const [mode, rows] of [['light', light], ['dark', dark]] as const) {
      expect.soft(rows.map((r) => r.id), `${mode} 市场审计目标齐`).toEqual(MARKET_TARGETS.map((t) => t.id))
      for (const r of rows) expect.soft(r.ratio, `${mode} ${r.id} 对比度 ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5)
    }
    writeFileSync(join(EVIDENCE, 'contrast-market.tsv'), [...light.map((r) => ['light', r.id, r.ratio, r.fg, r.bg].join('\t')), ...dark.map((r) => ['dark', r.id, r.ratio, r.fg, r.bg].join('\t'))].join('\n') + '\n')

    // 分页：Load more ×2 → 111 / 111，按钮消失
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('Showing 100 of 111')
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('Showing 111 of 111')
    await expect(page.locator('[data-action="load-more"]')).toHaveCount(0)

    // 三分类（109 仅浏览 / 1 可装 filesystem / 1 已装 pretrip）
    expect(await kinds(page)).toEqual({ browse: 109, installable: 1, installed: 1 })
    await expect(page.locator(`[data-entry="${PRE_INSTALLED}"] .pb-added`)).toContainText('Connected')
    await expect(page.locator(`[data-entry="${FS_PLUGIN}"] [data-action="connect"]`)).toHaveText('Connect') // R-04 iSLIjg
    const browseRow = page.locator('[data-market-list] [data-kind="browse"]').first()
    await expect(browseRow.locator('button[data-action]')).toHaveCount(0)
    await expect(browseRow.locator('.pb-status')).toHaveText('Not available')

    // P3/P11：无 Enable / 「安装并启用」、无目录源写入口
    expect((await market(page).innerText()).toLowerCase()).not.toContain('enable')
    expect(await market(page).locator('input:not([data-market-search])').count()).toBe(0)

    // 仅浏览详情：原因常驻、按钮 disabled；Back 回列表保留已加载结果（P12）
    await browseRow.locator('.pb-row__open').click()
    await expect(page.locator('[data-market-detail] [data-detail-action] button')).toHaveCount(0)
    await expect(page.locator('[data-market-detail] [data-detail-action]')).toHaveText('Not available')
    await expect(page.locator('[data-market-detail] [aria-label="Information"]')).toContainText('Availability')
    await page.screenshot({ path: join(EVIDENCE, 'market-detail-browse.png') })
    await page.click('[data-action="market-back"]')
    await expect(page.locator('[data-market-list]')).toBeVisible()
    await expect.poll(() => count(page)).toBe('Showing 111 of 111')

    // 搜索：防抖、重置分页；无匹配空态 + Clear search
    await page.fill('[data-market-search]', 'filesystem')
    await expect.poll(async () => Number((await count(page))?.match(/of (\d+)$/)?.[1] ?? -1)).toBeLessThan(111)
    await expect(page.locator(`[data-entry="${FS_PLUGIN}"]`)).toHaveAttribute('data-kind', 'installable')
    await page.fill('[data-market-search]', 'zzqqxxnomatch')
    await expect(page.locator('[data-market-empty]')).toContainText('No plugins match "zzqqxxnomatch"')
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect.poll(() => count(page)).toBe('Showing 50 of 111')

    // 切源重置：real 已加载 100 → 切 local → 2 / 2 → 切回 real → 50 / 111
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('Showing 100 of 111')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    await expect.poll(() => count(page)).toBe('Showing 2 of 2')
    await expect(page.locator(`[data-entry="${LOCAL_PLUGIN}"]`)).toHaveAttribute('data-kind', 'installable')
    await page.selectOption('[data-market-source]', env.server.realUrl)
    await expect.poll(() => count(page)).toBe('Showing 50 of 111')

    // 已装预览条（Your plugins，计数 = #16）→ 已装列表 → Back 回列表
    await expect(page.locator('[data-installed-count]')).toHaveText('1')
    await page.click('[data-action="your-plugins"]')
    await expect(page.locator(`[data-installed-list] [data-bundle="${PRE_INSTALLED}"] .pb-added`)).toContainText('Connected')
    await page.click('[data-action="market-back"]')
    await expect(page.locator('[data-market-list]')).toBeVisible()

    // Esc：空搜索框 → 关市场；侧栏仍在
    await page.keyboard.press('Escape')
    await expect(market(page)).toHaveCount(0)
    await expect(botItem(page, 'New chat')).toBeVisible()
  } finally {
    await env.stop()
  }
})

test('P-C ②③④：Connect 旅程（串行 / 可离开 / 重拉 #16）→ New bot with this app 预勾走 #4 + D5 UI 全条款 + not-bundle', async () => {
  test.setTimeout(480_000)
  const env = await launchMarket()
  try {
    const { page, shell, rt } = env
    await openMarket(page)
    await expect.poll(() => count(page), { timeout: 20_000 }).toBe('Showing 50 of 111')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    const row = page.locator(`[data-entry="${LOCAL_PLUGIN}"]`)
    await row.locator('[data-action="connect"]').click()
    await expect(row.locator('[data-action="connect"]')).toHaveText('Connecting…') // R-04 JrFTcr
    await page.screenshot({ path: join(EVIDENCE, 'market-installing.png') })
    // 全局串行：安装进行中，另一条可装条目的 Install disabled
    await expect(page.locator(`[data-entry="${BARE_PLUGIN}"] [data-action="connect"]`)).toBeDisabled()
    // 可离开：关市场，安装在模块级 store 里继续；再开回到同源
    await page.click('.pb-market .sand-plugins-dialog__close')
    await expect(market(page)).toHaveCount(0)
    await openMarket(page)
    await expect(row).toHaveAttribute('data-kind', 'installed', { timeout: 120_000 })
    await expect(row.locator('.pb-added')).toContainText('Connected')
    await expect(page.locator('[data-installed-count]')).toHaveText('2') // #16 已重拉

    // 详情 → New bot with this app：对话框预勾该连接器、不自动提交
    await row.locator('.pb-row__open').click()
    await expect(page.locator('[data-market-detail]')).toContainText("aren't turned on for every bot")
    const before = (await devState(page)).order
    await page.click('[data-market-detail] [data-action="new-with"]')
    await expect(dlg(page)).toBeVisible()
    await expect(dlg(page).locator('#pb-new-bot-title')).toHaveText('New bot with this app')
    await expect(dlg(page).locator(`[data-connector-option="${LOCAL_PLUGIN}"] input`)).toBeChecked({ timeout: 15_000 })
    await page.screenshot({ path: join(EVIDENCE, 'new-with-dialog.png') })
    expect((await devState(page)).order).toEqual(before) // 预填不提交
    await dlg(page).locator('[data-action="create-bot"]').click()
    await expect(dlg(page)).toHaveCount(0, { timeout: 60_000 })
    await expect(market(page)).toHaveCount(0) // 建成即关市场、聚焦新 bot
    const localBot = (await devState(page)).order.find((id) => !before.includes(id))!
    expect(localBot).toBeTruthy()
    await expect.poll(async () => (await devState(page)).views[localBot]?.preset, { timeout: 20_000 }).toMatch(/^p2temp-/)
    const meta = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(meta.recipes).map((r) => r.connectors)).toContainEqual([LOCAL_PLUGIN])
    await expect(page.locator('.sand-agent-item[data-active]')).toHaveCount(1)

    // ---- D5 全条款：real 源 filesystem（唯一预置 → U-25 wrapper 真装成功）----
    await openMarket(page)
    await expect(page.locator(`[data-market-detail="${LOCAL_PLUGIN}"]`)).toBeVisible() // 回到市场保留上次的详情（P12）
    await page.click('[data-action="market-back"]')
    await page.selectOption('[data-market-source]', env.server.realUrl)
    await page.fill('[data-market-search]', 'filesystem')
    const fs = page.locator(`[data-entry="${FS_PLUGIN}"]`)
    await expect(fs).toHaveAttribute('data-kind', 'installable')
    await fs.locator('.pb-row__open').click() // 浏览 → 搜索 → 详情
    await expect(page.locator(`[data-market-detail="${FS_PLUGIN}"]`)).toContainText('supported connector bundle')
    await page.screenshot({ path: join(EVIDENCE, 'market-detail-installable.png') })
    await page.click(`[data-market-detail="${FS_PLUGIN}"] [data-action="connect"]`)
    await expect(page.locator(`[data-market-detail="${FS_PLUGIN}"] [data-action="connect"]`)).toHaveText('Connecting…')
    await expect(page.locator(`[data-market-detail="${FS_PLUGIN}"]`), 'U-26 ①：#16 返回 wrapper 名 → Connected').toHaveAttribute('data-kind', 'installed', { timeout: 120_000 })
    const m1Installs = await shell.app.evaluate(
      () => (globalThis as unknown as { __pbotsM1?: { installs: Array<{ spec: unknown; enabled: unknown }> } }).__pbotsM1?.installs ?? [],
    )
    expect(m1Installs.filter((i) => i.spec === `${FS_PLUGIN}@1.2.29`), 'D5：main 收到的 enabled === false（+4 精确等值）')
      .toEqual([{ spec: `${FS_PLUGIN}@1.2.29`, enabled: false }])
    await page.screenshot({ path: join(EVIDENCE, 'market-detail-installed.png') })
    await page.click(`[data-market-detail="${FS_PLUGIN}"] [data-action="new-with"]`)
    await expect(dlg(page).locator(`[data-connector-option="${WRAPPER}"] input`)).toBeChecked({ timeout: 15_000 })
    const beforeX = (await devState(page)).order
    await dlg(page).locator('[data-action="create-bot"]').click()
    await expect(dlg(page)).toHaveCount(0, { timeout: 60_000 })
    const x = (await devState(page)).order.find((id) => !beforeX.includes(id))!
    expect(x).toBeTruthy()
    const metaX = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(metaX.recipes).map((r) => r.connectors), 'X 的 recipe 记 wrapper bundle 名').toContainEqual([WRAPPER])

    // X 的一轮对话：真实 stdio server 的 read_file → 审批 Allow once → 工具行 done + 结果（D5 主体）
    const workspace = join(rt.home, 'workspace')
    mkdirSync(workspace, { recursive: true })
    const helloPath = join(workspace, 'hello.txt')
    writeFileSync(helloPath, HELLO_TEXT)
    rt.writeScriptCalls(x, [mcpCall({ path: helloPath }), textCall(['D5 读取完成'])])
    await send(page, '读一下 hello.txt')
    await approveConnectorCall(page, x, HELLO_TEXT)
    await expect(finalAssistant(page).last()).toHaveText('D5 读取完成', { timeout: 30_000 })
    await page.screenshot({ path: join(EVIDENCE, 'd5-tool-call.png') })

    // Y（主 bot，未勾选）：工具表里没有任何 mcp__ 工具
    const y = (await devState(page)).meta.mainBotId!
    const yTools = await requestToolNames(rt, y)
    expect(yTools.filter((n) => n.startsWith('mcp__')), 'Y 工具表不含任何 mcp__ 工具').toEqual([])

    // ---- not-bundle：local 裸包真 pnpm → dsh 结构化拒 → unsupported ----
    await openMarket(page)
    await page.click('[data-action="market-back"]')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    await page.fill('[data-market-search]', '')
    await expect.poll(() => count(page)).toBe('Showing 2 of 2')
    const bare = page.locator(`[data-entry="${BARE_PLUGIN}"]`)
    await bare.locator('[data-action="connect"]').click()
    await expect(bare).toHaveAttribute('data-kind', 'unsupported', { timeout: 180_000 })
    await expect(bare.locator('.pb-status')).toHaveText('Not supported')
    await expect(bare.locator('button[data-action]')).toHaveCount(0)
    await bare.locator('.pb-row__open').click()
    await expect(page.locator('[data-market-detail] [data-install-error="not-bundle"]')).toContainText("isn't a supported connector bundle")
    await page.screenshot({ path: join(EVIDENCE, 'market-not-bundle.png') })
  } finally {
    await env.stop()
  }
})
