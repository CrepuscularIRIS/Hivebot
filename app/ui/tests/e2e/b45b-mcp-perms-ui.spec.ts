// B45b e2e：连接器详情页 per-tool 四档权限（market rig：pretrip-mcp 预装）。
// 链路闭环：详情页 Tool permissions 区 Set blocked → <dataDir>/mcp-permissions.json 落盘
// →（sdk 侧同文件）shell-ask 四档先裁 → mcp 调用被拒（deny，无审批卡）。
// shortcut: 本 spec 验 UI→文件→judge 数据链；「审批卡不弹」的运行时终验靠 deny 转录断言。
import { expect, test, type Page } from 'playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket, tempBundle, type MarketServer } from '../support/connectors.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

const PRE_INSTALLED = 'pretrip-mcp'

interface Env { server: MarketServer; rt: SdkRuntime; shell: ShellLaunch; page: Page; dataDir: string; stop(): Promise<void> }

async function launch(): Promise<Env> {
  const server = await serveMarket()
  // B45b 关键：sdk dataDir 必须与 shell 的 PBOTS_DATA_DIR 同根（main 写 = sdk 读）。
  // shellChildEnv 把 PBOTS_DATA_DIR 设为 $shellHome/data —— 先建 shellHome 再串。
  const shellHome = tmkdir('b45b-shell-')
  const dataDir = join(shellHome, 'data')
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: tmkdir('b45b-ws-'),
    dataDir,
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const pre = (await rt.client.call('pluginManager/installBundle', { spec: tempBundle(PRE_INSTALLED), options: { enabled: false } })) as { application?: string }
  if (pre.application === 'failed') throw new Error(`pre-install failed: ${JSON.stringify(pre).slice(0, 300)}`)
  const shell = await launchShell({ home: shellHome, env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  await waitProductReady(shell.page)
  return { server, rt, shell, page: shell.page, dataDir, async stop() { await shell.stop(); await rt.stop(); await server.close() } }
}

const openMarket = async (page: Page): Promise<void> => {
  await page.locator('.sand-agents-sidebar__plugins').click()
  await expect(page.locator('[data-market]')).toBeVisible()
}

test('B45b：详情页四档 Set → 落盘 → 行回显', async () => {
  test.setTimeout(120_000)
  const env = await launch()
  try {
    const { page } = env
    await openMarket(page)
    // 已装区 → pretrip 详情
    const row = page.locator(`[data-market-list] [data-kind="installed"]`).first()
    await row.locator('.pb-row__open').click()
    const detail = page.locator(`[data-market-detail="${PRE_INSTALLED}"]`)
    await expect(detail).toBeVisible()
    // Tool permissions 区在（B45b 新挂）
    const perm = detail.locator('[data-tool-permissions]')
    await expect(perm).toBeVisible()
    await expect(perm.locator('h4')).toHaveText('Tool permissions')
    // Set blocked
    await perm.locator('[data-perm-tool-input]').fill('read_file')
    await perm.locator('[data-perm-tier-select]').first().selectOption('blocked')
    await perm.locator('[data-action="perm-add"]').click()
    await expect(perm.locator('[data-perm-rows] [data-perm-row="read_file"]')).toBeVisible({ timeout: 10_000 })
    // 文件落盘（main 写的 <dataDir>/mcp-permissions.json）
    const file = JSON.parse(readFileSync(join(env.dataDir, 'mcp-permissions.json'), 'utf8')) as {
      servers: Record<string, { tools: Record<string, string> }>
    }
    const sid = Object.keys(file.servers)[0]
    expect(file.servers[sid]?.tools?.read_file).toBe('blocked')
    // 行内改档 always_allow → 文件同步
    await perm.locator('[data-perm-row="read_file"] [data-perm-tier-select]').selectOption('always_allow')
    await expect.poll(() => {
      const after = JSON.parse(readFileSync(join(env.dataDir, 'mcp-permissions.json'), 'utf8')) as typeof file
      return after.servers[sid]?.tools?.read_file
    }, { timeout: 10_000 }).toBe('always_allow')
    // 空工具名 Set 禁用（防误写空键）
    await expect(perm.locator('[data-action="perm-add"]')).toBeDisabled()
  } finally {
    await env.stop()
  }
})
