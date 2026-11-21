// T90b：`:` emoji 面板与 `@` 提及——每次都能用（--repeat-each=5 看 flaky 率）。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = '/home/lingxufeng/bot/work/grok-0.79.3-re/evidence/T90b'

test('T90b：emoji 面板每次出+@ 提及+无匹配', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t90b-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // ② 先 UI 建第二个 bot（@ 数据）——再回主 bot 输入
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('textbox', { name: 'Bot name' }).fill('Zeta-T90b')
    await dlg.locator('[data-action="create-bot"]').click()
    await expect(dlg).toHaveCount(0, { timeout: 60_000 })
    await page.waitForTimeout(1_200)
    // ① :smi 面板（每轮新输入——清空重打）
    const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await editor.click()
    await page.keyboard.type('hi :smi', { delay: 12 })
    const emojiBox = page.locator('.sand-emoji-listbox')
    await expect(emojiBox, 'emoji 面板出现').toBeVisible({ timeout: 12_000 })
    const opt = emojiBox.locator('.sand-emoji-option').first()
    await expect(opt).toBeVisible()
    const firstTxt = (await opt.innerText({ timeout: 8_000 })).trim()
    expect(firstTxt.length, '首项非空').toBeGreaterThan(0)
    await page.screenshot({ path: join(OUT, 'emoji-panel.light.png') })
    await page.keyboard.press('Tab') // T94 后 Enter=发送——suggestion 确认键 Tab 先（Enter 在 ④ 测）
    expect([...firstTxt][0]?.codePointAt(0) ?? 0, '首项是 emoji 本体（码点 >0x2000）').toBeGreaterThan(0x2000)
    await expect(editor).toContainText([...firstTxt][0]!, { timeout: 5_000 })  // 首项 emoji 进编辑器（不硬编码族）
    // ② @ 提及
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('@Ze', { delay: 12 })
    const mentionBox = page.locator('.sand-mention-listbox')
    await expect(mentionBox, 'mention 面板出现').toBeVisible({ timeout: 12_000 })
    await expect(mentionBox).toContainText('Zeta-T90b')
    await page.screenshot({ path: join(OUT, 'mention-panel.light.png') })
    await page.keyboard.press('Tab')
    await expect(page.locator('span[data-type="mention"]', { hasText: 'Zeta-T90b' }), '提及块插入').toBeVisible({ timeout: 5_000 })
    // ④ T94 互作：面板打开时 Enter=选中条目（不发送不换行）
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('again :smi', { delay: 12 })
    await expect(emojiBox).toBeVisible({ timeout: 12_000 })
    await page.keyboard.press('Enter')
    // 对齐 t90c 真④：面板关+emoji 进编辑器（Sol 审①：/./ 恒真——换 firstTxt 首码点锚）
    await expect(emojiBox, 'Enter 后面板藏').toBeHidden({ timeout: 3_000 })
    await expect(editor).toContainText([...firstTxt][0]!, { timeout: 3_000 })
    await expect(page.locator('.sand-message[data-role="user"]'), 'Enter 未发送（面板优先）').toHaveCount(0, { timeout: 2_000 })
    // ③ 无匹配
    await editor.click()
    await page.keyboard.type(' @zzzz', { delay: 12 })
    await expect(page.locator('.sand-mention-listbox'), 'No matches').toContainText('zzzz', { timeout: 10_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
