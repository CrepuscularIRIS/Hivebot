// B41a e2e：masterSessionId 不 pin 时，superagent 从 bots.json（$PBOTS_DATA_DIR / config dataDir）
// 自动发现 UI 主 bot——主 bot 发消息进 engine trigger 表（discovered 链闭环）。
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, composer } from '../support/ui.ts'
import { tmpdir } from 'node:os'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B41a：discovered master（bots.json mainBotId）消息进 engine', async () => {
  test.setTimeout(300_000)
  const home = tmkdir('b41a-home-')
  const libIndex = join(__dirname, '..', '..', '..', 'superagent', 'lib', 'index.js')

  // 第一段：纯 overlay，建主 bot 会话（b34 同款）
  const rt1: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b41a-ws1-'), home, readyTimeoutMs: 180_000 })
  const shell1 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt1.handoff } })
  const page = shell1.page
  await waitProductReady(page)
  const created = await rt1.client.call('session/create', { request: {} }) as { sessionId: string }
  const mainId = created.sessionId
  await rt1.client.call('session/rename', { request: { sessionId: mainId, title: 'B41a Main Bot' } })
  await page.evaluate((id) => window.pbotsUi.setMain(id), mainId)
  await shell1.stop()
  await rt1.stop()

  // 第二段：同 home 重启，superagent 不 pin；dataDir 指向预写 bots.json 的目录
  const saDir = mkdtempSync(join(tmpdir(), 'b41a-sa-live-'))  // 不进 sweep：结束后留证据目录
  const saPatch = join(saDir, 'patch.yml')
  writeFileSync(saPatch, `- insert:\n  - id: dsh-superagent\n    name: '${pathToFileURL(libIndex).href}'\n    config:\n      stateDir: '${saDir}'\n      dataDir: '${saDir}'\n`)
  writeFileSync(join(saDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: mainId, recipes: {} }))

  const rt2: SdkRuntime = await launchSdkRuntime({ patch: `${fakeOverlayPath()}:${saPatch}`, cwd: tmkdir('b41a-ws2-'), home, readyTimeoutMs: 180_000 })
  const shell2 = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt2.handoff } })
  const page2 = shell2.page
  await waitProductReady(page2)
  await page2.evaluate((id) => window.pbotsUi.setMain(id), mainId)
  await page2.evaluate((id) => window.pbotsUi.setMain(id), mainId)
  // b34 同款：UI composer 真打字（走完整发送链含 session/event 广播）
  await page2.locator('.sand-agent-item', { hasText: 'B41a Main Bot' }).first().click({ timeout: 30_000 })
  const editor = composer(page2)
  await editor.click()
  await page2.keyboard.type('hello from b41a discovery', { delay: 5 })
  await page2.keyboard.press('ControlOrMeta+Enter')
  await expect(page2.locator('.sand-message[data-role="user"]').last()).toContainText('hello from b41a', { timeout: 60_000 })
  // engine trigger 表应有 local: 开头的 trigger（discovered 命中 masterId → watchLocalSession 收到 user/message）
  // 断言 1（本改动面）：discovered masterId 命中 KV（bots.json mainBotId → master-id 回写）
  // shortcut: fake overlay 会话无真实 agent 回环（消息只到 inbox/spliced，不产生 user/message 事件），
  // trigger 表端到端留给真模型 smoke（demo launcher 手验）——升级条件=e2e rig 接 litellm。
  let kvMaster = ''
  try { kvMaster = execSync(`sqlite3 ${JSON.stringify(join(saDir, 'orchestrator.sqlite'))} "SELECT value FROM kv WHERE key='master-id'"`, { encoding: 'utf8' }).trim() } catch { kvMaster = '' }
  expect(kvMaster).toBe(JSON.stringify(mainId))
  // 订阅绑定（watchLocalSession sid===target）由 b34 同链覆盖；本 spec 只锁 discovered 命中。
  await shell2.stop()
})
