// T75：全应用一套字体栈——设置/市场/建 bot/命令面板/菜单各面全部可见文字元素的
// computed fontFamily === --cursor-font-family-sans（icon font 排除）；字号不动（三锚点）。
import { expect, test, type Page } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { join } from 'node:path'
const OUT = '/home/lingxufeng/bot/work/ui-quality/evidence/T75'

const snap2 = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: join(OUT, `${name}.light.png`) })
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `${name}.dark.png`) })
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(300)
}

const norm = (v: string): string => v.replace(/\s+/g, ' ').trim().replace(/, /g, ',').replace(/'/g, '"')
/** 面内全部可见文字元素的 fontFamily 集合（排除 icon font 与无文字元素）。 */
const fontsOf = (page: Page, sel: string): Promise<{ offenders: string[]; sawText: boolean }> =>
  page.locator(sel).first().evaluate((root) => {
    const want = (() => { const d = document.createElement('div'); d.style.font = 'inherit'; d.style.fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--cursor-font-family-sans'); d.style.display = 'none'; document.body.append(d); const v = getComputedStyle(d).fontFamily; d.remove(); return v })()
    const w = want.replace(/\s+/g, ' ').trim().replace(/, /g, ',')
    const offenders = new Set<string>()
    let sawText = false
    for (const el of [root, ...root.querySelectorAll('*')] as Element[]) {
      const style = getComputedStyle(el)
      if (style.fontFamily.includes('cursor-icons')) continue
      const text = (el as HTMLElement).textContent ?? ''
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      if (!ownText && text.trim() === '') continue
      sawText = true
      const f = style.fontFamily.replace(/\s+/g, ' ').trim().replace(/, /g, ',')
      if (f !== w) offenders.add(`${(el as HTMLElement).tagName}.${String((el as HTMLElement).className).slice(0, 30)} => ${f}`)
    }
    return { offenders: [...offenders], sawText }
  })

test('T75：各面字体栈统一 + 字号不变锚点', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t75-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: ['--force-device-scale-factor=2'] })
  try {
    const page = shell.page
    await waitProductReady(page)
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2)

    // ---- 设置 ----
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await expect(page.locator('.sand-settings-panel')).toBeVisible()
    const set = await fontsOf(page, '.sand-settings-panel')
    expect(set.sawText).toBe(true)
    expect(set.offenders, `设置面字体不一致：${set.offenders.join(' | ')}`).toEqual([])
    await snap2(page, 'settings')
    const h2set = await page.locator('.sand-settings-panel h2').first().evaluate((el) => getComputedStyle(el).fontSize)
    // ---- 市场（外壳容器）----
    await page.locator('.sand-settings-panel__close').click()
    await page.locator('.sand-agents-sidebar__plugins').click()
    await expect(page.locator('[data-market]')).toBeVisible()
    const mk = await fontsOf(page, '[data-market]')
    expect(mk.sawText).toBe(true)
    expect(mk.offenders, `市场面字体不一致：${mk.offenders.join(' | ')}`).toEqual([])
    await snap2(page, 'market')
    const h2mk = await page.locator('#sand-plugins-modal-heading').evaluate((el) => getComputedStyle(el).fontSize)
    // 审补：市场详情面（description/版本/按钮等）
    await page.locator('[data-market-list] .pb-row .pb-row__open').first().click()
    await expect(page.locator('[data-market-detail]')).toBeVisible()
    const mkd = await fontsOf(page, '[data-market-detail]')
    expect(mkd.sawText, '详情面有可见文字').toBe(true)
    expect(mkd.offenders, `市场详情字体不一致：${mkd.offenders.join(' | ')}`).toEqual([])
    const back = page.locator('[data-action="market-back"]')
    if (await back.count() > 0) await back.click()
    // ---- 建 bot 对话框 ----
    await page.locator('.pb-market .sand-plugins-dialog__close').click()
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeVisible()
    const nb = await fontsOf(page, 'dialog[data-dialog="new-bot"]')
    expect(nb.sawText).toBe(true)
    expect(nb.offenders, `建 bot 对话框字体不一致：${nb.offenders.join(' | ')}`).toEqual([])
    await snap2(page, 'new-bot')
    const nameInput = await page.locator('dialog[data-dialog="new-bot"]').getByRole('textbox', { name: 'Bot name' }).evaluate((el) => getComputedStyle(el).fontSize)
    await page.keyboard.press('Escape')
    // ---- 命令面板 + 账户菜单 ----
    await page.click('button[aria-label="Search"]')
    await expect(page.locator('.sand-command-palette')).toBeVisible()
    const cp = await fontsOf(page, '.sand-command-palette')
    expect(cp.offenders, `命令面板字体不一致：${cp.offenders.join(' | ')}`).toEqual([])
    await page.keyboard.press('Escape')
    await page.click('button[aria-label="Account"]')
    const menu = await fontsOf(page, '[role="menu"]')
    expect(menu.offenders, `账户菜单字体不一致：${menu.offenders.join(' | ')}`).toEqual([])
    await page.keyboard.press('Escape')
    // 审补：侧栏 section 右键菜单（Rename/Move/Delete）
    await page.locator('[data-context-menu-trigger]').first().click({ button: 'right' })
    await expect(page.locator('[data-component="menu-popup"]')).toBeVisible()
    const cm = await fontsOf(page, '[data-component="menu-popup"]')
    expect(cm.sawText, '右键菜单有可见文字').toBe(true)
    expect(cm.offenders, `右键菜单字体不一致：${cm.offenders.join(' | ')}`).toEqual([])
    await page.keyboard.press('Escape')
    // 审补：composer 输入区（可编辑体继承面）
    const inputF = await page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]').evaluate((el) => getComputedStyle(el).fontFamily.replace(/\s+/g, ' ').trim())
    const wantF = await page.evaluate(() => { const d = document.createElement('div'); d.style.fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--cursor-font-family-sans'); d.style.display = 'none'; document.body.append(d); const v = getComputedStyle(d).fontFamily.replace(/\s+/g, ' ').trim(); d.remove(); return v })
    expect(inputF, 'composer 输入区字体=token').toBe(wantF)

    // ---- 字号不变锚点（T76 的事不在此动）----
    expect(h2set, '设置 h2 17px').toBe('17px')
    expect(h2mk, '市场 h2 15px').toBe('15px')
    expect(nameInput, '建 bot 名字输入 15px').toBe('15px')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
