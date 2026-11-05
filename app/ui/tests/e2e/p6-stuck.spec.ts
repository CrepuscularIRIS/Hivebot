// P6-17 D8 真链路 e2e（PLAN P6-17 行 + GU-P6-15-r1 并入三条）。
// 与 p6-workers（测试插件代做编排 wire）不同：本 spec 经 P2SDK_PATCH 挂生产
// orchestration.yml（P6-14b 闸门只管生产默认链，不管测试），主 bot 的 create_bot
// 走真 ⑤ 通道到 Electron main（createWorkerBot：mintWorkspace → createdBy 落盘 →
// session/create → rename → respond），assign / 回报全走 P6-21 delivery + P6-12
// Reporter；ASK 卡是真的（P5-31 审批 dock，bash ASK 档），作答走 renderer 生产
// 路径（P5-28 / $events result，同 eventId）。
// 提问 leg：P5-33 提问卡 UI 未建（p5-parity 仍 blocked），worker 侧真提问由
// ask_user_question + 生产作答路径覆盖（测试 2 的 Unreader）；卡面 UI 留待 P5-33。
// 前置：pnpm build（LEARNINGS 2026-11-03：run-e2e 不重建 dist）。Xvfb only。
import { expect, test, type Locator, type Page } from 'playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmkdir } from '../support/tmp-sweep.ts'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import {
  PRESETS_PATCH, SDK_ROOT, assistantRows, botItem, evidenceOut, permissionDock, send, transcript, waitProductReady,
} from '../support/ui.ts'

const OUT = evidenceOut('P6-17')
const ORCH_YML = join(SDK_ROOT, 'profile', 'patches', 'orchestration.yml')
const INSPECT_URL = pathToFileURL(join(SDK_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')).href
const PLUGIN_URL = pathToFileURL(join(SDK_ROOT, 'src', 'orchestration', 'main-channel.mjs')).href

/** overlay 写法同 orchestration-create-live.test.ts（后层同 id 行覆盖 config）。 */
function overlayPatch(name: string, rows: string): string {
  const file = join(tmkdir('bot-p617-patch-'), name)
  writeFileSync(file, `- insert:\n${rows}`)
  return file
}
const inspectRows = `    - id: p610-inspect\n      name: '${INSPECT_URL}'\n`

interface Real { rt: SdkRuntime; page: Page; home: string; main: string; stop(): Promise<void> }

/** 起 runtime（真 orchestration 插件 + fake 模型 + inspect）→ 主 bot session + bots.json → 壳。 */
async function launchReal(capacity?: number): Promise<Real> {
  const home = tmkdir('bot-p617-')
  const base = `${PRESETS_PATCH}:${fakeOverlayPath()}:${overlayPatch('p617-inspect.yml', inspectRows)}:${ORCH_YML}`
  const patch = capacity === undefined ? base
    : `${base}:${overlayPatch('p617-cap.yml', `    - id: pbots-orchestration\n      name: '${PLUGIN_URL}'\n      config:\n        capacity: ${capacity}\n`)}`
  // P2SDK_ORCH_DATA_DIR 必须显式给：start.ts 不把 PBOTS_DATA_DIR 透传进 dsh（P5-01
  // 决策 15，mask 根不进模型侧 env），orch 插件 identity 会回落 $HOME/.config 读到
  // 真实 bots.json（SDK live 测试同款双变量）。
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch, cwd: tmkdir('bot-p617-ws-'), dataDir, env: { P2SDK_ORCH_DATA_DIR: dataDir } })
  const main = randomUUID()
  await rt.client.call('session/create', { request: { sessionId: main } })
  await rt.client.call('session/rename', { request: { sessionId: main, title: 'Main Bot' } })
  mkdirSync(join(home, 'data'), { recursive: true })
  writeFileSync(join(home, 'data', 'bots.json'), JSON.stringify({ version: 1, mainBotId: main, recipes: {}, bots: {} }))
  const shell = await launchShell({ home, env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  await waitProductReady(shell.page)
  return { rt, page: shell.page, home, main, async stop() { await shell.stop(); await rt.stop() } }
}

// ---- fake 脚本构造（p6-workers stepCall / report-live gatedText 同款帧形状）----

/** 一次模型调用：可选正文 + N 个工具调用块；finish 缺省按有无工具定（tool-calls 续回合 / stop 收回合）。 */
function step(pieces: { text?: string; tools?: Array<{ id: string; name: string; input: object }>; finish?: { kind: string; failure?: object } }): object {
  const tools = pieces.tools ?? []
  const blocks: object[] = []
  let index = 0
  if (pieces.text !== undefined) {
    blocks.push({ type: 'block-start', index, blockType: 'text' }, { type: 'text-delta', index, text: pieces.text }, { type: 'block-end', index, block: { type: 'text', text: pieces.text } })
    index += 1
  }
  for (const tool of tools) {
    const args = JSON.stringify(tool.input)
    blocks.push(
      { type: 'block-start', index, blockType: 'tool-call' },
      { type: 'tool-call-delta', index, id: tool.id, name: tool.name, argumentsDelta: args },
      { type: 'block-end', index, block: { type: 'tool-call', id: tool.id, name: tool.name, arguments: args } },
    )
    index += 1
  }
  return { chunks: [...blocks, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: pieces.finish ?? { kind: tools.length > 0 ? 'tool-calls' : 'stop' } }], paceMs: 10 }
}
const textStep = (t: string): object => step({ text: t })
const bashStep = (id: string, command: string, description: string): object => step({ tools: [{ id, name: 'bash', input: { command, description } }] })
/** gate 挡在 chunk 间：release 前 turn 保持 running（running 档 / failed 档的定时器）。 */
const gatedStep = (gateId: string, finish?: { kind: string; failure?: object }): object => ({
  gateAfterChunk: 1, gateId, paceMs: 10, chunks: [
    { type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: '.' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '.' } }, { type: 'finish', reason: finish ?? { kind: 'stop' } },
  ],
})
const questionStep = (id: string, questions: object[]): object => step({ tools: [{ id, name: 'ask_user_question', input: { questions } }] })

