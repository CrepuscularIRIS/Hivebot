// U-23 P-C 市场 E2E（派发验收 ②；裁决 work/p4-ui/ui/PDC-final.md P1–P16）。
// U-26 修订：两个目录源 real（T-19 快照 111 条；U-26 ④ 起未预置的有坐标条目在 serve 层打 not-installable
// → 109 仅浏览 / 1 可装 / 1 已装，见 support/connectors.ts patchRealIndex）、local（假 npm registry：
// demo-connector 真 dsh bundle + bare-package 裸包）。
// 预装：以 real 目录里的 pretrip-mcp 同名包装一个 fixture bundle（operator 直连 #15）→ 「已安装 ✓」类有 1 条实例。
// ① 浏览 / 搜索 / 分页 / 切源重置 / 三分类 109-1-1 / 无启用与源写入口；
// ② UI 安装旅程（串行、可离开、重拉 #16、new-with 预填走 #4）
// ③ D5 全条款（U-26 ②，GU-PDC-A HIGH-1 建议）：real 源 filesystem 浏览→搜索→详情→安装（__pbotsM1 断言
//    main 收到 enabled === false）→ ✓（认 wrapper 名）→ 用它新建（预勾 wrapper）→ 建 X → X 实调
//    mcp__…__read_file 出结果；未勾选的 bot Y 工具表无 mcp__*；
// ④ not-bundle（GU-PDC-A 建议：换成「19 条未预置条目」的等价构造）：local 裸包真 pnpm → 结构化拒 → unsupported。
import { expect, test, type Page } from 'playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { BARE_PLUGIN, LOCAL_PLUGIN, MARKET_SOURCE_PATCH, serveMarket, tempBundle, type MarketServer } from '../support/connectors.ts'
import { PRESETS_PATCH, devState, PDC_EVIDENCE, textCall } from '../support/ui.ts'

const PRE_INSTALLED = 'pretrip-mcp'
const NOT_BUNDLE = '@agent-infra/mcp-server-filesystem'
/** U-25 wrapper 身份（字面量与 app/sdk/tests/e2e/market.test.ts:69-72 互为锚点）。 */
const WRAPPER = '@p2sdk-market/agent-infra__mcp-server-filesystem'
const WRAPPER_SERVER_NAME = 'mcp-server-filesystem-3408f957'
const CONNECTOR_TOOL = `mcp__${WRAPPER_SERVER_NAME}__read_file`
const HELLO_TEXT = 'u26-d5-connector-evidence'

/** mcp tool-call 脚本（app/sdk/tests/e2e/market.test.ts toolCall 同款分片词汇）。 */
function mcpCall(name: string, args: object): object {
  const id = `u26-d5-${Math.random().toString(16).slice(2, 8)}`
  const json = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: json.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: json.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: json } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

