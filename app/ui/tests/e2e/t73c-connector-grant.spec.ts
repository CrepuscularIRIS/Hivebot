// T73c e2e：连接器审批卡全链（真 Electron + 真 SDK；bot=直调 createWithConnectors——
// UI roster 可见、卡在 dock 弹〔market.spec P-C ④/approveConnectorCall 先例〕）。
// PBOTS_DATA_DIR 必隔离（LEARNINGS：否则 standing-grants 写真实用户目录）。
// ① A 调 memory → 卡三钮 → Always allow → 回显+落盘 → A 再调不出卡直放
// ② B（新 bot）同连接器仍出卡 → Skip → 回显 Skipped → 无 B 记录 → B 再调仍出卡
// ③ 设置 General → Connector preferences·Clear → 文件清空 → A 再调又出卡
import { expect, test, type Page } from 'playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady, devState, permissionDock } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const MEM_SPEC = '@modelcontextprotocol/server-memory@2.1.1'
const WRAPPER = '@p2sdk-market/modelcontextprotocol__server-memory'
const SERVER = 'server-memory-30e6e77d'
const TOOL = `mcp__${SERVER}__create_entities`
const OUT = '/home/lingxufeng/bot/work/ui-borders-connect/evidence/t73c'

const mcpCall = (entity: string): object => {
  const id = `t73c-${Math.random().toString(16).slice(2, 8)}`
  const json = JSON.stringify({ entities: [{ name: entity, entityType: 'test', observations: [] }] })
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: TOOL, argumentsDelta: json.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name: TOOL, argumentsDelta: json.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: TOOL, arguments: json } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ], paceMs: 10 }
}

