// Unit tests for the tiered permission policy (src/policy/shell-ask.mjs).
// P5-21（PLAN p5-parity，Q-013 全表确认）：shell-ask 由「bash 必问」泛化为按
// profile/tiers.json 查表；ALWAYS 档（bash 第 1 行、文件工作区内第 3 行）仅在
// policy-state 实例校验通过时成立（决策 13⑤/16），否则退 ASK；ASK 在 never 会话
// 拒绝（P5-05 不变）；档位表损坏 → 全部退 ASK 并记日志（A9 ②）。T-07/T-12/P5-05
// 的 bash 语义（必问/严格更宽委托/never 拒绝）逐条保留。
// The plugin's in-runtime wiring (loader row, approval round-trip over $events)
// is covered end-to-end by tests/e2e/approval.test.ts + tiers-policy.test.ts.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as plugin from '../../src/policy/shell-ask.mjs'
import { issuePermit } from '../../src/policy/request-net.mjs'

interface RecordedListener {
  event: string
  listener: (exec: { name: string; agent?: unknown; arguments?: unknown }, next: () => unknown) => unknown
}

const WS = '/fake-ws'

/**
 * Minimal ctx capturing the one ctx.on registration apply() makes. When
 * `effectiveMode` is given, ctx.get('sandboxPolicy') serves a stub resolving
 * that mode + workspaceRoot (the same service tool-bash/guard read); `approval`
 * stubs ctx.get('approval'); `withFs` adds a ctx.fs.resolve stub anchoring
 * relative paths at WS (guard.mjs consumes the same service).
 */
function fakeCtx(effectiveMode?: string, approval?: object, withFs = false): { listeners: RecordedListener[] } & {
  on(event: string, listener: RecordedListener['listener']): void
  get(name: string): unknown
} {
  const listeners: RecordedListener[] = []
  return {
    listeners,
    on(event, listener) {
      listeners.push({ event, listener })
    },
    get(name: string) {
      if (name === 'sandboxPolicy' && effectiveMode !== undefined) {
        return { resolve: () => ({ mode: effectiveMode, workspaceRoot: WS }) }
      }
      if (name === 'approval' && approval !== undefined) {
        return approval
      }
      if (name === 'fs' && withFs) {
        return {
          resolve: async (raw: string) => ({ targetKey: raw.startsWith('/') ? raw : join(WS, raw) }),
        }
      }
      return undefined
    },
  }
}

/** An approval-service stub: overrideOf(session) → override, config.policy → configured. */
function approvalSvc(override?: string, configured?: string, throws = false): object {
  return {
    overrideOf: throws ? () => { throw new Error('projection unavailable') } : () => override,
    config: configured === undefined ? {} : { policy: configured },
  }
}

/** The pre-execute listener apply() registered, or fail. */
function registeredListener(opts: { mode?: string; approval?: object; fs?: boolean; config?: object } = {}): RecordedListener['listener'] {
  const ctx = fakeCtx(opts.mode, opts.approval, opts.fs)
  plugin.apply(ctx as never, (opts.config ?? {}) as never)
  expect(ctx.listeners, 'the plugin registers exactly one listener').toHaveLength(1)
  expect(ctx.listeners[0].event).toBe('tools/pre-execute')
  return ctx.listeners[0].listener
}

const nextResult = Symbol('next')
const next = (): unknown => nextResult
const askShape = { kind: 'ask', reason: 'p2sdk policy: ordinary shell commands require user approval' }
const neverDeny = { kind: 'deny', reason: 'approval unavailable in this session' }
// P6-25（决策 37）：写类区外固定字面串 deny（同 P5-05 的「原因固定字面串」口径）。
const writeOutDeny = { kind: 'deny', reason: 'p2sdk policy: write-outside-workspace denied (the target is outside this session workspace; the call does not run)' }

