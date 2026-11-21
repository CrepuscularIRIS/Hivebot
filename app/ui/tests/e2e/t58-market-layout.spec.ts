// T58：市场浮层对齐 0.78.1——外壳同设置（bg-chrome/.5px secondary/scrim 分主题）、输入组 1px 描边、
// Index sources ActionBar（Done 右对齐不裁、Add 与输入组居中）。规格 RE-UI-LAYOUT §1.1/§3 + RE-market-detail。
// rect 断言用 getBoundingClientRect 相减（±1，T57c 口径）；色走 token 求值 + rgba 容差比（T67 教训）。
import { expect, test, type Page } from 'playwright/test'
import { join } from 'node:path'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket, type MarketServer } from '../support/connectors.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/ui-polish-win/evidence/T58'
const HIDPI = ['--force-device-scale-factor=2'] // .5px 断言前提（DPR1 吸附读 1，T66 教训）

interface Env { server: MarketServer; rt: SdkRuntime; shell: ShellLaunch; page: Page; stop(): Promise<void> }
async function launchMarket(): Promise<Env> {
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: tmkdir('bot-t58-ws-'),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: HIDPI })
  await waitProductReady(shell.page)
  return { server, rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop(); await server.close() } }
}

const market = (page: Page) => page.locator('[data-market]')
const pill = (page: Page) => page.locator('.sand-agents-sidebar__plugins')
const openMarket = async (page: Page): Promise<void> => { await pill(page).click(); await expect(market(page)).toBeVisible() }

const tokenOf = (page: Page, token: string, prop: string): Promise<string> =>
  page.evaluate(([t, p]) => {
    const probe = document.createElement('div')
    probe.style[p] = `var(${t})`
    probe.style.display = 'none'
    document.body.append(probe)
    const v = getComputedStyle(probe)[p as 'color']
    probe.remove()
    return v
  }, [token, prop] as [string, string])
const sameColor = (a: string, b: string): boolean => {
  const num = (s: string): number[] => (s.match(/[\d.]+/g) ?? []).map(Number)
  const [r1, g1, b1, a1 = 1] = num(a); const [r2, g2, b2, a2 = 1] = num(b)
  return Math.abs(r1 - r2) <= 2 && Math.abs(g1 - g2) <= 2 && Math.abs(b1 - b2) <= 2 && Math.abs(a1 - a2) <= 0.02
}
const cs = (page: Page, sel: string, props: string[]): Promise<Record<string, string>> =>
  page.locator(sel).first().evaluate((el, keys) => {
    const c = getComputedStyle(el)
    return Object.fromEntries(keys.map((k) => [k, (c as unknown as Record<string, string>)[k]]))
  }, props)
const rect = (page: Page, sel: string): Promise<DOMRect.JSON> => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().toJSON())

