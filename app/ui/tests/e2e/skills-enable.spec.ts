// T7a（L4-c）e2e：A 在对话里存 skill → B（从未发过消息）list/enable → 改 A 的源 →
// B 首请求目录发现 + skill 加载旧正文（快照不联动）→ disable 删 B 副本。
// B 启用前一次消息都不发：首请求目录断言不依赖 dsh 增量刷新。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, type ShellLaunch } from '../support/launch.ts'
import { botItem, createBots, PRESETS_PATCH, textCall, toolCall } from '../support/ui.ts'


async function grokSend(page: import('playwright/test').Page, text: string): Promise<void> {
  const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
  await editor.click({ timeout: 15_000 })
  await page.keyboard.type(text, { delay: 5 })
  await expect(editor).toContainText(text.slice(0, 4))
  await page.click('button[aria-label="Send message"]')
}

async function expectState(page: import('playwright/test').Page, state: string, timeout = 20_000): Promise<void> {
  const one = page.locator('.sand-agent-item [data-grok-state]').first()
  const two = page.locator('.sand-chat-header__avatar [data-grok-state]').first()
  await expect(one).toHaveAttribute('data-grok-state', state, { timeout })
  await expect(two).toHaveAttribute('data-grok-state', state, { timeout: 5_000 })
}

const BODY_R = `t7a-${Math.random().toString(16).slice(2, 10)}`
const BODY_R2 = `t7a2-${Math.random().toString(16).slice(2, 10)}`

test('A 存 → B 启用（快照）→ 改源不联动 → B 能加载旧文 → disable', { timeout: 300_000 }, async ({ page }) => {
  // dataDir 放隔离 HOME 下（T6 已证此布局 bot 可写自己工作区）；/dev/shm 布局被
  // p2sdk-fs-guard 判 masked area（guard 的豁免根集合不含它）——取证见回执
  const dataDir = mkdtempSync(join(process.env.HOME!, 'bot-T7a-e2e-'))
  mkdirSync(join(dataDir, 'workspaces'), { recursive: true }) // sdk 子进程 cwd，spawn 前必须存在
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir, cwd: join(dataDir, 'workspaces') })
  let shell: ShellLaunch | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
    const ui = shell.page
    await expect(ui.locator('.sand-agent-item')).toHaveCount(1, { timeout: 60_000 })
    await expect(ui.locator('.ProseMirror[contenteditable="true"]')).toBeVisible({ timeout: 20_000 })
    await expectState(ui, 'idle')

    const [idA, idB] = await createBots(ui, [{ title: 'T7a-A' }, { title: 'T7a-B' }])
    const wsA = join(dataDir, 'workspaces', idA)
    const wsB = join(dataDir, 'workspaces', idB)
    const skillMd = (ws: string): string => join(ws, '.dsh', 'skills', 't7-flow', 'SKILL.md')
    const skillDirB = join(wsB, '.dsh', 'skills', 't7-flow')

    // ---- A 写入 t7-flow（fake 脚本一次写全——P5-03 游标坑）
    rt.writeScriptCalls(idA, [
      toolCall('write', {
        file_path: skillMd(wsA),
        content: `---\nname: t7-flow\ndescription: T7a saved flow\n---\n${BODY_R}\n`,
      }, 't7a-write'),
      textCall(['存', '好', '了', '。']),
    ])
    await botItem(ui, 'T7a-A').click()
    await grokSend(ui, '把刚才的流程存成 skill')
    await expectState(ui, 'idle', 120_000)
    for (let i = 0; i < 100 && !existsSync(skillMd(wsA)); i++) await ui.waitForTimeout(200)
    if (!existsSync(skillMd(wsA))) {
      const reqA = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n')
        .map((l) => JSON.parse(l) as { sessionId: string | null; toolResults: Array<{ isError: boolean; text: string }> })
        .filter((r) => r.sessionId === idA)
      console.log('[T7a-dbg] A toolResults=', JSON.stringify(reqA.flatMap((r) => r.toolResults)).slice(0, 700))
      console.log('[T7a-dbg] wsA 存在?', existsSync(wsA), ' dataDir=', dataDir, ' idA=', idA)
    }
    expect(existsSync(skillMd(wsA)), 'A 的 skill 已落盘').toBe(true)

    // ---- B 从未发过消息：list → candidates；enable → 快照
    const skillsApi = <T>(req: object): Promise<T> => ui.evaluate((r) => (window as unknown as { pbots: { skills: (x: object) => Promise<{ ok: boolean; value?: T; error?: { code: string } }> } }).pbots.skills(r), req)
    const list = await skillsApi<{ onBot: unknown[]; candidates: Array<{ fromBotId: string; name: string }> }>({ op: 'list', botId: idB })
    expect(list.onBot, 'B 启用前 onBot 为空').toEqual([])
    expect(list.candidates).toContainEqual(expect.objectContaining({ fromBotId: idA, name: 't7-flow' }))

    const enabled = await skillsApi<{ name: string }>({ op: 'enable', botId: idB, fromBotId: idA, name: 't7-flow' })
    expect(enabled.name).toBe('t7-flow')
    expect(readFileSync(skillMd(wsB), 'utf8')).toContain(BODY_R)

    // ---- 改 A 的源（模拟「改库」）
    writeFileSync(skillMd(wsA), `---\nname: t7-flow\ndescription: T7a saved flow\n---\n${BODY_R2}\n`)

    // ---- B 首次发消息：目录发现 + 加载旧正文（快照）
    rt.writeScriptCalls(idB, [
      toolCall('skill', { name: 't7-flow' }, 't7a-load'),
      textCall(['用', '完', '了', '。']),
    ])
    await botItem(ui, 'T7a-B').click()
    await grokSend(ui, '用一下刚启用的 skill')
    await expectState(ui, 'idle', 120_000)

    const requests = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line) as { sessionId: string | null; userTexts: string[]; toolResults: Array<{ toolCallId: string | null; isError: boolean; text: string }> })
      .filter((r) => r.sessionId === idB)
    expect(requests.length, 'B 有模型请求记录').toBeGreaterThan(0)
    expect(requests[0]!.userTexts.join('\n'), 'B 首请求目录含 t7-flow').toContain('t7-flow')
    const load = requests.slice(1).flatMap((r) => r.toolResults).find((t) => t.toolCallId === 't7a-load')
    expect(load, 'skill 调用结果回到模型').toBeTruthy()
    expect(load!.isError).toBe(false)
    expect(load!.text, 'B 读到启用时的快照正文').toContain(BODY_R)
    expect(load!.text, '不含启用后改动的源').not.toContain(BODY_R2)
    expect(readFileSync(skillMd(wsA), 'utf8'), 'A 的源确实被改过').toContain(BODY_R2)

    // ---- disable：B 副本删、A 不动
    const dis = await skillsApi<Record<string, never>>({ op: 'disable', botId: idB, name: 't7-flow' })
    expect(dis).toEqual({})
    expect(existsSync(skillDirB)).toBe(false)
    expect(existsSync(skillMd(wsA))).toBe(true)
  } finally {
    await shell?.stop()
    await rt.stop()
    rmSync(dataDir, { recursive: true, force: true })
  }
})