/** request/header 工具表（T-03 探针模式，app/sdk market.test.ts requestToolNames 同款）：返回一轮文本回复请求里的工具名。 */
async function requestToolNames(rt: SdkRuntime, sessionId: string, tail: object[] = []): Promise<string[]> {
  rt.writeScriptCalls(sessionId, [textCall(['工具表探针']), ...tail])
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

test('P-C ①：浏览 / 搜索 / 分页 / 切源重置 / 三分类 109-1-1 / 无启用与源写入口', async () => {
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

    // 三分类实测（U-26 ④：未预置的有坐标条目在 serve 层归仅浏览 → 109 / 1（filesystem，预置）/ 1（pretrip 预装））
    const k = await kinds(page)
    console.log(`[U-23] 三分类实测：${JSON.stringify(k)}`)
    expect(k).toEqual({ browse: 109, installable: 1, installed: 1 })
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

    // 切源重置：real 已加载 100 → 切 local → 2 / 2 → 切回 real → 50 / 111
    await page.click('[data-action="load-more"]')
    await expect.poll(() => count(page)).toBe('已加载 100 / 111')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    await expect.poll(() => count(page)).toBe('已加载 2 / 2')
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

test('P-C ②：安装旅程（串行、可离开页面、重拉 #16 → ✓ →「用它新建」预勾走 #4）+ D5 真实旅程（filesystem → X 实调工具 / Y 工具表不含 / enabled:false）+ not-bundle', async () => {
  test.setTimeout(420_000)
  const env = await launchMarket()
  try {
    const { page, shell, rt } = env
    await page.click('[data-action="market"]')
    await expect.poll(() => count(page), { timeout: 20_000 }).toBe('已加载 50 / 111')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    const row = page.locator(`[data-entry="${LOCAL_PLUGIN}"]`)
    await row.locator('[data-action="install"]').click()
    await expect(row.locator('.m-busy')).toBeVisible()
    // 全局串行：安装进行中，同源另一条可装条目（U-26 起裸包）的「安装」按钮 disabled
    await expect(page.locator(`[data-entry="${BARE_PLUGIN}"] [data-action="install"]`)).toBeDisabled()
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
    const localBot = (await devState(page)).order.find((id) => !before.includes(id))!
    expect(localBot).toBeTruthy()
    await expect.poll(async () => page.getAttribute(`[data-session="${localBot}"]`, 'data-preset'), { timeout: 20_000 }).toMatch(/^p2temp-/)
    const meta = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(meta.recipes).map((r) => r.connectors)).toContainEqual([LOCAL_PLUGIN])
    await expect(page.locator(`[data-session="${localBot}"]`)).not.toHaveClass(/readonly/)

    // ---- U-26 ② D5 全条款：real 源 filesystem（唯一预置 → U-25 wrapper 真装成功）----
    await page.click('[data-action="market"]')
    await expect(page.locator(`[data-market-detail="${LOCAL_PLUGIN}"]`)).toBeVisible() // 回到市场保留上次的详情（P12）
    await page.click('[data-action="market-back"]')
    await page.selectOption('[data-market-source]', env.server.realUrl)
    await page.fill('[data-market-search]', 'filesystem')
    const fs = page.locator(`[data-entry="${NOT_BUNDLE}"]`)
    await expect(fs).toHaveAttribute('data-kind', 'installable')
    // 详情（D5：浏览 → 搜索 → 详情）
    await fs.locator('.m-main').click()
    await expect(page.locator(`[data-market-detail="${NOT_BUNDLE}"]`)).toContainText('不会全局启用')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-filesystem-detail.png') })
    await page.click('[data-action="market-back"]')
    // 安装：main 收到的 enabled 恒为 false（__pbotsM1 观测，无新 IPC）
    await fs.locator('[data-action="install"]').click()
    await expect(fs, 'U-26 ①：#16 返回 wrapper 名，classify 认得 → ✓').toHaveAttribute('data-kind', 'installed', { timeout: 120_000 })
    await expect(fs.locator('.m-ok')).toContainText('已安装')
    const m1Installs = await shell.app.evaluate(
      () => (globalThis as unknown as { __pbotsM1?: { installs: Array<{ spec: unknown; enabled: unknown }> } }).__pbotsM1?.installs ?? [],
    )
    expect(m1Installs.filter((i) => i.spec === `${NOT_BUNDLE}@1.2.29`), 'D5：main 收到的 enabled === false（+4 精确等值）')
      .toEqual([{ spec: `${NOT_BUNDLE}@1.2.29`, enabled: false }])

    // ✓ 详情 →「用它新建 Bot」预勾 wrapper 名 → 建 X（走 #4）
    await fs.locator('.m-main').click()
    await expect(page.locator(`[data-market-detail="${NOT_BUNDLE}"] [data-action="new-with"]`)).toBeVisible()
    await page.click(`[data-market-detail="${NOT_BUNDLE}"] [data-action="new-with"]`)
    await expect(dlg.locator(`[data-connector-option="${WRAPPER}"] input`)).toBeChecked({ timeout: 15_000 })
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-new-with-wrapper.png') })
    const beforeX = (await devState(page)).order
    await page.click('[data-action="create-bot"]')
    await expect(dlg).toBeHidden({ timeout: 60_000 })
    const x = (await devState(page)).order.find((id) => !beforeX.includes(id))!
    expect(x).toBeTruthy()
    const metaX = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(metaX.recipes).map((r) => r.connectors), 'X 的 recipe 记 wrapper bundle 名').toContainEqual([WRAPPER])
    await expect(page.locator(`[data-session="${x}"]`)).not.toHaveClass(/readonly/)

    // X 的一轮对话：真实 stdio server 的 read_file → tool-call 行 + 结果（D5 主体）
    const workspace = join(rt.home, 'workspace')
    mkdirSync(workspace, { recursive: true })
    const helloPath = join(workspace, 'hello.txt')
    writeFileSync(helloPath, HELLO_TEXT)
    rt.writeScriptCalls(x, [mcpCall(CONNECTOR_TOOL, { path: helloPath }), textCall(['D5 读取完成'])])
    await page.fill('[data-composer]', '读一下 hello.txt')
    await page.press('[data-composer]', 'Enter')
    await expect(page.locator(`[data-pane="${x}"] .tool-row[data-status="done"]`), 'X 实调连接器工具成功').toBeVisible({ timeout: 60_000 })
    await page.locator(`[data-pane="${x}"] .tool-row .tool-line`).click() // 展开看结果
    await expect(page.locator(`[data-pane="${x}"] .tool-detail`)).toContainText(HELLO_TEXT)
    await expect(page.locator(`[data-pane="${x}"] .bubble.assistant.final`).last()).toHaveText('D5 读取完成')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-d5-tool-call.png') })

    // Y（主 bot，未勾选）：工具表里没有这个工具（request/header 探针，X 的脚本在它自己的探针尾段跑）
    const y = (await devState(page)).meta.mainBotId!
    const yTools = await requestToolNames(rt, y)
    expect(yTools.filter((n) => n.startsWith('mcp__')), 'Y 工具表不含任何 mcp__ 工具').toEqual([])

    // ---- U-26 ④：not-bundle（GU 建议「换未预置条目」的等价构造：local 裸包真 pnpm → dsh 结构化拒）----
    await page.click('[data-action="market"]')
    await page.click('[data-action="market-back"]')
    await page.selectOption('[data-market-source]', env.server.localUrl)
    await page.fill('[data-market-search]', '') // 清掉 D5 段的 'filesystem'（切源不重置 query）
    await expect.poll(() => count(page)).toBe('已加载 2 / 2')
    const bare = page.locator(`[data-entry="${BARE_PLUGIN}"]`)
    await bare.locator('[data-action="install"]').click()
    await expect(bare).toHaveAttribute('data-kind', 'unsupported', { timeout: 180_000 })
    await expect(bare.locator('.m-fail')).toHaveText('无法安装')
    await expect(bare.locator('button[data-action]')).toHaveCount(0)
    await bare.locator('.m-main').click()
    await expect(page.locator('[data-market-detail] [data-install-error="not-bundle"]')).toContainText('此包不是受支持的连接器包')
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-not-bundle.png') })
  } finally {
    await env.stop()
  }
})
