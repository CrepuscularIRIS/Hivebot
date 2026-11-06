// T16-3b（EVAL §8-3）：apply_patch 双防——guard NEVER_TOOLS 按名拒（第一道）+
// approval.yml 三段 preset 副本显式 applyPatch: false（第二道，工具不注册）。
// 本格只测第一道：overlay 在 preset-standard 副本里给 tool-fs 开 applyPatch: true
// （真实注册 apply_patch 工具），会话调用写 /tmp/x → 必须被 guard 在 pre-execute
// 层拒（NEVER 串），不出卡、不落到执行层。
// 先红（修补前）：NEVER_TOOLS 无 apply_patch → pre-execute 不按名拒 → 穿到
// 执行层（fs-zone 拒 /tmp 或真写），结果串不含 NEVER → 断言红。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import type { Frame } from '../support/fake/harness.ts'

const PKG_ROOT = join(import.meta.dirname, '../..')
const home = tmkdir('bot-t16-applypatch-')
const ws = join(home, 'ws')
mkdirSync(join(home, 'fake', 'scripts'), { recursive: true })
mkdirSync(ws, { recursive: true })

// 照 P6-14.f2 手法：读 approval.yml 的 preset-standard 段，在 tool-fs 行下
// 注入 applyPatch: true（顶层 patch 够不到嵌套行，同 id 整树覆盖——T9ac 教训）。
const approval = readFileSync(join(PKG_ROOT, 'profile', 'patches', 'approval.yml'), 'utf8')
const section = approval.slice(approval.indexOf('- id: preset-standard\n'), approval.indexOf('- id: preset-cordis\n'))
// approval.yml 的副本已带 config.applyPatch: false（产品第二道防线）——
// 本 overlay 只把该值翻 true（同段仅一处），注册出 apply_patch 供第一道测试。
const withApply = section.replace('applyPatch: false', 'applyPatch: true')
const overlay = join(home, 't16-applypatch.yml')
writeFileSync(overlay, `\
# T16-3b overlay: preset-standard + tool-fs applyPatch 开（测试第一道防线）
${withApply}
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL(join(PKG_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
                inputModalities: [text, image]
`)

let rt: Runtime | undefined
beforeAll(async () => {
  rt = await launchRuntime({ env: { P2SDK_HOME: home, P2SDK_PATCH: overlay } })
}, 240_000)
afterAll(async () => { try { await rt?.stop() } catch { /* gone */ } })

function toolCall(name: string, args: object): object {
  const id = `t16ap-${Math.random().toString(16).slice(2, 8)}`
  const a = JSON.stringify(args)
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(0, 5) },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a.slice(5) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: a } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ] }
}
function textCall(t: string): object {
  return { chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: t },
    { type: 'block-end', index: 0, block: { type: 'text', text: t } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }
}

it('① overlay 开 applyPatch 后调用 apply_patch 写 /tmp/x：guard NEVER 按名拒（不出卡、不落执行层）', { timeout: 240_000 }, async () => {
  const { sessionId } = (await rt!.client.call('session/create', { request: { cwd: ws } })) as { sessionId: string }
  writeFileSync(join(home, 'fake', 'scripts', `${sessionId}.json`), JSON.stringify({
    calls: [
      toolCall('apply_patch', { input: '*** Begin Patch\n*** Add File: /tmp/x\n+x\n*** End Patch' }),
      textCall('T16ap'),
    ],
  }))
  const stream = await rt!.client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await rt!.client.call('session/prompt', { request: { requestId: `t16ap-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'T16ap' }] } })
  const deadline = Date.now() + 90_000
  for (;;) {
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end 未到：${JSON.stringify(frames.slice(-4)).slice(0, 300)}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  stream.cancel(); void drained
  const results = frames.flatMap((f) => {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') return []
    const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    return [{ isError: d.message?.isError === true, text: (d.message?.content ?? []).map((c) => c.text ?? '').join('\n') }]
  })
  expect(results.length, 'apply_patch 有一条结果（工具已注册=正对照）').toBeGreaterThanOrEqual(1)
  expect(results[0]!.isError, '被拒').toBe(true)
  expect(results[0]!.text, `guard NEVER 串（pre-execute 按名拒）：${results[0]!.text.slice(0, 120)}`).toContain('p2sdk-fs-guard: tool "apply_patch" is not available')
  expect(frames.some((f) => f.type === 'event' && f.event?.type === 'approval/asked'), 'NEVER 不出卡').toBe(false)
})
