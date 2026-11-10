// U-15 D1 E2E（PLAN U-15 ①；P5-54 起跑在 renderer-grok 上）：起壳 → 建 bot（选 preset 经 M1 #3；连接器经
// M1 #4 → main 编排，CONTRACT §3.1）→ 0.18 composer 发消息 → 流式条目（live-stream，原位增长）→ assistant/message 定稿替换；
// 两个 bot 的 header.agentPreset === 'p2-alpha' / 'p2-beta'（+4 精确等值）。
// 0.18 新建入口只有默认 preset、没有连接器栏：「选 preset / 勾连接器」改为 M1 直调（REPORT-P5-54 映射表 D1/D8 行）。
// fake LLM：首块后 gate 挂起，gate 文件出现后放行（app/sdk/tests/support/fake/plugin.mjs gateAfterChunk）。
// preset fixture：app/sdk/profile/patches/presets.yml（经 P2SDK_PATCH 与 fake overlay 叠加）；
// connector fixture：app/sdk/tests/market/support.ts writeBundleFixture 的内联最小版（T-15 同款）。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { api, createBots, devState, finalAssistant, openBot, send, streamingRow, waitProductReady } from '../support/ui.ts'

const SDK_ROOT = join(__dirname, '..', '..', '..', 'sdk')
const PRESETS_PATCH = join(SDK_ROOT, 'profile', 'patches', 'presets.yml')
const MARKET_PATCH = join(SDK_ROOT, 'profile', 'patches', 'market.yml') // p2temp 服务由此挂载（src/p2temp）
const BUNDLE_NAME = '@p2sdk-fixture/demo-mcp'

/** app/sdk/tests/market/support.ts writeBundleFixture 的内联最小版（MCP bundle 指向同 fixtures server）。 */
function writeBundleFixture(dir: string): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: BUNDLE_NAME, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 1)}\n`)
  const mcpRow = {
    id: 'demo-mcp',
    name: pathToFileURL(join(SDK_ROOT, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')).href,
    config: {
      serverName: 'demo', transport: 'stdio', command: process.execPath,
      args: [join(SDK_ROOT, 'tests', 'market', 'fixtures', 'mcp-stdio-server.mjs')],
      env: {}, cwd: '', failOnStartupError: true,
    },
  }
  writeFileSync(join(dir, 'cordis.patch.yml'), `${JSON.stringify([{ insert: [mcpRow] }])}\n`)
  return dir
}

const A_PIECES = ['alpha-第一段 ', 'alpha-第二段 ', 'alpha-第三段 ', 'alpha-第四段 ', 'alpha-收尾']
const B_PIECES = ['beta-一 ', 'beta-二 ', 'beta-三 ', 'beta-收尾']

function textChunks(pieces: string[]): object[] {
  return pieces.map((text) => ({ type: 'text-delta', index: 0, text }))
}

/** gate 版 scripted call：首 text-delta 发出后挂起，$P2SDK_HOME/gates/<gateId> 出现后继续（T-01⑧ 通道）。 */
function gatedCall(pieces: string[], gateId: string, paceMs = 200): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      ...textChunks(pieces),
      { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    gateAfterChunk: 1,
    gateId,
    paceMs,
  }
}

function plainCall(pieces: string[], paceMs = 200): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      ...textChunks(pieces),
      { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs,
  }
}

/** 采样流式条目文本直到定稿；返回去重后的文本序列（每项 = 一次增长后的全文）。流式条目必须原位更新（同一 DOM 节点）。 */
async function sampleStreamingGrowth(page: Page, timeoutMs = 20_000): Promise<string[]> {
  const seen: string[] = []
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const streaming = document.querySelector('.sand-transcript-row[data-entry-id="live-stream"] .sand-message-prose')
      const w = window as unknown as { __u21Node?: Element | null }
      if (streaming !== null && w.__u21Node == null) w.__u21Node = streaming
      if (streaming !== null && w.__u21Node !== streaming) throw new Error('streaming entry replaced mid-stream (not in-place)')
      if (streaming === null) w.__u21Node = null
      return { text: streaming?.textContent ?? null }
    })
    if (state.text !== null && state.text !== seen[seen.length - 1]) seen.push(state.text)
    if (state.text === null && seen.length > 0) break // 定稿替换：流式条目消失
    await page.waitForTimeout(40)
  }
  return seen
}

const viewOf = async (page: Page, sid: string) => (await devState(page)).views[sid]

test('D1：建 bot→发消息→流式增量→定稿；两 bot header.agentPreset 精确等值', async () => {
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}` })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    const [sidA, sidB] = await createBots(page, [{ title: 'D1-alpha', preset: 'p2-alpha' }, { title: 'D1-beta', preset: 'p2-beta' }])

    // A（p2-alpha）：挂起流（首块后 gate）
    await openBot(page, 'D1-alpha')
    const gateId = `u15-d1-a-${Date.now()}`
    rt.writeScriptCalls(sidA!, [gatedCall(A_PIECES, gateId)])
    await send(page, '你好 alpha')

    // 挂起态：DOM 有部分文本、没有定稿正文（B D1）
    await expect(streamingRow(page)).toContainText(A_PIECES[0]!.trim(), { timeout: 20_000 })
    expect(await finalAssistant(page).count()).toBe(0)

    // 放行 → 文本 ≥3 步增长（5 段：首段挂起时已在，4 段增长）
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gateId), '')
    const growth = await sampleStreamingGrowth(page)
    expect(growth.length).toBeGreaterThanOrEqual(4) // 初值 + ≥3 步增长
    expect(growth[0]).toContain(A_PIECES[0]!.trim())

    // 定稿替换：流式条目消失，定稿正文 = 全文
    await expect(streamingRow(page)).toHaveCount(0, { timeout: 20_000 })
    await expect(finalAssistant(page).last()).toHaveText(A_PIECES.join(''), { timeout: 20_000 })
    await expect.poll(async () => (await viewOf(page, sidA!))?.turnEnded).toBe(true)

    // B（p2-beta）：直接流式收尾
    await openBot(page, 'D1-beta')
    rt.writeScriptCalls(sidB!, [plainCall(B_PIECES)])
    await send(page, '你好 beta')
    const bGrowth = await sampleStreamingGrowth(page)
    await expect(finalAssistant(page).last()).toHaveText(B_PIECES.join(''), { timeout: 20_000 })
    expect(bGrowth.length).toBeGreaterThanOrEqual(3) // ≥2 增量（派发 ③：≥2 增量 + turn end）
    await expect.poll(async () => (await viewOf(page, sidB!))?.chunkCount).toBeGreaterThanOrEqual(2)
    await expect.poll(async () => (await viewOf(page, sidB!))?.turnEnded).toBe(true)

    // +4：两个 bot 的 follow 快照 header.agentPreset 分别 === 'p2-alpha'、'p2-beta'
    expect((await viewOf(page, sidA!))?.preset).toBe('p2-alpha')
    expect((await viewOf(page, sidB!))?.preset).toBe('p2-beta')
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('U-15 ③ ledger 联调：真实 $events ready 后错 clientId 作答 → pbots/forbidden，dsh 计数不变', async () => {
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath() })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await page.waitForFunction(
      () => (window as unknown as { __pbotsDev?: { events: { clientId?: string } } }).__pbotsDev?.events.clientId !== undefined,
      undefined,
      { timeout: 20_000 },
    )
    // 等 boot 期的 M1 调用（roster 重试 + listBundles）沉降：连续两拍 apiCount 不变再取基线
    const stableApiCount = async (): Promise<number> => {
      let prev = -1
      for (;;) {
        const cur = (await shell.app.evaluate(
          () => (globalThis as unknown as { __pbotsDsh?: { apiCount: number } }).__pbotsDsh?.apiCount,
        )) as number
        if (cur === prev) return cur
        prev = cur
        await page.waitForTimeout(400)
      }
    }
    const before = await stableApiCount()
    const res = await page.evaluate(() =>
      (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<unknown> } }).pbots.api('$events/result', {
        clientId: 'u15-wrong-client-id',
        eventId: 'u15-nonexistent-event',
        outcome: { kind: 'result', value: 'rejected' },
      }),
    )
    expect(res).toEqual({
      ok: false,
      error: {
        code: 'pbots/forbidden',
        message: expect.stringContaining('clientId mismatch'),
        details: {},
      },
    })
    const after = (await shell.app.evaluate(
      () => (globalThis as unknown as { __pbotsDsh?: { apiCount: number } }).__pbotsDsh?.apiCount,
    )) as number
    expect(after).toBe(before) // 拒绝未触达 dsh /api（计数不变）
  } finally {
    await shell.stop()
    await rt.stop()
  }
})

