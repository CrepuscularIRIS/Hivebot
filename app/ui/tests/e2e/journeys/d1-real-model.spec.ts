// U-31 全旅程 ①（PLAN U-31 ①④ + GU-PDC 修订）：D1/D2 走真模型——
// 起壳 → 建 p2-alpha bot（P5-54 起 renderer-grok：选 preset 走 M1 #3）→ 新 renderer composer 发消息 → LiteLLM glm-5.3-flash 真模型流式回复
// （流式气泡 → 定稿替换 + turn/end），main M2 原帧 tap 计数 === renderer chunkCount（D2 原帧转发无丢失）。
// key 只经 env 传入 child（sdk-runtime.ts 在子进程 env 副本上剔除凭证 key 再叠加 opts.env，
// R9 后不再修改 worker 的 process.env），不打印、不进断言。凭证取值 = process.env 优先、
// app/ui/.env 兜底（后台派发 shell 不继承交互 shell 的 key，VERIFY-U-31 实证；.env 值不进 git）。
// 两处都无时本条直接失败（真模型证据缺失 = FAIL，不静默 skip）。
import { expect, test } from 'playwright/test'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { launchShell } from '../../support/launch.ts'
import { envOrDotenv } from '../../support/creds.ts'
import { launchSdkRuntime } from '../../support/sdk-runtime.ts'
import { PRESETS_PATCH, createBots, devState, finalAssistant, openBot, send, streamingRow, waitProductReady } from '../../support/ui.ts'

test('D1+D2 真模型：建 bot → LiteLLM 流式回复 → 定稿 + turn/end；M2 原帧 tap === chunkCount', async () => {
  test.setTimeout(180_000)
  const apiKey = envOrDotenv('LITELLM_MASTER_KEY', join(__dirname, '..', '..', '..', '.env'))
  expect(apiKey, 'LITELLM_MASTER_KEY 未设置（process.env 与 app/ui/.env 均无）：真模型旅程无凭证').toBeTruthy()
  const rt = await launchSdkRuntime({
    patch: PRESETS_PATCH,
    cwd: tmkdir('bot-u31-ws-'),
    env: { P2SDK_PROVIDER: 'litellm', P2SDK_LLM_API_KEY: apiKey! },
  })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)

    // D1：选 preset 建 bot（真模型 runtime 的 preset 表 = presets.yml fixture）
    const [a] = await createBots(page, [{ title: 'Real-A', preset: 'p2-alpha' }]) as [string]
    await openBot(page, 'Real-A')
    await send(page, '请用中文介绍你自己，两三句话即可。')

    // 流式：见到 live-stream 条目（真模型逐 chunk 到达）
    await expect(streamingRow(page)).toBeVisible({ timeout: 30_000 })
    // 定稿替换：live-stream 消失、定稿非空（真模型内容不定长，只断言非空）
    await expect(streamingRow(page)).toHaveCount(0, { timeout: 90_000 })
    await expect(finalAssistant(page).last()).toBeVisible({ timeout: 30_000 })
    const finalText = await finalAssistant(page).last().textContent()
    expect(finalText!.trim().length, '真模型定稿回复非空').toBeGreaterThan(0)

    // turn/end + chunk 计数（真模型 chunk 数不定，但必须 ≥2 才算流式而非一次性吐出）
    await expect.poll(async () => (await devState(page)).views[a]?.turnEnded, { timeout: 30_000 }).toBe(true)
    const K = (await devState(page)).views[a]!.chunkCount
    expect(K, '真模型流式至少 2 个 chunk').toBeGreaterThanOrEqual(2)

    // D2：main M2 原帧 tap 计数 === renderer chunkCount（本次旅程唯一发流的 bot）
    const tapChunks = await shell.app.evaluate(
      () => Object.values((globalThis as unknown as { __pbotsM2?: { stats: { downlink: { streamChunks: Record<string, number> } } } }).__pbotsM2!.stats.downlink.streamChunks),
    )
    expect(tapChunks, 'M2 tap 表非空').not.toEqual([])
    expect(Math.max(...tapChunks), 'M2 原帧 tap 最大计数 === renderer chunkCount（无丢帧）').toBe(K)
    expect(tapChunks.reduce((s, v) => s + v, 0), 'tap 总和 === K（本旅程只有 A 一条流）').toBe(K)
  } finally {
    await shell.stop()
    await rt.stop()
  }
})
