// U-21 P-A E2E（PAB 验收 ①③ + U-21 ①②④；P5-54 起跑在 renderer-grok 上）：冷启动主 bot 两分支、侧栏渲染（主 bot 首位、无删除入口）、
// 侧栏「New」新建（#3 → 插入并选中 → composer 可输入）、侧栏 280 默认 / 240–400 调宽并持久化、D9/D12② DOM 搜索、
// 主题 token 落地（0.18 运行时主题：--cursor-* 亮暗两套 + body 字体 XVF）、引擎未就绪态存证（与 01-boot.png 并排）。
// 0.18 没有的旧构件（新建对话框的 preset / 模型候选、主 bot 角标、启动封面）记 REPORT-P5-54 差异表，交 P5-55。
import { expect, test } from 'playwright/test'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { EVIDENCE, MAIN_TITLE, botItem, composer, devState, launchProduct } from '../support/ui.ts'

/** D9 / D12② 禁区词（innerText 小写）：删除入口、权限 preset、never 类 preset、账号登录、computer / SSH / billing。 */
const FORBIDDEN = ['delete', '删除', 'sign in', 'log out', 'computer', 'ssh', 'billing', 'permission preset', 'danger-full-access', '始终允许']

test('冷启动 mainBotId 为空 → #3 建默认 bot → #20 patch；主 bot 首位、无删除入口；D9/D12② DOM', async () => {
  const env = await launchProduct()
  try {
    const { page, shell } = env
    const s = await devState(page)
    const main = s.meta.mainBotId!
    expect(s.order[0]).toBe(main)
    const meta = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { mainBotId: string }
    expect(meta.mainBotId).toBe(main)
    await expect(page.locator('.sand-agent-item')).toHaveCount(1)
    await expect(page.locator('.sand-agent-item').first()).toHaveAttribute('aria-label', MAIN_TITLE)
    await expect(page.locator('.sand-agent-item').first()).toHaveAttribute('data-active', 'true')
    // 行菜单（右键）：无 Delete / Duplicate（P5-52 剥掉无实底回调）
    await page.locator('.sand-agent-item').first().click({ button: 'right' })
    const menu = page.locator('[role="menu"]')
    if (await menu.count() > 0) {
      const items = (await menu.innerText()).toLowerCase()
      expect(items).not.toContain('delete')
      expect(items).not.toContain('duplicate')
      await page.keyboard.press('Escape')
    }
    const text = (await page.locator('body').innerText()).toLowerCase()
    for (const word of FORBIDDEN) expect(text, `DOM 不应出现「${word}」`).not.toContain(word)
  } finally {
    await env.stop()
  }
})

test('冷启动 mainBotId 指向已不存在的 session → 重建主 bot 并 patch', async () => {
  const data = tmkdir('bot-u21-data-')
  writeFileSync(join(data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-gone', recipes: {}, bots: {} }))
  const env = await launchProduct({ env: { PBOTS_DATA_DIR: data } })
  try {
    const main = (await devState(env.page)).meta.mainBotId!
    expect(main).toMatch(/^session-/)
    expect(main === 'session-gone').toBe(false)
    expect((JSON.parse(readFileSync(join(data, 'bots.json'), 'utf8')) as { mainBotId: string }).mainBotId).toBe(main)
    expect((await devState(env.page)).order[0]).toBe(main)
  } finally {
    await env.stop()
  }
})

test('侧栏「New」→ 新建对话框 Create：#3 建 bot → 侧栏插入并选中 → composer 可输入；新 bot 有 follow 视图', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    const before = (await devState(page)).order
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await page.getByRole('textbox', { name: 'Bot name' }).fill('NB') // T30：Create 需名字
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click() // P5-57：New 先开新建对话框
    await expect.poll(async () => (await devState(page)).order.length, { timeout: 30_000 }).toBe(before.length + 1)
    const sid = (await devState(page)).order.find((id) => !before.includes(id))!
    await expect(page.locator('.sand-agent-item')).toHaveCount(2)
    await expect(page.locator('.sand-agent-item[data-active="true"]')).toHaveCount(1)
    await expect.poll(async () => (await devState(page)).views[sid]?.cwd ?? null, { timeout: 30_000 }).not.toBeNull()
    await composer(page).click()
    await page.keyboard.type('hello')
    await expect(page.locator('button[aria-label="Send message"]')).toBeVisible()
  } finally {
    await env.stop()
  }
})

