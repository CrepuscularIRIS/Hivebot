// P5-51 · grok renderer-grok shim E2E（验收）：fake-LLM 真实事件流（launchSdkRuntime）→ 真实 main
// （M1/M2/M3 + D9 守卫不动）→ 缺省 appRoot = out/renderer（P5-54 起即 renderer-grok build，shim 已注入 index.html）。
// ① 每类 entry 渲染（user/ack/thinking/tool/assistant markdown/审批卡）boundary=0；
// ② persona currentActivity 接 dsh 活动态；③ 审批作答只发 allowed-once/rejected；卡只有 Allow once / Deny once（P5-31），
// bash 卡显示完整命令、request_network 卡显示 reason 全文（命令 + 范围 + 期限）。
// 前置：pnpm build（含 renderer-grok build + 拷入 out/renderer）。
import { expect, test, type Page } from 'playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launchShell, sandboxHome, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { bashCall, MAIN_TITLE, openOutline, textCall, toolCall } from '../support/ui.ts'

const UI_ROOT = resolve(__dirname, '..', '..')
const EVIDENCE = join(UI_ROOT, 'test-output', 'P5-51')
const SDK_ROOT = join(UI_ROOT, '..', 'sdk')
const PRESETS_PATCH = join(SDK_ROOT, 'profile', 'patches', 'presets.yml')
const NET_COMMAND = `curl -fsSL https://pypi.org/simple/requests/ -o /dev/null --retry 3 --connect-timeout 10 ${'-H "X-P531: long" '.repeat(8)}`.trim()
const NET_REASON = 'P5-31 probe: fetch the package index to resolve dependencies'

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

