// U-15 D1 E2E（PLAN U-15 ①）：起壳 → 建 bot（选 preset，经 M1；连接器路径经 M1 #4 → main 编排，
// CONTRACT §3.1）→ 发消息 → 流式气泡（assistant-stream chunk）→ assistant/message 定稿替换；
// 两个 bot 的 header.agentPreset === 'p2-alpha' / 'p2-beta'（+4 精确等值）。
// fake LLM：首块后 gate 挂起，gate 文件出现后放行（app/sdk/tests/support/fake/plugin.mjs gateAfterChunk）。
// preset fixture：app/sdk/profile/patches/presets.yml（经 P2SDK_PATCH 与 fake overlay 叠加）；
// connector fixture：app/sdk/tests/market/support.ts writeBundleFixture 的内联最小版（T-15 同款）。
import { expect, test, type Page } from 'playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'

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

interface DevBot { sessionId: string; preset: string | null; turnEnded: boolean; chunkCount: number }

const devBots = (page: Page): Promise<DevBot[]> => page.evaluate(() =>
  (window as unknown as { __pbotsDev: { bots: DevBot[] } }).__pbotsDev.bots)

async function waitPresetOptions(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#preset-select') as HTMLSelectElement | null
      return sel !== null && [...sel.options].some((o) => o.value === 'p2-alpha') && [...sel.options].some((o) => o.value === 'p2-beta')
    },
    undefined,
    { timeout: 20_000 },
  )
}

async function createBot(page: Page, preset: string): Promise<string> {
  const before = (await devBots(page)).map((b) => b.sessionId)
  await page.selectOption('#preset-select', preset)
  await page.click('#create-bot')
  await page.waitForFunction(
    (old) => (window as unknown as { __pbotsDev: { bots: DevBot[] } }).__pbotsDev.bots.some((b) => !old.includes(b.sessionId)),
    before,
    { timeout: 20_000 },
  )
  const created = (await devBots(page)).find((b) => !before.includes(b.sessionId))
  return created!.sessionId
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.fill('#composer', text)
  await page.click('#send')
}

/** 采样流式气泡文本直到定稿；返回去重后的文本序列（每项 = 一次增长后的全文）。 */
async function sampleStreamingGrowth(page: Page, timeoutMs = 20_000): Promise<string[]> {
  const seen: string[] = []
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const streaming = document.querySelector('.bubble.streaming')
      const finals = document.querySelectorAll('.bubble.assistant.final').length
      return { text: streaming?.textContent ?? null, finals }
    })
    if (state.text !== null && state.text !== seen[seen.length - 1]) seen.push(state.text)
    if (state.text === null && state.finals > 0) break // 定稿替换：流式气泡消失
    await page.waitForTimeout(40)
  }
  return seen
}

