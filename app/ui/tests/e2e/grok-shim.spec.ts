// P5-51 · grok renderer-grok shim E2E（验收）：fake-LLM 真实事件流（launchSdkRuntime）→ 真实 main
// （M1/M2/M3 + D9 守卫不动）→ PBOTS_APP_ROOT 指 renderer-grok build（shim 已注入 index.html）。
// ① 每类 entry 渲染（user/ack/thinking/tool/assistant markdown/审批卡）boundary=0；
// ② persona currentActivity 接 dsh 活动态；③ 审批作答只发 allowed-once/rejected、ceiling=ask 禁用 Always。
// 前置：cd renderer-grok && pnpm build（shim.iife.js 注入）。
import { expect, test, type Page } from 'playwright/test'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { bashCall, textCall } from '../support/ui.ts'

const UI_ROOT = resolve(__dirname, '..', '..')
const GROK_ROOT = join(UI_ROOT, 'renderer-grok', '.build', 'frontend-shell')
const EVIDENCE = join(UI_ROOT, 'test-output', 'P5-51')
const SDK_ROOT = join(UI_ROOT, '..', 'sdk')
const PRESETS_PATCH = join(SDK_ROOT, 'profile', 'patches', 'presets.yml')

/** fake LLM 一次模型调用：reasoning + ack 正文 + bash tool-call（finish tool-calls → 回合继续）。
 * （fake 脚本逐条消费：一次调用一条；要回合继续就必须在同一条里以 tool-calls 收尾。） */
function reasoningAckTool(reasoning: string, ack: string, command: string, id: string, paceMs = 120): object {
  const args = JSON.stringify({ command, description: 'P5-51 shim e2e probe' })
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: reasoning },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: ack },
      { type: 'block-end', index: 1, block: { type: 'text', text: ack } },
      { type: 'block-start', index: 2, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 2, id, name: 'bash', argumentsDelta: args },
      { type: 'block-end', index: 2, block: { type: 'tool-call', id, name: 'bash', arguments: args } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs,
  }
}

/** 0.18 composer（tiptap）：focus 编辑器 → 输入 → 点 Send message（S0 drive.mjs 同法）。 */
async function grokSend(page: Page, text: string): Promise<void> {
  const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
  await editor.click({ timeout: 15_000 })
  await page.keyboard.type(text, { delay: 5 })
  await expect(editor).toContainText(text.slice(0, 8))
  await page.click('button[aria-label="Send message"]')
}