const openGate = (rt: SdkRuntime, id: string): void => {
  mkdirSync(join(rt.home, 'gates'), { recursive: true })
  writeFileSync(join(rt.home, 'gates', id), '')
}
/** 未知 id 的 session（Electron main 铸的 worker）回落 scripts/default.json（fake/plugin.mjs 既有机制，P5-05）。 */
const writeScript = (rt: SdkRuntime, sessionId: string, calls: object[]): void => {
  mkdirSync(join(rt.home, 'fake', 'scripts'), { recursive: true })
  writeFileSync(join(rt.home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({ calls }))
}
/** requests.jsonl：全部模型调用（sessionId / purpose / userTexts）——「主 bot 模型侧作答调用数」的观测面。 */
interface ModelCall { sessionId: string; purpose: string | null; userTexts: string[] }
const modelCalls = (rt: SdkRuntime, sessionId: string): ModelCall[] =>
  readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n')
    .map((line) => JSON.parse(line) as ModelCall).filter((c) => c.sessionId === sessionId)

// ---- 观测 / 操作 ----

interface LogEvent { seq: number; type: string; id?: string; sourceKind?: string; items?: Array<Record<string, unknown>>; text?: string }
const readLog = async (rt: SdkRuntime, sessionId: string): Promise<LogEvent[]> =>
  ((await rt.client.call('p610/control', { request: { op: 'read', sessionId } })) as { events: LogEvent[] }).events
/** 主 bot 侧已落盘的回报消息集合（user/message，pbots-worker 来源）。 */
const reportItems = async (rt: SdkRuntime, sessionId: string): Promise<Array<Record<string, unknown>>> => {
  const events = await readLog(rt, sessionId)
  return events.filter((e) => e.type === 'user/message' && e.sourceKind === 'pbots-worker').flatMap((e) => e.items ?? [])
}
const until = async (pred: () => Promise<boolean>, label: string, ms = 60_000): Promise<void> => {
  const deadline = Date.now() + ms
  for (;;) {
    if (await pred()) return
    if (Date.now() > deadline) throw new Error(`${label}: timed out`)
    await new Promise((r) => setTimeout(r, 150))
  }
}
/** 主 bot 日志里 create_bot 工具结果（{"sessionId","name",…}）按 name 找 worker——
 * wire 原文即带 name↔sessionId，不依赖 rename / session/list 的 title 字段。 */
const workerIdByName = async (rt: SdkRuntime, mainId: string, name: string): Promise<string> => {
  let found: string | undefined
  await until(async () => {
    const events = await readLog(rt, mainId)
    found = events.flatMap((e) => {
      if (e.type !== 'tool/result') return []
      try {
        const parsed = JSON.parse(e.text ?? '{}') as { name?: string; sessionId?: string }
        return parsed.name === name && parsed.sessionId !== undefined ? [parsed.sessionId] : []
      } catch { return [] }
    })[0]
    return found !== undefined
  }, `create_bot result for "${name}" lands in main log`)
  return found!
}
/** $events waterfall 帧（approval/request / user-questions/request）→ eventId（作答用）。 */
const waterfallEventId = async (page: Page, agentId: string, event: string): Promise<string> => {
  let id: string | undefined
  await until(async () => {
    id = await page.evaluate(({ sid, ev }) => {
      const items = (window as unknown as { __pbotsDev: { events: { items: Array<{ type?: string; event?: string; agentId?: string; eventId?: string }> } } }).__pbotsDev.events.items
      return items.find((it) => it.type === 'waterfall' && it.event === ev && it.agentId === sid && typeof it.eventId === 'string')?.eventId
    }, { sid: agentId, ev: event })
    return id !== undefined
  }, `${event} waterfall for ${agentId}`)
  return id!
}
/** renderer 生产路径作答（P5-28 / P5-31 同一条：window.pbots → M1 → dsh $events/result）。 */
async function answerEvent(page: Page, eventId: string, value: unknown): Promise<void> {
  const result = await page.evaluate(
    ({ eid, val }) =>
      (window as unknown as { pbots: { api(method: string, args?: unknown): Promise<{ ok: boolean; error?: { code: string; message: string } }> } })
        .pbots.api('$events/result', {
          clientId: (window as unknown as { __pbotsDev: { events: { clientId?: string } } }).__pbotsDev.events.clientId,
          eventId: eid,
          outcome: { kind: 'result', value: val },
        }),
    { eid: eventId, val: value },
  )
  expect(result.ok, JSON.stringify(result.error ?? {})).toBe(true)
}
const answers = (page: Page): Promise<Array<{ eventId: string; value: string }>> =>
  page.evaluate(() => (window as unknown as { __pbotsShim: { answers: Array<{ eventId: string; value: string }> } }).__pbotsShim.answers)
/** view.asked 的键集（approval/asked.id 一路；与 $events eventId 不同源，FINAL §2-5 双认）。 */
const askedIds = (page: Page, sid: string): Promise<string[]> =>
  page.evaluate((id) => Object.keys((window as unknown as { __pbotsDev: { state: { views: Record<string, { asked?: Record<string, string> }> } } }).__pbotsDev.state.views[id]?.asked ?? {}), sid)

// ---- P6-15 FINAL 口径的视觉面（p6-workers 同款 helper：等主题过渡稳定再拍）----

const S = (page: Page, id: string) => page.locator(`.sand-agents-section[data-section-id="${id}"]`)
const rowIn = (page: Page, id: string, name: string) => S(page, id).locator(`.sand-agent-item[aria-label="${name}"]`)
const sectionNames = (page: Page, id: string) => S(page, id).locator('.sand-agent-item').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
const active = async (page: Page, name: string) => expect(botItem(page, name)).toHaveAttribute('data-active', 'true')

async function bothThemes(page: Page, name: string): Promise<void> {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode })
    await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
    await page.waitForTimeout(600) // GU-P6-15-r1 ①：稳定态才截图
    await page.screenshot({ path: join(OUT, `${name}-${mode}.png`) })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

