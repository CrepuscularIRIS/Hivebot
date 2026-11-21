// B7 e2e：bot 设置面 Knowledge 区——Learnings（skills 只读列表）+ Routines（空态 onAsk 引导）。
// 1.1.0 规格（re-botmanage）：Learnings 卡片 wqxglO、Approve/Reject=Z7ZXbT/1t/NnN（本实现无审批=只读降级）；
// Routines section dmYV6f、「New routine」kFvfud→StuxPK「Set up a routine: 」走 onAsk。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, textCall, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const editor = (page: import('playwright/test').Page) => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

test('B7：Learnings 只读列表 + Routines 空态引导', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b7-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 打开主 bot 的 info pane（照 skills-picker.spec:29-31 模板）：点行选中 → View agent settings
    await page.locator('.sand-agent-item').first().click({ timeout: 30_000 })
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    // Learnings 区（B7.1）：区头 + 只读列表（skills）或空态
    await expect(pane.locator('[data-learnings-heading]')).toBeVisible({ timeout: 10_000 })
    // Routines 区（B7.2）：空态引导可见
    await expect(pane.locator('[data-routines-heading]')).toBeVisible({ timeout: 10_000 })
    const askBtn = pane.locator('button', { hasText: 'Set up a routine' }).first()
    await expect(askBtn).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: 'test-output/PAB/b7-knowledge-pane.png' })
    // onAsk（原版语义）：点击 → 直接向 bot 发「Set up a routine: 」消息（由 bot 对话创建）
    await askBtn.dispatchEvent('click')
    await expect(page.locator('.sand-message[data-role="user"]').last()).toContainText('Set up a routine', { timeout: 10_000 })
  } finally { await shell.stop(); await rt.stop() }
})
