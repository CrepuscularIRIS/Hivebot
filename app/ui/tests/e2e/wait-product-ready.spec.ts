// T7be：裸壳兜底竞态——先等引导打开（钉成必现）再调 waitProductReady，引导必须被撤掉、主区可点。
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

test('T7be：引导已开时 waitProductReady 撤引导、View agent settings 可点', { timeout: 120_000 }, async () => {
  const home = sandboxHome('T7be')
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
    const page = shell.page
    await expect(page.locator('.sand-onboarding')).toHaveCount(1, { timeout: 30_000 }) // 确定性进入竞态态（真首启必开引导）
    await waitProductReady(page)
    await expect(page.locator('.sand-onboarding')).toHaveCount(0)
    await expect(page.locator('button[aria-label="View agent settings"]')).toBeVisible({ timeout: 15_000 })
  } finally {
    await shell?.stop()
    await rt.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }
})
