// T90：`:` emoji 补全 + `@` Bot 提及——列表出现→选中进编辑器→发出去文本，三段全断言。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/evidence/T90'

test('T90：emoji 补全与 @ 提及（列表/插入/发出/无匹配/Esc）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t90-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, extraArgs: ['--force-device-scale-factor=2'] })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 建两个 bot（UI 对话框——roster 必经 shim；RPC 直连建的 session 不进 shim roster，探针实证）
    const mkUi = async (name: string): Promise<void> => {
      await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
      const dlg = page.locator('dialog[data-dialog="new-bot"]')
      await expect(dlg).toBeVisible()
      await dlg.getByRole('textbox', { name: 'Bot name' }).fill(name)
      await dlg.locator('[data-action="create-bot"]').click()
      await expect(dlg).toHaveCount(0, { timeout: 60_000 })
    }
    await mkUi('Alpha-T90')
    await mkUi('Beta-T90')
    await page.waitForTimeout(2_500) // adapter.refresh 异步窗口（scope effect → listAgents → snapshot ready）
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

    // ---- ① :smile 补全 ----
    // 单会话跨加载窗：首拍 catalog loading 返 []——先打 : 等面板出现（load 完成后 query 不变不重触发，
    // 故 poll 的是 hidden→shown 的 catalog ready 时机由列表首帧空 query 全量呈现），再续打 smile
    await editor.click()
    await page.keyboard.type('hi :', { delay: 10 })
    const emojiBox0 = page.locator('.sand-emoji-listbox')
    await expect(emojiBox0, '空 query 面板出现（catalog ready 后由后续字符触发）').toBeVisible({ timeout: 15_000 })
    await page.keyboard.type('smile', { delay: 15 })
    const emojiBox = page.locator('.sand-emoji-listbox')
    await expect(emojiBox, 'emoji 列表出现').toBeVisible({ timeout: 10_000 })
    const firstOption = emojiBox.locator('.sand-emoji-option').first()
    await expect(firstOption).toBeVisible()
    const firstUnicode = await firstOption.innerText()
    expect(firstUnicode.trim().length, '首项含 unicode 字符').toBeGreaterThan(0)
    await page.screenshot({ path: join(OUT, 'emoji-list.light.png') })
    await page.keyboard.press('Tab')
    await expect(editor, '选中后 :smile 消失、unicode 进编辑器').toContainText(/[^:\s]/)
    const editorText = await editor.innerText()
    expect(editorText, '编辑器含首项 unicode').toContain([...firstUnicode].find((ch) => ch.codePointAt(0)! > 0x2000) ?? firstUnicode)
    expect(editorText).not.toContain(':smile')

    // ---- ② @Be 提及 Beta ----
    await page.keyboard.type(' @Be', { delay: 10 })
    const mentionBox = page.locator('.sand-mention-listbox')
    await expect(mentionBox, 'mention 列表出现').toBeVisible({ timeout: 10_000 })
    await expect(mentionBox, '列表含 Beta-T90').toContainText('Beta-T90')
    await page.screenshot({ path: join(OUT, 'mention-list.light.png') })
    await page.keyboard.press('Tab')
    await expect(page.locator('span[data-type="mention"]', { hasText: 'Beta-T90' }), 'mention 块插入').toBeVisible({ timeout: 5_000 })

    // ---- ③ 发送：用户气泡含 @Beta-T90 ----
    await page.click('button[aria-label="Send message"]')
    await expect(page.locator('.sand-message[data-role="user"]').last(), '用户气泡含 @Beta-T90').toContainText('@Beta-T90', { timeout: 30_000 })

    // ---- ④ 无匹配 + Esc ----
    await editor.click()
    await page.keyboard.type(' @zzzz', { delay: 10 })
    await expect(page.locator('.sand-mention-listbox'), 'No matches 文案').toContainText('zzzz', { timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.sand-mention-listbox'), 'Esc 后列表关').toBeHidden({ timeout: 5_000 })
    expect(await editor.innerText(), '输入框文本保留').toContain('zzzz')

    // ---- 暗色截图（列表重开） ----
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('再试 :smile', { delay: 10 })
    await expect(page.locator('.sand-emoji-listbox')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: join(OUT, 'emoji-list.dark.png') })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
