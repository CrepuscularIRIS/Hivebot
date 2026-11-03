// Unit tests for the tiered permission policy (src/policy/shell-ask.mjs).
// P5-21（PLAN p5-parity，Q-013 全表确认）：shell-ask 由「bash 必问」泛化为按
// profile/tiers.json 查表；ALWAYS 档（bash 第 1 行、文件工作区内第 3 行）仅在
// policy-state 实例校验通过时成立（决策 13⑤/16），否则退 ASK；ASK 在 never 会话
// 拒绝（P5-05 不变）；档位表损坏 → 全部退 ASK 并记日志（A9 ②）。T-07/T-12/P5-05
// 的 bash 语义（必问/严格更宽委托/never 拒绝）逐条保留。
// The plugin's in-runtime wiring (loader row, approval round-trip over $events)
// is covered end-to-end by tests/e2e/approval.test.ts + tiers-policy.test.ts.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as plugin from '../../src/policy/shell-ask.mjs'

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
    it(`in-workspace read/write ask when policy-state is ${s.label}`, async () => {
      const p = provisionedConfig(s.state)
      cleanups.push(p.cleanup)
      const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
      expect(await listener({ name: 'read', arguments: { file_path: 'a.txt' } }, next)).toMatchObject({ kind: 'ask' })
      expect(await listener({ name: 'write', arguments: { file_path: 'a.txt', content: 'x' } }, next)).toMatchObject({ kind: 'ask' })
    })
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

describe('P5-21 ④: reads outside the workspace ask regardless of the gate; outside writes hit the upstream fence', () => {
  const outside = { file_path: '/etc/hostname' }

  it('read outside the workspace asks even with the gate open (no always: every call re-asks)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    const first = await listener({ name: 'read', arguments: outside }, next)
    expect(first).toMatchObject({ kind: 'ask' })
    expect(await listener({ name: 'read', arguments: outside }, next), 'the identical call asks again (no standing grant at the SDK layer)').toMatchObject(first as object)
  })

  it('write outside the workspace delegates (upstream workspace-write fence owns it; a card would be theater)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', fs: true, config: p.config })
    expect(await listener({ name: 'write', arguments: { file_path: '/var/tmp/outside.txt', content: 'x' } }, next)).toBe(nextResult)
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

// ── P5-21 ⑤（A9 ⑦）：门开时 ALWAYS 类在 never 会话照常执行 ──

describe('P5-21 ⑤ (A9 ⑦): with the gate open, ALWAYS-class tools run even in never sessions (executed inside the wrapper)', () => {
  it('ordinary bash under never with a validated policy-state goes through (not denied)', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const listener = registeredListener({ mode: 'workspace-write', approval: approvalSvc('never'), config: p.config })
    expect(await listener({ name: 'bash', agent: { session: {} }, arguments: { command: 'echo x > m', description: 'x' } }, next)).toBe(nextResult)
  })
})
