// U-22 ⑤ markdown E2E（PLAN U-22 验收 ① + ⑥ 链接回归）：fake 回复含 **粗体**、代码块（shiki 高亮）、
// https 链接、raw <img>、行内 code、列表 —— 断言 strong / pre code.hl / a[href] 渲染（数量 ≥1），
// raw HTML 不出现在 DOM（skipHtml 删除）、零 <img> 挂载（D12① 先导）、链接点击经 U-00 门控
// （getURL 不变、窗口数 === 1、openExternal 桩收到 URL）、打断判据 aborted 回归。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { EVIDENCE, createViaDialog, devState, launchProduct, send, textCall } from '../support/ui.ts'

const MD = [
  '**加粗结论**与`inline-code`随后：\n\n',
  '```typescript\nconst answer: number = 42\n```\n\n',
  '详见 [示例链接](https://example.com) 与 <img src="https://evil.example/x.png" alt="evil"> 内嵌标记。\n\n',
  '- 列表甲\n- 列表乙\n',
]

test('markdown：strong/pre code/a 渲染；raw img 不在 DOM、零图片请求；链接点击走 U-00 门控', async () => {
  const env = await launchProduct()
  try {
    const { page, rt, shell } = env
    const x = await createViaDialog(page, 'p2-alpha')
    rt.writeScriptCalls(x, [textCall(MD)])
    await send(page, '请用 markdown 回复')

    const bubble = page.locator('[data-pane="' + x + '"] .bubble.assistant.final')
    await expect(bubble).toContainText('加粗结论', { timeout: 20_000 })

    // ① 结构断言（PLAN U-22 ①）：strong / pre>code（高亮态）/ a[href=https://example.com]，数量 ≥1
    await expect(bubble.locator('strong')).toHaveCount(1)
    await expect(bubble.locator('strong')).toHaveText('加粗结论')
    const pre = bubble.locator('pre code')
    await expect(pre).toHaveCount(1)
    await expect(pre).toContainText('const answer: number = 42')
    const link = bubble.locator('a[href="https://example.com"]')
    await expect(link).toHaveCount(1)
    await expect(link).toHaveText('示例链接')
    await expect(bubble.locator('ul li')).toHaveCount(2)
    await expect(bubble.locator('code:not(pre code)')).toHaveText('inline-code') // 行内 code 不进高亮块

    // shiki 高亮（⑤：token 上色 + 双主题变量）
    await expect(bubble.locator('pre code .hl-tok').first()).toBeVisible({ timeout: 10_000 })
    const firstTok = bubble.locator('pre code .hl-line').first()
    await expect(firstTok).toContainText('const')
    const tokStyle = await bubble.locator('pre code .hl-tok').first().evaluate((el) => getComputedStyle(el).color)
    expect(tokStyle).toMatch(/rgb\(/) // 亮色主题内联 color 生效

    // ⑥ raw HTML 不出现在 DOM（skipHtml 删除，非转文本）+ 零 <img> 挂载（图片零请求）
    expect(await page.locator('[data-pane="' + x + '"] img').count()).toBe(0)
    expect(await bubble.innerText()).not.toContain('<img')
    expect(await bubble.innerText()).not.toContain('evil.example')

    // ⑥ 链接回归：点击外链 → 不导航（getURL 仍 pbots-app://app/）、窗口数 === 1、openExternal 桩收到
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

test('markdown 后打断判据回归：stop → turn/end reason.kind === aborted +「已停止」', async () => {
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const x = await createViaDialog(page, 'p2-alpha')
    rt.writeScriptCalls(x, [textCall(['**流式中**的粗体，', '随后被打断'], { gateId: `u22-md-stop-${Date.now()}` })])
    await send(page, '跑起来')
    // 流式 markdown 气泡同样走渲染（streaming 也接 Markdown）
    await expect(page.locator('.bubble.streaming strong')).toHaveText('流式中', { timeout: 20_000 })
    await page.locator('[data-action="stop"]').click()
    await expect(page.locator('.turn-notice')).toHaveText('已停止', { timeout: 20_000 })
    await expect.poll(async () => (await devState(page)).views[x]?.endReason).toBe('aborted') // +4 精确等值
    expect(await page.locator('.bubble.streaming').count()).toBe(0)
  } finally {
    await env.stop()
  }
})
