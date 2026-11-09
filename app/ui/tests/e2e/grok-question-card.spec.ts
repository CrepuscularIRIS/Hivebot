// T40 e2e：bot 提问 → 聊天流出现 widget 卡 → 点选项/自定义输入 → bot 收到答案续跑
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

test('T40 提问卡：两题卡出现→作答→终答含答案', { timeout: 240_000 }, async () => {
  const home = sandboxHome('T40e')
  const dataDir = `${home}/data`
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
    const ui = shell.page
    await waitProductReady(ui)
    // 用主 bot（UI 已打开它的 transcript——卡渲染依赖 openAgentTail 拉流）
    const { readFileSync: rf } = await import('node:fs')
    const { join: j } = await import('node:path')
    const mainId = JSON.parse(rf(j(dataDir, 'bots.json'), 'utf8')).mainBotId as string
    expect(mainId).toBeTruthy()
    const sid = mainId
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    const args = JSON.stringify({ questions: [
      { id: 'q1', question: 'Which color?', options: [{ label: 'Red' }, { label: 'Blue' }] },
      { id: 'q2', question: 'Anything to note?', options: [] },
    ] })
    writeFileSync(join(dir, `${sid}.json`), JSON.stringify({ calls: [
      { chunks: [
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 0, id: 't40a', name: 'ask_user_question', argumentsDelta: args.slice(0, 5) },
        { type: 'tool-call-delta', index: 0, id: 't40a', name: 'ask_user_question', argumentsDelta: args.slice(5) },
        { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't40a', name: 'ask_user_question', arguments: args } },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ] },
      { chunks: [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: 'done' },
        { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } },
        { type: 'finish', reason: { kind: 'stop' } },
      ] },
    ] }))
    await ui.evaluate((s) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<unknown> } }).pbots.api('session/prompt', { request: { requestId: `t40-${Date.now()}`, sessionId: s, mode: 'queue', content: [{ type: 'text', text: 'ask me' }] } }), sid)
    // 卡出现（0.18 widget.tsx 根 class=sand-widget）
    await expect(ui.locator('.sand-widget')).toHaveCount(2, { timeout: 30_000 })
    // 点第 1 题选项 Blue；第 2 题 Skip（0 选项卡的唯一钮）
    await ui.locator('.sand-widget button', { hasText: 'Blue' }).first().click()
    await ui.locator('.sand-widget button', { hasText: 'Skip' }).first().click()
    // fake 第二轮收到的工具结果含答案 → 终答出现
    await expect(ui.locator('.ProseMirror[contenteditable="true"]')).toBeVisible()
    // requests.jsonl 里 toolResults 是嵌套转义 JSON——parse 后断（q1 Blue / q2 skip）
    const readAnswers = async (): Promise<Array<{ toolCallId?: string; text?: string }>> => {
      const { readFileSync } = await import('node:fs')
      try {
        return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n')
          .map((l) => JSON.parse(l) as { toolResults?: Array<{ toolCallId?: string; text?: string }> })
          .flatMap((r) => r.toolResults ?? [])
      } catch { return [] }
    }
    await expect.poll(async () => JSON.stringify(await readAnswers()), { timeout: 45_000 }).toContain('Blue')
    const trs = await readAnswers()
    const ans = trs.find((t) => t.toolCallId === 't40a')?.text ?? ''
    expect(ans).toContain('q1')
    expect(ans).toContain('Blue')
    expect(ans).toContain('q2')
  } finally {
    await shell?.stop()
    await rt.stop()
  }
})