/** A temp handoff dir + policy-state dir wired as the plugin config would be. */
function provisionedConfig(state: Record<string, unknown> | 'missing' | 'invalid-json'): { config: object; statePath: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'p5-21-unit-'))
  const handoff = join(root, 'handoff')
  const data = join(root, 'data')
  mkdirSync(handoff)
  mkdirSync(data)
  writeFileSync(join(handoff, 'launch-token'), 'unit-token\n')
  const statePath = join(data, 'policy-state.json')
  if (state === 'missing') {
    // no file
  } else if (state === 'invalid-json') {
    writeFileSync(statePath, '{not json')
  } else {
    writeFileSync(statePath, JSON.stringify(state))
  }
  return {
    config: { handoff, policyStatePaths: [statePath] },
    statePath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

/** The instance value the plugin derives from the probe token ('unit-token'). */
const INSTANCE = plugin.instanceOf('unit-token')

const VALID: Record<string, unknown> = { version: 1, paused: false, instance: INSTANCE }

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

// ── T-07 / T-12 / P5-05：bash 语义回归（无 config → 门关 → 全部按 ASK） ──

it('exports the function-plugin shape (named name/apply, no default export)', () => {
  expect(plugin.name).toBe('p2sdk-shell-ask')
  expect(plugin.apply).toBeTypeOf('function')
  expect((plugin as { default?: unknown }).default).toBeUndefined()
})

it('asks for an ordinary bash call when the policy-state gate is not validated (no config)', async () => {
  const listener = registeredListener({ mode: 'workspace-write' })
  const decision = await listener(
    { name: 'bash', arguments: { command: 'touch /tmp/canary', description: 'x' } },
    next,
  )
  expect(decision).toEqual(askShape)
})

it('delegates a bash call whose sandbox_permissions is strictly wider than the effective mode', async () => {
  const listener = registeredListener({ mode: 'workspace-write' })
  expect(
    await listener({ name: 'bash', arguments: { command: 'ls /root', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'need root listing' } }, next),
    'workspace-write -> danger-full-access goes through tool-bash own escalation approval',
  ).toBe(nextResult)
  const roListener = registeredListener({ mode: 'read-only' })
  expect(
    await roListener({ name: 'bash', arguments: { command: 'ls', description: 'x', sandbox_permissions: 'workspace-write', justification: 'need writes' } }, next),
    'read-only -> workspace-write is strictly wider too',
  ).toBe(nextResult)
})

it('asks for a bash call whose sandbox_permissions repeats the effective mode', async () => {
  const listener = registeredListener({ mode: 'workspace-write' })
  const decision = await listener(
    { name: 'bash', arguments: { command: 'touch /tmp/canary', description: 'x', sandbox_permissions: 'workspace-write', justification: 'same mode probe' } },
    next,
  )
  expect(decision).toEqual(askShape)
})

it('asks for a bash call whose sandbox_permissions is narrower or unknown (fail closed)', async () => {
  const listener = registeredListener({ mode: 'workspace-write' })
  expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x', sandbox_permissions: 'read-only', justification: 'narrower probe' } }, next)).toEqual(askShape)
  expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x', sandbox_permissions: 'made-up-mode', justification: 'unknown probe' } }, next)).toEqual(askShape)
})

it('asks when the current effective mode cannot be resolved (no sandboxPolicy service)', async () => {
  const listener = registeredListener({})
  const decision = await listener(
    { name: 'bash', arguments: { command: 'ls /root', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'no policy service' } },
    next,
  )
  expect(decision, 'cannot prove strictly-wider -> ask; dedupe is left to the user').toEqual(askShape)
})

it('delegates non-tiered in-process tools untouched (default allow row, status quo)', async () => {
  const listener = registeredListener({ mode: 'workspace-write' })
  for (const name of ['fs_write', 'subagent', 'working_directory', 'todo']) {
    expect(await listener({ name, arguments: {} }, next), `${name} delegates to next()`).toBe(nextResult)
  }
})

it('treats absent/null arguments as ordinary (asks)', async () => {
  const listener = registeredListener({ mode: 'workspace-write' })
  expect(await listener({ name: 'bash' }, next)).toMatchObject({ kind: 'ask' })
  expect(await listener({ name: 'bash', arguments: null }, next)).toMatchObject({ kind: 'ask' })
})

// ── P5-05（G1-r2 #1）：never 会话语义（ASK 档在 never 拒绝）──

describe('P5-05 (G1-r2 #1): explicit approval=never denies instead of asking or releasing', () => {
  const agent = { session: {} }

  it('denies an ordinary bash call when the session override is never (gate closed → ASK → deny)', async () => {
    const listener = registeredListener({ mode: 'danger-full-access', approval: approvalSvc('never') })
    expect(await listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(neverDeny)
  })

  it('denies with sandbox_permissions set to a repeated/narrower mode under never (G1-r2 #1)', async () => {
    const listener = registeredListener({ mode: 'danger-full-access', approval: approvalSvc('never') })
    expect(await listener({
      name: 'bash', agent,
      arguments: { command: 'ls', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'repeat probe' },
    }, next)).toEqual(neverDeny)
    expect(await listener({
      name: 'bash', agent,
      arguments: { command: 'ls', description: 'x', sandbox_permissions: 'read-only', justification: 'narrower probe' },
    }, next)).toEqual(neverDeny)
  })

  it('denies when only the deployment config policy is never (no session override yet; G1-r2 #1)', async () => {
    const listener = registeredListener({ mode: 'danger-full-access', approval: approvalSvc(undefined, 'never') })
    expect(await listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(neverDeny)
  })

  it('denies under never even when the effective mode cannot be resolved (an ask has no answerer)', async () => {
    const listener = registeredListener({ approval: approvalSvc('never') })
    expect(await listener({
      name: 'bash', agent,
      arguments: { command: 'ls', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'unresolved mode probe' },
    }, next)).toEqual(neverDeny)
  })

  it('still delegates strictly-wider escalation under never (tool-bash own gate asks; never rejects it)', async () => {
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never') })
    expect(await listener({
      name: 'bash', agent,
      arguments: { command: 'ls', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'wider probe' },
    }, next)).toBe(nextResult)
  })

  it('still asks when the override is the default preset pinned ask', async () => {
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('ask') })
    expect(await listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(askShape)
  })

  it('still asks for any non-never policy value (only exact never denies)', async () => {
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('always') })
    expect(await listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(askShape)
  })

  it('still asks when the approval service or its state is unreadable (fail closed)', async () => {
    const noSvc = registeredListener({ mode: 'workspace-write' })
    expect(await noSvc({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
    const noOverrideNoConfig = registeredListener({ mode: 'workspace-write', approval: approvalSvc(undefined, undefined) })
    expect(await noOverrideNoConfig({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
    const throwing = registeredListener({ mode: 'workspace-write', approval: approvalSvc(undefined, undefined, true) })
    expect(await throwing({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
  })

  // T-17 (最终 L 复审 R1): overrideOf throws while the deployment config is
  // 'never' — unreadable session intent fails closed to ask.
  it('still asks when overrideOf throws and the deployment config policy is never (fail closed)', async () => {
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('ask', 'never', true) })
    expect(await listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(askShape)
  })

  it('still asks when the exec carries no agent/session (cannot prove never)', async () => {
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never') })
    expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
  })
})

// ── P5-21 ①②：policy-state 实例门控（决策 13⑤/16）──

describe('P5-21 ①: a validated policy-state unlocks the ALWAYS rows (bash + in-workspace files)', () => {
  it('lets an ordinary sandboxed bash call through (next) when instance matches', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', config: p.config })
    expect(await listener({ name: 'bash', arguments: { command: 'echo hi > a.txt', description: 'x' } }, next)).toBe(nextResult)
  })

  it('lets in-workspace read/write through with the gate open', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next), 'in-workspace read allows').toBe(nextResult)
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next), 'in-workspace write allows').toBe(nextResult)
    expect(await listener({ name: 'grep', arguments: { pattern: 'x', path: WS } }, next), 'in-workspace grep allows').toBe(nextResult)
  })
})

describe('P5-21 ②: the five invalid policy-state states demote ALWAYS back to ASK', () => {
  // L-7 R6（2026-11-04）：「file missing」从文件工具的门控态里移出——状态从未写入
  // （写端 P5-29 未交付）不再让工作区文件工具出卡/让 never 子代理失能，改由上方
  // 「unprovisioned」describe 断言放行；bash 的必问不变，仍在此处覆盖。其余四态
  // （文件存在但无效）保持 fail-closed。
  const states: Array<{ label: string; state: Record<string, unknown> | 'missing' | 'invalid-json' }> = [
    { label: 'file missing', state: 'missing' },
    { label: 'invalid JSON', state: 'invalid-json' },
    { label: 'paused', state: { version: 1, paused: true, instance: INSTANCE } },
    { label: 'fault (grants-corrupt)', state: { version: 1, paused: false, fault: 'grants-corrupt', instance: INSTANCE } },
    { label: 'instance mismatch (another SDK instance)', state: { version: 1, paused: false, instance: 'deadbeef' } },
  ]
  for (const s of states) {
    it(`bash asks when policy-state is ${s.label}`, async () => {
      const p = provisionedConfig(s.state)
      cleanups.push(p.cleanup)
      const listener = registeredListener({ mode: 'workspace-write', config: p.config })
      expect(await listener({ name: 'bash', arguments: { command: 'echo hi > a.txt', description: 'x' } }, next)).toEqual(askShape)
    })
    if (s.state !== 'missing') {
      it(`in-workspace read/write ask when policy-state is ${s.label}`, async () => {
        const p = provisionedConfig(s.state)
        cleanups.push(p.cleanup)
        const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
        expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
        expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toMatchObject({ kind: 'ask' })
      })
    }
  }

  it('an unknown policy-state schema version also demotes (fail closed)', async () => {
    const p = provisionedConfig({ version: 2, paused: false, instance: INSTANCE })
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', config: p.config })
    expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
  })

  it('a missing handoff (no launch token → no instance id) demotes even with a well-formed state', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', config: { policyStatePaths: [p.statePath] } })
    expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
  })
})

// ── P5-21 ④：第 4 行（Q-013 编号）文件读工作区外 ASK，与门控无关 ──

describe('P5-21 ④: reads outside the workspace ask regardless of the gate; outside writes are denied (P6-25)', () => {
  const outside = { file_path: '/etc/hostname' }

  it('read outside the workspace asks even with the gate open (no always: every call re-asks)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    const first = await listener({ name: 'read', arguments: outside }, next)
    expect(first).toMatchObject({ kind: 'ask' })
    expect(await listener({ name: 'read', arguments: outside }, next), 'the identical call asks again (no standing grant at the SDK layer)').toMatchObject(first as object)
  })

  it('write outside the workspace is denied with no card (P6-25 决策 37: the upstream fence writable roots include host /tmp — fence delegation was the hole, P6-22 r1 probe2)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: '/var/tmp/outside.txt', content: 'x' } }, next)).toEqual(writeOutDeny)
  })

  it('reads that cannot be resolved ask (fail closed)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: false, config: p.config })
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
  })

  it('an out-of-workspace read under never is denied (ASK tier in a never session)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never'), fs: true, config: p.config })
    expect(await listener({ name: 'read', agent: { session: {} }, arguments: outside }, next)).toEqual(neverDeny)
  })
})

