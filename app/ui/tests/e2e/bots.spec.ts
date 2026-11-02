// U-21 P-A E2E（PAB 验收 ①③ + U-21 ①②④）：冷启动主 bot 两分支、列表渲染（主 bot 首位 + 标记、无删除入口）、
// 新建对话框全旅程（preset/模型候选 → 创建 → 插主 bot 下 → 选中 → composer 焦点）、侧栏 280 默认 / 240–400 调宽、
// D9/D12② DOM 搜索、token computed-style 断言（≥5 个 --dsw-* 等于 theme-tokens.css）、启动封面与 01-boot.png 并排存证。
import { expect, test } from 'playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { EVIDENCE, createViaDialog, devState, launchProduct } from '../support/ui.ts'

const TOKENS = join(__dirname, '..', '..', '..', '..', 'work', 'p1-re', 'evidence', 'theme-tokens.css')

/** 从 theme-tokens.css 的 [data-theme="cursor-<mode>"] 首块读 --sand-<name> 值。 */
function tokenValue(mode: 'light' | 'dark', name: string): string {
  const css = readFileSync(TOKENS, 'utf8')
  const start = css.indexOf(`[data-theme="cursor-${mode}"] {`)
  const block = css.slice(start, css.indexOf('}', start))
  const m = new RegExp(`--sand-${name}:\\s*([^;]+);`).exec(block)
  if (m === null) throw new Error(`token --sand-${name} missing in ${mode}`)
  return m[1]!.trim()
}

const PAIRS: Array<[string, string]> = [
  ['--dsw-alias-bg-base', 'bg-chrome'],
  ['--dsw-specific-sidebar-fill', 'bg-sidebar'],
  ['--dsw-alias-bg-layer-2', 'bg-pane'],
  ['--dsw-alias-label-primary', 'text-primary'],
  ['--dsw-alias-border-l3', 'border-secondary-translucent'],
  ['--dsw-specific-bubble', 'fill-bubble-user'],
  ['--dsw-alias-button-primary-fill', 'bg-primary'],
]

test('冷启动 mainBotId 为空 → #3 建默认 bot → #20 patch；主 bot 首位带标记、无删除入口；D9/D12② DOM', async () => {
  const env = await launchProduct()
  try {
    const { page, shell } = env
    const s = await devState(page)
    const main = s.meta.mainBotId!
    expect(s.order[0]).toBe(main)
    const meta = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { mainBotId: string }
    expect(meta.mainBotId).toBe(main)
    const first = page.locator('.bot-item').first()
    await expect(first).toHaveAttribute('data-session', main)
    await expect(first).toHaveAttribute('data-main', 'true')
    await expect(first.locator('.corner-main')).toBeVisible()
    await expect(first).toHaveAttribute('aria-selected', 'true')
    // 无删除入口；D9：无权限 preset 入口 / never 类；D12②：无 Sign in / 账号 / computer / SSH / billing
    const text = (await page.locator('body').innerText()).toLowerCase()
    for (const word of ['删除', 'delete', 'sign in', 'account', '账号', 'computer', 'ssh', 'billing', 'permission', 'danger-full-access', '始终允许']) {
      expect(text, `DOM 不应出现「${word}」`).not.toContain(word)
    }
    await page.click('[data-action="new-bot"]')
    await expect(page.locator('[data-preset-option]').first()).toBeVisible({ timeout: 15_000 })
    const dlg = (await page.locator('dialog[data-dialog="new-bot"]').innerText()).toLowerCase()
    expect(dlg).not.toContain('danger-full-access')
    expect(dlg).not.toContain('permission')
  } finally {
    await env.stop()
  }
})