test('D1：建 bot→发消息→流式增量→定稿；两 bot header.agentPreset 精确等值', async () => {
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}` })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitPresetOptions(page)

    // 建 bot A（p2-alpha）：挂起流（首块后 gate）
    const sidA = await createBot(page, 'p2-alpha')
    const gateId = `u15-d1-a-${Date.now()}`
    rt.writeScriptCalls(sidA, [gatedCall(A_PIECES, gateId)])
    await sendMessage(page, '你好 alpha')

    // 挂起态：DOM 有部分文本、没有定稿气泡（B D1）
    await page.waitForSelector('.bubble.streaming', { timeout: 20_000 })
    await expect.poll(async () => page.textContent('.bubble.streaming')).toContain(A_PIECES[0].trim())
    expect(await page.locator('.bubble.assistant.final').count()).toBe(0)

    // 放行 → 文本 ≥3 步增长（5 段：首段挂起时已在，4 段增长）
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gateId), '')
    const growth = await sampleStreamingGrowth(page)
    expect(growth.length).toBeGreaterThanOrEqual(4) // 初值 + ≥3 步增长
    expect(growth[0]).toContain(A_PIECES[0].trim())

    // 定稿替换：流式气泡消失，final 气泡文本 = 全文
    await page.waitForSelector('.bubble.assistant.final', { timeout: 20_000 })
    await page.waitForFunction(() => document.querySelector('.bubble.streaming') === null, undefined, { timeout: 20_000 })
    await expect.poll(async () => page.textContent('.bubble.assistant.final')).toBe(A_PIECES.join(''))

    // turn/end 到达（bot 视图）
    await expect.poll(async () => (await devBots(page)).find((b) => b.sessionId === sidA)?.turnEnded).toBe(true)

    // 建 bot B（p2-beta）：直接流式收尾
    const sidB = await createBot(page, 'p2-beta')
    rt.writeScriptCalls(sidB, [plainCall(B_PIECES)])
    await sendMessage(page, '你好 beta')
    const bFinal = await sampleStreamingGrowth(page)
    await expect.poll(async () => page.locator('.bubble.assistant.final').last().textContent()).toBe(B_PIECES.join(''))
    expect(bFinal.length).toBeGreaterThanOrEqual(3) // ≥2 增量（派发 ③：≥2 增量 + turn end）
    await expect.poll(async () => (await devBots(page)).find((b) => b.sessionId === sidB)?.chunkCount).toBeGreaterThanOrEqual(2)
    await expect.poll(async () => (await devBots(page)).find((b) => b.sessionId === sidB)?.turnEnded).toBe(true)

    // +4：两个 bot 的 header.agentPreset 分别 === 'p2-alpha'、'p2-beta'
    await expect
      .poll(async () => (await devBots(page)).filter((b) => [sidA, sidB].includes(b.sessionId)).map((b) => b.preset).sort())
      .toEqual(['p2-alpha', 'p2-beta'])
    expect(await page.getAttribute(`[data-session="${sidA}"]`, 'data-preset')).toBe('p2-alpha')
    expect(await page.getAttribute(`[data-session="${sidB}"]`, 'data-preset')).toBe('p2-beta')
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

test('建 bot 经 M3（#4 编排→createWithConnectors）：勾选连接器 → recipe 落盘 → header 冻结 p2temp-id', async () => {
  const rt = await launchSdkRuntime({ patch: `${MARKET_PATCH}:${fakeOverlayPath()}` })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await page.waitForFunction(
      () => (document.querySelector('#preset-select') as HTMLSelectElement | null)?.options.length !== undefined
        && (document.querySelector('#preset-select') as HTMLSelectElement).options.length >= 1,
      undefined,
      { timeout: 20_000 },
    )
    // 预装连接器（M1 #15；§2.2 强制 enabled:false；wire 形状 = typert 命名参数 {spec, options}）
    const bundleDir = writeBundleFixture(mkdtempSync(join(tmpdir(), 'bot-u15-bundle-')))
    const install = await page.evaluate(
      (dir: string) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<{ ok: boolean; value?: { application?: string }; error?: { code: string; message: string } }> } }).pbots.api('pluginManager/installBundle', { spec: dir, options: { enabled: false } }),
      bundleDir,
    )
    expect(install.ok).toBe(true)
    expect(install.value?.application).not.toBe('failed')

    // dev-min 的连接器候选来自 boot 时的 listBundles：重载页面拉到已装 bundle
    await page.reload()
    await page.waitForSelector(`input[type="checkbox"][value="${BUNDLE_NAME}"]`, { timeout: 20_000 })
    await page.check(`input[type="checkbox"][value="${BUNDLE_NAME}"]`)

    const before = (await devBots(page)).map((b) => b.sessionId)
    await page.click('#create-bot')
    await page.waitForFunction(
      (old) => (window as unknown as { __pbotsDev: { bots: DevBot[] } }).__pbotsDev.bots.some((b) => !old.includes(b.sessionId)),
      before,
      { timeout: 30_000 }, // #4 编排：校验→presetIdOf→写 recipe→dsh #4（含 MCP 启动）
    )
    const created = (await devBots(page)).find((b) => !before.includes(b.sessionId))!
    // header 冻结 p2temp-<id>（T-15① 同判据）；recipe 在 main 的 bots.json
    await expect.poll(async () => page.getAttribute(`[data-session="${created.sessionId}"]`, 'data-preset')).toMatch(/^p2temp-/)
    const botsJson = JSON.parse(readFileSync(join(shell.home, 'data', 'bots.json'), 'utf8')) as {
      recipes: Record<string, { agentPreset: string; connectors: string[] }>
    }
    const recipes = Object.values(botsJson.recipes)
    expect(recipes).toEqual([{ agentPreset: 'standard', connectors: [BUNDLE_NAME] }])
    const presetId = Object.keys(botsJson.recipes)[0]
    await expect
      .poll(async () => (await devBots(page)).find((b) => b.sessionId === created.sessionId)?.preset)
      .toBe(presetId) // 页面 follow 快照的 header id = 落盘 recipe 的 key（同一 presetIdOf）
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