test('T58：市场浮层外壳 / 输入组 / Index sources ActionBar', async () => {
  test.setTimeout(300_000)
  const env = await launchMarket()
  try {
    const { page } = env
    expect(await page.evaluate(() => devicePixelRatio), 'DPR=2 前提').toBe(2)
    await page.setViewportSize({ width: 1280, height: 800 })

    // ---- 外壳：与设置同 rect、.5px secondary、scrim 分主题、r14 ----
    await openMarket(page)
    await expect(market(page).locator('#sand-plugins-modal-heading')).toHaveText('Connect Apps')
    await page.waitForTimeout(350) // 入场动画 200ms scale .97→1——等完再量 rect
    let mk = await rect(page, '[data-market]')
    let mkc = await cs(page, '[data-market]', ['borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'backgroundColor'])
    await page.screenshot({ path: join(OUT, 'market-list-light.png') })
    await page.locator('.pb-market .sand-plugins-dialog__close').click()
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await page.locator('.sand-settings-dialog').waitFor({ state: 'visible', timeout: 10_000 })
    const st = await rect(page, '.sand-settings-dialog')
    await page.keyboard.press('Escape')
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs((mk[k] as number) - (st[k] as number)), `市场与设置 rect.${k} 相等（±1）`).toBeLessThanOrEqual(1)
    }
    expect(mkc.borderTopWidth, '市场边 .5px').toBe('0.5px')
    expect(sameColor(mkc.borderTopColor, await tokenOf(page, '--sand-border-secondary-translucent', 'color')), `市场边色 secondary（${mkc.borderTopColor}）`).toBe(true)
    expect(mkc.borderTopLeftRadius, '市场 r14').toBe('14px')
    expect(sameColor(mkc.backgroundColor, await tokenOf(page, '--sand-bg-chrome', 'backgroundColor')), `市场底 chrome（${mkc.backgroundColor}）`).toBe(true)
    // scrim：亮 .502 / 暗 .698
    await openMarket(page)
    const scrimAlpha = (): Promise<number> => page.evaluate(() => {
      const el = document.querySelector('div:has(> .pb-market)') ?? document.body
      const a = getComputedStyle(el).backgroundColor.match(/([\d.]+)\)/)
      return a === null ? -1 : Number(a[1])
    })
    expect(await scrimAlpha(), 'scrim 亮 alpha≈.502（Chromium 序列化 0.5）').toBeGreaterThanOrEqual(0.49)
    expect(await scrimAlpha(), 'scrim 亮 alpha 上限').toBeLessThanOrEqual(0.52)
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300)
    expect(await scrimAlpha(), 'scrim 暗 alpha≈.698').toBeGreaterThanOrEqual(0.68)
    expect(await scrimAlpha(), 'scrim 暗 alpha 上限').toBeLessThanOrEqual(0.71)
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(300)

    // ---- 搜索框（input-group）：容器 1px tertiary + bg input-field；input 无边无底 13/18 ----
    const search = '.pb-market__tools .pb-search'
    await expect(page.locator(search)).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()) // 开场自动聚焦搜索框（升 primary）——静息量测先 blur
    await page.waitForTimeout(250)
    let s = await cs(page, search, ['borderTopWidth', 'borderTopColor', 'backgroundColor', 'borderTopLeftRadius'])
    expect(s.borderTopWidth, '搜索容器 1px').toBe('1px')
    expect(sameColor(s.borderTopColor, await tokenOf(page, '--sand-border-tertiary-translucent', 'color')), `搜索容器边 tertiary（${s.borderTopColor}）`).toBe(true)
    expect(sameColor(s.backgroundColor, await tokenOf(page, '--cursor-bg-input-field', 'backgroundColor')), `搜索底 input-field（${s.backgroundColor}）`).toBe(true)
    let inp = await cs(page, `${search} input`, ['borderTopWidth', 'backgroundColor', 'fontSize', 'lineHeight'])
    expect(inp.borderTopWidth, 'input 本体无边').toBe('0px')
    expect(inp.backgroundColor, 'input 本体无底').toBe('rgba(0, 0, 0, 0)')
    expect(inp.fontSize, 'input 13').toBe('13px')
    expect(inp.lineHeight, 'input lh 18').toBe('18px')
    // focus 容器边升 primary
    await page.locator(`${search} input`).click()
    s = await cs(page, search, ['borderTopColor'])
    expect(sameColor(s.borderTopColor, await tokenOf(page, '--sand-border-primary-translucent', 'color')), `focus 容器边 primary（${s.borderTopColor}）`).toBe(true)
    await page.screenshot({ path: join(OUT, 'market-search-focus-light.png') })
    await page.keyboard.press('Escape') // 关搜索 focus——但也会关浮层，下面重开
    await openMarket(page)

    // ---- 行（有源有结果）：图标 40 / Connect 26·pill·12 / check 12 ----
    await expect.poll(async () => page.locator('[data-market-list] .pb-row').count(), { timeout: 20_000 }).toBeGreaterThan(0)
    const icon = await rect(page, '[data-market-list] .pb-row .pb-mono')
    expect(Math.abs(icon.width! - 40), '行图标 40（±1.5，DPR2 亚像素）').toBeLessThanOrEqual(1.5)
    expect(Math.abs(icon.height! - 40), '行图标 40（±1.5）').toBeLessThanOrEqual(1.5)
    // 可连接条目不在默认首屏（当前页 50 条全 browse）——搜索定位（market.spec ③ filesystem 先例）
    await page.locator('[data-market-search]').fill('filesystem')
    await expect(page.locator('[data-market-list] .pb-row button[data-action="connect"]').first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(400)
    const cc = await cs(page, '[data-market-list] .pb-row button[data-action="connect"]', ['height', 'borderRadius', 'fontSize'])
    expect(Math.abs(Number.parseFloat(cc.height) - 26), 'Connect 高 26（±1）').toBeLessThanOrEqual(1)
    expect(Number.parseFloat(cc.borderRadius), 'Connect pill r≥13').toBeGreaterThanOrEqual(13)
    expect(cc.fontSize, 'Connect label 12').toBe('12px')

    // ---- Index sources：输入组同款 + Add 居中对齐 + Done ActionBar 右对齐不裁 ----
    const openSources = async (): Promise<void> => {
      await page.locator('[data-action="your-plugins"]').click() // T71：入口收进 Installed 底部（T71b 补改）
      await page.locator('[data-action="manage-index-sources"]').click()
      await page.locator('[data-index-sources]').waitFor({ state: 'visible', timeout: 5_000 })
    }
    await page.locator('[data-market-search]').fill('') // 清搜索回列表，再进 sources
    await page.waitForTimeout(400)
    await openSources()
    const urlInput = '.pb-market__add .pb-search'
    s = await cs(page, urlInput, ['borderTopWidth', 'borderTopColor', 'backgroundColor'])
    expect(s.borderTopWidth, 'URL 容器 1px').toBe('1px')
    expect(sameColor(s.borderTopColor, await tokenOf(page, '--sand-border-tertiary-translucent', 'color')), `URL 容器边 tertiary（${s.borderTopColor}）`).toBe(true)
    expect(sameColor(s.backgroundColor, await tokenOf(page, '--cursor-bg-input-field', 'backgroundColor')), 'URL 底 input-field').toBe(true)
    // Add 中心 y 与输入组中心 y 差 ≤1
    const addRect = await rect(page, '[data-action="add-index"]')
    const inputRect = await rect(page, urlInput)
    expect(Math.abs((addRect.y! + addRect.height! / 2) - (inputRect.y! + inputRect.height! / 2)), 'Add 与输入组垂直居中（±1）').toBeLessThanOrEqual(1)
    // Done 不被裁（Sol 修法口径）：与真实裁切祖先（.pb-market__scroll，overflow:auto）比上下边界，
    // 且右对齐内容区——每态都断言，rect.height==computed.height 单独一条（不再当「不裁」的证据）
    const done = page.locator('[data-action="sources-done"]')
    const doneIntact = async (tag: string): Promise<void> => {
      await expect(done, `${tag}：Done 可见`).toBeVisible()
      const d = await rect(page, '[data-action="sources-done"]')
      const sc = await page.locator('.pb-market__scroll').evaluate((el) => el.getBoundingClientRect().toJSON())
      expect(d.bottom!, `${tag}：Done 底不超出滚动容器（${d.bottom} ≤ ${sc.bottom}）`).toBeLessThanOrEqual(sc.bottom! + 1)
      expect(d.top!, `${tag}：Done 顶不越出容器顶（${d.top} ≥ ${sc.top}）`).toBeGreaterThanOrEqual(sc.top! - 1)
      const dcs = await cs(page, '[data-action="sources-done"]', ['height'])
      expect(Math.abs(d.height! - Number.parseFloat(dcs.height!)), `${tag}：rect 高 = computed 高`).toBeLessThanOrEqual(1)
      const src = await page.locator('.pb-market__sources').evaluate((el) => el.getBoundingClientRect().toJSON())
      expect(Math.abs(d.right! - (src.right! - 20)), `${tag}：Done 右对齐内容区（±2）`).toBeLessThanOrEqual(2)
      // T58b：字心对钮心（钮内标签下沉是 T51 原毛病——外框断言看不见）
      const labelMid = await page.locator('[data-action="sources-done"]').first().evaluate((el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        const tr = range.getBoundingClientRect()
        return (tr.top + tr.bottom) / 2
      })
      expect(Math.abs(labelMid - (d.top! + d.height! / 2)), `${tag}：字心对钮心 ≤1（实测偏 ${Math.round((labelMid - (d.top! + d.height! / 2)) * 10) / 10}px）`).toBeLessThanOrEqual(1)
      // T58b：高 ≥ kit md 规定值（--cursor-height-base=28）
      expect(d.height!, `${tag}：Done 高 ≥28`).toBeGreaterThanOrEqual(28)
    }

    // ---- 态 1：初始（两源桩环境；空态/一条态构造不出——SDK setIndexes 在 env 源下无效，
    // 见回执存疑项「Remove/addIndex 失效」，Sol 三态口径在此环境下取两态硬断言 + Remove 行为记录）----
    const n0 = await page.locator('[data-index-item]').count()
    expect(n0, 'T71b：初始=内置+两 env 源（恰 3）').toBe(3)
    await doneIntact(`初始(${n0})`)

    // ---- 态 2：校验错误（重复添加——唯一稳定拒绝路）+ 错误色（Sol MAJOR1 配套）----
    await page.locator('[data-index-input]').fill(env.server.localUrl)
    await page.locator('[data-action="add-index"]').click()
    const refused = page.locator('[data-index-refused]')
    await expect(refused).toBeVisible({ timeout: 10_000 })
    await expect(refused).toContainText('twice')
    const errCs = await cs(page, '[data-index-refused]', ['color'])
    // token 带规则同款 fallback（--sand-danger 在色板未定义——probe 裸 var 会继承黑）
    const danger = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--sand-danger, #b3261e)'
      probe.style.display = 'none'
      document.body.append(probe)
      const v = getComputedStyle(probe).color
      probe.remove()
      return v
    })
    expect(sameColor(errCs.color, danger), `拒绝提示 danger 色（${errCs.color} ≈ ${danger}，规则曾被未闭合注释吞掉——Sol MAJOR1）`).toBe(true)
    await doneIntact('错误')
    await page.screenshot({ path: join(OUT, 'sources-two-error-light.png') }) // T58c：env 段两源+错误——真名

    // env 段两源现状截图（不再冒名 empty/one——真三态在生产段；env 源由 market-source.yml
    // 启动写死，Remove 对它无效属配置层设计，见 LEARNINGS）
    await page.screenshot({ path: join(OUT, 'sources-two-light.png') })

    // ---- 暗色一轮（外壳 + sources）----
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'sources-two-dark.png') }) // T58c：env 段两源暗色——真名
    await page.locator('[data-action="sources-done"]').click() // Done=回列表视图（浮层仍开）
    await page.locator('[data-market-list]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'market-list-dark.png') })
    mkc = await cs(page, '[data-market]', ['borderTopColor', 'backgroundColor'])
    expect(sameColor(mkc.borderTopColor, await tokenOf(page, '--sand-border-secondary-translucent', 'color')), `暗色市场边 secondary（${mkc.borderTopColor}）`).toBe(true)
    expect(sameColor(mkc.backgroundColor, await tokenOf(page, '--sand-bg-chrome', 'backgroundColor')), '暗色市场底 chrome').toBe(true)
  } finally {
    await env.stop()
  }
})

