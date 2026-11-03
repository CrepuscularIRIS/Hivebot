// U-14 e2e（D10c2 桥级）：真 SDK runtime + 预写 bots.json（上一运行期 #4 编排的形状）
// → 壳启动 → #21 逐个 preset.ensure（真实现）→ 全部 settle 后 ready 闸门开（M1/M2 就绪）；
// 好 recipe live=true（D8 数据源：非只读）、坏 recipe（未装连接器）失败进 failed 不阻断
// （§8-1/D7），failed 进 ready 载荷。fixture 与安装方式来源:
// app/sdk/tests/e2e/connector-restart.test.ts:178-192 + tests/market/support.ts:41-64。
import { expect, test, type ElectronApplication } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'

const SDK_ROOT = resolve(__dirname, '..', '..', '..', 'sdk')
const MARKET_YML = join(SDK_ROOT, 'profile', 'patches', 'market.yml')
const BUNDLE_NAME = '@p2sdk-fixture/demo-mcp'

/** 真 MCP connector fixture（tests/market/support.ts:41-64 同构；绝对路径按本机生成）。 */
function writeBundleFixture(dir: string): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: BUNDLE_NAME,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 1)}\n`)
  const mcpRow = {
    id: 'demo-mcp',
    name: pathToFileURL(join(SDK_ROOT, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')).href,
    config: {
      serverName: 'demo',
      transport: 'stdio',
      command: process.execPath,
      args: [join(SDK_ROOT, 'tests', 'market', 'fixtures', 'mcp-stdio-server.mjs')],
      env: {},
      cwd: '',
      failOnStartupError: true,
    },
  }
  writeFileSync(join(dir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [mcpRow] }])}\n`)
  return dir
}

/** presetIdOf 直接 import SDK 共用模块（CONTRACT §3.1；.mjs 经 file URL 走原生 ESM）。 */
async function loadPresetIdOf(): Promise<(agentPreset: string, connectors: string[]) => string> {
  const mod = (await import(pathToFileURL(join(SDK_ROOT, 'src', 'p2temp', 'preset-id.mjs')).href)) as {
    presetIdOf: (agentPreset: string, connectors: string[]) => string
  }
  return mod.presetIdOf
}

interface Probe {
  outcomes: Array<{ presetId: string; ok: boolean }>
  failed: string[]
  restoreSettledAt: number | null
  gateOpenedAt: number | null
}

/** 轮询 main 侧观察面直到 gate 开（restore settle 且窗口/dsh 就绪；M1/M2 就绪时点）。 */
async function pollRestoreProbe(app: ElectronApplication, timeout = 30_000): Promise<Probe> {
  const deadline = Date.now() + timeout
  for (;;) {
    const probe = await app.evaluate(() => (globalThis as unknown as { __pbotsRestore?: Probe }).__pbotsRestore)
    if (probe !== undefined && probe.gateOpenedAt !== null) return probe
    if (Date.now() >= deadline) throw new Error(`gate did not open in ${timeout}ms: ${JSON.stringify(probe)}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

test('restore：好 recipe ensure 成功 live=true、坏 recipe 失败不阻断 live=false，gate 在 restore settle 后开', async () => {
  const rt: SdkRuntime = await launchSdkRuntime({ patch: `${MARKET_YML}:${fakeOverlayPath()}` })
  try {
    // 预置：装连接器 fixture + 建一个真连接器 bot（上一运行期的状态）
    const install = await rt.client.call('pluginManager/installBundle', {
      spec: writeBundleFixture(join(tmkdir('bot-U-14-fix-'), 'demo-mcp')),
      options: { enabled: false },
    })
    if (install?.application === 'failed' || install?.error) {
      throw new Error(`installBundle failed: ${JSON.stringify(install).slice(0, 2000)}`)
    }
    const cwd = tmkdir('bot-U-14-ws-')
    const { sessionId } = (await rt.client.call('p2temp/session.createWithConnectors', {
      request: { connectors: [BUNDLE_NAME], agentPreset: 'standard', cwd },
    })) as { sessionId: string }

    // 预写 bots.json（restore 的输入；形状 = BotsMetaStore.putRecipe 落盘形状）
    const presetIdOf = await loadPresetIdOf()
    const good = presetIdOf('standard', [BUNDLE_NAME])
    const bad = presetIdOf('standard', ['bot-u-14-gone'])
    const dataDir = tmkdir('bot-U-14-data-')
    writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({
      version: 1,
      mainBotId: null,
      recipes: {
        [good]: { agentPreset: 'standard', connectors: [BUNDLE_NAME] },
        [bad]: { agentPreset: 'standard', connectors: ['bot-u-14-gone'] },
      },
    }))

    const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_DATA_DIR: dataDir } })
    try {
      // ①② restore settle（含失败）→ gate 开：观察面时间线证明先 restore 后 ready
      const probe = await pollRestoreProbe(shell.app)
      expect(probe.outcomes.find((o) => o.presetId === good)?.ok).toBe(true)
      expect(probe.outcomes.find((o) => o.presetId === bad)?.ok).toBe(false)
      expect(probe.failed).toEqual([bad])
      expect(probe.gateOpenedAt).not.toBeNull()
      expect(probe.restoreSettledAt! <= probe.gateOpenedAt!, 'gate 在 restore settle 之后才开').toBe(true)

      // 真 ensure 证据（operator 侧直连，不经 M1 的 p2temp-* 过滤）：内容定 id 已在 registry
      const roster = (await rt.client.call('agentPresets/list', {})) as { presets: Array<{ id: string }> }
      expect(roster.presets.map((p) => p.id)).toContain(good)

      // gate 开后 M1 放行（#9 里还有那个连接器 bot —— D7「另一个 bot 重启后可用」的数据面；
      // session/list 的 wire 壳 {_request} 与 SDK e2e connector-restart.test.ts:212 一致）
      await shell.page.waitForFunction(() => typeof (window as unknown as { pbots?: unknown }).pbots === 'object', undefined, { timeout: 15_000 })
      const list = (await shell.page.evaluate(() =>
        (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<{ ok: boolean; value?: { items?: Array<{ sessionId: string }> } }> } })
          .pbots.api('session/list', { _request: {} }))) as { ok: boolean; value?: { items?: Array<{ sessionId: string }> } }
      expect(list.ok).toBe(true)
      expect(list.value?.items?.map((i) => i.sessionId)).toContain(sessionId)

      // M3 视图：good live=true（D8「重启后仍非只读」的数据源）、bad live=false（§8-1 不毒化）。
      // ready 载荷（gate.status().failedPresets）与这里的 failed 同源，单测已直断言；消费面在 U-23 ③。
      const meta = (await shell.page.evaluate(() =>
        (window as unknown as { pbots: { botsMeta(op: 'get'): Promise<{ ok: boolean; value?: { recipes: Record<string, { live: boolean }> } }> } })
          .pbots.botsMeta('get'))) as { ok: boolean; value?: { recipes: Record<string, { live: boolean }> } }
      expect(meta.ok).toBe(true)
      expect(meta.value?.recipes[good]?.live).toBe(true)
      expect(meta.value?.recipes[bad]?.live).toBe(false)
    } finally {
      await shell.stop()
    }
  } finally {
    await rt.stop()
  }
})