// ── P5-21：连接器（第 7 行回退）与 web（第 10 行维持）──

describe('P5-21: connector tools ask (pre-P5-23 fallback, row 7); web stays allowed (row 10, Q-013 维持)', () => {
  it('mcp__ prefixed tools ask even with the gate open', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', config: p.config })
    expect(await listener({ name: 'mcp__x__search', arguments: { q: 'x' } }, next)).toMatchObject({ kind: 'ask' })
  })

  it('web tools stay allowed with the gate closed (维持现状, no new restriction)', async () => {
    const listener = registeredListener({ mode: 'workspace-write' })
    expect(await listener({ name: 'web_fetch', arguments: { url: 'https://example.com' } }, next)).toBe(nextResult)
    expect(await listener({ name: 'web_search', arguments: { query: 'x' } }, next)).toBe(nextResult)
  })
})

// ── P5-21 ③（A9 ②）：档位表损坏 → 全部退 ASK 并记日志；NEVER 归 guard 不在此测 ──

describe('P5-21 ③ (A9 ②): a corrupt tier table fails closed to per-call approval for every tool', () => {
  it('config.tiers invalid → bash / read / web all ask and one log line is emitted', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const listener = registeredListener({ mode: 'workspace-write', fs: true, config: { ...p.config, tiers: 'garbage' } })
      expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x' } }, next)).toMatchObject({ kind: 'ask' })
      expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
      expect(await listener({ name: 'web_fetch', arguments: { url: 'https://example.com' } }, next), 'even status-quo rows ask under a corrupt table').toMatchObject({ kind: 'ask' })
      expect(err).toHaveBeenCalledTimes(1)
      expect(String(err.mock.calls[0])).toContain('p2sdk-shell-ask')
    } finally {
      err.mockRestore()
    }
  })

  it('a tier value outside the known vocabulary is corrupt too (whole-key fail closed)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const listener = registeredListener({ mode: 'workspace-write', config: { tiers: { default: 'sometimes', bash: 'allow' } } })
      expect(await listener({ name: 'bash', arguments: { command: 'ls', description: 'x' } }, next)).toMatchObject({ kind: 'ask' })
      expect(err).toHaveBeenCalledTimes(1)
    } finally {
      err.mockRestore()
    }
  })

  it('a table without a default key is corrupt (unknown tools cannot be judged)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const listener = registeredListener({ mode: 'workspace-write', config: { tiers: { bash: 'allow' } } })
      expect(await listener({ name: 'todo', arguments: {} }, next)).toMatchObject({ kind: 'ask' })
      expect(err).toHaveBeenCalledTimes(1)
    } finally {
      err.mockRestore()
    }
  })
})

