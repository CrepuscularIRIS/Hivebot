// T-05 acceptance (PLAN p2-sdk T-05 / BRIEF §6 D4, 断言 D4 原文):
// 两个 session（一个真实 dsh runtime）分别使用不同的模型 M1/M2 与 preset
// P1/P2；请求侧逐 session 断言 —— LLM 请求边界记录的模型标识、preset 注入
// 的指令（persona 全量系统提示）与工具集合，S1 全是 M1/P1、S2 全是 M2/P2，
// 且两者确实不同；S1 在 S2 选择模型之后再发一轮，证伪「配置互相覆盖或被忽略」。
// 请求侧证据来自两处独立记录：T-02 fake adapter 的 requests.jsonl（provider
// 侧 options）与本测试经 llm/stream waterfall 记录的完整 GenerateOptions（含
// system/tools），两者都穿过真实 dsh runtime；只回显配置（session/projections
// 各自返回自己的配置）仅作查询侧补充，不构成通过依据。
import { expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchRuntime, type Runtime } from '../support/runtime.ts'
import {
  clearRealKeys,
  sendPrompt,
  waitForTurnEnd,
  type FakeRequest,
  type Frame,
} from '../support/fake/harness.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Fixture contract with profile/patches/presets.yml (complete personas render as the whole system prompt). */
const ALPHA = {
  preset: 'p2-alpha',
  model: 'p2fake-m1',
  persona: 'P2SDK-D4 preset p2-alpha persona: ALPHA-MARKER-7f3a. 你是 alpha 会话专用的人格。',
}
const BETA = {
  preset: 'p2-beta',
  model: 'p2fake-m2',
  persona: 'P2SDK-D4 preset p2-beta persona: BETA-MARKER-c91b. 你是 beta 会话专用的人格。',
}
/** Tools only p2-beta mounts (tool-fs-search registers glob+grep; alpha mounts tool-fs only). */
const BETA_ONLY_TOOLS = ['glob', 'grep'] as const

const PROMPTS = { s1a: 'alpha 第一问', s2: 'beta 提问', s1b: 'alpha 第二问' }
const PIECES = {
  s1a: ['阿', '波', '次'],
  s2: ['甲', '乙', '丙'],
  s1b: ['丁', '戊'],
}

/** The waterfall recorder's per-request record ($P2SDK_HOME/fake/llm-streams.jsonl). */
interface StreamRecord {
  ts: number
  sessionId: string
  provider: string
  model: string
  purpose: string | null
  systemTexts: string[]
  toolNames: string[]
}

interface D4Runtime extends Runtime {
  /** Write one scripted fake call per entry (the T-02 fake consumes them in order). */
  writeScript(sessionId: string, turns: string[][]): void
  /** Waterfall records, in request order. */
  readStreams(): StreamRecord[]
  /** The fake adapter's own request log, in request order. */
  readRequests(): FakeRequest[]
}

const isTextDelta = (f: Frame): boolean =>
  f.type === 'assistant-stream' && f.frame?.type === 'chunk' && f.frame.chunk?.type === 'text-delta'

function scriptedCall(pieces: string[]): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      ...pieces.map((text) => ({ type: 'text-delta', index: 0, text })),
      { type: 'block-end', index: 0, block: { type: 'text', text: pieces.join('') } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: pieces.length } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 10,
  }
}

/**
 * Generated overlay: restate agent-default-model onto the fake provider with
 * both fixture models, restate the T-02 fake adapter plugin (two models), and
 * insert the llm/stream waterfall recorder. Loaded after
 * profile/patches/presets.yml through the launcher's P2SDK_PATCH passthrough.
 */