test('grok shim：fake 事件流每类 entry 渲染 boundary=0；persona 活动态；审批 allow-once/deny 值域 ⊆ {allowed-once,rejected}；卡两钮 + 完整动作', async () => {
  test.setTimeout(240_000)
  mkdirSync(EVIDENCE, { recursive: true })
  // P5-25 起 session/create 由 main 强制 cwd=$PBOTS_DATA_DIR/workspaces/<botId>——runtime 进程
  // cwd 不再是会话 cwd。两侧数据根对齐（workspaces.spec launchAligned 同款），canary 落进
  // 会话工作区；工作区外的 /tmp 路径会被沙箱 --tmpfs /tmp 遮蔽（P5-51.f2：旧假象 touch ENOENT）。
  const home = sandboxHome('P5-51')
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
  const page = shell.page
  const env: Env = { rt, shell, page, async stop() { await shell.stop(); await rt.stop() } }
  try {
    // ---- boot：主 bot 侧栏 + persona 挂载 ----
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(page.locator('.sand-agent-item__name')).not.toHaveText('')
    await expect.poll(async () => page.locator('[data-grok-state]').count()).toBeGreaterThan(0)
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })

    // 主 bot sessionId（shim boot 自建的默认 standard bot，带 bash+shell-ask）；
    // 其会话工作区 = $PBOTS_DATA_DIR/workspaces/<sid>（P5-25 强制注入，dataDir 在 /tmp 下）
    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()

    // ---- 回合 1：reasoning + ack + bash(审批 allow-once) + 尾正文 markdown ----
    // canary 放会话工作区内：兼作「dataDir 在 /tmp 下时工作区仍可写可见」的断言
    // （wrapper 工作区 --bind 在 dsh --tmpfs /tmp 之后，P5-51.f2 dry-run 实证；
    //  P5-25 强制 cwd=workspaces/<sid>，orchestrate.ts）
    const ws = join(dataDir, 'workspaces', sid!)
    const okCanary = join(ws, 'p551-ok')
    const rejectCanary = join(ws, 'p551-reject')
    // fake 脚本游标逐条消费且不随重写复位（LEARNINGS P5-03）：两个回合的 4 条一次写全
    rt.writeScriptCalls(sid!, [
      reasoningAckTool('先想想怎么做。', '好的，先看一下环境。', 'touch p551-ok', 'call-a'),
      textCall(['完成。结果如下：\n\n```python\nprint(42)\n```\n收工。']),
      bashCall('touch p551-reject', 'call-r'),
      textCall(['不执行，已拒绝。']),
      toolCall('request_network', { reason: NET_REASON, command: NET_COMMAND }, 'call-n'),
      textCall(['网络未获批准。']),
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
    // P5-31（L-AP A9④）：Always allow / Never 不在 DOM，只剩两钮；bash 卡显示完整命令
    await expect(dock.locator('button', { hasText: 'Always allow' })).toHaveCount(0)
    await expect(dock.locator('button', { hasText: /^Never$/ })).toHaveCount(0)
    await expect(dock.locator('[role="group"] button')).toHaveText(['Allow once', 'Deny once']) // 动作段；标题条另有关闭钮（P5-41.f1，= Deny once）
    await expect(dock.locator('[data-pbots="ask-command"]')).toHaveText('touch p551-ok')
    await dock.locator('button', { hasText: 'Allow once' }).click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })

    // T22：主 transcript 只有 user / ack / assistant markdown；thinking 与 tool 在 outline 面板 ≥1
    await expect(page.locator('.sand-virtual-transcript')).toContainText('请检查环境并执行', { timeout: 30_000 })
    await expect(page.locator('.sand-virtual-transcript')).toContainText('好的，先看一下环境。')
    await expect(page.locator('.sand-virtual-transcript')).not.toContainText('先想想怎么做。')
    await expect(page.locator('.sand-virtual-transcript').getByText(/bash/i).first()).toHaveCount(0)
    const shimRowLabel = await page.locator('.sand-agent-item').first().getAttribute('aria-label') ?? MAIN_TITLE
    await openOutline(page, shimRowLabel)
    await expect(page.locator('.sand-outline-panel .sand-outline-item[data-kind="thinking"]')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.sand-outline-panel .sand-outline-item[data-kind="tool-call"]')).toHaveCount(1)
    await page.click('button[aria-label="Close full conversation"]') // 面板是 dialog，开着会吃 Esc（回合 3 网络卡靠 Esc 拒绝）
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
    // P5-41.f1：0.78.1 分段卡——标题条「Computer」+ 关闭钮；关闭 = Deny once（走 rejected，见下方 D9 计数）
    await expect(dock.locator('[data-pbots="ask-titlebar"]')).toContainText('Computer')
    await dock.locator('[data-pbots="ask-titlebar"] button[aria-label="Deny once"]').click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('.sand-virtual-transcript')).toContainText('不执行，已拒绝。', { timeout: 30_000 })
    await expect.poll(() => existsSync(rejectCanary), { timeout: 5_000 }).toBe(false)
    expect(await boundaryCount(page)).toBe(0)

    // ---- 回合 3：request_network 卡（P5-22 恒 ASK）——卡上是 reason 全文：原因 + 完整命令 + 范围 + 期限 ----
    await grokSend(page, '需要联网')
    await expect(dock).toBeVisible({ timeout: 30_000 })
    const netText = dock.locator('[data-pbots="ask-command"]')
    await expect(netText).toContainText(`reason: ${NET_REASON}`)
    await expect(netText).toContainText(`command: ${NET_COMMAND}`)
    await expect(netText).toContainText('scope: this session, one exact command, single use, expires in ~60s')
    await expect(dock.locator('[role="group"] button')).toHaveText(['Allow once', 'Deny once']) // 动作段；标题条另有关闭钮（P5-41.f1，= Deny once）
    await page.screenshot({ path: join(EVIDENCE, 'net-card-light.png') })
    await page.keyboard.press('Escape') // Esc = Deny once（覆盖卡保留上游键位）
    await expect(dock).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('.sand-virtual-transcript')).toContainText('网络未获批准。', { timeout: 30_000 })

    // ---- D9：全部作答值 ⊆ {allowed-once, rejected}（allow-once 1 次 + 拒绝 2 次：bash 关闭钮、网络 Esc）----
    const answers = await page.evaluate(() => (window as unknown as { __pbotsShim?: { answers: Array<{ eventId: string; value: string }> } }).__pbotsShim?.answers ?? [])
    expect(answers.map((a) => a.value).sort()).toEqual(['allowed-once', 'rejected', 'rejected'])
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