// ── L-7 修复链（P5-W3.f1）：R1 稀疏 overlay 的 mcp 兜底 / R6 未 provision 状态不门控文件工具 ──

describe('L-7 R1: a sparse tier overlay without an "mcp" row falls back to default for mcp__ tools', () => {
  // 触发面是 runtime patch / 后置 overlay 整表覆盖且省略 mcp 行（validateTiers 只强制 default）。
  // 修复前 kind=undefined 落 workspace 分支，MCP 工具无路径候选 → total=0 → next() 静默放行。
  it('asks for an mcp__ tool when the overlay omits the mcp row and default is ask', async () => {
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: { tiers: { default: 'ask' } } })
    expect(await listener({ name: 'mcp__x__search', arguments: { q: 'x' } }, next)).toMatchObject({ kind: 'ask' })
  })

  it('honors the overlay default row when it says allow (operator explicitly chose the fallback)', async () => {
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: { tiers: { default: 'allow' } } })
    expect(await listener({ name: 'mcp__x__search', arguments: { q: 'x' } }, next)).toBe(nextResult)
  })

  it('the shipped table still asks for mcp__ tools (row mcp:ask) even with the gate open', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'mcp__x__search', arguments: { q: 'x' } }, next)).toMatchObject({ kind: 'ask' })
  })
})