function buildOverlay(): string {
  const dir = mkdtempSync(join(tmpdir(), 'p2sdk-d4-patch-'))
  const file = (p: string): string => pathToFileURL(join(PKG_ROOT, p)).href
  const overlay = join(dir, 'd4-overlay.yml')
  writeFileSync(
    overlay,
    `\
# T-05 generated overlay (tests/e2e/config.test.ts).
- id: agent-default-model
  config:
    provider: p2fake
    model: ${ALPHA.model}
- insert:
    - id: p2sdk-fake-llm
      name: '${file('tests/support/fake/plugin.mjs')}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: ${ALPHA.model}
                contextWindow: 131072
              - id: ${BETA.model}
                contextWindow: 131072
    - id: p2sdk-llm-recorder
      name: '${pathToFileURL(join(dir, 'recorder.mjs')).href}'
`,
  )
  writeFileSync(
    join(dir, 'recorder.mjs'),
    `// T-05 request-side recorder: one line per LLM request at the llm/stream
// waterfall (the same GenerateOptions the provider adapter receives).
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p2sdk-llm-recorder'

const textOf = (message) => (message.content ?? [])
  .filter((b) => b?.type === 'text')
  .map((b) => b.text)
  .join('')

export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    const home = process.env.P2SDK_HOME
    if (home === undefined) throw new Error('p2sdk-llm-recorder: $P2SDK_HOME is not set')
    appendFileSync(
      join(home, 'fake', 'llm-streams.jsonl'),
      \`\${JSON.stringify({
        ts: Date.now(),
        sessionId: options.sessionId === undefined ? 'null' : String(options.sessionId),
        provider: options.provider,
        model: options.model,
        purpose: options.purpose ?? null,
        systemTexts: options.messages.filter((m) => m.role === 'system').map(textOf),
        toolNames: (options.tools ?? []).map((t) => t.name).sort(),
      })}\\n\`,
    )
    return next()
  })
}
`,
  )
  return overlay
}

/** Boot one real runtime carrying the fixture presets, the fake provider, and the recorder. */
async function launchD4Runtime(): Promise<D4Runtime> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: { P2SDK_PATCH: `${join(PKG_ROOT, 'profile', 'patches', 'presets.yml')}:${buildOverlay()}` },
  })
  const readJsonl = (name: string): object[] => {
    try {
      return readFileSync(join(rt.home, 'fake', name), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as object)
    } catch {
      return []
    }
  }
  return {
    ...rt,
    writeScript(sessionId: string, turns: string[][]) {
      const dir = join(rt.home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: turns.map(scriptedCall) }))
    },
    readStreams: () => readJsonl('llm-streams.jsonl') as StreamRecord[],
    readRequests: () => readJsonl('requests.jsonl') as FakeRequest[],
  }
}

/** Create a session bound to a fixture preset (per-session config entry point). */
async function createWithPreset(client: D4Runtime['client'], home: string, preset: string): Promise<string> {
  const value = (await client.call('session/create', {
    request: { cwd: join(home, 'workspace'), agentPreset: preset },
  })) as { sessionId: string; agentPreset?: string }
  expect(value.agentPreset, 'session/create echoes the requested preset').toBe(preset)
  return value.sessionId
}

/** Explicitly select this session's model (D4 requires both sessions to selectModel). */
async function selectModel(client: D4Runtime['client'], sessionId: string, model: string): Promise<void> {
  const { selected } = (await client.call('session/selectModel', {
    request: { sessionId, provider: 'p2fake', model },
  })) as { selected: { provider: string; model: string } }
  expect(selected.model, 'selectModel records the requested model').toBe(model)
}

/** One scripted turn; resolves after turn/end with the received delta text. */
async function scriptedTurn(client: D4Runtime['client'], sessionId: string, prompt: string): Promise<void> {
  const frames: Frame[] = []
  const stream = await client.follow(sessionId)
  const drained = (async () => {
    for await (const f of stream) frames.push(f)
  })()
  await sendPrompt(client, sessionId, prompt)
  await waitForTurnEnd(frames)
  const text = frames.filter(isTextDelta).map((f) => f.frame?.chunk?.text ?? '').join('')
  stream.cancel()
  void drained // cancel is locally terminal; the loop settles when rt.stop() closes the socket
  expect(text, 'the scripted fake text arrived').toBeTruthy()
}

