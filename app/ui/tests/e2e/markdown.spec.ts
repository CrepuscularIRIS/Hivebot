// U-22 ⑤ markdown E2E（PLAN U-22 验收 ① + ⑥ 链接回归；P5-54 起跑在 renderer-grok 上）：fake 回复含 **粗体**、代码块、
// https 链接、raw <img>、行内 code、列表 —— 断言 strong / pre code / a[href] / li 渲染，零 <img> 挂载（D12① 先导），
// 链接点击经 U-00 门控（getURL 不变、窗口数 === 1、openExternal 收到 URL）；流式中同样走 markdown，打断判据 aborted 回归。
// 0.18 没有 shiki 双主题高亮、没有停止钮：差异记 REPORT-P5-54（→ P5-55），打断走 M1 #cancel。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { EVIDENCE, api, createBots, devState, finalAssistant, launchProduct, openBot, send, streamingRow, textCall, transcript } from '../support/ui.ts'

const MD = [
  '**加粗结论**与`inline-code`随后：\n\n',
  '```typescript\nconst answer: number = 42\n```\n\n',
  '详见 [示例链接](https://example.com) 与 <img src="https://evil.example/x.png" alt="evil"> 内嵌标记。\n\n',
  '- 列表甲\n- 列表乙\n',
]

test('markdown：strong/pre code/a/li 渲染；raw img 不挂载、零图片请求；链接点击走 U-00 门控', async () => {
  const env = await launchProduct()
  try {
    const { page, rt, shell } = env
    const imageRequests: string[] = []
    page.on('request', (r) => { if (r.resourceType() === 'image' && !r.url().startsWith('pbots-app:') && !r.url().startsWith('data:')) imageRequests.push(r.url()) })
    const [x] = await createBots(page, [{ title: 'MD-X', preset: 'p2-alpha' }])
    await openBot(page, 'MD-X')
    rt.writeScriptCalls(x!, [textCall(MD)])
    await send(page, '请用 markdown 回复')

    const bubble = finalAssistant(page).last()
    await expect(bubble).toContainText('加粗结论', { timeout: 20_000 })
    await expect(bubble).toContainText('列表乙', { timeout: 20_000 })

    // ① 结构断言（PLAN U-22 ①）：strong / pre>code / a[href=https://example.com] / li ×2 / 行内 code
    await expect(bubble.locator('strong')).toHaveText('加粗结论')
    await expect(bubble.locator('pre')).toHaveCount(1)
    await expect(bubble.locator('pre')).toContainText('const answer: number = 42')
    const link = bubble.locator('a[href="https://example.com"]')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveText('示例链接')
    await expect(bubble.locator('li')).toHaveCount(2)
    await expect(bubble.locator('code').filter({ hasText: 'inline-code' })).toHaveCount(1)

    // ⑥ raw <img> 不挂载为图片、零外部图片请求（D12①）
    expect(await transcript(page).locator('img[src*="evil.example"]').count()).toBe(0)
    expect(imageRequests).toEqual([])

    // ⑥ 链接回归：点击外链 → 不导航（getURL 仍 pbots-app://app/）、窗口数 === 1、openExternal 收到
    await shell.app.evaluate(({ shell: sh }) => {
      const calls: string[] = []
      ;(globalThis as unknown as { __mdExtCalls?: string[] }).__mdExtCalls = calls
      sh.openExternal = ((url: string) => { calls.push(url); return Promise.resolve() }) as typeof sh.openExternal
    })
    await link.click()
    // Chromium window.open 会把 URL 规范化（补尾斜杠）再进 setWindowOpenHandler —— 断言实际到达值
    await expect.poll(async () => await shell.app.evaluate(() => (globalThis as unknown as { __mdExtCalls?: string[] }).__mdExtCalls ?? []))
      .toEqual(['https://example.com/'])
    const url = await shell.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getURL())
    expect(url.startsWith('pbots-app://app/')).toBe(true)
    expect(await shell.app.windows()).toHaveLength(1)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cursor-dark')
    expect(await page.screenshot({ path: join(EVIDENCE, 'markdown-dark.png') })).toBeTruthy()
    await page.emulateMedia({ colorScheme: 'light' })
  } finally {
    await env.stop()
  }
})

test('markdown 流式 + 打断判据回归：流式条目同样渲染 markdown；cancel → turn/end reason.kind === aborted', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [x] = await createBots(page, [{ title: 'MD-S', preset: 'p2-alpha' }])
    await openBot(page, 'MD-S')
    rt.writeScriptCalls(x!, [textCall(['**流式中**的粗体，', '随后被打断'], { gateId: `u22-md-stop-${Date.now()}` })])
    await send(page, '跑起来')
    await expect(streamingRow(page).locator('strong')).toHaveText('流式中', { timeout: 20_000 })
    expect((await api(page, 'session/cancel', { request: { sessionId: x } })).ok).toBe(true)
    await expect.poll(async () => (await devState(page)).views[x!]?.endReason, { timeout: 20_000 }).toBe('aborted') // +4 精确等值
    await expect(streamingRow(page)).toHaveCount(0, { timeout: 20_000 })
  } finally {
    await env.stop()
  }
})