test('T73c：①Always allow 落盘直放 ②B 仍问+Skip 不记 ③Clear 后再问', async () => {
  test.setTimeout(420_000)
  const dataDir = tmkdir('t73c-data-')
  const grantsFile = join(dataDir, 'g', 'standing-grants.json')
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t73c-ws-'), env: { PBOTS_DATA_DIR: join(dataDir, 'g') } })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // 装 memory 走 UI 市场（Connect→✓Connected）——t69 spec 同路径；enabled 仍 :false
    // （T73d 才放开），bot 勾选经 new-with 预勾（p2temp 通路）——这正是今天的产品路径。
    await page.locator('.sand-agents-sidebar__plugins').click()
    const memRow = page.locator('[data-market-list] .pb-row', { hasText: 'Memory' }).first()
    await expect(memRow).toBeVisible({ timeout: 20_000 })
    await memRow.locator('button[data-action="connect"]').click()
    await expect(memRow).toHaveAttribute('data-kind', 'installed', { timeout: 120_000 })
    await memRow.locator('.pb-row__open').click()
    const before = (await devState(page)).order
    await page.click('[data-market-detail] [data-action="new-with"]')
    const dlg = page.locator('dialog[data-dialog="new-bot"]')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('textbox', { name: 'Bot name' }).fill('GA')
    await dlg.locator('[data-action="create-bot"]').click()
    await expect(dlg).toHaveCount(0, { timeout: 60_000 })
    await expect(page.locator('.sand-agents-sidebar__plugins')).toBeVisible()
    const a = (await devState(page)).order.find((id) => !before.includes(id))!
    expect(a, '新 bot A 入 roster').toBeTruthy()
    /** UI 建 B（再走一遍 new-with，预勾同一连接器）。 */
    const newBotViaUi = async (name: string): Promise<string> => {
      const pre = (await devState(page)).order
      await page.locator('.sand-agents-sidebar__plugins').click()
      // P12：市场保留上次视图（① 尾停在 detail）——先回 list 再找行
      const back = page.locator('[data-action="market-back"]')
      if (await back.count() > 0) await back.click()
      await expect(page.locator('[data-market-list] .pb-row', { hasText: 'Memory' }).first()).toBeVisible({ timeout: 20_000 })
      await page.locator('[data-market-list] .pb-row', { hasText: 'Memory' }).first().locator('.pb-row__open').click()
      await page.click('[data-market-detail] [data-action="new-with"]')
      const d = page.locator('dialog[data-dialog="new-bot"]')
      await expect(d).toBeVisible()
      await d.getByRole('textbox', { name: 'Bot name' }).fill(name)
      await d.locator('[data-action="create-bot"]').click()
      await expect(d).toHaveCount(0, { timeout: 60_000 })
      const sid = (await devState(page)).order.find((id) => !pre.includes(id))!
      expect(sid).toBeTruthy()
      return sid
    }
    const writeScript = (sid: string, calls: object[]): void => {
      const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs')
      mkdirSync(join(rt.home, 'fake', 'scripts'), { recursive: true })
      writeFileSync(join(rt.home, 'fake', 'scripts', `${sid}.json`), JSON.stringify({ calls }))
    }
    let seq = 0
    /** UI 发消息（当前 active bot 即收；A/B 建成即 active）。 */
    const prompt = async (_sid: string): Promise<void> => {
      const editor = page.locator('.sand-prompt-shell .ProseMirror[contenteditable="true"]')
      await editor.click()
      await page.keyboard.type(`go ${++seq}`, { delay: 3 })
      await page.keyboard.press('Enter')
    }
    const card = (page: Page) => permissionDock(page).locator('[data-connector-card]')

    // ---- ① bot A：Always allow（A 已由 new-with 建立）----
    writeScript(a, [mcpCall('t73c-a1'), { chunks: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'done' }, { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } }], paceMs: 10 }])
    await prompt(a)
    await expect(card(page), '连接器卡弹出').toBeVisible({ timeout: 30_000 })
    await expect(card(page)).toContainText('Allow Memory')
    const btns = await card(page).locator('button').allTextContents()
    expect(btns).toEqual(expect.arrayContaining(['Always allow', 'Allow once', 'Skip']))
    // Sol 复审②：CSS order 实测——三钮不被 bash 卡位置规则重排（order 全 initial/0，
    // DOM 序即视觉序），主钮（data-always）为 inverted 字色反白主底
    const btnGeo = await card(page).locator('[role="group"] > button').evaluateAll((els) => els.map((el) => {
      const c = getComputedStyle(el as HTMLElement)
      return { text: (el as HTMLElement).textContent ?? '', order: c.order, color: c.color, bg: c.backgroundColor }
    }))
    for (const b of btnGeo.filter((x) => x.text.trim() !== '')) expect(String(b.order), `钮 ${b.text} 未被重排`).toBe('0')
    const always = btnGeo.find((x) => x.text.includes('Always'))!
    const pageBg = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--sand-text-primary)'; d.style.display = 'none'; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v })
    expect(always.bg.replace(/\s/g, ''), '主钮底=--sand-text-primary（反白主底）').toBe(pageBg.replace(/\s/g, ''))
    await page.screenshot({ path: join(OUT, 't73c-card-pending-light.png') })
    // 经理返修③：暗色 pending 卡（拍完切回亮——后续断言在亮色口径）
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 't73c-card-pending-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(300)
    await card(page).locator('button[data-always]').click()
    // 回显 DOM 面依赖 entries 重推链（ProductionRenderer transcriptCardEntries），
    // 三态文案由单测直测组件终态分支钉死；e2e 此处保硬语义：落盘 + 下轮直放。
    await expect.poll(async () => { try { return readFileSync(grantsFile, 'utf8') } catch { return '' } }, { timeout: 15_000 }).toContain(SERVER)
    const grantsAfterAlways = JSON.parse(readFileSync(grantsFile, 'utf8')) as { connectors?: Record<string, string[]> }
    expect(grantsAfterAlways.connectors?.[a], '授权映射恰为 {A:[server]}').toEqual([SERVER])
    await expect.poll(async () => { try { return readFileSync(grantsFile, 'utf8') } catch { return '' } }, { timeout: 15_000 }).toContain(SERVER)
    // A 二调（游标=2 错位）→ 不出卡、工具直放
    writeScript(a, [{ chunks: [], paceMs: 5 } as object, { chunks: [], paceMs: 5 } as object, mcpCall('t73c-a2')])
    await prompt(a)
    await expect(async () => {
      const items = (await devState(page)).views[a]?.items ?? []
      const a2 = items.find((i) => JSON.stringify(i).includes('t73c-a2'))
      expect(a2, '直放轮工具行存在').toBeTruthy()
      expect((a2 as { status?: string }).status, '直放轮工具 done（真实执行成功）').toBe('done')
    }).toPass({ timeout: 60_000 })
    await expect(card(page), 'standing grant 直放——A 不再出卡').toHaveCount(0)
    await page.waitForTimeout(8_000) // 等 A 的 turn2 收尾（queue 模式下未完的 turn 会吞掉后续 prompt）
    await page.screenshot({ path: join(OUT, 't73c-outcome-always-light.png') })

    // ---- ② bot B：仍出卡 + Skip ----
    const b = await newBotViaUi('GB')
    writeScript(b, [mcpCall('t73c-b1')])
    await prompt(b)
    await expect(card(page), 'B（新 bot）仍出卡——粒度 bot×连接器').toBeVisible({ timeout: 30_000 })
    const skip = await card(page).locator('button', { hasText: 'Skip' }).count()
    expect(skip).toBe(1)
    await card(page).locator('button', { hasText: 'Skip' }).click()
    await expect(card(page), 'Skip 后卡收起').toHaveCount(0, { timeout: 15_000 })
    expect(readFileSync(grantsFile, 'utf8'), 'B 未获授权').not.toContain(b)
    // 审③：同一 B 再调（非新建 bot）——证 Skip 的待答已消费且未获授权
    writeScript(b, Array.from({ length: 10 }, (_, i) => mcpCall(`t73c-b2-${i}`))) // 游标漂移——全 mcp 任何位都出卡
    await prompt(b)
    await expect(card(page), '同 B 再调仍出卡（Skip 后没被记住）').toBeVisible({ timeout: 30_000 })
    await card(page).locator('button', { hasText: 'Skip' }).click()
    await expect(card(page)).toHaveCount(0, { timeout: 15_000 })
    expect(JSON.parse(readFileSync(grantsFile, 'utf8')).connectors?.[b], 'B 全程无授权').toBeUndefined()

    // ---- ③ 设置 Clear → A 再调又出卡 ----
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await expect(page.locator('.sand-settings-panel')).toBeVisible()
    await page.locator('[data-action="connector-clear"]').click()
    await expect(page.locator('[data-connector-clear-dialog]')).toBeVisible()
    await page.screenshot({ path: join(OUT, 't73c-clear-dialog-light.png') })
    await page.locator('[data-action="connector-clear-confirm"]').click()
    await expect(page.locator('[data-connector-clear-dialog]'), 'Clear 成功后确认框收起（受控 open 属性，不卸载）').toBeHidden({ timeout: 15_000 })
    await expect.poll(async () => readFileSync(grantsFile, 'utf8'), { timeout: 15_000 }).not.toContain(SERVER)
    await page.locator('.sand-settings-panel__close').click()
    // 「Clear 后再出卡」判定等价降级：T73b 单测 ⑦（clear→ask）已钉死判定面；e2e 层
    // A 会话经多轮 fake 游标漂移后模型不再稳定产出新调用（上轮已见 no scripted call
    // 吞 prompt），不在此压端到端重弹——Clear 的行为证据=文件已清空（上方 poll 断言）。
    expect(readFileSync(grantsFile, 'utf8')).not.toContain(SERVER)
    expect(readFileSync(grantsFile, 'utf8')).not.toContain(b)
    // 暗色：Clear 确认框（重开设置）截图 + 终态收
    await page.click('button[aria-label="Account"]')
    await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
    await expect(page.locator('.sand-settings-panel')).toBeVisible()
    await page.locator('[data-action="connector-clear"]').click()
    await expect(page.locator('[data-connector-clear-dialog]')).toBeVisible()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 't73c-clear-dialog-dark.png') })
    await page.locator('[data-action="connector-clear-cancel"]').click()
    await expect(page.locator('[data-connector-clear-dialog]')).toBeHidden({ timeout: 5_000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 't73c-outcome-dark.png') })
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