describe('L-7 R6: an unprovisioned policy-state (no file at any path) does not gate workspace file tools', () => {
  // 生产写端（P5-29 main 侧写入）未落地：状态文件从未写入 ≠ 门被关上。读端先落地时把
  // 「文件从未存在」与「存在但无效」区分开——前者回到 P5-21 之前的文件工具行为（工作区内
  // 放行、区外读出卡），bash 不放宽（T-07 不变）；一旦文件存在（任何内容），完整门控恢复。
  it('lets in-workspace read/write through when no policy-state file exists anywhere', async () => {
    const p = provisionedConfig('missing')
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toBe(nextResult)
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toBe(nextResult)
    expect(await listener({ name: 'edit', arguments: { file_path: 'a.txt' } }, next)).toBe(nextResult)
  })

  it('still asks for bash when the state file is missing (T-07 ordinary-shell-ask unchanged)', async () => {
    const p = provisionedConfig('missing')
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', config: p.config })
    expect(await listener({ name: 'bash', arguments: { command: 'echo hi > a.txt', description: 'x' } }, next)).toEqual(askShape)
  })

  it('never sessions run in-workspace file tools when the state file is missing (delegated subagents restored)', async () => {
    const p = provisionedConfig('missing')
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never'), fs: true, config: p.config })
    expect(await listener({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next)).toBe(nextResult)
    expect(await listener({ name: 'write', agent: { session: {} }, arguments: { file_path: 'a.txt', content: 'x' } }, next)).toBe(nextResult)
  })

  it('an existing (invalid/paused/mismatched) state file still gates in-workspace file tools', async () => {
    for (const state of ['invalid-json' as const, { version: 1, paused: true, instance: INSTANCE }, { version: 1, paused: false, instance: 'deadbeef' }]) {
      const p = provisionedConfig(state)
      cleanups.push(p.cleanup)
      const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
      expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
      expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toMatchObject({ kind: 'ask' })
    }
  })

  it('a bare plugin (no policyStatePaths in config) still gates file tools (documented bare behavior unchanged)', async () => {
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: {} })
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toMatchObject({ kind: 'ask' })
  })
})

