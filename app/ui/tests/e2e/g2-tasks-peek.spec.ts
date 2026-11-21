// G2 e2e：tasks 岛 peek 卡（1.1.0 §3.1）——island 语义标记+Escape/外点关闭+peek 卡类。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('G2: tasks 岛 peek 卡语义', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('g2-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // island 语义标记（1.1.0 data-tasks-peek-island/count）
    const island = page.locator('[data-tasks-peek-island]')
    await expect(island).toBeVisible()
    const countBtn = island.locator('[data-tasks-peek-count]')
    await expect(countBtn).toHaveAttribute('aria-expanded', 'false')

    // 点开 → peek 卡（clip 动画类+island aria-expanded=true）
    await countBtn.click()
    const card = page.locator('[data-tasks-peek-card]')
    await expect(card).toBeVisible()
    await expect(countBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(card).toHaveClass(/sand-task-board--peek/)

    // Escape 关闭（TAt 语义）
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
    await expect(countBtn).toHaveAttribute('aria-expanded', 'false')

    // 重开 → 外点（island/card 之外）关闭
    await countBtn.click()
    await expect(card).toBeVisible()
    await page.locator('.sand-prompt-shell').click({ position: { x: 20, y: 20 } })
    await expect(card).toBeHidden()
  } finally {
    await rt.stop()
  }
})
