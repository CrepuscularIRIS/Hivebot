// T7b（L4-c）：bot 设置 Skills 段 +「Pick from your skills」对话框 e2e。
// 以磁盘为准（enable/disable 真发生），不看列表刷新；参照 work/p9-dsh-integration/ref/skills-ref-notes.md。
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { createBots, PRESETS_PATCH } from '../support/ui.ts'

test('Skills 段：Added 空 → Pick 勾选 Add → 磁盘副本字节等于源 → 移除双清', { timeout: 300_000 }, async ({ page }) => {
  const home = sandboxHome('T7b')
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
    const wsB = join(dataDir, 'workspaces', idB)
    const skillA = join(wsA, '.dsh', 'skills', 't7b-flow')
    mkdirSync(skillA, { recursive: true })
    writeFileSync(join(skillA, 'SKILL.md'), '---\nname: t7b-flow\ndescription: T7b ref flow\n---\nt7b-body\n')

    // 打开 B 的 info pane：点 bot 选中 → 「View agent settings」（照 settings.spec:76）
    const itemB = ui.locator(`.sand-agent-item[aria-label="T7b-B"]`)
    await itemB.click()
    await ui.click('button[aria-label="View agent settings"]')
    const pane = ui.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await expect(pane.locator('[data-skills-heading]')).toBeVisible({ timeout: 15_000 })
    await expect(pane.locator('[data-skills-empty]')).toBeVisible()

    // Pick → 对话框出现候选（来自 A）→ 勾选 → Add → 磁盘生效
    await pane.locator('[data-action="skills-pick"]').click()
    const dlg = ui.locator('[data-skills-dialog]')
    await expect(dlg).toBeVisible({ timeout: 15_000 })
    const row = dlg.locator('[data-skill-candidate="t7b-flow"]')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText('T7b-A')
    await row.locator('input[type="checkbox"]').check()
    await dlg.locator('[data-action="skills-add"]').click()
    await expect(dlg).toBeHidden({ timeout: 30_000 })
    const copied = join(wsB, '.dsh', 'skills', 't7b-flow', 'SKILL.md')
    for (let i = 0; i < 100 && !existsSync(copied); i++) await ui.waitForTimeout(200)
    expect(existsSync(copied), 'B 的磁盘副本存在').toBe(true)
    expect(readFileSync(copied, 'utf8')).toBe(readFileSync(join(skillA, 'SKILL.md'), 'utf8'))

    // 列表出现 → 移除 → 双清（B 副本没了，A 的还在）
    await expect(pane.locator('[data-skill-row="t7b-flow"]')).toBeVisible({ timeout: 15_000 })
    await pane.locator('[data-skill-row="t7b-flow"] [data-action="skill-remove"]').click()
    for (let i = 0; i < 100 && existsSync(copied); i++) await ui.waitForTimeout(200)
    expect(existsSync(copied), 'B 副本已删').toBe(false)
    expect(existsSync(join(skillA, 'SKILL.md')), 'A 的原件还在').toBe(true)
  } finally {
    await shell?.stop()
    await rt.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('250 上限：Add 显示可读提示、磁盘无新增', { timeout: 300_000 }, async ({ page }) => {
  const home = sandboxHome('T7b')
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
    const ui = shell.page
    await expect(ui.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(ui.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })
    await expect(ui.locator('.sand-agent-item [data-grok-state]').first()).toHaveAttribute('data-grok-state', 'idle', { timeout: 30_000 })

    const [idA, idB] = await createBots(ui, [{ title: 'T7b-A2' }, { title: 'T7b-B2' }])
    const wsA = join(dataDir, 'workspaces', idA)
    const wsB = join(dataDir, 'workspaces', idB)
    const src = join(wsA, '.dsh', 'skills', 't7b-flow')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: t7b-flow\ndescription: T7b ref flow\n---\nt7b-body\n')
    const skillsB = join(wsB, '.dsh', 'skills')
    mkdirSync(skillsB, { recursive: true })
    for (let i = 0; i < 250; i++) {
      mkdirSync(join(skillsB, `pad-${i}`), { recursive: true })
      writeFileSync(join(skillsB, `pad-${i}`, 'SKILL.md'), `---\nname: pad-${i}\ndescription: p\n---\npad\n`)
    }

    const itemB = ui.locator(`.sand-agent-item[aria-label="T7b-B2"]`)
    await itemB.click()
    await ui.click('button[aria-label="View agent settings"]')
    const pane = ui.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await pane.locator('[data-action="skills-pick"]').click()
    const dlg = ui.locator('[data-skills-dialog]')
    await expect(dlg).toBeVisible({ timeout: 15_000 })
    await dlg.locator('[data-skill-candidate="t7b-flow"] input[type="checkbox"]').check()
    await dlg.locator('[data-action="skills-add"]').click()
    await expect(dlg.locator('[data-skills-notice]')).toContainText('250', { timeout: 30_000 })
    expect(existsSync(join(skillsB, 't7b-flow')), '磁盘无新增').toBe(false)
  } finally {
    await shell?.stop()
    await rt.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }
})
