import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { createBots, PRESETS_PATCH } from '../support/ui.ts'

const shot = async (page: import('playwright/test').Page, theme: 'light' | 'dark', state: 'added' | 'pick', pane: import('playwright/test').Locator): Promise<void> => {
  await page.emulateMedia({ colorScheme: theme })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `test-output/T7b/skills-${state}.${theme}.png` })
  void pane
}

test('截图四张', { timeout: 300_000 }, async ({ page }) => {
  const home = sandboxHome('T7bS')
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
    const ui = shell.page
    await expect(ui.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(ui.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })
    await expect(ui.locator('.sand-agent-item [data-grok-state]').first()).toHaveAttribute('data-grok-state', 'idle', { timeout: 30_000 })
    const [idA, idB] = await createBots(ui, [{ title: 'T7b-A' }, { title: 'T7b-B' }])
    const wsA = join(dataDir, 'workspaces', idA)
    mkdirSync(join(wsA, '.dsh', 'skills', 't7b-flow'), { recursive: true })
    writeFileSync(join(wsA, '.dsh', 'skills', 't7b-flow', 'SKILL.md'), '---\nname: t7b-flow\ndescription: T7b ref flow\n---\nt7b-body\n')
    const itemB = ui.locator('.sand-agent-item[aria-label="T7b-B"]')
    await itemB.click()
    await ui.click('button[aria-label="View agent settings"]')
    const pane = ui.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await expect(pane.locator('[data-skills-heading]')).toBeVisible({ timeout: 15_000 })
    // pick 态（对话框开）
    await pane.locator('[data-action="skills-pick"]').click()
    const dlg = ui.locator('[data-skills-dialog]')
    await expect(dlg).toBeVisible({ timeout: 15_000 })
    await expect(dlg.locator('[data-skill-candidate="t7b-flow"]')).toBeVisible({ timeout: 15_000 })
    mkdirSync('test-output/T7b', { recursive: true })
    await dlg.locator('[data-skill-candidate="t7b-flow"] input[type="checkbox"]').check()
    // T7bc 先红：暗色下按钮字色≠底色
    await ui.emulateMedia({ colorScheme: 'dark' })
    await ui.waitForTimeout(300)
    for (const sel of ['[data-action="skills-add"]', '[data-action="skills-pick"]']) {
      const el = ui.locator(sel).first()
      const color = await el.evaluate((n) => getComputedStyle(n).color)
      const bg = await el.evaluate((n) => getComputedStyle(n).backgroundColor)
      expect(color, `暗色按钮字色≠底色 ${sel}: color=${color} bg=${bg}`).not.toBe(bg)
    }
    for (const t of ['light', 'dark'] as const) {
      await ui.emulateMedia({ colorScheme: t })
      await ui.waitForTimeout(400)
      await ui.screenshot({ path: `test-output/T7b/skills-pick.${t}.png` })
    }
    await dlg.locator('[data-skill-candidate="t7b-flow"] input[type="checkbox"]').uncheck()
    // added 态（勾选+Add 后）
    await dlg.locator('[data-skill-candidate="t7b-flow"] input[type="checkbox"]').check()
    await dlg.locator('[data-action="skills-add"]').click()
    await expect(dlg).toBeHidden({ timeout: 30_000 })
    await expect(pane.locator('[data-skill-row="t7b-flow"]')).toBeVisible({ timeout: 15_000 })
    for (const t of ['light', 'dark'] as const) {
      await ui.emulateMedia({ colorScheme: t })
      await ui.waitForTimeout(400)
      await ui.screenshot({ path: `test-output/T7b/skills-added.${t}.png` })
    }
  } finally {
    await shell?.stop()
    await rt.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }
})
void shot