test('侧栏 280 默认；拖拽调宽夹紧 240–400；重载后保持', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    const width = (): Promise<number> => page.locator('aside.sand-agents-sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))
    expect(await width()).toBe(280)
    const drag = async (dx: number): Promise<void> => {
      const b = (await page.locator('.sand-sidebar-resize-handle').boundingBox())!
      const y = b.y + b.height / 2 // 0.18 的把手只覆盖侧栏列表区高度（版式残留归 P5-55）
      await page.mouse.move(b.x + b.width / 2, y)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2 + dx, y, { steps: 5 })
      await page.mouse.up()
    }
    await drag(-200)
    await expect.poll(width).toBe(240)
    await drag(400)
    await expect.poll(width).toBe(400)
    await drag(-60)
    await expect.poll(width).toBeGreaterThanOrEqual(338) // 0.18 按「指针 x − 侧栏左缘」取宽，把手中心与右缘差几 px
    const dragged = await width()
    expect(dragged).toBeLessThanOrEqual(342)
    await page.reload()
    await expect(botItem(page, MAIN_TITLE)).toBeVisible({ timeout: 60_000 })
    await expect.poll(width).toBe(dragged) // 持久化（clientPersistence）
  } finally {
    await env.stop()
  }
})

// D12③：P5-55 起色板 = 0.78.1（overrides/p5-55-palette.css，gen-tokens.py 产物，压过 0.18 运行时主题），XVF / XVF Mono 以 0.78.1
// 同文 @font-face 注册；正文字体栈按 0.78.1 gate sand_xvf_typeface 缺省关 = 系统栈（与对照台 0.78.1 实测一致）。
test('主题落地：0.18 运行时主题装 --cursor-* 亮暗两套且随系统切换', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    const probe = (): Promise<Record<string, string>> => page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      return Object.fromEntries(['--cursor-bg-editor', '--cursor-text-primary', '--cursor-stroke-tertiary', '--cursor-bg-sidebar', '--cursor-text-secondary']
        .map((n) => [n, cs.getPropertyValue(n).trim()]))
    })
    const seen: Record<string, Record<string, string>> = {}
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      seen[mode] = await probe()
      for (const [name, value] of Object.entries(seen[mode]!)) expect(value, `${mode} ${name}`).not.toBe('')
    }
    // 亮暗两套确实不同（运行时主题按 resolved 换整张表，不是只换 data-theme）
    expect(seen.light!['--cursor-bg-editor']).not.toBe(seen.dark!['--cursor-bg-editor'])
    expect(seen.light!['--cursor-text-primary']).not.toBe(seen.dark!['--cursor-text-primary'])
    // P5-55：0.78.1 色板落地（几项 0.78.1 独有值，0.18 是 #f7f7f7 / #141414 / #fcfcfc）
    expect(seen.light!['--cursor-text-primary']).toBe('#1c1c1c')
    const sand = (n: string): Promise<string> => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), n)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-light')
    expect(await sand('--sand-bg-sidebar')).toBe('#f5f5f5')
    expect(await sand('--sand-fill-bubble-user')).toBe('#1c1c1cff')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    expect(await sand('--sand-bg-sidebar')).toBe('#0e0e0e')
    // XVF / XVF Mono 已注册（0.78.1 同文 @font-face）
    expect(await page.evaluate(() => [...document.fonts].map((f) => f.family.replace(/"/g, '')))).toEqual(expect.arrayContaining(['XVF', 'XVF Mono']))
    // 图标字体（cursor-icons，R9 资产）已加载
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('cursor-icons') && f.status === 'loaded'))).toBe(true)
  } finally {
    await env.stop()
  }
})

test('引擎未就绪（未配 dsh）：空壳挂载不崩、无 Sign in / Terms；截图与原版 01-boot.png 并排存证', async () => {
  const shell = await launchShell() // 不配 dsh：M1 不就绪
  try {
    const { page } = shell
    await shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1040, 760) })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('.sand-shell')).toBeVisible({ timeout: 15_000 })
    const text = (await page.locator('body').innerText()).toLowerCase()
    expect(text).not.toContain('sign in')
    expect(text).not.toContain('terms')
    expect(text).not.toContain("couldn't render this")
    await page.evaluate(() => document.fonts.ready)
    mkdirSync(EVIDENCE, { recursive: true })
    await page.screenshot({ path: join(EVIDENCE, 'boot-cover-dark.png') })
    copyFileSync(join(__dirname, '..', '..', '..', '..', 'work', 'p1-re', 'evidence', '01-boot.png'), join(EVIDENCE, 'boot-cover-original-01-boot.png'))
  } finally {
    await shell.stop()
  }
})
