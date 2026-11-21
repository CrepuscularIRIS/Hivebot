// B33 e2e：SuperAgent 引擎 bundle 叠进 dsh runtime（P2SDK_PATCH 冒号叠加），runtime 激活不炸
// + 主 bot 委派链路（B31 shim 路由）在引擎在场时照常工作。
// rig 模式锚：b31-superagent-router（setMain 钉定+writeScriptCalls+ControlOrMeta+Enter）。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, createBots, composer, textCall } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B33：superagent bundle 激活且主 bot 委派链路照常', async () => {
  test.setTimeout(300_000)
  // superagent patch 叠在 fake overlay 上（P2SDK_PATCH 冒号分隔，start.ts:82 extraPatches）
  const saDir = tmkdir('b33-sa-state-')
  const libIndex = join(__dirname, '..', '..', '..', 'superagent', 'lib', 'index.js')
  const saPatch = join(tmkdir('b33-sa-patch-'), 'superagent.yml')
  writeFileSync(saPatch, `\
- insert:
    - id: dsh-superagent
      name: '${pathToFileURL(libIndex).href}'
      config:
        stateDir: '${saDir}'
`)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: `${fakeOverlayPath()}:${saPatch}`, cwd: tmkdir('b33-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // runtime 仍应答 RPC（bundle 激活未炸 runtime）
    const [main, atlas] = await createBots(page, [{ title: 'B33 Main' }, { title: 'Atlas Worker' }])
    rt.writeScriptCalls(atlas, [textCall(['采集完成：3 条情报'])])
    await page.evaluate(([mainId]) => window.pbotsUi.setMain(mainId), [main])
    await page.evaluate(() => localStorage.setItem('pbots.shim.superagent-router', '1'))
    await page.locator('.sand-agent-item', { hasText: 'B33 Main' }).click({ timeout: 30_000 })
    const editor = composer(page)
    await editor.click()
    await page.keyboard.type('@Atlas Worker 去采集今天的设计情报', { delay: 5 })
    await page.keyboard.press('ControlOrMeta+Enter')
    await page.locator('.sand-agent-item', { hasText: 'Atlas Worker' }).click()
    await expect(page.locator('.sand-message[data-role="user"]').last()).toContainText('去采集今天的设计情报', { timeout: 60_000 })
    await expect(page.locator('.sand-message[data-role="assistant"]', { hasText: '采集完成' })).toBeVisible({ timeout: 60_000 })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