/**
 * GU-P6-15-r1：worker 完成瞬间的「无标记窗口」（follow 与 $events 两状态源时序）。
 * ~50ms 采样侧栏行可见标记（running 载体 / Needs attention / Unread activity / 全无），
 * 直到 stop 条件；样本落盘 evidence，REPORT 汇总最长无标记时长。
 */
async function sampleRowStates(page: Page, row: Locator, stop: () => Promise<boolean>, budgetMs = 20_000): Promise<Array<{ t: number; state: string }>> {
  const samples: Array<{ t: number; state: string }> = []
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const state = await row.evaluate((el) => {
      const running = el.querySelector('.sand-agent-item__activity, .sand-agent-item__corner-dot') !== null
      const unread = el.querySelector('.sand-agent-item__trailing[aria-label="Unread activity"]') !== null
      const attention = el.querySelector('.sand-agent-item__trailing[aria-label="Needs attention"]') !== null
      return running ? 'running' : unread ? 'unread' : attention ? 'blocked' : 'none'
    }).catch(() => 'gone')
    samples.push({ t: Date.now() - t0, state })
    if (await stop()) break
    await page.waitForTimeout(40)
  }
  return samples
}
const noMarkerStats = (samples: Array<{ t: number; state: string }>): { noneSamples: number; maxGapMs: number; seen: string[] } => {
  let maxGap = 0
  let run = 0
  for (const s of samples) {
    if (s.state === 'none') { run += 1; maxGap = Math.max(maxGap, run * 50) } else run = 0
  }
  return { noneSamples: samples.filter((s) => s.state === 'none').length, maxGapMs: maxGap, seen: [...new Set(samples.map((s) => s.state))] }
}