// ── L-7 修复链：O3 request_network 两侧校验对称 / O5 许可命中的 bash 不出第二张卡 ──

describe('L-7 O3: request_network pre-execute rejects what execute would reject (no doomed approval card)', () => {
  it('denies a request_network whose command exceeds the execute-side length limit', async () => {
    const listener = registeredListener({ mode: 'workspace-write' })
    const decision = await listener({ name: 'request_network', arguments: { reason: 'fetch deps', command: 'x'.repeat(8193) } }, next)
    expect(decision).toMatchObject({ kind: 'deny', reason: expect.stringContaining('too long') })
  })

  it('denies malformed request_network arguments before any card (empty reason)', async () => {
    const listener = registeredListener({ mode: 'workspace-write' })
    const decision = await listener({ name: 'request_network', arguments: { reason: '  ', command: 'curl example.com' } }, next)
    expect(decision).toMatchObject({ kind: 'deny', reason: expect.stringContaining('reason') })
  })

  it('still asks for a well-formed request_network', async () => {
    const listener = registeredListener({ mode: 'workspace-write' })
    expect(await listener({ name: 'request_network', arguments: { reason: 'fetch deps', command: 'curl example.com' } }, next))
      .toMatchObject({ kind: 'ask' })
  })
})

describe('L-7 O5: a live network permit for this exact command satisfies the bash tier (one card, not two)', () => {
  const SESSION = { header: { id: 'sess-net-1' } }
  const mkPermitDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'p5w3f1-permit-'))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    return dir
  }

  it('lets bash through when an unexpired permit matches session + exact command', async () => {
    const dir = mkPermitDir()
    issuePermit({ dir, session: 'sess-net-1', command: 'curl example.com' })
    const listener = registeredListener({ mode: 'workspace-write', config: { permitDir: dir } })
    expect(await listener({ name: 'bash', agent: { session: SESSION }, arguments: { command: 'curl example.com', description: 'x' } }, next)).toBe(nextResult)
  })

  it('still asks when the permit is for another session, expired, or absent', async () => {
    const dir = mkPermitDir()
    issuePermit({ dir, session: 'sess-other', command: 'curl example.com' })
    issuePermit({ dir, session: 'sess-net-1', command: 'curl expired.example', ttlMs: -1000 })
    const listener = registeredListener({ mode: 'workspace-write', config: { permitDir: dir } })
    for (const command of ['curl example.com', 'curl expired.example', 'curl never-permitted.example']) {
      expect(await listener({ name: 'bash', agent: { session: SESSION }, arguments: { command, description: 'x' } }, next), command).toEqual(askShape)
    }
  })

  it('still asks with no permitDir configured', async () => {
    const listener = registeredListener({ mode: 'workspace-write' })
    expect(await listener({ name: 'bash', agent: { session: SESSION }, arguments: { command: 'curl example.com', description: 'x' } }, next)).toEqual(askShape)
  })
})

// ── L-8 修复链（P5-W3.f3）：R1 provision 后删除不放松文件门 / R4 联网许可一次性原子抢占 ──

