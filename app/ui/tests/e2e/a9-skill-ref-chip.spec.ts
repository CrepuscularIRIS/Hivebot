// A9 e2e：skill 引用发送 → transcript user 行渲染 workflow chip（0.78.1 markcode skill pill 同构）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('A9: skill 引用透传 → user 消息渲染 workflow chip', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('a9-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // 直接以 shim 契约注入带 skill 标记的 user 消息（发送链 composer→标记在单测已锁；
    // e2e 锁端到端渲染：session/prompt 文本带标记 → transcript 剥出 → chip 上屏）。
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId?: string }> }
    const sid = list.items?.[0]?.sessionId
    expect(sid).toBeTruthy()
    const text = `\u2063[skill:${encodeURIComponent('deploy-service')}@${encodeURIComponent('Deploy the service')}]\u2063\nplease run it`
    await rt.client.call('session/prompt', { request: { requestId: `a9-${Date.now()}`, sessionId: sid, mode: 'queue', content: [{ type: 'text', text }] } })

    const chip = page.locator('.sand-transcript-row .sand-workflow-chip[data-type="workflow-reference"]', { hasText: 'Deploy the service' })
    await expect(chip).toBeVisible({ timeout: 20_000 })
    // 余文本也在（chip 外的 please run it）
    const row = chip.locator('xpath=ancestor::*[contains(@class,"sand-transcript-row")][1]')
    await expect(row).toContainText('please run it')
    // 标记行本体不可见（\u2063 不可见字符已剥）
    await expect(row).not.toContainText('\u2063')
  } finally {
    await rt.stop()
  }
})
