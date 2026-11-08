// 产品页 E2E 共用：fake LLM 脚本构造（events-replay.test.ts / d1.spec 同款帧形状）+ 产品 UI 操作。
// P5-54 起产品 renderer = renderer-grok（0.18 移植树 + shim）：UI 操作改走 0.18 DOM（.sand-* 类、aria-label），
// 观测面 window.__pbotsDev 由 shim 提供（renderer-grok/shim/src/data.ts DevSurface，与旧 store 同名同形）。
import { expect, type Locator, type Page } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from './tmp-sweep.ts'
import { launchShell, type ShellLaunch, type ShellOptions } from './launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from './sdk-runtime.ts'

export const SDK_ROOT = join(__dirname, '..', '..', '..', 'sdk')
export const PRESETS_PATCH = join(SDK_ROOT, 'profile', 'patches', 'presets.yml')
export const MARKET_PATCH = join(SDK_ROOT, 'profile', 'patches', 'market.yml')
/** e2e 证据目录（U-33）：一律写本 checkout 的 gitignored app/ui/test-output/<sub>/。 */
export const evidenceOut = (sub: string): string => {
  const dir = join(__dirname, '..', '..', 'test-output', sub)
  mkdirSync(dir, { recursive: true })
  return dir
}
export const EVIDENCE = evidenceOut('PAB')

export function textCall(pieces: string[], opts: { gateId?: string; paceMs?: number } = {}): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
      { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: opts.paceMs ?? 120,
    ...(opts.gateId !== undefined ? { gateAfterChunk: 1, gateId: opts.gateId } : {}),
  }
}

export function bashCall(command: string, id: string): object {
  return toolCall('bash', { command, description: 'U-21 approval probe' }, id)
}

/** fake LLM 一次模型调用：单个 tool-call（finish tool-calls → 回合继续）。 */
export function toolCall(name: string, input: object, id: string): object {
  const args = JSON.stringify(input)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: args },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: args } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 10,
  }
}

/** reasoning 块 + 正文（thinking 行用例）。 */
export function reasoningTextCall(reasoning: string, text: string, paceMs = 120): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: reasoning },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text },
      { type: 'block-end', index: 1, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs,
  }
}

export interface Env { rt: SdkRuntime; shell: ShellLaunch; page: Page; stop(): Promise<void> }

/** T7be：置 seen → 整页 reload → 等 __pbotsDev（launchProduct / waitProductReady 共用）。
 * reload 后 gate 在新加载里必判 shell（消「壳已用旧 seen 打开引导、storage 写入关不掉」竞态）。 */
async function ensureOnboardingSeen(page: Page, settle = true): Promise<void> { // T7bec：settle=false（launchProduct ready:false）跳过落定轮询——GU-1 注入 api 抛错时 roster 永远起不来，不该等满 30s
  await page.waitForFunction(() => (window as unknown as { __pbotsDev?: unknown }).__pbotsDev !== undefined, undefined, { timeout: 30_000 }).catch(() => {})
  await page.evaluate(() => { try { window.localStorage.setItem('pbots.shim.onboarding-seen', '1') } catch { /* ignore */ } }).catch(() => {})
  // T7beb：reload 前先让旧文档把主 bot 落定——置 seen 后旧文档读到 seen=1+空 roster 会
  // session/create，reload 若砍在 create 与 meta patch 之间，新文档再建一个 → 双 main
  // （D10c1，1/25≈4%）。expect.poll 真异步轮询（review 中1：waitForFunction 不 await
  // async predicate——Promise 恒 truthy 首次即 fulfill，250ms 从未驱动）；每轮主动
  // reloadRoster（置 seen 后旧文档不会自动再拉）。超时 expect.poll 抛。
  if (settle) {
    await expect.poll(async () => await page.evaluate(async () => {
      const dev = (window as unknown as { __pbotsDev?: { reloadRoster?(): Promise<void>; state?: { meta?: { mainBotId?: string | null } } } }).__pbotsDev
      if (!dev?.reloadRoster) return false
      await dev.reloadRoster().catch(() => {})
      return dev.state?.meta?.mainBotId != null
    }), { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(true)
  }
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { __pbotsDev?: unknown }).__pbotsDev !== undefined, undefined, { timeout: 30_000 }).catch(() => {})
}

