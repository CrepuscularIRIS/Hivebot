// U-21 产品页 E2E 共用：fake LLM 脚本构造（events-replay.test.ts / d1.spec 同款帧形状）+ 产品 UI 操作。
import { expect, type Page } from 'playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, type ShellLaunch, type ShellOptions } from './launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from './sdk-runtime.ts'

export const SDK_ROOT = join(__dirname, '..', '..', '..', 'sdk')
export const PRESETS_PATCH = join(SDK_ROOT, 'profile', 'patches', 'presets.yml')
export const EVIDENCE = join(__dirname, '..', '..', '..', '..', 'work', 'p4-ui', 'evidence', 'PAB')

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

export interface Env { rt: SdkRuntime; shell: ShellLaunch; page: Page; stop(): Promise<void> }

export async function launchProduct(opts: ShellOptions = {}): Promise<Env> {
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: mkdtempSync(join(tmpdir(), 'bot-u21-ws-')) })
  const shell = await launchShell({ ...opts, env: { PBOTS_DSH_HANDOFF: rt.handoff, ...opts.env } })
  await shell.page.waitForSelector('.shell', { timeout: 30_000 })
  return { rt, shell, page: shell.page, async stop() { await shell.stop(); await rt.stop() } }
}

export interface DevState {
  selected: string | null
  order: string[]
  meta: { mainBotId: string | null }
  views: Record<string, { cwd: string | null; preset: string | null; endReason: string | null; turnEnded: boolean; chunkCount: number }>
}

export const devState = (page: Page): Promise<DevState> =>
  page.evaluate(() => (window as unknown as { __pbotsDev: { state: DevState } }).__pbotsDev.state)

/** 走新建对话框建 bot：选 preset（可选模型）→ 创建 → 返回新选中的 sessionId。 */
export async function createViaDialog(page: Page, preset: string, model?: string): Promise<string> {
  const before = (await devState(page)).order
  await page.click('[data-action="new-bot"]')
  await page.locator(`[data-preset-option="${preset}"] input`).check({ timeout: 15_000 })
  if (model !== undefined) await page.selectOption('[data-model-select]', model)
  await page.click('[data-action="create-bot"]')
  await expect(page.locator('dialog[data-dialog="new-bot"]')).toBeHidden({ timeout: 20_000 })
  await expect.poll(async () => (await devState(page)).order.find((id) => !before.includes(id))).toBeTruthy()
  const sid = (await devState(page)).order.find((id) => !before.includes(id))!
  await expect.poll(async () => (await devState(page)).selected).toBe(sid)
  return sid
}

export async function send(page: Page, text: string): Promise<void> {
  await page.fill('[data-composer]', text)
  await page.press('[data-composer]', 'Enter')
}
