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
  const args = JSON.stringify({ command, description: 'U-21 approval probe' })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: args },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: args } },
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

/** 产品就绪 = 主 bot 已进侧栏（shim roster 拉完，M1 已通）。 */
export async function waitProductReady(page: Page, timeout = 60_000): Promise<void> {
  await expect(page.locator('.sand-agent-item').first()).toBeVisible({ timeout })
}

/**
 * 起 fake runtime + 壳。dataDir 两侧同源（P5-25 起会话 cwd = $PBOTS_DATA_DIR/workspaces/<sid>，
 * workspaces.spec launchAligned 同款），会话工作区路径可在测试侧直接派生。
 */
export async function launchProduct(opts: ShellOptions & { ready?: boolean; patch?: string } = {}): Promise<Env> {
  const { ready = true, patch, ...shellOpts } = opts
  const home = shellOpts.home ?? tmkdir('bot-p554-')
  const rt = await launchSdkRuntime({ patch: patch ?? `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: tmkdir('bot-u21-ws-'), dataDir: join(home, 'data') })
  const shell = await launchShell({ ...shellOpts, home, env: { PBOTS_DSH_HANDOFF: rt.handoff, ...shellOpts.env } })
  if (ready) await waitProductReady(shell.page)
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

export const transcript = (page: Page): Locator => page.locator('.sand-virtual-transcript')
export const assistantRows = (page: Page): Locator => page.locator('.sand-virtual-transcript .sand-transcript-row[data-role="assistant"]')
/** 流式中的正文（shim entries.ts live-stream 条目的 prose；行本身还含隐藏的作者 / 时间 span）。 */
export const streamingRow = (page: Page): Locator => page.locator('.sand-transcript-row[data-entry-id="live-stream"] .sand-message-prose')
/** 定稿的 bot 正文 prose（非 live）。 */
export const finalAssistant = (page: Page): Locator =>
  page.locator('.sand-virtual-transcript .sand-transcript-row[data-role="assistant"]:not([data-entry-id="live-stream"]) .sand-message-prose')
export const toolRows = (page: Page): Locator => page.locator('.sand-outline-item[data-kind="tool-call"]')
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
