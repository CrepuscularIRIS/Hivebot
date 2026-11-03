// U-23 / U-26 D5 E2E（P5-54 起跑在 renderer-grok 上，按语义重写）：0.18 没有旧 P-C 市场页（浏览 / 搜索 / 分页 / 三分类 /
// 安装进度 /「用它新建」预勾），这部分 UI 承载记 REPORT-P5-54 差异表（交新任务）；D5 的契约主体在新 renderer 的同一条 preload 通道上验：
// real 源 filesystem 经 M1 #15 安装（__pbotsM1 断言 main 收到 enabled === false）→ #4 用 wrapper 建 X → X 在新 renderer 里
// 实调 mcp__…__read_file（审批 dock Allow once → 工具行 done、结果含文件内容）；未勾选的 bot Y 工具表无 mcp__*。
import { expect, test } from 'playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { MARKET_SOURCE_PATCH, serveMarket } from '../support/connectors.ts'
import { FS_PLUGIN, WRAPPER, approveConnectorCall, mcpCall } from '../support/connector-call.ts'
import { PRESETS_PATCH, api, devState, evidenceOut, finalAssistant, openBot, send, textCall, waitProductReady } from '../support/ui.ts'

const HELLO_TEXT = 'u26-d5-connector-evidence'
const PDC_EVIDENCE = evidenceOut('PDC')

/** request/header 工具表（T-03 探针模式，app/sdk market.test.ts requestToolNames 同款）：返回一轮文本回复请求里的工具名。 */
async function requestToolNames(rt: SdkRuntime, sessionId: string): Promise<string[]> {
  rt.writeScriptCalls(sessionId, [textCall(['工具表探针'])])
  const frames: Array<{ type?: string; event?: { type?: string; data?: { header?: { tools?: Array<{ name: string }> } } } }> = []
  const client = rt.client as unknown as {
    follow(sid: string, opts: { assistantStream: boolean }): Promise<AsyncIterable<object> & { cancel(): void }>
  }
  const stream = await client.follow(sessionId, { assistantStream: true })
  const drained = (async () => { for await (const f of stream) frames.push(f as never) })()
  try {
    await rt.client.call('session/prompt', {
      request: { requestId: `u26-probe-${Math.random().toString(16).slice(2, 8)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: '列工具' }] },
    })
    await expect.poll(() => frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end'), { timeout: 30_000 }).toBe(true)
  } finally {
    stream.cancel()
    void drained
  }
  return frames.filter((f) => f.type === 'event' && f.event?.type === 'request/header')
    .flatMap((f) => f.event?.data?.header?.tools?.map((t) => t.name) ?? [])
}

test('D5：filesystem 经 #15 安装（enabled:false）→ #4 建 X → X 在新 renderer 实调 read_file；Y 工具表不含', async () => {
  test.setTimeout(420_000)
  const server = await serveMarket()
  const rt = await launchSdkRuntime({
    patch: `${MARKET_SOURCE_PATCH}:${PRESETS_PATCH}:${fakeOverlayPath()}`,
    cwd: tmkdir('bot-u23-ws-'),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // #15 安装：main 收到的 enabled 恒为 false（__pbotsM1 观测，无新 IPC）；#16 返回 wrapper 名
    const install = await api<{ application?: string }>(page, 'pluginManager/installBundle', { spec: `${FS_PLUGIN}@1.2.29`, options: { enabled: false } })
    expect(install.ok, JSON.stringify(install.error)).toBe(true)
    expect(install.value?.application).not.toBe('failed')
    const m1Installs = await shell.app.evaluate(
      () => (globalThis as unknown as { __pbotsM1?: { installs: Array<{ spec: unknown; enabled: unknown }> } }).__pbotsM1?.installs ?? [],
    )
    expect(m1Installs.filter((i) => i.spec === `${FS_PLUGIN}@1.2.29`), 'D5：main 收到的 enabled === false（+4 精确等值）')
      .toEqual([{ spec: `${FS_PLUGIN}@1.2.29`, enabled: false }])
    const bundles = await api<{ bundles?: Array<{ name: string }> }>(page, 'pluginManager/listBundles', {})
    expect(JSON.stringify(bundles.value)).toContain(WRAPPER)

    // #4：用 wrapper 建 X
    const created = await api<{ sessionId: string }>(page, 'p2temp/session.createWithConnectors', { request: { connectors: [WRAPPER], agentPreset: 'standard' } })
    expect(created.ok, JSON.stringify(created.error)).toBe(true)
    const x = created.value!.sessionId
    expect((await api(page, 'session/rename', { request: { sessionId: x, title: 'D5-X' } })).ok).toBe(true)
    const metaX = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as { recipes: Record<string, { connectors: string[] }> }
    expect(Object.values(metaX.recipes).map((r) => r.connectors), 'X 的 recipe 记 wrapper bundle 名').toContainEqual([WRAPPER])
    await page.reload()
    await waitProductReady(page)
    await openBot(page, 'D5-X')
    await expect.poll(async () => (await devState(page)).views[x]?.preset, { timeout: 20_000 }).toMatch(/^p2temp-/)

    // X 的一轮对话：真实 stdio server 的 read_file → 审批 dock → 工具行 done + 结果（D5 主体）
    const workspace = join(rt.home, 'workspace')
    mkdirSync(workspace, { recursive: true })
    const helloPath = join(workspace, 'hello.txt')
    writeFileSync(helloPath, HELLO_TEXT)
    rt.writeScriptCalls(x, [mcpCall({ path: helloPath }), textCall(['D5 读取完成'])])
    await send(page, '读一下 hello.txt')
    await approveConnectorCall(page, x, HELLO_TEXT)
    await expect(finalAssistant(page).last()).toHaveText('D5 读取完成', { timeout: 30_000 })
    await page.screenshot({ path: join(PDC_EVIDENCE, 'pc-d5-tool-call.png') })

    // Y（主 bot，未勾选）：工具表里没有这个工具
    const y = (await devState(page)).meta.mainBotId!
    const yTools = await requestToolNames(rt, y)
    expect(yTools.filter((n) => n.startsWith('mcp__')), 'Y 工具表不含任何 mcp__ 工具').toEqual([])
  } finally {
    await shell.stop()
    await rt.stop()
    await server.close()
  }
})
