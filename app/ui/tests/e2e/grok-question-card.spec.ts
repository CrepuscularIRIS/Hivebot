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
    const args2 = JSON.stringify({ questions: [ { id: 'q3', question: 'Dismiss me?', options: [{ label: 'Yes' }] } ] })
    const askTurn = (tid: string, ag: string) => ({ chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: tid, name: 'ask_user_question', argumentsDelta: ag.slice(0, 5) },
      { type: 'tool-call-delta', index: 0, id: tid, name: 'ask_user_question', argumentsDelta: ag.slice(5) },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: tid, name: 'ask_user_question', arguments: ag } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ] })
    const textTurn = (t: string) => ({ chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: t },
      { type: 'block-end', index: 0, block: { type: 'text', text: t } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] })
    writeFileSync(join(dir, `${sid}.json`), JSON.stringify({ calls: [
      askTurn('t40a', args),
      askTurn('t40b', args2),
      textTurn('done'),
    ] }))
    await ui.evaluate((s) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<unknown> } }).pbots.api('session/prompt', { request: { requestId: `t40-${Date.now()}`, sessionId: s, mode: 'queue', content: [{ type: 'text', text: 'ask me' }] } }), sid)
    // 卡出现（0.18 widget.tsx 根 class=sand-widget）
    await expect(ui.locator('.sand-widget')).toHaveCount(2, { timeout: 30_000 })
    // 点第 1 题选项 Blue；第 2 题（0 选项卡）自定义输入 hello 回车——custom 语义（工单原文）
    await ui.locator('.sand-widget button', { hasText: 'Blue' }).first().click()
    const customInput = ui.locator('.sand-widget input, .sand-widget textarea').first()
    await customInput.fill('hello')
    await customInput.press('Enter')
    await expect(ui.locator('.sand-widget--resolved')).toHaveCount(2, { timeout: 15_000 })
    // 第二批（q3）：X dismiss → dismissed 态 3s 不弹回（F1+F2）
    await expect(ui.locator('.sand-widget')).toHaveCount(3, { timeout: 20_000 })
    await ui.locator('button[aria-label="Dismiss question"]').last().click()
    await expect(ui.locator('.sand-widget--dismissed')).toHaveCount(1, { timeout: 10_000 })
    await ui.waitForTimeout(3000)
    await expect(ui.locator('.sand-widget--dismissed'), '3s 后仍 dismissed').toHaveCount(1)
    await ui.screenshot({ path: '/home/lingxufeng/bot/work/exp-polish/evidence/T40/dismissed.light.png' })
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
    await expect(ui.getByText('done', { exact: true }).last()).toBeVisible({ timeout: 30_000 })
    const trs = await readAnswers()
    // requests.jsonl 每轮携带历史 toolResults——按 toolCallId 取**最后**一次出现
    const lastOf = (tid: string): { answers: Array<{ id: string; selected: string[]; custom?: string }> } | undefined => {
      let hit: { answers: Array<{ id: string; selected: string[]; custom?: string }> } | undefined
      for (const t of trs) if (t.toolCallId === tid) { try { hit = JSON.parse(t.text ?? '{}') } catch { /* skip */ } }
      return hit
    }
    const b1 = lastOf('t40a')!
    const b2 = lastOf('t40b')?.answers?.[0]
    expect(b1.answers.find((a) => a.id === 'q1')?.selected).toEqual(['Blue'])
    expect(b1.answers.find((a) => a.id === 'q2')).toEqual({ id: 'q2', selected: [], custom: 'hello' })
    expect(b2 ?? {}, `dismiss=空 selected（实际 ${JSON.stringify(b2)}）`).toEqual({ id: 'q3', selected: [] })
  } finally {
    await shell?.stop()
    await rt.stop()
  }
})
