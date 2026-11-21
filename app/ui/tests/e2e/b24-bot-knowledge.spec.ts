// B24 e2e：bot 设置面 Skills——Add custom skill 编辑器（create）+ Edit（update）走 main 侧新 op。
// 0.78.1 规格（chunk-bot-manage-knowledge-Cciz9jNH）：EBwmRD 'Add custom skill'、MdpSC1 'New skill'、
// Uqy4he 'Editing skill'、6YtxFj 'Name'、NxHkkp 'Instructions'、GBQjiV 'Add skill'、tfDRzk 'Save'、
// MEJR0H 'Use at least one letter (a–z) or number'。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B24：Add custom skill 创建 + Edit 更新', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b24-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.locator('.sand-agent-item').first().click({ timeout: 30_000 })
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await expect(pane.locator('[data-skills-heading]')).toBeVisible({ timeout: 10_000 })

    // Add custom skill → 编辑器（0.78.1 EBwmRD/MdpSC1）
    await pane.locator('[data-action="skill-new"]').click()
    const editor = pane.locator('[data-skills-editor]')
    await expect(editor).toBeVisible({ timeout: 5_000 })
    expect(await editor.textContent()).toContain('New skill')
    // 空名：save 禁用（0.78.1 Ce 校验——按钮 disabled 而非点击报错）
    await editor.locator('[data-skills-editor-body]').fill('Deploy the service to staging.')
    await expect(editor.locator('[data-action="skill-save"]')).toBeDisabled()
    // 填名创建（GBQjiV 'Add skill'）
    await editor.locator('[data-skills-editor-name]').fill('deploy-service')
    await editor.locator('[data-action="skill-save"]').click()
    await expect(editor).toBeHidden({ timeout: 10_000 })
    const row = pane.locator('[data-skill-row="deploy-service"]')
    await expect(row).toBeVisible({ timeout: 10_000 })
    expect(await row.textContent()).toContain('Deploy the service to staging.')

    // Edit → 编辑器（Uqy4he）锁名 + 预填 body（NxHkkp 'Instructions'）
    await row.locator('[data-action="skill-edit"]').click()
    const editor2 = pane.locator('[data-skills-editor]')
    await expect(editor2).toBeVisible({ timeout: 5_000 })
    expect(await editor2.textContent()).toContain('Editing skill')
    expect(await editor2.locator('[data-skills-editor-body]').inputValue()).toContain('Deploy the service to staging.')
    await editor2.locator('[data-skills-editor-body]').fill('Deploy to production instead.')
    await editor2.locator('[data-action="skill-save"]').click()
    await expect(editor2).toBeHidden({ timeout: 10_000 })
    await expect(pane.locator('[data-skill-row="deploy-service"]')).toContainText('Deploy to production instead.', { timeout: 10_000 })
  } finally { await shell.stop(); await rt.stop() }
})
