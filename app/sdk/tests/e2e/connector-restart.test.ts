// T-15 探明①（work/p3-contract/CONTRACT.md §7 遗留 1，J3×J4）：
// 带连接器建的 bot（p2temp/session.createWithConnectors）能否跨 dsh 重启恢复。
//
// 流程：T-03 market fixture 装 demo-mcp（enabled:false）→ p2temp 建 X → 一回合
// → kill -9 → 同 P2SDK_HOME + 同 P2SDK_PATCH 重启 → 逐面探明：
//   a. session/list 仍含 X（冷读，T-06 已验的存活面）
//   b. session/events 仍可读 X 历史（冷读）
//   f. preset.ensure 重建 recipe：内容定 id 与 X header 冻结的 id 一致（T-16）
//   c. 重启后 p2temp 仍可用：新建 X2 并完成一回合（排除「运行时整体坏了」）
//   d. follow 打开 X 的 opening snapshot（触发 typert agent lookup → resume）
//   e. prompt X 再完成一回合（J4 目标语义）
//
// 红点史（T-15 探明）：X 的 preset 选择持久化为临时 id，只登记在内存
// registry.definitions（deepseek-harness packages/preset/agent-preset-registry
// src/index.ts:97-115 不落盘），重启后 prompt 的 resume 报
// `Unknown agent preset: p2temp-…`（code gateway/internal）。实测 follow 的
// opening snapshot 不触发 preset resolve、是绿的；红点仅在 prompt 的 resume
// （VERIFY-T-15 根因链核对，更正了本注释早前「d+e 都红」的预断）。
// 修复（T-16，Q-008=A）：boot 2 后按 recipe 调 p2temp/preset.ensure——
// 内容定 id 重建出与 header 冻结一致的 id；这是 CONTRACT #21「main 启动时按
// recipes 逐个 ensure」在此的黑盒替身（main 编排属 P4）。
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { connect, type DshClient } from '../../examples/lib/client.mjs'
import { sendPrompt, waitForDelta, waitForTurnEnd, type Frame } from '../support/fake/harness.ts'
import { launcherSpawnEnv } from '../support/runtime.ts'
import { BUNDLE_NAME, MARKET_YML, writeBundleFixture } from '../market/support.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** No orphaned runtimes: everything booted here dies in afterAll if a test leaked it. */
const booted: ChildProcess[] = []
afterAll(() => {
  for (const child of booted) {
    if (child.exitCode !== null) continue
    for (const pid of [child.pid, ...childPids(child.pid)]) {
      try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    }
  }
})