test('建 bot 经 M3（#4 编排→createWithConnectors）：连接器 → recipe 落盘 → header 冻结 p2temp-id', async () => {
  const rt = await launchSdkRuntime({ patch: `${MARKET_PATCH}:${fakeOverlayPath()}` })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page) // 产品就绪 = M1 已通
    // 预装连接器（M1 #15；§2.2 强制 enabled:false；wire 形状 = typert 命名参数 {spec, options}）
    const bundleDir = writeBundleFixture(tmkdir('bot-u15-bundle-'))
    const install = await api<{ application?: string }>(page, 'pluginManager/installBundle', { spec: bundleDir, options: { enabled: false } })
    expect(install.ok).toBe(true)
    expect(install.value?.application).not.toBe('failed')

    // #4：连接器 bot（0.18 无连接器栏，M1 直调；候选校验在 main 编排）
    const created = await api<{ sessionId: string }>(page, 'p2temp/session.createWithConnectors', { request: { connectors: [BUNDLE_NAME] } })
    expect(created.ok, JSON.stringify(created.error)).toBe(true)
    const sid = created.value!.sessionId
    expect((await api(page, 'session/rename', { request: { sessionId: sid, title: 'D1-conn' } })).ok).toBe(true)
    await page.reload()
    await openBot(page, 'D1-conn')

    // header 冻结 p2temp-<id>（T-15① 同判据）；recipe 在 main 的 bots.json
    const botsJson = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as {
      recipes: Record<string, { agentPreset: string; connectors: string[] }>
    }
    expect(Object.values(botsJson.recipes)).toEqual([{ agentPreset: 'standard', connectors: [BUNDLE_NAME] }])
    const presetId = Object.keys(botsJson.recipes)[0]
    expect(presetId).toMatch(/^p2temp-/)
    // 页面 follow 快照的 header id = 落盘 recipe 的 key（同一 presetIdOf）
    await expect.poll(async () => (await viewOf(page, sid))?.preset, { timeout: 30_000 }).toBe(presetId)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