/** 产品就绪 = 主 bot 已进侧栏（shim roster 拉完，M1 已通）。 */
export async function waitProductReady(page: Page, timeout = 60_000): Promise<void> {
  // T7be：直接 launchShell 的 spec（market/settings 等）自己走首启路径——若壳已用旧 seen
  // 打开引导，storage 写入+reloadRoster 都关不掉它，只有整页 reload 能撤。seen 判定前先等
  // __pbotsDev（避免在应用加载前读到别的文档）；不再调 reloadRoster（reload 后 gate 自然建 main）。
  try {
    await page.waitForFunction(() => (window as unknown as { __pbotsDev?: unknown }).__pbotsDev !== undefined, undefined, { timeout: 30_000 }).catch(() => {})
    if (await page.evaluate(() => window.localStorage.getItem('pbots.shim.onboarding-seen') !== '1').catch(() => false)) {
      await ensureOnboardingSeen(page)
    }
  } catch { /* ignore */ }
  await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout })
  await expect(page.locator('.sand-onboarding')).toHaveCount(0) // T7be 哨兵：引导层必须不在
}

/**
 * 起 fake runtime + 壳。dataDir 两侧同源（P5-25 起会话 cwd = $PBOTS_DATA_DIR/workspaces/<sid>，
 * workspaces.spec launchAligned 同款），会话工作区路径可在测试侧直接派生。
 */
