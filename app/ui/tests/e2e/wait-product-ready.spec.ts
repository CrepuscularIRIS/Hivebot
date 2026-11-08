// T7be：裸壳兜底竞态——先等引导打开（钉成必现）再调 waitProductReady，引导必须被撤掉、主区可点。
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { api, PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

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

// T7beb：D10c1 双 main 机制钉死——立即调 helper（不先等引导打开）重复 10 次，
// 直接数持久层顶层会话（滤 subagent 与子会话），比批跑等 strict violation 更直接。
test('T7beb: 立即调 helper ×10 → 每轮恰 1 个顶层会话、侧栏一个 New chat', { timeout: 300_000 }, async () => {
  for (let i = 1; i <= 10; i++) {
    const home = sandboxHome(`T7beb${i}`)
    const dataDir = join(home, 'data')
    const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
    let shell: Awaited<ReturnType<typeof launchShell>> | undefined
    try {
      shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
      const page = shell.page
      await waitProductReady(page) // 立即调——不先等引导打开（D10c1 场景：shell1 路径）
      await page.reload()
      await waitProductReady(page)
      const rows = await page.locator('.sand-agent-item[aria-label="New chat"]').count()
      expect(rows, `第${i}轮 New chat 行数`).toBe(1)
      const listed = await api<{ items?: Array<{ sessionId: string; origin?: string; parentSessionId?: string }> }>(page, 'session/list', { _request: {} })
      expect(listed.ok, `第${i}轮 session/list ok`).toBe(true)
      const top = (listed.value?.items ?? []).filter((it) => it.origin !== 'subagent' && !it.parentSessionId)
      expect(top.length, `第${i}轮顶层会话恰 1（滤 subagent/子会话）`).toBe(1)
    } finally {
      await shell?.stop()
      await rt.stop()
      rmSync(dataDir, { recursive: true, force: true })
    }
  }
})