test('T58b：Index sources 真三态（生产缺省路径——无 env 源、独立 HOME）', async () => {
  test.setTimeout(300_000)
  // market.spec :289 同款生产启动：patch=fakeOverlay、不设 P2SDK_MARKET_SOURCE_INDEXES——
  // add/remove 走真实存储（env 源钉死只发生在 market-source.yml 注入的测试环境）
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t58b-prod-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: HIDPI })
  try {
    const page = shell.page
    expect(await page.evaluate(() => devicePixelRatio), 'DPR=2 前提').toBe(2)
    await page.setViewportSize({ width: 1280, height: 800 }) // 与第一 test 同基准（默认窗 600 高会溢出属滚动域）
    await waitProductReady(page)
    await pill(page).click()
    await expect(market(page)).toBeVisible()
    // T71：无源空态不可达（内置目录恒在）；Index sources 入口收进 Installed 视图底部
    await expect(page.locator('[data-market-list] .pb-row').first()).toBeVisible({ timeout: 20_000 })
    await page.locator('[data-action="your-plugins"]').click()
    await page.locator('[data-action="manage-index-sources"]').click()
    await page.locator('[data-index-sources]').waitFor({ state: 'visible', timeout: 5_000 })
    await expect(page.locator('[data-index-item]')).toHaveCount(1) // T71b：仅内置（恒在，无空态可造）
    await expect(page.locator('[data-index-item="builtin:hivebot-picks"] [data-builtin-source]')).toBeVisible()
    await doneIntactProd(page, '仅内置')
    await page.screenshot({ path: join(OUT, 'sources-builtin-only-light.png') })
    // 加一条（真 server）→ 一条态
    const server = await serveMarket()
    try {
      // T58c 诊断结论：IndexSources mount/enterMarket 重拉窗内 fill 会被受控重渲拉回空（onChange 丢）——
      // toPass 整体重试 fill+验证（竞争窗口有限，重试必赢），赢后 150ms 双验再提交
      const fillStable = async (url: string): Promise<void> => {
        // fill 程序化赋值会被重渲窗拉回（T58c 诊断）——type 逐键真事件 + toPass 重试闭环
        // （偶发键入窗内被打断值不齐，重试整个 click/clear/type 直到值齐；竞争窗口有限必收敛）
        const input = page.locator('[data-index-input]')
        await expect(async () => {
          await input.click({ timeout: 5_000 })
          await input.fill('', { timeout: 5_000 })
          await input.pressSequentially(url, { delay: 3 })
          await expect(input).toHaveValue(url, { timeout: 1_500 })
        }).toPass({ timeout: 45_000 })
      }
      await fillStable(server.realUrl)
      await page.locator('form[data-index-add]').evaluate((f) => f.requestSubmit())
      await expect(page.locator('[data-index-item]')).toHaveCount(2, { timeout: 20_000 }) // 内置+新加
      await doneIntactProd(page, '内置+一条')
      await page.screenshot({ path: join(OUT, 'sources-one-light.png') })
      // 一条态下重复同 URL = 错误态
      await fillStable(server.realUrl)
      await page.locator('form[data-index-add]').evaluate((f) => f.requestSubmit())
      await expect(page.locator('[data-index-refused]')).toContainText('twice', { timeout: 10_000 })
      await page.screenshot({ path: join(OUT, 'sources-error-light.png') }) // T58c：生产段一条+twice 错误——真名
      await doneIntactProd(page, '错误')
      // 删回空态（生产路径 Remove 真实生效）。T58c 时间线判定：列表卸载 → Empty 块挂载间有 ~200ms
      // 中间帧（items=0 empty=false，内容塌短 Done 相对位置瞬移——607.5/478.5 越界读数即此窗采样），
      // 终态 done.bottom=412 ≤ scroll.bottom=448 从未越界。等 Empty 挂载（终态标记）再断言，不放宽阈值。
      await page.locator('[data-action="remove-index"]').first().click()
      await expect(page.locator('[data-index-item]')).toHaveCount(1, { timeout: 20_000 }) // T71b：删用户源回仅内置（终态=恰 1）
      await expect(page.locator('[data-index-item="builtin:hivebot-picks"]')).toBeVisible()
      await doneIntactProd(page, '删后仅内置')
    } finally {
      await server.close()
    }
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

/** 生产段 doneIntact（env 段同款口径，独立函数避免依赖 env 段闭包）。 */
async function doneIntactProd(page: import('playwright/test').Page, tag: string): Promise<void> {
  const done = page.locator('[data-action="sources-done"]')
  await expect(done, `${tag}：Done 可见`).toBeVisible()
  const d = await done.first().evaluate((el) => el.getBoundingClientRect().toJSON())
  const sc = await page.locator('.pb-market__scroll').evaluate((el) => el.getBoundingClientRect().toJSON())
  expect(d.bottom!, `${tag}：Done 底不超滚动容器`).toBeLessThanOrEqual(sc.bottom! + 1)
  expect(d.top!, `${tag}：Done 顶不越容器顶`).toBeGreaterThanOrEqual(sc.top! - 1)
  expect(Math.abs(d.height! - 28) <= 1 || d.height! >= 28, `${tag}：Done 高 ≥28`).toBe(true)
  const src = await page.locator('.pb-market__sources').evaluate((el) => el.getBoundingClientRect().toJSON())
  expect(Math.abs(d.right! - (src.right! - 20)), `${tag}：Done 右对齐内容区`).toBeLessThanOrEqual(2)
  const labelMid = await done.first().evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const tr = range.getBoundingClientRect()
    return (tr.top + tr.bottom) / 2
  })
  expect(Math.abs(labelMid - (d.top! + d.height! / 2)), `${tag}：字心对钮心 ≤1`).toBeLessThanOrEqual(1)
}