export async function launchProduct(opts: ShellOptions & { ready?: boolean; patch?: string; onboardingFirst?: boolean } = {}): Promise<Env> {
  const { ready = true, patch, onboardingFirst = false, ...shellOpts } = opts
  const home = shellOpts.home ?? tmkdir('bot-p554-')
  const rt = await launchSdkRuntime({ patch: patch ?? `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: tmkdir('bot-u21-ws-'), dataDir: join(home, 'data') })
  const shell = await launchShell({ ...shellOpts, home, env: { PBOTS_DSH_HANDOFF: rt.handoff, ...shellOpts.env } })
  // T26：真首启（未 seen+空 roster）进 onboarding、不建 main bot——常规 e2e 测的是引导
  // 之后的产品面：页面起来后置 seen 并触发 roster 重载（补建 main bot）；onboarding 专项
  // 用 onboardingFirst:true 自测真首启三态。
  if (!onboardingFirst) await ensureOnboardingSeen(shell.page, ready) // T26b #2 → T7be 抽共用；T7bec：ready:false（GU-1 类）跳过落定轮询
  if (ready) await waitProductReady(shell.page) // 内含引导计零哨兵（T7be）
  if (!onboardingFirst) await expect(shell.page.locator('.sand-onboarding')).toHaveCount(0) // T7be review：独立哨兵恢复——ready:false 调用方（resilience/theme-flash）不走 waitProductReady，仍需守
  return { rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop() } }
}

export interface DevView { sessionId: string; cwd: string | null; preset: string | null; endReason: string | null; turnEnded: boolean; chunkCount: number; streaming: unknown; running: boolean; items: Array<{ kind: string; id: string; text?: string }> }
export interface DevState { order: string[]; meta: { mainBotId: string | null }; views: Record<string, DevView> }

export const devState = (page: Page): Promise<DevState> =>
  page.evaluate(() => (window as unknown as { __pbotsDev: { state: DevState } }).__pbotsDev.state)

/** M1 直调（主世界 window.pbots，与 shim 同一条 preload 通道）。 */
export function api<T = unknown>(page: Page, method: string, args?: unknown): Promise<{ ok: boolean; value?: T; error?: { code: string; message: string } }> {
  return page.evaluate(([m, a]) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<never> } }).pbots.api(m as string, a), [method, args] as const)
}

/**
 * 建一个指定 preset 的 bot（0.18 新建入口只有默认 preset：选 preset 的语义改走 M1 #3 直调，见 REPORT-P5-54 映射表），
 * 起唯一标题（侧栏行 aria-label = 标题）并 reload 让 shim 重拉 roster。返回 sessionId。
 */
export async function createBots(page: Page, bots: Array<{ title: string; preset?: string }>): Promise<string[]> {
  const ids: string[] = []
  for (const bot of bots) {
    const created = await api<{ sessionId: string }>(page, 'session/create', { request: bot.preset !== undefined ? { agentPreset: bot.preset } : {} })
    expect(created.ok, JSON.stringify(created.error)).toBe(true)
    const sid = created.value!.sessionId
    const renamed = await api(page, 'session/rename', { request: { sessionId: sid, title: bot.title } })
    expect(renamed.ok, JSON.stringify(renamed.error)).toBe(true)
    ids.push(sid)
  }
  await page.reload()
  for (const bot of bots) await expect(botItem(page, bot.title)).toBeVisible({ timeout: 60_000 })
  return ids
}

/** 主 bot 未命名（shim NEW_CHAT 兜底名）；测试里其余 bot 一律起唯一标题。 */
export const MAIN_TITLE = 'New chat'

export const botItem = (page: Page, title: string): Locator => page.locator(`.sand-agent-item[aria-label="${title}"]`)

/** 打开侧栏里的 bot（按标题），等会话头切到它。 */
export async function openBot(page: Page, title: string): Promise<void> {
  await botItem(page, title).click()
  await expect(botItem(page, title)).toHaveAttribute('data-active', 'true')
}

/** T21：侧栏行右键 → 菜单「Show full conversation」打开 outline 面板（真实菜单点击，不 evaluate）。
 * 同名多行（未命名 bot 都叫 New chat）时优先 data-active 行。 */
export async function openOutline(page: Page, botTitle: string): Promise<Locator> {
  const rows = botItem(page, botTitle)
  const row = (await rows.count()) > 1 ? page.locator(`.sand-agent-item[data-active="true"][aria-label="${botTitle}"]`).first() : rows.first()
  await row.click({ button: 'right' })
  await page.locator('[aria-label="Agent actions"] [role="menuitem"]', { hasText: 'Show full conversation' }).click()
  const panel = page.locator('aside.sand-outline-panel')
  await expect(panel).toBeVisible({ timeout: 15_000 })
  return panel
}

/** T22：工具行只在 outline 面板（主 transcript 不再渲染 tool-call；0.79.3 COORD Qz）。
 * 断言前先 openOutline（T21 已证面板开着时事件实时更新）。 */
export const toolRows = (page: Page): Locator => page.locator('.sand-outline-panel .sand-outline-item[data-kind="tool-call"]')

export const transcript = (page: Page): Locator => page.locator('.sand-virtual-transcript')
export const assistantRows = (page: Page): Locator => page.locator('.sand-virtual-transcript .sand-transcript-row[data-role="assistant"]')
/** 流式中的正文（shim entries.ts live-stream 条目的 prose；行本身还含隐藏的作者 / 时间 span）。 */
export const streamingRow = (page: Page): Locator => page.locator('.sand-transcript-row[data-entry-id="live-stream"] .sand-message-prose')
/** 定稿的 bot 正文 prose（非 live）。 */
export const finalAssistant = (page: Page): Locator =>
  page.locator('.sand-virtual-transcript .sand-transcript-row[data-role="assistant"]:not([data-entry-id="live-stream"]) .sand-message-prose')
export const permissionDock = (page: Page): Locator => page.locator('[aria-label="Local tool permissions"]')
export const composer = (page: Page): Locator => page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')

/** 0.18 composer（tiptap）：focus 编辑器 → 输入 → Enter 发送。 */
export async function send(page: Page, text: string): Promise<void> {
  const editor = composer(page)
  await editor.click({ timeout: 15_000 })
  await page.keyboard.type(text, { delay: 5 })
  await expect(editor).toContainText(text.slice(0, 8))
  await page.click('button[aria-label="Send message"]')
}

export const boundaryCount = (page: Page): Promise<number> =>
  page.evaluate(() => (document.body.innerText.match(/Couldn't render this/g) ?? []).length)