describe('L-8 R1: a policy-state deleted after provisioning keeps the workspace file gate closed', () => {
  // L-8 R1：L-7 R6 的「从未存在 → 不门控」只对从未存在成立。曾 provision（状态文件
  // 出现过——paused/fault/instance 不符等关门态）后被删除（清理/轮换/手工 rm/写端
  // 中途崩溃留空缺）必须 fail closed，否则暂停/故障门被静默撤销。记忆两级：进程内
  // latch + 状态文件同目录的伴生标记（跨重启）。
  it('in-workspace read/write keep asking after the provisioned state file is deleted (was: silently open)', async () => {
    const p = provisionedConfig({ version: 1, paused: true, instance: INSTANCE })
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
    rmSync(p.statePath)
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next), '删除后仍关门，不回到「从未存在」放行').toMatchObject({ kind: 'ask' })
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toMatchObject({ kind: 'ask' })
  })

  it('never sessions keep denying file tools after deletion (delegated subagents do not come back)', async () => {
    const p = provisionedConfig({ version: 1, paused: true, instance: INSTANCE })
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never'), fs: true, config: p.config })
    expect(await listener({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next)).toEqual(neverDeny)
    rmSync(p.statePath)
    expect(await listener({ name: 'read', agent: { session: {} }, arguments: { file_path: 'a.txt' } }, next), '删除转移不放松 never 门').toEqual(neverDeny)
  })

  it('the provisioned memory survives an SDK restart (companion marker in the state dir)', async () => {
    const p = provisionedConfig({ version: 1, paused: true, instance: INSTANCE })
    cleanups.push(p.cleanup)
    const first = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await first({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
    rmSync(p.statePath)
    // 新 apply = 新进程记忆（cachedInstance / latch 全新）：只能凭磁盘上的伴生标记
    const restarted = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await restarted({ name: 'read', arguments: { file_path: 'a.txt' } }, next), '重启后凭伴生标记仍关门').toMatchObject({ kind: 'ask' })
  })

  it('a never-provisioned dir still opens the file gate and leaves no trace files (L-7 R6 missing semantics unchanged)', async () => {
    const p = provisionedConfig('missing')
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toBe(nextResult)
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toBe(nextResult)
    expect(readdirSync(dirname(p.statePath)), '从未 provision 不产生任何伴生文件').toEqual([])
  })
})

describe('L-8 R4: a network permit authorizes exactly one bash pre-execute (atomic claim, not a shared read)', () => {
  // L-8 R4：hasLivePermit 只读 → 同一许可可被多个（后台）bash 重复借用执行本地
  // 副作用。抢占语义：pre-execute 命中即原子 rename（permit-*.json → claim-*.json，
  // 同一源文件只有一个赢家，输家出卡）；改名产物仍是 .json 且 session/argvHash 不变，
  // wrapper 的 claim_permit（按 *.json + 字段匹配 unlink）仍能认领联网。
  const SESSION = { header: { id: 'sess-r4' } }
  const COMMAND = 'printf x >> log.txt; curl https://example.com'
  const mkPermitDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'p5w3f3-permit-'))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    return dir
  }
  type Listener = ReturnType<typeof registeredListener>
  const bash = (listener: Listener, command: string = COMMAND) =>
    listener({ name: 'bash', agent: { session: SESSION }, arguments: { command, description: 'x' } }, next)

  it('first matching bash consumes the permit; an identical second bash asks again (was: both silently through)', async () => {
    const dir = mkPermitDir()
    issuePermit({ dir, session: 'sess-r4', command: COMMAND })
    const listener = registeredListener({ mode: 'workspace-write', config: { permitDir: dir } })
    expect(await bash(listener)).toBe(nextResult)
    expect(await bash(listener), '同一许可不授权第二次 bash（卡面单次使用语义）').toEqual(askShape)
  })

  it('the claim renames the permit away for pre-execute but keeps it wrapper-claimable for network', async () => {
    const dir = mkPermitDir()
    const { permit } = issuePermit({ dir, session: 'sess-r4', command: COMMAND })
    const listener = registeredListener({ mode: 'workspace-write', config: { permitDir: dir } })
    expect(await bash(listener)).toBe(nextResult)
    const names = readdirSync(dir)
    expect(names.some((n) => n.startsWith('permit-')), '原许可已原子移走（后续 pre-execute 扫描不再命中）').toBe(false)
    const claimed = names.find((n) => n.endsWith('.json'))
    expect(claimed, '抢占产物仍是 .json（wrapper claim_permit 按 *.json 认领）').toBeTruthy()
    expect(JSON.parse(readFileSync(join(dir, claimed!), 'utf8')))
      .toMatchObject({ session: 'sess-r4', argvHash: permit.argvHash })
  })

  it('two approvals authorize two executions; a third asks', async () => {
    const dir = mkPermitDir()
    issuePermit({ dir, session: 'sess-r4', command: COMMAND })
    issuePermit({ dir, session: 'sess-r4', command: COMMAND })
    const listener = registeredListener({ mode: 'workspace-write', config: { permitDir: dir } })
    expect(await bash(listener)).toBe(nextResult)
    expect(await bash(listener)).toBe(nextResult)
    expect(await bash(listener)).toEqual(askShape)
  })
})

