// U-22 ② D2 E2E（PLAN U-22 验收 ② + L4；P5-54 起跑在 renderer-grok 上）：A 流式中切 B、再切 C 发消息——transcript 不串线；
// main M2 原帧 tap 计数：A 的 follow 流 assistant-stream chunk 帧 === renderer chunkCount（K）；
// 切回 A 完整定稿、无半截流；L4：当前视图 B 的 DOM 不含 A 的标记。
import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createBots, devState, finalAssistant, launchProduct, openBot, send, streamingRow, textCall, transcript } from '../support/ui.ts'

const A_PIECES = ['AAA-标记甲 ', 'AAA-标记乙 ', 'AAA-标记丙 ', 'AAA-标记收尾']

test('D2：三 bot 并发流不串线；A 后台续流 tap chunk === K；切回完整定稿', async () => {
  const env = await launchProduct()
  try {
    const { page, rt, shell } = env
    const main = (await devState(page)).meta.mainBotId!
    const [a, b, c] = await createBots(page, [
      { title: 'D2-A', preset: 'p2-alpha' }, { title: 'D2-B', preset: 'p2-beta' }, { title: 'D2-C', preset: 'p2-alpha' },
    ])
    const gateId = `u22-d2-a-${Date.now()}`

    // A：gated 挂起流（4 chunk，首块后挂）
    rt.writeScriptCalls(a!, [textCall(A_PIECES, { gateId, paceMs: 80 })])
    await openBot(page, 'D2-A')
    await send(page, 'A 跑流')
    await expect(streamingRow(page)).toContainText('AAA-标记甲', { timeout: 20_000 })
    await expect.poll(async () => (await devState(page)).views[a!]?.running).toBe(true)

    // A 流式中切 B：B 发消息拿独立回复（A 的 follow 留在后台继续收帧）
    await openBot(page, 'D2-B')
    rt.writeScriptCalls(b!, [textCall(['BBB-专属回复'])])
    await send(page, 'B 你好')
    await expect(finalAssistant(page).last()).toHaveText('BBB-专属回复', { timeout: 20_000 })

    // L4：当前视图 B 的 DOM 不含 A 的标记
    expect(await transcript(page).innerText()).not.toContain('AAA-')

    // 再切 C 发消息
    await openBot(page, 'D2-C')
    rt.writeScriptCalls(c!, [textCall(['CCC-专属回复'])])
    await send(page, 'C 你好')
    await expect(finalAssistant(page).last()).toHaveText('CCC-专属回复', { timeout: 20_000 })
    expect(await transcript(page).innerText()).not.toContain('AAA-')

    // 放 A 的 gate → A 在后台跑完（当前视图是 C）
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', gateId), '')

    // A 定稿（renderer 侧 chunkCount = K = 4）
    const K = A_PIECES.length
    await expect.poll(async () => (await devState(page)).views[a!]?.chunkCount, { timeout: 20_000 }).toBe(K)
    await expect.poll(async () => (await devState(page)).views[a!]?.streaming ?? null, { timeout: 20_000 }).toBe(null)

    // main M2 原帧 tap：follow 流的 assistant-stream chunk 帧计数集合 === {A:K, B:1, C:1}
    // （A=4 在视图为 C 时经 main 持续转发；主 bot 无 chunk 不进表；+4 精确等值）
    const tapChunks = await shell.app.evaluate(
      () => Object.values((globalThis as unknown as { __pbotsM2?: { stats: { downlink: { streamChunks: Record<string, number> } } } }).__pbotsM2!.stats.downlink.streamChunks),
    )
    expect([...tapChunks].sort((x, y) => x - y)).toEqual([1, 1, K])

    // 每个 transcript 只含自己的标记；主 bot 全程未被串线
    const views = await devState(page)
    const textOf = (id: string): string => JSON.stringify(views.views[id]?.items ?? [])
    expect(textOf(a!)).toContain('AAA-'); expect(textOf(a!)).not.toContain('BBB-'); expect(textOf(a!)).not.toContain('CCC-')
    expect(textOf(b!)).toContain('BBB-'); expect(textOf(b!)).not.toContain('AAA-'); expect(textOf(b!)).not.toContain('CCC-')
    expect(textOf(c!)).toContain('CCC-'); expect(textOf(c!)).not.toContain('AAA-'); expect(textOf(c!)).not.toContain('BBB-')
    expect(textOf(main)).not.toMatch(/AAA-|BBB-|CCC-/)

    // 切回 A：完整定稿、无半截流
    await openBot(page, 'D2-A')
    await expect(finalAssistant(page).last()).toHaveText(A_PIECES.join(''), { timeout: 20_000 })
    expect(await streamingRow(page).count()).toBe(0)
    expect(await transcript(page).innerText()).not.toMatch(/BBB-|CCC-/)
    await expect.poll(async () => (await devState(page)).views[a!]?.running).toBe(false)
  } finally {
    await env.stop()
  }
})
