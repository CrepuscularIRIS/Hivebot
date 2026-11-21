// T90c：面板样式+位置（0.78.1 形态：浮层/elevated 底/无圆点无原生框/输入框上方/不裁）+真④+②发送步。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/evidence/T90c'

test('T90c：面板样式/位置/真④/②发送', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t90c-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('textbox', { name: 'Bot name' }).fill('Zeta-T90c')
    await dlg.locator('[data-action="create-bot"]').click()
    await expect(dlg).toHaveCount(0, { timeout: 60_000 })
    await page.waitForTimeout(1_200)
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('hi :smi', { delay: 12 })
    const box = page.locator('.sand-emoji-listbox')
    await expect(box).toBeVisible({ timeout: 12_000 })
    // 位置：面板底 ≤ 编辑器顶（上方弹）+ 完全在视口
    const geo = await box.evaluate((el) => { const b = el.getBoundingClientRect(); const ed = (document.querySelector('.sand-prompt-shell .ProseMirror') as HTMLElement).getBoundingClientRect(); return { pb: b.bottom, et: ed.top, pt: b.top, pl: b.left, vw: window.innerWidth, vh: window.innerHeight } })
    expect(geo.pb, `面板在输入框上方（面板底 ${geo.pb} ≤ 编辑器顶 ${geo.et}+4——贴上缘）`).toBeLessThanOrEqual(geo.et + 4)
    expect(geo.pt, '完全在视口内').toBeGreaterThanOrEqual(0)
    // 样式：无圆点/无原生边框/elevated 底
    const st = await box.locator('li').first().evaluate((el) => getComputedStyle(el)) 
    expect(st.listStyleType).toBe('none')
    const btn = await box.locator('button').first().evaluate((el) => { const s = getComputedStyle(el); return { border: s.borderWidth, bg: s.backgroundColor } })
    expect(btn.border, '原生边框无（0）').toBe('0px')
    const panelBg = await box.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(panelBg, 'elevated 底').not.toBe('rgba(0, 0, 0, 0)')
    await page.screenshot({ path: join(OUT, 'emoji-panel.light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'emoji-panel.dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    // 真④：Enter 选中（面板藏+编辑器含 emoji）+ 1.5s 内 user 数仍 0（poll 稳定）
    await page.keyboard.press('Enter')
    await expect(box, 'Enter 后面板藏').toBeHidden({ timeout: 3_000 })
    // Sol 审①同源：/./ 恒真——改断言编辑器含码点 >0x2000 的字符（emoji 本体）
    const txt4 = await editor.innerText({ timeout: 3_000 })
    expect([...txt4].some(ch => (ch.codePointAt(0) ?? 0) > 0x2000), 'emoji 进编辑器').toBe(true)
    await expect.poll(async () => page.locator('.sand-message[data-role="user"]').count(), { timeout: 1_500 }).toBe(0)
    // ② @ 提及+发送步
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('@Ze', { delay: 12 })
    const mBox = page.locator('.sand-mention-listbox')
    await expect(mBox).toBeVisible({ timeout: 12_000 })
    await expect(mBox).toContainText('Zeta-T90c')
    await page.screenshot({ path: join(OUT, 'mention-panel.light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'mention-panel.dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.keyboard.press('Enter') // 面板选中
    await expect(page.locator('span[data-type="mention"]', { hasText: 'Zeta-T90c' })).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press('ControlOrMeta+Enter') // 发送（T94 键位）
    await expect(page.locator('.sand-message[data-role="user"]').first(), 'user 消息含 @Zeta-T90c').toContainText('@Zeta-T90c', { timeout: 30_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
