// P6-25 review C 共用 harness：write-outside.test.ts 的最小复刻，fake LLM 换成本目录
// 的副本（多记 toolNames）。真实 launcher + 真实 dsh + 真实 policy 插件。
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { connect, type DshClient } from '/tmp/bot-wt/P6-25f1/app/sdk/examples/lib/client.mjs'
import { launchRuntime, type Runtime } from '/tmp/bot-wt/P6-25f1/app/sdk/tests/support/runtime.ts'
import { clearRealKeys, waitFor, type Frame } from '/tmp/bot-wt/P6-25f1/app/sdk/tests/support/fake/harness.ts'
import { trackTmpDir } from '/tmp/bot-wt/P6-25f1/app/sdk/tests/support/tmp-sweep.ts'

export const ROOT = '/tmp/bot-p625f1-vfy/e2e'
export const TEST_HOME = mkdtempSync('/tmp/bot-p625f1-vfy-home-')
trackTmpDir(TEST_HOME)
export const DATA_DIR = join(TEST_HOME, 'pbots-data')
export const WS = join(DATA_DIR, 'workspaces', 'x')
mkdirSync(WS, { recursive: true })
export const OUT_DIR = '/tmp/bot-p625f1-vfy-out'
mkdirSync(OUT_DIR, { recursive: true })
export const R = Math.random().toString(16).slice(2, 8)

export interface EvFrame { type: string; event?: string; eventId?: string; agentId?: string; request?: { toolName?: string; reason?: string } }
export interface H extends Runtime {
  frames: EvFrame[]
  answer(f: EvFrame, v: string): Promise<unknown>
  closeFeed(): void
  script(sessionId: string, calls: object[]): void
  requests(): Array<{ sessionId: string | null; toolNames?: string[]; toolResults?: Array<{ isError: boolean; text: string }> }>
}

function overlay(extra: string): string {
  const dir = mkdtempSync('/tmp/bot-p625f1-vfy-patch-')
  trackTmpDir(dir)
  const p = join(dir, 'fake.yml')
  writeFileSync(p, `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pathToFileURL('/tmp/bot-wt/P6-25f1/app/sdk/tests/support/fake/plugin.mjs').href}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
${extra}`)
  return p
}

export async function launch(extraYaml = '', env: Record<string, string> = {}): Promise<H> {
  clearRealKeys()
  const rt = await launchRuntime({
    env: {
      HOME: TEST_HOME,
      P2SDK_HOME: mkdtempSync('/tmp/bot-p625f1-vfy-dsh-'),
      P2SDK_PATCH: overlay(extraYaml),
      PBOTS_DATA_DIR: DATA_DIR,
      ...env,
    },
  })
  const client: DshClient = await connect({ baseUrl: rt.baseUrl, token: rt.token, interactions: 'answer' })
  const stream = await client.socket.open('$events', {})
  const frames: EvFrame[] = []
  void (async () => { for await (const f of stream) frames.push(f as EvFrame) })().catch(() => {})
  await waitFor(frames as unknown as Frame[], (f) => f.type === 'ready', 5000, '$events ready')
  const clientId = (frames.find((f) => f.type === 'ready') as { clientId?: string } | undefined)?.clientId ?? ''
  return {
    ...rt,
    frames,
    answer: (f, v) => client.call('$events/result', { clientId, eventId: f.eventId, outcome: { kind: 'result', value: v } }),
    closeFeed() { stream.cancel(); client.close() },
    script(sessionId, calls) {
      const d = join(rt.home, 'fake', 'scripts')
      mkdirSync(d, { recursive: true })
      writeFileSync(join(d, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    requests() {
      try {
        return readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      } catch { return [] }
    },
  }
}

export function toolCall(name: string, args: object): object {
  const id = `c-${Math.random().toString(16).slice(2, 8)}`
  const a = JSON.stringify(args)
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: a },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: a } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ],
    paceMs: 5,
  }
}

export function text(t: string): object {
  return {
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: t },
      { type: 'block-end', index: 0, block: { type: 'text', text: t } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ],
    paceMs: 5,
  }
}

/** 建会话、一次写全脚本、发一条 prompt，按 answer 应答所有审批卡，等 turn/end。 */
export async function turn(h: H, opts: { cwd?: string; preset?: string; calls: object[]; answer?: 'rejected' | 'allowed-once'; timeoutMs?: number }): Promise<{ sessionId: string; frames: Frame[]; cards: EvFrame[] }> {
  const req: Record<string, unknown> = { cwd: opts.cwd ?? WS }
  if (opts.preset) req.agentPreset = opts.preset
  const { sessionId } = (await h.client.call('session/create', { request: req })) as { sessionId: string }
  h.script(sessionId, [...opts.calls, text('done')])
  const stream = await h.client.follow(sessionId)
  const frames: Frame[] = []
  void (async () => { for await (const f of stream) frames.push(f) })().catch(() => {})
  await h.client.call('session/prompt', {
    request: { requestId: `r-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'probe' }] },
  })
  const answered = new Set<string>()
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000)
  for (;;) {
    for (const f of h.frames) {
      if (f.type === 'waterfall' && f.event === 'approval/request' && !answered.has(f.eventId ?? '')) {
        answered.add(f.eventId ?? '')
        await h.answer(f, opts.answer ?? 'rejected')
      }
    }
    if (frames.some((f) => f.type === 'event' && f.event?.type === 'turn/end')) break
    if (Date.now() > deadline) throw new Error(`turn/end timeout; tail=${JSON.stringify(frames.slice(-3)).slice(0, 600)}`)
    await new Promise((r) => setTimeout(r, 50))
  }
  stream.cancel()
  const cards = h.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId)
  return { sessionId, frames, cards }
}

export function results(frames: Frame[]): Array<{ isError: boolean; text: string }> {
  const out: Array<{ isError: boolean; text: string }> = []
  for (const f of frames) {
    if (f.type !== 'event' || f.event?.type !== 'tool/result') continue
    const d = f.event.data as { message?: { isError?: boolean; content?: Array<{ text?: string }> } }
    out.push({ isError: d.message?.isError === true, text: (d.message?.content ?? []).map((c) => c.text ?? '').join('\n') })
  }
  return out
}
