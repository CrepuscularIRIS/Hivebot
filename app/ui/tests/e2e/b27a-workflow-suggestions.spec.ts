// B27a e2e：composer skill 引用面——'/' 触发 Reference a skill 菜单，断言 skill 行（main skills 实底投影）。
// 0.78.1 规格（chunk-prompt-editor-DpaS0rI9）：gtdpBF 'Reference a skill'、ixkTse 'Press Esc to close'；
// hi() items={id,label:slug 化 name,kind:'skill',tag:OZJeTZ,subtitle:description}。
// 我们路径：production adapter workflowRows→entries.filter(category==='automations'&&trigger==null)→'/' listbox。
// suggestion 快照在 setScope（agent 切换）时刷新——0.78.1 是 store 订阅实时失效；我们快照式，
// e2e 里造 skill 后切 agent 再回来触发 refresh（shortcut：见 BRIEF「快照 vs 订阅」节）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { createBots, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B27a：/ 引用面显示 skills（getAgentWorkflows 实底）', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b27a-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 造第二个 bot（切换锚点——setScope→refresh 拉新 skills）
    const [mainId, otherId] = await createBots(page, [{ title: 'B27a-Main' }, { title: 'B27a-Other' }])
    void mainId; void otherId
    // 回 Main 造 skills
    const mainItem = page.locator('.sand-agent-item', { hasText: 'B27a-Main' })
    await mainItem.click({ timeout: 30_000 })
    await page.click('button[aria-label="View agent settings"]')
    const pane = page.locator('.sand-info-pane[data-open]').locator('[data-pane-config]')
    await expect(pane.locator('[data-skills-heading]')).toBeVisible({ timeout: 10_000 })

    for (const [name, desc] of [['deploy-service', 'Deploy the service to staging'], ['review-checklist', 'Check the PR before merge']] as const) {
      await pane.locator('[data-action="skill-new"]').click()
      const editor = pane.locator('[data-skills-editor]')
      await expect(editor).toBeVisible({ timeout: 5_000 })
      await editor.locator('[data-skills-editor-name]').fill(name)
      await editor.locator('[data-skills-editor-body]').fill(desc)
      await editor.locator('[data-action="skill-save"]').click()
      await expect(editor).toBeHidden({ timeout: 10_000 })
      await expect(pane.locator(`[data-skill-row="${name}"]`)).toBeVisible({ timeout: 10_000 })
    }
    // 关设置面（Close details 按钮——header 在 aside 直下，不在 [data-pane-config] 内）→ 切 Other 再回 Main
    await page.locator('.sand-info-pane[data-open] > header button[aria-label="Close details"]').click()
    await expect(pane).toBeHidden({ timeout: 5_000 })
    await page.locator('.sand-agent-item', { hasText: 'B27a-Other' }).click({ timeout: 15_000 })
    await mainItem.click({ timeout: 15_000 })

    // '/' 触发 Reference a skill 菜单（实底行已投影；我们的 listbox 仅空态显标题，非空不渲染 header）
    const composer = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
    await composer.click({ timeout: 15_000 })
    await page.keyboard.type('/', { delay: 20 })
    const listbox = page.locator('.sand-workflow-listbox')
    await expect(listbox).toBeVisible({ timeout: 10_000 })
    const row = listbox.locator('.sand-workflow-option', { hasText: 'deploy-service' })
    await expect(row).toBeVisible({ timeout: 5_000 })
    expect(await row.textContent()).toContain('Deploy the service to staging')
    // 选中 → 插入 workflowReference chip（mousedown 是激活事件——li 内 button）
    await row.locator('button').dispatchEvent('mousedown', { button: 0 })
    await expect(composer).toContainText('deploy-service')
  } finally { await shell.stop(); await rt.stop() }
})
