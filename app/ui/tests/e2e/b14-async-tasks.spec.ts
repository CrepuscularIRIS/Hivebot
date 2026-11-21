// B14 e2e：右键 bot 行 → Show async tasks → AsyncTasksPanel 开（空态不崩）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B14：async tasks 面板打开不崩（空态）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b14-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 主 bot 右键 → Show async tasks
    const row = page.locator('.sand-agent-item[data-active="true"]').first()
    await row.click({ button: 'right' })
    const item = page.locator('[role="menuitem"]', { hasText: 'Show async tasks' })
    await expect(item).toBeVisible({ timeout: 5_000 })
    await item.click()
    // 面板出现（view.tsx:83 aside.sand-async-tasks-panel）
    const panel = page.locator('aside.sand-async-tasks-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })
  } finally { await shell.stop(); await rt.stop() }
})