/** Direct children of pid via pgrep (LEARNINGS: never pkill -f). */
function childPids(pid: number | undefined): number[] {
  if (!pid) return []
  try {
    return execSync(`pgrep -P ${pid}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number)
  } catch {
    return [] // pgrep exits 1 on no match
  }
}

/** The one start command every boot (first and restart) uses, unchanged. */
function startEnv(home: string, patch: string, handoff: string): NodeJS.ProcessEnv {
  return {
    ...launcherSpawnEnv(),
    P2SDK_PATCH: patch,
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: home,
    P2SDK_HANDOFF: handoff,
    P2SDK_PORT: '0',
    P2SDK_READY_TIMEOUT_MS: '60000',
  }
}

/** Boot `pnpm -C app/sdk start`'s underlying command against an existing home. */
async function bootHome(home: string, patch: string, handoff: string): Promise<{ child: ChildProcess; client: DshClient }> {
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: startEnv(home, patch, handoff),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  booted.push(child)
  let output = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => { output += c })
  const deadline = Date.now() + 60_000
  while (!/\[p2sdk\] ready http/.test(output)) {
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):\n${output}`)
    if (Date.now() >= deadline) throw new Error(`no ready line within 60s:\n${output}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
  return { child, client: await connect({ baseUrl, token }) }
}

/** kill -9 the start.mjs parent and its dsh child, then wait for the parent's exit. */
async function killTree9(parent: ChildProcess): Promise<void> {
  for (const pid of [parent.pid, ...childPids(parent.pid)]) {
    try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  }
  await new Promise<void>((resolve) => {
    if (parent.exitCode !== null) return resolve()
    const timer = setTimeout(resolve, 10_000)
    parent.on('exit', () => { clearTimeout(timer); resolve() })
  })
}

/** Fake overlay (restart.test.ts pattern): scripted p2fake provider. */
function fakeOverlay(): string {
  const dir = tmkdir('p2sdk-t15-patch-')
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
# T-15 generated fake-provider overlay (tests/e2e/connector-restart.test.ts).
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
`)
  return overlay
}

/** Scripted plain-text model call (restart.test.ts vocabulary). */
function textCall(pieces: string[]): object {
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

function writeScriptCalls(home: string, sessionId: string, calls: object[]): void {
  const dir = join(home, 'fake', 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
}

interface EventsPage {
  records: Array<{ type: string; event: { type: string; data?: { agentPreset?: string } } }>
  hasMore: boolean
}

async function eventsOf(client: DshClient, sessionId: string): Promise<EventsPage> {
  return (await client.call('session/events', {
    request: { address: { kind: 'session', sessionId }, maxMessages: 200 },
  })) as EventsPage
}

/** One scripted turn; resolves on durable turn/end (15s clock either way). */
async function runTurn(client: DshClient, sessionId: string, prompt: string, firstDelta: string): Promise<void> {
  const stream = await client.follow(sessionId)
  const frames: Frame[] = []
  const drained = (async () => { for await (const f of stream) frames.push(f) })()
  await sendPrompt(client, sessionId, prompt)
  await waitForDelta(frames, firstDelta, 15_000)
  await waitForTurnEnd(frames, 15_000)
  stream.cancel()
  void drained
}

/** Stringify an unknown error with its own message first (错误原文进断言输出). */
const errText = (e: unknown): string => (e instanceof Error ? `${e.message}` : String(e))

it('T-15① connector bot across restart: list/events survive; follow+prompt on the old session recover (target semantics, expected red)', async () => {
  const scratch = tmkdir('p2sdk-t15-a-')
  const home = tmkdir('p2sdk-t15-home-')
  const handoff = tmkdir('p2sdk-t15-h-')
  const patch = `${MARKET_YML}:${fakeOverlay()}`
  const cwd = join(home, 'workspace')
  mkdirSync(cwd, { recursive: true })

  // Boot 1: install fixture bundle, create the connector bot X, complete one turn.
  const rt1 = await bootHome(home, patch, handoff)
  const install = await rt1.client.call('pluginManager/installBundle', {
    spec: writeBundleFixture(join(scratch, 'demo-mcp')),
    options: { enabled: false },
  })
  if (install?.application === 'failed' || install?.error) {
    throw new Error(`installBundle failed: ${JSON.stringify(install).slice(0, 2000)}`)
  }
  const { sessionId: x } = await rt1.client.call('p2temp/session.createWithConnectors', {
    request: { connectors: [BUNDLE_NAME], agentPreset: 'standard', cwd },
  })
  expect(typeof x).toBe('string')
  writeScriptCalls(home, x, [textCall(['甲', '乙', '丙'])])
  await runTurn(rt1.client, x, '重启前·连接器bot一问', '甲')

  // The persisted preset id lives in the frozen creation header
  // (SessionWireHeader.agentPreset; agent-preset/selected events only record
  // post-creation blank-window switches, agent-preset-registry session.ts).
  const headerPeek = await rt1.client.follow(x, { awaitSnapshot: true })
  const presetId = ((headerPeek.snapshot as { header?: { agentPreset?: string } }).header?.agentPreset) ?? null
  headerPeek.stream.cancel()
  expect(presetId, 'the connector bot header froze the temporary preset id').toMatch(/^p2temp-/)

  await killTree9(rt1.child)

  // Boot 2: identical spawn — same argv, same env, same P2SDK_HOME/HANDOFF/PATCH.
  const rt2 = await bootHome(home, patch, handoff)

  // a. list survives (cold read).
  const list = (await rt2.client.call('session/list', { _request: {} })) as { items: Array<{ sessionId: string }> }
  expect(list.items.map((i) => i.sessionId), 'restart keeps the connector bot in session/list').toContain(x)

  // b. events survive (cold read).
  const post = await eventsOf(rt2.client, x)
  expect(post.records.some((r) => r.event.type === 'user/message'), 'restart keeps the history readable').toBe(true)

  // f. (T-16) Stand-in for the CONTRACT #21 main-side startup orchestration:
  //    re-register the recipe by content. The content-derived id must rebuild
  //    exactly the id X's header froze — that equality is what makes the old
  //    session resolvable again, before any new bot is created.
  const ensured = (await rt2.client.call('p2temp/preset.ensure', {
    request: { agentPreset: 'standard', connectors: [BUNDLE_NAME] },
  })) as { presetId: string }
  expect(ensured.presetId, 'preset.ensure rebuilds the id the creation header froze').toBe(presetId)

  // c. runtime health after restart: a NEW connector bot builds and completes a turn
  //    (fresh temp preset registers fine — the gap, if any, is the OLD id only).
  let fresh: { ok: boolean; error?: string; turnEnd?: boolean } = { ok: false }
  try {
    const { sessionId: x2 } = await rt2.client.call('p2temp/session.createWithConnectors', {
      request: { connectors: [BUNDLE_NAME], agentPreset: 'standard', cwd },
    })
    writeScriptCalls(home, x2, [textCall(['子', '丑', '寅'])])
    await runTurn(rt2.client, x2, '重启后·新建连接器bot一问', '子')
    fresh = { ok: true, turnEnd: true }
  } catch (e) {
    fresh = { ok: false, error: errText(e) }
  }

  // d+e. the J4 target: the OLD session follows and completes another turn.
  const recovery: Record<string, unknown> = { freshBot: fresh }
  try {
    const { stream, snapshot } = await rt2.client.follow(x, { awaitSnapshot: true })
    const snap = snapshot as { type?: string; header?: { agentPreset?: string } }
    recovery.follow = { ok: true, snapshotType: snap.type, headerPreset: snap.header?.agentPreset ?? null }
    stream.cancel()
  } catch (e) {
    recovery.follow = { ok: false, error: errText(e) }
  }
  let stage = 'follow-open'
  try {
    const stream = await rt2.client.follow(x) // open BEFORE the prompt: the fake's
    // single scripted call replays from index 0, so its deltas must not race the
    // subscription (restart.test.ts runTurn ordering).
    const frames: Frame[] = []
    const drained = (async () => { for await (const f of stream) frames.push(f) })()
    stage = 'prompt'
    await sendPrompt(rt2.client, x, '重启后·续聊一问')
    recovery.prompt = { ok: true }
    stage = 'first-delta'
    await waitForDelta(frames, '甲', 15_000)
    stage = 'turn-end'
    await waitForTurnEnd(frames, 15_000)
    recovery.turnEnd = true
    stream.cancel()
    void drained
  } catch (e) {
    recovery.prompt = { ...((recovery.prompt as object) ?? {}), error: `${stage}: ${errText(e)}` }
    recovery.turnEnd = false
  }

  expect(
    { freshBot: recovery.freshBot, follow: recovery.follow, prompt: recovery.prompt, turnEnd: recovery.turnEnd },
    `connector bot recovery across restart (header presetId=${presetId}); observed outcomes in the diff — ` +
      'red here IS the CONTRACT §7.1 answer: the persisted temp preset no longer resolves after restart',
  ).toMatchObject({ freshBot: { ok: true }, follow: { ok: true }, prompt: { ok: true }, turnEnd: true })

  rt1.client.close()
  rt2.client.close()
}, 240_000)
