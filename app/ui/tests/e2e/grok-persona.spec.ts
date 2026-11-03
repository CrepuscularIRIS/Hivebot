// P5-56 · U3′ bot 动画验收（renderer-grok）：fake-LLM 真实事件流 → shim activityOf/awaitingUserResponse →
// 上游 agent-avatar personaStateFromAgent → OnboardingCharacter svg[data-grok-state]。
// ① 侧栏 + 会话头头像逐态：thinking →（审批挂起）idle+Needs attention → working(bash) → searching(web_fetch) → idle（结束）
// ② 同一 bot 两次启动 data-avatar-shape/color 不变（按 agentId 确定）
// ③ emulateMedia reduce：data-reduced-motion="true"，rAF 不推进（两帧 face transform 相同、像素帧差=0）；正对照：未降级时两帧不同
// 前置：cd renderer-grok && pnpm build；cd .. && pnpm build（LEARNINGS：run-e2e 不重建 dist）。
import { expect, test, type Locator, type Page } from 'playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { textCall } from '../support/ui.ts'

const UI_ROOT = resolve(__dirname, '..', '..')
const EVIDENCE = join(UI_ROOT, 'test-output', 'P5-56')
const PRESETS_PATCH = join(UI_ROOT, '..', 'sdk', 'profile', 'patches', 'presets.yml')
const SLOW_MS = 5_000 // bash sleep / web_fetch 慢响应：留够轮询窗口

/** fake 一次模型调用：慢速 reasoning（thinking 窗口）+ 一个工具调用（finish tool-calls → 回合继续）。 */
function reasoningThenTool(name: string, args: object, id: string): object {
  const a = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      ...['想一想', '……', '再想想', '……', '好。'].map((text) => ({ type: 'reasoning-delta', index: 0, text })),
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想一想……再想想……好。' } },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 1, id, name, argumentsDelta: a },
      { type: 'block-end', index: 1, block: { type: 'tool-call', id, name, arguments: a } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 400,
  }
}

async function grokSend(page: Page, text: string): Promise<void> {
  const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
  await editor.click({ timeout: 15_000 })
  await page.keyboard.type(text, { delay: 5 })
  await expect(editor).toContainText(text.slice(0, 4))
  await page.click('button[aria-label="Send message"]')
}

const sidebarPersona = (page: Page): Locator => page.locator('.sand-agent-item [data-grok-state]').first()
const headerPersona = (page: Page): Locator => page.locator('.sand-chat-header__avatar [data-grok-state]').first()

async function expectState(page: Page, state: string, timeout = 20_000): Promise<void> {
  await expect(sidebarPersona(page)).toHaveAttribute('data-grok-state', state, { timeout })
  await expect(headerPersona(page)).toHaveAttribute('data-grok-state', state, { timeout: 5_000 })
}

/** 头像 face <g>（上游 rAF 每帧写 transform）两次采样，间隔 300ms。 */
async function faceSamples(persona: Locator): Promise<[string | null, string | null]> {
  const face = persona.locator('g').first()
  const a = await face.getAttribute('transform')
  await new Promise((r) => setTimeout(r, 300))
  return [a, await face.getAttribute('transform')]
}

/** 慢响应 HTTP：web_fetch 在执行窗口内保持 running（persona searching 可观测）。 */
function slowServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((_req, res) => {
    setTimeout(() => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('slow ok') }, SLOW_MS)
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => {
    const addr = server.address()
    r({ server, url: `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}/p556` })
  }))
}