// =====================================================================================
// 测试 1 · D8 全条（真链路）：真 create_bot → worker 真 ASK 审批卡 → 主 bot 点名 →
// 原卡作答（同 eventId）→ end 回主 bot；主 bot 模型侧作答调用数 === 0；GU dock 聚焦
// 图 + notice-view 按 eventId 定位（双认）。
// =====================================================================================

test('P6-17 D8 全条真链路：真 create_bot → worker 真 ASK 卡 → 点名 → 原卡作答（同 eventId）→ end 回主 bot', async () => {
  test.setTimeout(300_000)
  const env = await launchReal()
  try {
    const { page, rt, main: M } = env
    // 主 bot 脚本：turn1 建真 worker（create_bot，tool-calls 续步）→ turn2 收 ask 回报点名 → turn3 收 end 回报总结
    writeScript(rt, M, [
      step({ text: 'On it — spinning up Test fixer.', tools: [{ id: 'p617-c1', name: 'create_bot', input: { name: 'Test fixer', prompt: 'Publish the docs: push the branch.' } }] }),
      textStep('Dispatched to Test fixer.'),
      textStep('Test fixer is waiting for your approval to push the docs.'),
      textStep('Test fixer pushed the docs. All done.'),
    ])
    // worker（Electron main 铸 id，测试不可知）回落 default.json：bash 真 ASK → 批准后续跑收尾
    writeScript(rt, 'default', [bashStep('p617-w1', 'git push origin docs', 'publish docs'), textStep('Pushed the docs.')])

    await botItem(page, 'Main Bot').click()
    await send(page, 'Publish the docs please.')
    // 真链路：worker 由 Electron main 铸出（createdBy 落盘 + rename），assign 真投递（首条 = pbots-assign:*）
    const W = await workerIdByName(rt, M, 'Test fixer')
    await until(async () => (await readLog(rt, W)).some((e) => e.type === 'user/message' && (e.id ?? '').startsWith('pbots-assign:')), 'real assign lands in worker log')

    // D8：worker 真 ASK 卡（bash 审批）→ ask 回报恰 1 项 → 主 bot 点名（turn2）
    await until(async () => (await reportItems(rt, M)).some((i) => i.kind === 'ask'), 'ask report lands')
    const askItem = (await reportItems(rt, M)).find((i) => i.kind === 'ask')!
    expect(askItem.awaiting).toBe('approval')
    const askEventId = String(askItem.eventId) // approval/asked.id（fold 一路）
    await until(async () => (await askedIds(page, W)).includes(askEventId), 'view.asked records the ask (双认第二路)')
    const waterfallId = await waterfallEventId(page, W, 'approval/request') // $events 一路（与 asked.id 不同源）

    // notice 视觉（P6-15 FINAL 口径）：Messaging 行 + 回报卡 + 点名正文 + 主 bot 行 blocked 点
    const peer = (kind: string) => transcript(page).locator(`[data-pbots-peer="${kind}"]`)
    await expect(peer('assign')).toHaveCount(1, { timeout: 30_000 })
    await expect(peer('assign')).toContainText('Messaging Test fixer')
    await expect(peer('report')).toHaveCount(1, { timeout: 30_000 })
    const card = peer('report').first()
    await expect(card.locator('[data-pbots-item-kind="ask"] [data-pbots-state]')).toHaveText('Needs you')
    await expect(card.locator('[data-pbots-worker-name]')).toHaveText(['Test fixer'])
    await expect(permissionDock(page)).toHaveCount(0) // 主 bot 区无审批按钮（E16）
    await expect(assistantRows(page).last()).toContainText('Test fixer is waiting for your approval') // 点名消息
    const workersSection = `pbots:workers:${M}`
    const workerRow = rowIn(page, workersSection, 'Test fixer')
    await expect(workerRow).toHaveCount(1, { timeout: 30_000 })
    await expect(workerRow.locator('.sand-agent-item__trailing[aria-label="Needs attention"]')).toHaveCount(1)
    await expect(workerRow.locator('.sand-agent-item__preview')).toHaveText('Waiting for you: git push origin docs')
    const mainRow = rowIn(page, `pbots:main:${M}`, 'Main Bot')
    await expect(mainRow.locator('.sand-agent-item__trailing[aria-label="Needs attention"]')).toHaveCount(1)
    await expect(mainRow.locator('.sand-agent-item__preview')).toHaveText('Waiting for you: Test fixer: git push origin docs')
    await bothThemes(page, 'main-messaging-report') // GU：Messaging 行 + 回报卡（亮暗）

    // GU notice-view 导航接 eventId：点回报卡 ask 项 → 打开 worker → 焦点落原审批卡（容器，非按钮）
    await card.locator('button', { hasText: 'Review in Test fixer' }).click()
    await active(page, 'Test fixer')
    await expect(transcript(page).locator('[data-pbots-peer="task"]')).toContainText('From Main Bot') // D7：worker 侧任务卡（真 assign）
    await expect(permissionDock(page)).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => page.evaluate(() => {
      const a = document.activeElement
      return a !== null && a.closest('[aria-label="Local tool permissions"]') !== null && a.tagName !== 'BUTTON'
    }), { timeout: 5_000 }).toBe(true)
    await bothThemes(page, 'worker-dock-focused') // GU：dock 聚焦（亮暗）

    // 用户在 worker 原卡作答（Allow once）→ 同一 eventId（waterfall 原帧），值域 allowed-once
    expect(await answers(page)).toHaveLength(0)
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click()
    await expect(permissionDock(page)).toHaveCount(0, { timeout: 20_000 })
    const sent = await answers(page)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.eventId).toBe(waterfallId) // 原卡同 eventId
    expect(sent[0]!.value).toBe('allowed-once')

    // worker 续跑完成 → end 回报恰 1 项（completed）→ 主 bot turn3 总结；ask 项转 Answered
    await until(async () => (await reportItems(rt, M)).some((i) => i.kind === 'end'), 'end report lands')
    const endItem = (await reportItems(rt, M)).find((i) => i.kind === 'end')!
    expect(endItem.outcome).toBe('completed')
    await botItem(page, 'Main Bot').click()
    await active(page, 'Main Bot')
    await expect(peer('report')).toHaveCount(2, { timeout: 30_000 })
    await expect(peer('report').nth(1).locator('[data-pbots-state]')).toHaveText('Done')
    await expect(card.locator('[data-pbots-item-kind="ask"] [data-pbots-state]')).toHaveText('Answered', { timeout: 10_000 })

    // 主 bot 模型侧：恰 4 次调用（派活 / 消化 create 结果 / 点名 / 总结），无一次携带作答
    const calls = modelCalls(rt, M)
    expect(calls).toHaveLength(4)
    expect(calls.every((c) => c.userTexts.every((t) => !t.includes('allowed-once'))), '主 bot 模型侧作答调用数 === 0').toBe(true)
  } finally {
    await env.stop()
  }
})

