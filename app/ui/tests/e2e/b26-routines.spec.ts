// B26 e2e：Routines 区——dsh schedule/list 投影行 + Pause/Resume toggle（schedule/edit）。
// 0.78.1 规格：ftt 区（heading 'Routines'）+EM 行（toggle+schedule 描述只读）；数据源换 DSH schedule/*。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B26：Routines 投影行 + Pause toggle', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b26-ws-'), readyTimeoutMs: 180_000 })
  // 造一条 dsh scheduled task（typed timing：daily 09:00 UTC）
  const created = await rt.client.call('schedule/create', { request: { title: 'Morning brief', prompt: 'summarize news', timing: { kind: 'daily', daily: { time: '09:00:00', time_zone: 'UTC' } } } }) as { id: string }
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.locator('.sand-agent-item').first().click({ timeout: 30_000 })
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await expect(pane.locator('[data-routines-heading]')).toBeVisible({ timeout: 10_000 })

    // 投影行：title+describeTiming 文案（0.78.1 EM 行）
    const row = pane.locator(`[data-routine-row="${created.id}"]`)
    await expect(row).toBeVisible({ timeout: 10_000 })
    expect(await row.textContent()).toContain('Morning brief')
    expect(await row.textContent()).toContain('Every day at 09:00')

    // Pause（0.78.1 toggle isEnabled；DSH schedule/edit patch.active）
    await row.locator('[data-action="routine-toggle"]').click()
    await expect(row.locator('[data-action="routine-toggle"]')).toHaveText('Resume', { timeout: 10_000 })
    // 服务端真相：schedule/view status=paused
    const v = await rt.client.call('schedule/view', { request: { id: created.id } }) as { status: string }
    expect(v.status).toBe('paused')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