test('U3′ persona：真实事件流逐态切换（侧栏+会话头）、两次启动形色不变、reduced-motion 停帧', async () => {
  test.setTimeout(300_000)
  mkdirSync(EVIDENCE, { recursive: true })
  const ws = mkdtempSync(join(tmpdir(), 'bot-p556-ws-'))
  const { server, url } = await slowServer()
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, cwd: ws })
  let shell: ShellLaunch | undefined
  const launch = (home?: string): Promise<ShellLaunch> =>
    launchShell({ ...(home !== undefined ? { home } : {}), env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    shell = await launch()
    let page = shell.page
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })
    await expectState(page, 'idle')
    const mark = page.locator('.sand-agent-item [data-avatar-shape]').first()
    const identity = { shape: await mark.getAttribute('data-avatar-shape'), color: await mark.getAttribute('data-avatar-color') }
    expect(identity.shape).toBeTruthy()
    expect(identity.color).toBeTruthy()

    const list = await rt.client.call('session/list', { _request: {} }) as { items?: Array<{ sessionId: string; origin?: string }> }
    const sid = list.items?.find((i) => i.origin !== 'subagent')?.sessionId
    expect(sid).toBeTruthy()
    // fake 游标不随重写复位（LEARNINGS P5-03）：两回合脚本一次写全
    rt.writeScriptCalls(sid!, [
      reasoningThenTool('bash', { command: `sleep ${SLOW_MS / 1000}`, description: 'P5-56 persona probe' }, 'call-bash'),
      reasoningThenTool('web_fetch', { url }, 'call-web'),
      textCall(['收', '工', '。'], { paceMs: 400 }),
      textCall(['降', '级', '模', '式', '下', '在', '想', '。'], { paceMs: 500 }),
    ])

    // ---- ① 回合 1：逐态 ----
    const shot = (state: string): Promise<Buffer> => sidebarPersona(page).screenshot({ path: join(EVIDENCE, `persona-${state}-${identity.shape}-${identity.color}.png`) })
    await grokSend(page, '跑一下探针')
    await expectState(page, 'thinking')
    // 正对照：未降级时 rAF 在推进（两帧 transform 不同）
    const [m0, m1] = await faceSamples(sidebarPersona(page))
    expect(await sidebarPersona(page).getAttribute('data-reduced-motion')).toBe('false')
    expect(m0).not.toBe(m1)
    await shot('thinking')

    // 审批挂起：awaitingUserResponse 到达 persona（上游原版：idle + 侧栏 Needs attention 标记）
    const dock = page.locator('[aria-label="Local tool permissions"]')
    await expect(dock).toBeVisible({ timeout: 30_000 })
    await expectState(page, 'idle', 10_000)
    await expect(page.locator('.sand-agent-item [data-status="needs-attention"]')).toHaveCount(1)
    await shot('awaiting')
    await dock.locator('button', { hasText: 'Allow once' }).click()
    await expect(dock).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('.sand-agent-item [data-status="needs-attention"]')).toHaveCount(0)

    await expectState(page, 'working') // bash sleep 中
    await shot('working')
    await expectState(page, 'searching', 30_000) // web_fetch 慢响应中
    await shot('searching')
    await expectState(page, 'idle', 30_000) // 回合结束
    expect(await page.evaluate(() => (document.body.innerText.match(/Couldn't render this/g) ?? []).length)).toBe(0)

    // ---- ② 两次启动：同一主 bot 形色不变 ----
    await shell.stop()
    shell = await launch(shell.home)
    page = shell.page
    await expect(page.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    const mark2 = page.locator('.sand-agent-item [data-avatar-shape]').first()
    await expect(mark2).toHaveAttribute('data-avatar-shape', identity.shape!)
    await expect(mark2).toHaveAttribute('data-avatar-color', identity.color!)

    // ---- ③ reduced-motion：降级后进入新态 → 上游 effect 早退、不起 rAF ----
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })
    await grokSend(page, '降级再来')
    await expectState(page, 'thinking')
    await expect(sidebarPersona(page)).toHaveAttribute('data-reduced-motion', 'true')
    await expect(headerPersona(page)).toHaveAttribute('data-reduced-motion', 'true')
    const [r0, r1] = await faceSamples(sidebarPersona(page))
    expect(r0).toBe(r1)
    const f0 = await sidebarPersona(page).screenshot()
    await new Promise((r) => setTimeout(r, 300))
    const f1 = await sidebarPersona(page).screenshot({ path: join(EVIDENCE, `persona-reduced-thinking-${identity.shape}-${identity.color}.png`) })
    expect(Buffer.compare(f0, f1)).toBe(0) // 像素帧差 = 0
    await expectState(page, 'idle', 30_000)
  } finally {
    await shell?.stop()
    await rt.stop()
    server.close()
  }
})