const boundaryCount = (page: Page): Promise<number> =>
  page.evaluate(() => (document.body.innerText.match(/Couldn't render this/g) ?? []).length)

interface Env { rt: SdkRuntime; shell: ShellLaunch; page: Page; stop(): Promise<void> }

test('grok shim：fake 事件流每类 entry 渲染 boundary=0；persona 活动态；审批 allow-once/deny 值域 ⊆ {allowed-once,rejected}；Always 禁用', async () => {
  test.setTimeout(240_000)
  mkdirSync(EVIDENCE, { recursive: true })
  const ws = mkdtempSync(join(tmpdir(), 'bot-p551-ws-'))
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: ws })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_APP_ROOT: GROK_ROOT } })
  const page = shell.page
  const env: Env = { rt, shell, page, async stop() { await shell.stop(); await rt.stop() } }
  try {
    // ---- boot：主 bot 侧栏 + persona 挂载 ----
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(page.locator('.sand-agent-item__name')).not.toHaveText('')
    await expect.poll(async () => page.locator('[data-grok-state]').count()).toBeGreaterThan(0)
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })

    // 主 bot sessionId（shim boot 自建的默认 standard bot，带 bash+shell-ask）
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()

    // ---- 回合 1：reasoning + ack + bash(审批 allow-once) + 尾正文 markdown ----
    // canary 落 session workspace：P5-25 起 #3/#4 的 cwd 由 main 强制为
    // $PBOTS_DATA_DIR/workspaces/<botId>（orchestrate.ts；shellChildEnv 设 PBOTS_DATA_DIR=
    // <home>/data），沙箱只 bind 数据根——canary 写 runtime cwd（ws）沙箱内不可见（f1 期间实证）。
    // bash cwd 即 workspace，用相对路径 touch。
    const wsDir = join(shell.home, 'data', 'workspaces', sid!)
    const okCanary = join(wsDir, 'p551-ok')
    const rejectCanary = join(wsDir, 'p551-reject')
    // fake 脚本游标逐条消费且不随重写复位（LEARNINGS P5-03）：两个回合的 4 条一次写全
    rt.writeScriptCalls(sid!, [
      reasoningAckTool('先想想怎么做。', '好的，先看一下环境。', 'touch p551-ok', 'call-a'),
      textCall(['完成。结果如下：\n\n```python\nprint(42)\n```\n收工。']),
      bashCall('touch p551-reject', 'call-r'),
      textCall(['不执行，已拒绝。']),
    ])
    await grokSend(page, '请检查环境并执行')
    // persona currentActivity 接 dsh 活动态：回合中无工具 → thinking（activityOf → {kind:'thinking'}）
    const persona = page.locator('.sand-agent-item [data-grok-state]')
    await expect.poll(() => persona.getAttribute('data-grok-state'), { timeout: 15_000 }).toBe('thinking')
    // 审批卡：LocalToolPermissionDock（permissionScope/Revision 条件满足才渲染，P5-50 坑2）
    const dock = page.locator('[aria-label="Local tool permissions"]')
    await expect(dock).toBeVisible({ timeout: 30_000 })
    // 待决审批 → awaitingUserResponse → persona idle（上游 agent-avatar 映射，等待用户）
    await expect(persona).toHaveAttribute('data-grok-state', 'idle', { timeout: 10_000 })
    // ceiling=ask：Always allow 被（上游 ceilingBlocksAlways）禁用
    await expect(dock.locator('button', { hasText: 'Always allow' })).toBeDisabled()
    await dock.locator('button', { hasText: 'Allow once' }).click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })

    // 每类 entry 渲染：user / ack / thinking（reasoning 与中间文本）/ tool / assistant markdown 代码块
    await expect(page.locator('.sand-virtual-transcript')).toContainText('请检查环境并执行', { timeout: 30_000 })
    await expect(page.locator('.sand-virtual-transcript')).toContainText('好的，先看一下环境。')
    await expect(page.locator('.sand-virtual-transcript')).toContainText('先想想怎么做。')
    await expect(page.locator('.sand-virtual-transcript').getByText(/bash/i).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.sand-virtual-transcript')).toContainText('收工。', { timeout: 30_000 })
    await expect(page.locator('.sand-virtual-transcript pre')).toHaveCount(1)
    // allow-once 真执行（D9 链路打通到 dsh）
    await expect.poll(() => existsSync(okCanary), { timeout: 30_000 }).toBe(true)
    expect(await boundaryCount(page)).toBe(0)
    await page.screenshot({ path: join(EVIDENCE, 'turn1-light.png') })

    // ---- persona：回合结束后回到静息态（idle；currentActivity=null） ----
    await expect(page.locator('.sand-agent-item [data-grok-state]')).toHaveAttribute('data-grok-state', 'idle', { timeout: 20_000 })

    // ---- 回合 2：deny 路径（rejected）----
    await grokSend(page, '再试一次')
    await expect(dock).toBeVisible({ timeout: 30_000 })
    await dock.locator('button', { hasText: 'Deny once' }).click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('.sand-virtual-transcript')).toContainText('不执行，已拒绝。', { timeout: 30_000 })
    await expect.poll(() => existsSync(rejectCanary), { timeout: 5_000 }).toBe(false)
    expect(await boundaryCount(page)).toBe(0)

    // ---- D9：全部作答值 ⊆ {allowed-once, rejected}，且各出现一次 ----
    const answers = await page.evaluate(() => (window as unknown as { __pbotsShim?: { answers: Array<{ eventId: string; value: string }> } }).__pbotsShim?.answers ?? [])
    expect(answers.map((a) => a.value).sort()).toEqual(['allowed-once', 'rejected'])
    await page.screenshot({ path: join(EVIDENCE, 'turn2-light.png') })

    // ---- f1（VERIFY-P5-51）：持久条目侧别。流式期的 pre=1 由 live-stream 条目（entries.ts:88
    // 自带 role）撑住，live 定稿即消失；reload 后 transcript 只剩持久序列化条目，判侧全靠
    // entries.ts:71 的 role:'assistant'——摘掉它则正文落 user 侧纯文本 <p>（无 markdown），此段必红 ----
    await page.reload()
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    const persisted = page.locator('.sand-virtual-transcript .sand-message[data-role="assistant"]').filter({ hasText: '收工。' })
    await expect(persisted).toHaveCount(1, { timeout: 30_000 })
    // markdown 代码块：UserMessageContent 纯 <p> 无 pre；scope 限定在该消息内，避开 tool/thinking 卡的 pre
    await expect(persisted.locator('pre')).toHaveCount(1)
    await page.screenshot({ path: join(EVIDENCE, 'reload-light.png') })
  } finally {
    await env.stop()
  }
})
