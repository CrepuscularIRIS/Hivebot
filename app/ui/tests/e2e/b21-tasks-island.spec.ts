// B21 e2e：Tasks 任务岛——侧栏行可见+点开 workspace 看板+空态文案+运行 worker 行。
// 0.78.1 锚：C5e 侧栏行（icon list-todo）/ ne 看板（h1 Tasks + 空态 qXAOim）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B21：侧栏 Tasks 行 + workspace 看板空态', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b21-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 侧栏 Tasks 行
    const row = page.locator('.sand-tasks-island-row__button')
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toHaveAttribute('aria-label', 'Tasks')
    // 点开看板：h1 Tasks + 空态长文案 + 排序条
    await row.click()
    const board = page.locator('.sand-task-board')
    await expect(board).toBeVisible({ timeout: 5_000 })
    await expect(board.locator('.sand-task-board__title')).toHaveText('Tasks')
    await expect(board.locator('.sand-task-board__empty')).toContainText('each one shows up here as a task')
    await expect(board.locator('.sand-task-board__sort-item').first()).toHaveText('Status')
    // 关闭
    await board.locator('.sand-task-board__close').click()
    await expect(board).toBeHidden({ timeout: 5_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
