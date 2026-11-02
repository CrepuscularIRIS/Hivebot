// T-18（REVIEW-P2最终收尾 R2/R4，真实 registry）：上游 AgentPresetRegistry
// 的 register() 激活失败不抛错、只把失败留在 record.broken（repos/
// deepseek-harness packages/preset/agent-preset-registry src/index.ts:97-136），
// 所以 p2temp 必须在 register 之后检查 broken：
//   a. 缺 name 的 patch 行（SDK 读层不校验行形状，上游 entryListProblem 拒绝）
//      → p2temp/preset.ensure 抛 p2temp/preset-broken，不返回「成功」id；
//   b. 修复已装 bundle 的 patch 后，同 recipe（同内容 id）重试走完整路径
//      重新注册成功；
//   c. 在该 preset 下 createWithConnectors 能建 session（真实 retain() 不再
//      报 agent-preset/invalid，证明真的激活了）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { launchRuntime } from '../support/runtime.ts'
import { BUNDLE_NAME, MARKET_YML, writeBundleFixture } from '../market/support.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// CONTRACT §3.1 formula (src/p2temp/preset-id.mjs), inlined because importing
// src/p2temp/* from a vitest worker would re-measure it in vite coordinates
// (T-11② coverage split; the module is measured raw in dsh subprocesses).
const expectedId = (agentPreset: string, connectors: string[]): string =>
  `p2temp-${createHash('sha256')
    .update(JSON.stringify([agentPreset, [...new Set(connectors)].sort()]))
    .digest('hex').slice(0, 12)}`

it('T-18②: broken preset is not cached — ensure fails loud, retry after fixing the patch re-registers the same id', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'p2sdk-t18-'))
  // The healthy fixture first, so its generated (machine-absolute) patch
  // content can be written back later as "the fixed connector".
  const bundleDir = writeBundleFixture(join(scratch, 'demo-mcp'))
  const patchFile = join(bundleDir, 'cordis.patch.yml')
  const healthyPatch = readFileSync(patchFile, 'utf8')
  // Break it: the insert row keeps the SDK-readable shape but loses "name",
  // which the real registry's entryListProblem rejects at activation.
  writeFileSync(patchFile, `${JSON.stringify([{ insert: [{ id: 'demo-mcp' }] }])}\n`)

  // market.yml is the patch that inserts the p2temp service itself (same
  // reason connector-restart.test.ts boots with it); no market index needed —
  // the bundle installs from the local directory spec.
  const rt = await launchRuntime({ env: { P2SDK_PATCH: MARKET_YML } })
  try {
    const install = await rt.client.call('pluginManager/installBundle', {
      spec: bundleDir,
      options: { enabled: false },
    })
    if (install?.application === 'failed' || install?.error) {
      throw new Error(`installBundle failed: ${JSON.stringify(install).slice(0, 2000)}`)
    }
    const request = { request: { agentPreset: 'standard', connectors: [BUNDLE_NAME] } }

    // a. First ensure hits the real registry: register resolves with a broken
    //    record; p2temp must surface it, not return a success id.
    await expect(rt.client.call('p2temp/preset.ensure', request)).rejects.toThrow(/p2temp\/preset-broken/)

    // b. Fix the INSTALLED bundle's patch under the profile (the path
    //    readConnectorRows reads), then retry the same recipe.
    const installedPatch = join(rt.home, 'profiles', 'web', 'node_modules', BUNDLE_NAME, 'cordis.patch.yml')
    expect(existsSync(installedPatch), `installed patch found at ${installedPatch}`).toBe(true)
    writeFileSync(installedPatch, healthyPatch)
    const ensured = await rt.client.call('p2temp/preset.ensure', request)
    expect(ensured.presetId).toBe(expectedId('standard', [BUNDLE_NAME]))

    // c. The re-registered preset actually activates: session creation runs
    //    the real retain(), which throws agent-preset/invalid on a broken id.
    const workspace = join(rt.home, 'workspace')
    mkdirSync(workspace, { recursive: true })
    const session = await rt.client.call('p2temp/session.createWithConnectors', {
      request: { connectors: [BUNDLE_NAME], agentPreset: 'standard', cwd: workspace },
    })
    expect(typeof session.sessionId).toBe('string')
  } finally {
    await rt.stop()
  }
}, 120_000)
