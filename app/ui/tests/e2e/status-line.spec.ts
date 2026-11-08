// T23 · 0.79.3 状态行（工单验收 3 ①-④）：回合进行中主聊天出现「吉祥物 + 活动短语」状态行，
// typing 三点退役。活动链：reasoning 流（thinking）→ bash（running_commands）→ 结束退场 140ms。
// 前置：pnpm build（run-e2e 不重建 dist）。
import { expect, test, type Page } from 'playwright/test'
import {
  createBots, devState, launchProduct, openBot, permissionDock, send, textCall,
} from '../support/ui.ts'

const THINKING = ['Thinking it through', 'Mulling it over', 'Putting it together']

/** 一次模型调用：可选 reasoning（可 gate 卡流）+ 正文 + 一个 tool-call。 */
function stepCall(opts: { text?: string[]; reasoning?: string; tool?: { name: string; input: object; id: string }; gateId?: string }): object {
  const chunks: object[] = []
  let i = 0
  if (opts.reasoning !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'reasoning' }, { type: 'reasoning-delta', index: i, text: opts.reasoning },
      { type: 'block-end', index: i, block: { type: 'reasoning', text: opts.reasoning } })
    i += 1
  }
  if (opts.text !== undefined) {
    chunks.push({ type: 'block-start', index: i, blockType: 'text' }, ...opts.text.map((text) => ({ type: 'text-delta', index: i, text })),
      { type: 'block-end', index: i, block: { type: 'text', text: opts.text.join('') } })
    i += 1
  }
  if (opts.tool !== undefined) {
    const args = JSON.stringify(opts.tool.input)
    chunks.push({ type: 'block-start', index: i, blockType: 'tool-call' }, { type: 'tool-call-delta', index: i, id: opts.tool.id, name: opts.tool.name, argumentsDelta: args },
      { type: 'block-end', index: i, block: { type: 'tool-call', id: opts.tool.id, name: opts.tool.name, arguments: args } })
    chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } })
  } else {
    chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'stop' } })
  }
  return { chunks, paceMs: 60, ...(opts.gateId !== undefined ? { gateAfterChunk: 1, gateId: opts.gateId } : {}) }
}

const statusLine = (page: Page) => page.locator('.sand-virtual-transcript .sand-status-line')
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const openGate = (home: string, id: string): void => {
  mkdirSync(join(home, 'gates'), { recursive: true })
  writeFileSync(join(home, 'gates', id), '')
}

test('① thinking：状态行出现=transcript 末元素、文字∈附录 A 三句、typing 点为 0', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'SL-A' }]) as [string]
    const gate = `t23-a-${Date.now()}`
    rt.writeScriptCalls(sid, [
      stepCall({ reasoning: '先想想这个问题。', text: ['A 首答'], gateId: gate }),
      textCall(['E 终答']),
    ])
    await openBot(page, 'SL-A')
    await send(page, '想想')
    const line = statusLine(page)
    await expect(line).toBeVisible({ timeout: 30_000 }) // reasoning 流卡 gate → thinking 态
    // 是滚动容器的最后一个元素子节点
    const isLast = await page.evaluate(() => {
      const sc = document.querySelector('.sand-virtual-transcript')
      const last = sc?.lastElementChild
      return last?.classList.contains('sand-status-line') ?? false
    })
    expect(isLast).toBe(true)
    await expect(line).toHaveAttribute('data-activity', 'thinking')
    const text = await line.locator('.sand-activity-label__text').innerText()
    expect(THINKING).toContain(text)
    await expect(page.locator('.sand-typing-indicator')).toHaveCount(0)
    openGate(rt.home, gate)
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
  } finally {
    await env.stop()
  }
})

test('② 切换可见：reasoning → bash 后文字变 Running a few commands（data-activity=running_commands）', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'SL-B' }]) as [string]
    const gate = `t23-b-${Date.now()}`
    rt.writeScriptCalls(sid, [
      { ...(stepCall({ reasoning: '先想想。', text: ['A 首答'], tool: { name: 'bash', input: { command: 'echo t23', description: 'T23 probe' }, id: 't23-t1' } }) as object), gateId: gate },
      textCall(['E 终答']),
    ])
    await openBot(page, 'SL-B')
    await send(page, '跑一下')
    const line = statusLine(page)
    await expect(line).toBeVisible({ timeout: 30_000 })
    await expect(line).toHaveAttribute('data-activity', 'thinking')
    const firstSeen = Date.now()
    openGate(rt.home, gate)
    // bash 出审批卡（工具 running）→ running_commands（间隔记录进回执；硬断言在 unit）
    await expect(permissionDock(page)).toBeVisible({ timeout: 30_000 })
    await expect(line).toHaveAttribute('data-activity', 'running_commands', { timeout: 20_000 })
    await expect(line).toContainText('Running a few commands')
    console.log('switch-interval-ms:', Date.now() - firstSeen)
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
    await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
  } finally {
    await env.stop()
  }
})

test('③ 退场：终答出现后 2s 内状态行计数 0、终答正文可见', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [sid] = await createBots(page, [{ title: 'SL-C' }]) as [string]
    // 一次调用收尾（finish stop）：正文即终答——退场断言不需要第二轮
    rt.writeScriptCalls(sid, [stepCall({ reasoning: '想一想', text: ['C 终答即首答'] })])
    await openBot(page, 'SL-C')
    await send(page, '随便')
    await expect(statusLine(page)).toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => (await devState(page)).views[sid]?.endReason, { timeout: 30_000 }).toBe('completed')
    await expect(page.locator('.sand-virtual-transcript .sand-message-prose', { hasText: 'C 终答即首答' })).toBeVisible({ timeout: 20_000 })
    await expect(statusLine(page)).toHaveCount(0, { timeout: 2000 + 140 })
  } finally {
    await env.stop()
  }
})

test('④ 切 bot：进行中切到空闲 bot 无状态行；切回状态行还在', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, rt } = env
    const [a, b] = await createBots(page, [{ title: 'SL-D1' }, { title: 'SL-D2' }]) as [string, string]
    const gate = `t23-d-${Date.now()}`
    rt.writeScriptCalls(a, [stepCall({ reasoning: '长思考中', text: ['A 首答'], gateId: gate })])
    rt.writeScriptCalls(b, [textCall(['另一答'])])
    await openBot(page, 'SL-D1')
    await send(page, '想着')
    await expect(statusLine(page)).toBeVisible({ timeout: 30_000 })
    await openBot(page, 'SL-D2')
    await expect(statusLine(page)).toHaveCount(0, { timeout: 10_000 })
    await openBot(page, 'SL-D1')
    await expect(statusLine(page)).toBeVisible({ timeout: 10_000 })
    openGate(rt.home, gate)
    await expect.poll(async () => (await devState(page)).views[a]?.endReason, { timeout: 30_000 }).toBe('completed')
  } finally {
    await env.stop()
  }
})