it('D4: two sessions keep different preset + model configs, per-session, request-side', async () => {
  const rt = await launchD4Runtime()
  try {
    // S1: preset p2-alpha + model M1, one turn before S2 exists.
    const s1 = await createWithPreset(rt.client, rt.home, ALPHA.preset)
    await selectModel(rt.client, s1, ALPHA.model)
    rt.writeScript(s1, [PIECES.s1a, PIECES.s1b])
    await scriptedTurn(rt.client, s1, PROMPTS.s1a)

    // S2: preset p2-beta + model M2 (its selectModel also re-saves the host default).
    const s2 = await createWithPreset(rt.client, rt.home, BETA.preset)
    expect(s2, 'S2 is a different session').not.toBe(s1)
    await selectModel(rt.client, s2, BETA.model)
    rt.writeScript(s2, [PIECES.s2])
    await scriptedTurn(rt.client, s2, PROMPTS.s2)

    // S1 again, after S2's selection: its config must be neither overwritten nor ignored.
    await scriptedTurn(rt.client, s1, PROMPTS.s1b)

    // ── request-side evidence: the llm/stream records ──
    const streams = rt.readStreams()
    const s1Streams = streams.filter((r) => r.sessionId === s1)
    const s2Streams = streams.filter((r) => r.sessionId === s2)
    expect(s1Streams, 'S1 drove exactly its own turns (2)').toHaveLength(2)
    expect(s2Streams, 'S2 drove exactly its own turn (1)').toHaveLength(1)

    for (const record of s1Streams) {
      expect(record.model, 'S1 requests carry M1').toBe(ALPHA.model)
      expect(record.systemTexts.join('\n'), 'S1 system prompt is the alpha persona').toEqual([ALPHA.persona].join('\n'))
    }
    expect(s2Streams[0].model, 'S2 request carries M2').toBe(BETA.model)
    expect(s2Streams[0].systemTexts.join('\n'), 'S2 system prompt is the beta persona').toEqual([BETA.persona].join('\n'))

    const s1Tools = s1Streams[0].toolNames
    const s2Tools = s2Streams[0].toolNames
    expect(s1Tools.length, 'S1 has a non-empty tool set').toBeGreaterThan(0)
    expect(s2Tools.length, 'S2 has a non-empty tool set').toBeGreaterThan(0)
    for (const tool of BETA_ONLY_TOOLS) {
      expect(s2Tools, `S2 tools include ${tool} (p2-beta only)`).toContain(tool)
      expect(s1Tools, `S1 tools exclude ${tool} (p2-alpha only)`).not.toContain(tool)
    }
    expect(new Set(s1Tools).size, 'tool names are deduplicated').toBe(s1Tools.length)
    expect(s1Tools.join(','), 'S1 and S2 tool sets really differ').not.toBe(s2Tools.join(','))

    // ── request-side cross-check: the fake adapter's own log ──
    const requests = rt.readRequests()
    const s1Requests = requests.filter((r) => r.sessionId === s1)
    const s2Requests = requests.filter((r) => r.sessionId === s2)
    expect(s1Requests.map((r) => r.model), 'fake adapter saw M1 for both S1 turns').toEqual([ALPHA.model, ALPHA.model])
    expect(s2Requests.map((r) => r.model), 'fake adapter saw M2 for S2').toEqual([BETA.model])
    expect(s1Requests.every((r) => r.userTexts.join('').length > 0), 'S1 turns were real prompts').toBe(true)

    // ── query-side check through the SDK surface: session/projections ──
    const projectionsOf = async (sessionId: string) =>
      (await rt.client.call('session/projections', { request: { sessionId } })) as {
        kind: string
        values: {
          agentPreset?: string | null
          modelSelection?: { lastUsed: { provider: string; model: string } | null; pending: { provider: string; model: string } | null }
        }
      }
    const p1 = await projectionsOf(s1)
    const p2 = await projectionsOf(s2)
    expect(p1.values.agentPreset, 'S1 projection names its own preset').toBe(ALPHA.preset)
    expect(p2.values.agentPreset, 'S2 projection names its own preset').toBe(BETA.preset)
    const used = (p: { values: { modelSelection?: { lastUsed: { model: string } | null; pending: { model: string } | null } } }): string =>
      (p.values.modelSelection?.lastUsed ?? p.values.modelSelection?.pending)?.model ?? ''
    expect(used(p1), 'S1 projection names its own model').toBe(ALPHA.model)
    expect(used(p2), 'S2 projection names its own model').toBe(BETA.model)
  } finally {
    await rt.stop()
  }
})