test('冷启动 mainBotId 指向已不存在的 session → 重建主 bot 并 patch', async () => {
  const data = mkdtempSync(join(tmpdir(), 'bot-u21-data-'))
  writeFileSync(join(data, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-gone', recipes: {}, bots: {} }))
  const env = await launchProduct({ env: { PBOTS_DATA_DIR: data } })
  try {
    const main = (await devState(env.page)).meta.mainBotId!
    expect(main).toMatch(/^session-/)
    expect(main === 'session-gone').toBe(false)
    expect((JSON.parse(readFileSync(join(data, 'bots.json'), 'utf8')) as { mainBotId: string }).mainBotId).toBe(main)
    await expect(env.page.locator('.bot-item').first()).toHaveAttribute('data-session', main)
  } finally {
    await env.stop()
  }
})

test('新建对话框全旅程：preset/模型候选 → 创建 → 插主 bot 下并选中 → composer 焦点；Esc 关闭回焦点', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    // Esc 关闭，焦点回「新建 Bot」
    await page.click('[data-action="new-bot"]')
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeVisible()
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toContainText('配置随 bot 固定，换配置需新建')
    await expect(page.locator('[data-preset-option="p2-alpha"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-preset-option="p2-beta"]')).toBeVisible()
    await expect(page.locator('[data-preset-option="standard"] input')).toBeChecked() // 默认项预选
    const models = await page.locator('[data-model-select] option').allTextContents()
    expect(models.length).toBeGreaterThanOrEqual(2) // 跟随默认 + #2 候选
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeHidden()
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-action'))).toBe('new-bot')

    const main = (await devState(page)).meta.mainBotId!
    const sid = await createViaDialog(page, 'p2-alpha', 'p2fake/p2fake')
    const s = await devState(page)
    expect(s.order.slice(0, 2)).toEqual([main, sid]) // 插在主 bot 之下第一位
    await expect(page.locator(`.bot-item[data-session="${sid}"]`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-chat-meta]')).toHaveText('p2-alpha')
    await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-composer'))).toBe(true)
    await expect(page.locator('.pane-notice')).toHaveCount(0) // #5 成功，无「模型未切换」
    await expect.poll(async () => (await devState(page)).views[sid]?.preset).toBe('p2-alpha')
  } finally {
    await env.stop()
  }
})

test('侧栏 280 默认；拖拽调宽夹紧 240–400；重载后保持', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    const width = (): Promise<number> => page.locator('.sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width))
    expect(await width()).toBe(280)
    const drag = async (dx: number): Promise<void> => {
      const b = (await page.locator('.resizer').boundingBox())!
      await page.mouse.move(b.x + b.width / 2, b.y + 200)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + 200, { steps: 5 })
      await page.mouse.up()
    }
    await drag(-200)
    expect(await width()).toBe(240)
    await drag(400)
    expect(await width()).toBe(400)
    await drag(-60)
    expect(await width()).toBe(340)
    await page.reload()
    await page.waitForSelector('.shell', { timeout: 30_000 })
    expect(await width()).toBe(340)
  } finally {
    await env.stop()
  }
})

test('token 落地：≥5 个 --dsw-* computed 值 == theme-tokens.css（亮/暗）；body 字体含 XVF', async () => {
  const env = await launchProduct()
  try {
    const { page } = env
    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
      for (const [dsw, sand] of PAIRS) {
        const got = await page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), dsw)
        expect(got, `${mode} ${dsw}`).toBe(tokenValue(mode, sand))
      }
    }
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('XVF')
    // 席 A 坑：light 用户气泡内正文色单独反转
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-light')
    const bubbleLabel = await page.evaluate(() => {
      const el = document.createElement('div')
      el.setAttribute('data-message-bubble', '')
      document.body.append(el)
      const v = getComputedStyle(el).getPropertyValue('--dsw-alias-label-primary').trim()
      el.remove()
      return v
    })
    expect(bubbleLabel).toBe('#fcfcfc')
  } finally {
    await env.stop()
  }
})

test('启动封面：引擎未就绪时复刻 01-boot.png（无 Sign in / Terms），截图与原版并排存证', async () => {
  const shell = await launchShell() // 不配 dsh：M1 不就绪，封面常驻
  try {
    const { page } = shell
    await shell.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1040, 760) })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('[data-boot-cover]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-boot-cover]')).toContainText('Grok Bot')
    await expect(page.locator('[data-boot-cover]')).toContainText('Your team of always-on Bots that you can give real work to')
    await expect(page.locator('[data-boot-cover] [role="status"]')).toHaveText('正在启动本地引擎…')
    const text = (await page.locator('body').innerText()).toLowerCase()
    expect(text).not.toContain('sign in')
    expect(text).not.toContain('terms')
    await page.evaluate(() => document.fonts.ready)
    mkdirSync(EVIDENCE, { recursive: true })
    await page.screenshot({ path: join(EVIDENCE, 'boot-cover-dark.png') })
    copyFileSync(join(__dirname, '..', '..', '..', '..', 'work', 'p1-re', 'evidence', '01-boot.png'), join(EVIDENCE, 'boot-cover-original-01-boot.png'))
  } finally {
    await shell.stop()
  }
})
