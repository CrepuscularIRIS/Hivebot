// D2 e2e：自定义 MCP server 表单（0.78.1 custom-mcp-form 锚）——双模式/校验/落盘/回显。
import { expect, test } from 'playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import type { Page } from 'playwright/test'

async function launch(): Promise<{ rt: SdkRuntime; shell: ShellLaunch; page: Page; dataDir: string; stop(): Promise<void> }> {
  const shellHome = tmkdir('d2-shell-')
  const dataDir = join(shellHome, 'data')
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('d2-ws-'), dataDir })
  const shell = await launchShell({ home: shellHome, env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  await waitProductReady(shell.page)
  return { rt, shell, page: shell.page, dataDir, async stop() { await shell.stop(); await rt.stop() } }
}

async function openMarket(page: Page): Promise<void> {
  await page.locator('.sand-agents-sidebar__plugins').click()
  await expect(page.locator('[data-market]')).toBeVisible()
}

test('D2: Add custom server 表单——Form 模式校验+保存落盘+JSON 模式校验', async () => {
  test.setTimeout(120_000)
  const env = await launch()
  try {
    const { page, dataDir } = env
    await openMarket(page)

    // 入口按钮 → 表单开
    await page.locator('[data-action="add-custom-server"]').click()
    const dialog = page.locator('[data-custom-server-dialog]')
    await expect(dialog).toBeVisible()

    // 空名校验（AUlCmR 锚）
    await dialog.locator('[data-action="save-server"]').click()
    await expect(dialog.locator('[data-custom-server-error]')).toHaveText('Name must contain at least one letter or number')

    // Remote HTTPS：填名+空 URL 校验（YH8mbG 锚）
    await dialog.locator('[data-field="name"]').fill('my-remote')
    await dialog.locator('[data-action="save-server"]').click()
    await expect(dialog.locator('[data-custom-server-error]')).toHaveText('The server needs a URL or a command')

    // 填 URL 保存 → 落盘（main mcp-servers.json）
    await dialog.locator('[data-field="url"]').fill('https://example.com/mcp')
    await dialog.locator('[data-action="save-server"]').click()
    await expect(dialog).toBeHidden()
    const saved = JSON.parse(readFileSync(join(dataDir, 'mcp-servers.json'), 'utf8')) as { 'my-remote'?: { type: string; url: string } }
    expect(saved['my-remote']).toEqual({ name: 'my-remote', type: 'remote', url: 'https://example.com/mcp' })

    // JSON 模式：非法 JSON 校验（NjG+x8 锚）
    await page.locator('[data-action="add-custom-server"]').click()
    await dialog.locator('[data-mode="json"]').click()
    await dialog.locator('[data-field="json"]').fill('{bad')
    await dialog.locator('[data-action="save-server"]').click()
    await expect(dialog.locator('[data-custom-server-error]')).toHaveText('Enter valid JSON')

    // JSON 模式：非对象键控（ARSuTm 锚）
    await dialog.locator('[data-field="json"]').fill('[]')
    await dialog.locator('[data-action="save-server"]').click()
    await expect(dialog.locator('[data-custom-server-error]')).toHaveText('The JSON must be an object keyed by the server name')

    // JSON 模式：合法单键保存落盘
    await dialog.locator('[data-field="json"]').fill('{ "my-cmd": { "command": "npx", "args": ["-y", "@example/mcp-server"] } }')
    await dialog.locator('[data-action="save-server"]').click()
    await expect(dialog).toBeHidden()
    const saved2 = JSON.parse(readFileSync(join(dataDir, 'mcp-servers.json'), 'utf8')) as Record<string, unknown>
    expect(Object.keys(saved2).sort()).toEqual(['my-cmd', 'my-remote'])
  } finally {
    await env.stop()
  }
})