// =====================================================================================
// 测试 2 · GU-P6-15-r1 真链路重拍：4 态侧栏 / 合批卡 / failed 行（亮暗）+ 完成瞬间
// 无标记窗口观察。4 个真 worker（capacity=5）：Asker 永挂审批（blocked）、Runner
// gate 挂住（running）、Unreader 审批后真提问→作答→完成（unread）、Failer gate 后
// error 收尾（failed 未读 → 读取后归档 Done）。主 bot 脚本按回报回合逐条消费
//（turn1 建队 → 4-ask 合批 → Unreader 提问 ask → Unreader end → Failer end error），
// 尾部 2 条 spare 防回报拆批多耗回合。
// =====================================================================================

test('P6-17 GU 真链路：4 态侧栏 / 合批卡 / failed 行重拍 + 完成瞬间无标记窗口', async () => {
  test.setTimeout(300_000)
  const env = await launchReal(5)
  try {
    const { page, rt, main: M } = env
    const names = { asker: 'Asker', runner: 'Runner', unreader: 'Unreader', failer: 'Failer' }
    writeScript(rt, M, [
      step({
        text: 'On it — hiring the crew.',
        tools: Object.values(names).map((name, i) => ({ id: `p617-g${i}`, name: 'create_bot', input: { name, prompt: `Do the ${name} job.` } })),
      }),
      textStep('Dispatched to the crew.'),
      textStep('Crew status received.'),
      textStep('Unreader has a question about the scope.'),
      textStep('Unreader finished the research.'),
      textStep('Failer hit an error pushing.'),
      textStep('Noted.'),
      textStep('Noted.'),
    ])
    // 4 worker 共用 default.json[0]：bash 真 ASK（全 blocked 在审批上 → 测试从容补写各自脚本）
    writeScript(rt, 'default', [bashStep('p617-w0', 'git push origin docs', 'publish docs')])

    await botItem(page, 'Main Bot').click()
    await send(page, 'Publish everything please.')
    const W = {
      asker: await workerIdByName(rt, M, names.asker),
      runner: await workerIdByName(rt, M, names.runner),
      unreader: await workerIdByName(rt, M, names.unreader),
      failer: await workerIdByName(rt, M, names.failer),
    }
    // 合批：4 个审批 ask 并成回报（全部在主 bot turn1 结束前落日志 → 单次 flush 收齐）
    await until(async () => (await reportItems(rt, M)).filter((i) => i.kind === 'ask' && i.awaiting === 'approval').length === 4, 'batched ask report (4 approval asks) lands')
    // 各自旅程（cursor 已到 1；[0] 占位不消费）
    writeScript(rt, W.runner, [textStep('(unused)'), gatedStep('p617-run-hold')])
    writeScript(rt, W.unreader, [
      textStep('(unused)'),
      questionStep('p617-q1', [{ id: 'q1', question: 'Which scope?', header: 'Scope', options: [{ label: 'full' }, { label: 'short' }] }]),
      textStep('Research done: 3 sources found.'),
    ])
    writeScript(rt, W.failer, [textStep('(unused)'), gatedStep('p617-fail-hold', { kind: 'error', failure: { message: 'push rejected by remote', code: 'PUSH' } })])

    // 放行三个（Asker 永挂）：审批按 $events 原帧作答（生产路径）
    await answerEvent(page, await waterfallEventId(page, W.runner, 'approval/request'), 'allowed-once')
    await answerEvent(page, await waterfallEventId(page, W.failer, 'approval/request'), 'allowed-once')
    await answerEvent(page, await waterfallEventId(page, W.unreader, 'approval/request'), 'allowed-once')
    // Unreader 真 提问（Reporter 的 QUESTION_TOOL 分支）→ ask 项（awaiting question）
    await until(async () => (await reportItems(rt, M)).some((i) => i.kind === 'ask' && i.awaiting === 'question'), 'question ask report lands')
    const qEventId = await waterfallEventId(page, W.unreader, 'user-questions/request')

    // 完成瞬间无标记窗口观察：从作答提问起采样 Unreader 侧栏行，直到出现未读标记
    const workersSection = `pbots:workers:${M}`
    const unreaderRow = rowIn(page, workersSection, names.unreader)
    const sampler = sampleRowStates(page, unreaderRow, async () =>
      (await unreaderRow.locator('.sand-agent-item__trailing[aria-label="Unread activity"]').count()) === 1)
    await answerEvent(page, qEventId, { answers: [{ id: 'q1', selected: ['full'] }] })
    const samples = await sampler
    writeFileSync(join(OUT, 'no-marker-window.json'), JSON.stringify({ worker: names.unreader, samples }, null, 2))
    writeFileSync(join(OUT, 'no-marker-stats.json'), JSON.stringify({ ...noMarkerStats(samples), cadenceMs: 50 }, null, 2))

    // Unreader 完成 → end 回报 1 项（completed）
    await until(async () => (await reportItems(rt, M)).some((i) => i.kind === 'end' && i.outcome === 'completed'), 'unreader end report lands')
    // 放 Failer 收尾：error 终态 → failed 行 + end 回报 1 项（error）
    openGate(rt, 'p617-fail-hold')
    await until(async () => (await reportItems(rt, M)).some((i) => i.kind === 'end' && i.outcome === 'error'), 'failer end report lands')
    await until(async () => (await sectionNames(page, workersSection)).includes(names.failer), 'failer row visible in Workers')

    // failed 行（亮暗）：Failer 未读失败行（rank 2，排在 unread 前）
    const failerRow = rowIn(page, workersSection, names.failer)
    await expect(failerRow.locator('.sand-agent-item__preview')).toHaveText(/^Failed:/)
    await expect.poll(() => sectionNames(page, workersSection), { timeout: 30_000 }).toEqual([names.asker, names.runner, names.failer, names.unreader])
    await bothThemes(page, 'sidebar-failed-row')

    // 4 态侧栏（亮暗）：blocked（Asker）/ running（Runner）/ unread（Unreader）在 Workers；
    // Failer 读取后离开归档进 Done（展开示第 4 态）
    await failerRow.click()
    await active(page, names.failer)
    await botItem(page, 'Main Bot').click()
    await active(page, 'Main Bot')
    await expect.poll(() => sectionNames(page, workersSection), { timeout: 30_000 }).toEqual([names.asker, names.runner, names.unreader])
    const doneSection = `pbots:done:${M}`
    await S(page, doneSection).locator(':scope > .sand-agents-section__header').click()
    await expect.poll(() => sectionNames(page, doneSection), { timeout: 10_000 }).toEqual([names.failer])
    await expect(rowIn(page, doneSection, names.failer).locator('.sand-agent-item__preview')).toHaveText(/^Failed:/)
    await bothThemes(page, 'sidebar-4states')

    // 合批卡（亮暗）：主 bot 视图里 4 项审批 ask 合批（Asker 仍 Needs you，其余作答后 Answered）
    const peer = (kind: string) => transcript(page).locator(`[data-pbots-peer="${kind}"]`)
    await expect(peer('report')).toHaveCount(4, { timeout: 30_000 })
    const batch = peer('report').first()
    await expect(batch.locator('.pb-report__batch-head')).toContainText('4 worker updates')
    await expect(batch.locator('[data-pbots-item-kind="ask"]')).toHaveCount(4)
    await expect(batch.locator('[data-pbots-item-kind="ask"][data-pending] [data-pbots-state]')).toHaveText(['Needs you'])
    await expect(batch.locator('[data-pbots-item-kind="ask"]:not([data-pending]) [data-pbots-state]')).toHaveText(['Answered', 'Answered', 'Answered'])
    await bothThemes(page, 'main-report-batch')
  } finally {
    await env.stop()
  }
})