// ── P5-21 ⑤（A9 ⑦）：门开时 ALWAYS 类在 never 会话照常执行 ──

describe('P5-21 ⑤ (A9 ⑦): with the gate open, ALWAYS-class tools run even in never sessions (executed inside the wrapper)', () => {
  it('ordinary bash under never with a validated policy-state goes through (not denied)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never'), config: p.config })
    expect(await listener({ name: 'bash', agent: { session: {} }, arguments: { command: 'echo x > m', description: 'x' } }, next)).toBe(nextResult)
  })
})

// ── P6-25（PLAN p6-orchestration 决策 37，2026-11-05）：写类区外一律 deny，不出卡 ──
// 根因：P5-21 起写类「区外 → next()」交上游 workspace-write fence，前提是 fence 会
// 拒；但 dsh-sandbox fence 的可写根含宿主 /tmp 与 os.tmpdir()（dsh-sandbox
// lib/index.js:232-244），而 bash 的 /tmp 是私有 tmpfs——所有会话都能用 write/edit
// 无卡改写宿主 /tmp（P6-22 r1 实锚 probe2.txt，dev-single-json-schema-1.w1.jsonl:8760）。
// 收紧为 deny（非出卡）：用户无从判断一个 /tmp 路径该不该批，bot 的 bash 也看不见
// 宿主 /tmp。读类语义不变（区外读仍 ASK，Q-013 第 3 行）；NEVER 根规则归 guard 不变。

describe('P6-25: write-class calls outside the workspace are denied (hard deny, no card, no fence delegation)', () => {
  const OUT = '/tmp/bot-p6-25-unit/probe.txt'

  it('denies write and edit with an absolute outside target even with the gate open', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: OUT, content: 'x' } }, next)).toEqual(writeOutDeny)
    expect(await listener({ name: 'edit', arguments: { file_path: OUT, old_string: 'a', new_string: 'b' } }, next)).toEqual(writeOutDeny)
  })

  it('the deny is identical under approvalPolicy=never (a hard deny, not the never ask-deny reason)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never'), fs: true, config: p.config })
    expect(await listener({ name: 'write', agent: { session: {} }, arguments: { file_path: OUT, content: 'x' } }, next)).toEqual(writeOutDeny)
  })

  it('the deny precedes the workspace gate: an existing-but-invalid policy-state does not turn it into a writeGate card', async () => {
    const p = provisionedConfig('invalid-json')
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: OUT, content: 'x' } }, next)).toEqual(writeOutDeny)
  })

  it('fails closed without the fs service (cannot prove inside → deny, not delegate)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toEqual(writeOutDeny)
  })

  it('fails closed without a workspaceRoot (sandboxPolicy unreadable → allInside false → deny)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ fs: true, config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toEqual(writeOutDeny)
  })

  it('a candidate that cannot be resolved is denied too (targets < total → unprovable is not inside)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listeners: RecordedListener[] = []
    const ctx = {
      on: (event: string, listener: RecordedListener['listener']) => { listeners.push({ event, listener }) },
      get: (name: string) =>
        name === 'fs' ? { resolve: async () => { throw new Error('resolve boom') } }
          : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'workspace-write', workspaceRoot: WS }) }
          : undefined,
    }
    plugin.apply(ctx as never, p.config as never)
    expect(listeners).toHaveLength(1)
    expect(await listeners[0]!.listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toEqual(writeOutDeny)
  })

  it('read semantics unchanged by P6-25: the same outside target still asks (Q-013 row 3 intact)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'read', arguments: { file_path: OUT } }, next)).toMatchObject({ kind: 'ask' })
  })

  it('in-workspace write/edit still pass with the gate open (only the outside branch tightened)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toBe(nextResult)
    expect(await listener({ name: 'edit', arguments: { file_path: 'a.txt', old_string: 'a', new_string: 'b' } }, next)).toBe(nextResult)
  })
})
