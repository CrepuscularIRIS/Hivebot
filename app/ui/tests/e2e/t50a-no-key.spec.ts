// T50a：无 key 引导全链（工单验收 4 七步）。真链端到端：
// real 模式无 key → 发 hello → NO_KEY_NOTICE+按钮（桩 0 请求）→ 点按钮直落 Models →
// 填假 key Apply 绿 → 关设置 → 不重启重发 → 桩 1 请求带 Bearer + 桩回复出现（无 NO_KEY_NOTICE）。
// 泄漏反证：console 监听在填 key 之前注册（T50c 教训）；DOM/console 全程不含假 key。
import { expect, test, type Page } from 'playwright/test'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell } from '../support/launch.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { waitProductReady } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/settings-connectors/evidence/T50a'
const FAKE_KEY = 'sk-t50a-fake-000' // 工单边界 4：明显假串，不碰真实凭证
const REPLY = `t50a-ok-${Math.random().toString(16).slice(2, 8)}`

/** real 模式空白 overlay：不设 provider（litellm 默认路由用 SDK 自带 default，§0 探针同构）。 */
function emptyOverlayPath(): string {
  const dir = tmkdir('bot-t50a-patch-')
  writeFileSync(join(dir, 'empty.yml'), '[]\n')
  return join(dir, 'empty.yml')
}

/** 0.18 composer 驱动（grok-shim.spec grokSend 同款）。 */
async function send(page: Page, text: string): Promise<void> {
  const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
  await editor.click({ timeout: 15_000 })
  await page.keyboard.type(text, { delay: 5 })
  await expect(editor).toContainText(text.slice(0, 4))
  await page.click('button[aria-label="Send message"]')
}

test('T50a 无 key 引导链：notice→按钮直落 Models→填 key→不重启重发成功', async () => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })

  // 1. SSE 桩：记录请求与 Authorization；/models 挂 litellm 单模型；/chat/completions 回 REPLY
  const seen: Array<{ url: string; auth: string }> = []
  const stub = createServer((req, res) => {
    seen.push({ url: req.url ?? '', auth: req.headers.authorization ?? '' })
    if (req.method === 'GET' && (req.url ?? '').endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'glm-5.3-flash', object: 'model' }] }))
      return
    }
    if (req.method === 'POST' && (req.url ?? '').endsWith('/chat/completions')) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
      sse({ id: 'chatcmpl-t50a', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })
      sse({ id: 'chatcmpl-t50a', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: REPLY }, finish_reason: null }] })
      sse({ id: 'chatcmpl-t50a', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r))
  const stubPort = (stub.address() as { port: number }).port

  // T50ab：桩已起——此后任何启动步骤失败也不能漏进程/端口；rt/shell 在 try 内赋值，finally 逆序各吞错
  let rt: Awaited<ReturnType<typeof launchSdkRuntime>> | undefined
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
  // 2. real 无 key runtime + shell
  rt = await launchSdkRuntime({
    patch: emptyOverlayPath(), cwd: tmkdir('bot-t50a-ws-'),
    env: { P2SDK_PROVIDER: 'real', P2SDK_LLM_BASE_URL: `http://127.0.0.1:${stubPort}/v1` },
  })
  shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
    const page = shell.page
    await waitProductReady(page)
    // console 监听在一切 key 输入之前注册（T50c 教训）+ must-catch 探针
    const consoleTexts: string[] = []
    page.on('console', (m) => consoleTexts.push(m.text()))
    await page.evaluate(() => { console.log('t50a-listener-alive') })
    for (let i = 0; i < 25 && !consoleTexts.some((t) => t.includes('t50a-listener-alive')); i++) await page.waitForTimeout(200)
    expect(consoleTexts.join('\n'), 'must-catch：监听器活着').toContain('t50a-listener-alive')

    // 3. 发 hello → NO_KEY_NOTICE 原文 + 按钮；桩收到 0 个请求
    await send(page, 'hello')
    const notice = page.locator('.sand-notice', { hasText: '还没有填 API key' })
    await expect(notice).toBeVisible({ timeout: 60_000 })
    const btn = page.locator('[data-action="open-models"]')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveText('Open Settings → Models')
    expect(seen.length, `桩收到 0 个请求（实际 ${seen.length}）`).toBe(0)
    // 截图在 notice+按钮可见时（工单验收 4.7；重发成功后 notice 已退场）
    await page.screenshot({ path: join(OUT, 'no-key-notice.light.png') })
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, 'no-key-notice.dark.png') })
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(600)

    // 4. 点按钮 → 设置开且直接落 Models 区（不是 General）
    await btn.click()
    await page.locator('.sand-settings-dialog').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('[data-settings-panel="models"]').waitFor({ state: 'visible', timeout: 5_000 })

    // 5. litellm 行填假 key → Apply → 圆点绿（t50-models 同款定位）→ 关设置
    const row = page.locator('[data-model-route="litellm"]')
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.locator('input[type="password"]').fill(FAKE_KEY)
    await row.getByRole('button', { name: 'Apply' }).click()
    await expect(row.locator('[data-key-dot]')).toHaveAttribute('data-key-dot', 'on', { timeout: 10_000 })
    await page.locator('.sand-settings-panel__close').click()

    // 6. 不重启重发 → 桩 1 请求带 Bearer；回复出现；这一轮没有新增 NO_KEY_NOTICE
    // （第一轮的 notice 是历史条目合法留存——判据=不新增，不是清零）
    const noticeCountBefore = await page.locator('.sand-notice', { hasText: '还没有填 API key' }).count()
    await send(page, 'hello again')
    await expect(page.locator('.sand-transcript-row', { hasText: REPLY })).toBeVisible({ timeout: 60_000 })
    expect(seen.filter((s) => s.url.endsWith('/chat/completions')).length, `桩恰 1 个 chat 请求（实际 ${seen.length}）`).toBe(1)
    expect(seen.find((s) => s.url.endsWith('/chat/completions'))?.auth, 'Bearer = 假 key').toBe(`Bearer ${FAKE_KEY}`)
    await expect(page.locator('.sand-notice', { hasText: '还没有填 API key' })).toHaveCount(noticeCountBefore)

    // 7. 泄漏反证（终态 DOM + 监听注册后 console 不含假 key——T50ab 措辞：HTML 只查终态快照）
    const html = await page.evaluate(() => document.documentElement.outerHTML)
    expect(html, 'HTML 不含假 key').not.toContain(FAKE_KEY)
    expect(consoleTexts.join('\n'), 'console 不含假 key').not.toContain(FAKE_KEY)
  } finally {
    await shell?.stop().catch(() => { /* T50ab：各步吞错不阻断下一步 */ })
    await rt?.stop().catch(() => { /* */ })
    await new Promise<void>((r) => stub.close(() => r()))
  }
})
