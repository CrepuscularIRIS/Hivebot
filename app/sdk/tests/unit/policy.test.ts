// Unit tests for the shell-ask policy decision itself (src/policy/shell-ask.mjs).
// The plugin's in-runtime wiring (loader row, approval round-trip over $events)
// is covered end-to-end by tests/e2e/approval.test.ts.
import { describe, expect, it } from 'vitest'
import * as plugin from '../../src/policy/shell-ask.mjs'

interface RecordedListener {
  event: string
  listener: (exec: { name: string; agent?: unknown; arguments?: unknown }, next: () => unknown) => unknown
}

/**
 * Minimal ctx capturing the one ctx.on registration apply() makes. When
 * `effectiveMode` is given, ctx.get('sandboxPolicy') serves a stub resolving
 * that mode (the same service tool-bash reads at
 * packages/shell/tool-bash/src/index.ts resolveSandboxPolicy); without it the
 * service is absent, as in a no-sandbox composition. `approval` stubs
 * ctx.get('approval') (the real service is dsh-user-approval: overrideOf +
 * config.policy).
 */
function fakeCtx(effectiveMode?: string, approval?: object): { listeners: RecordedListener[] } & {
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
        return { resolve: () => ({ mode: effectiveMode }) }
      }
      if (name === 'approval' && approval !== undefined) {
        return approval
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

/** The pre-execute listener apply() registered for one effective mode, or fail. */
function registeredListener(effectiveMode?: string, approval?: object): RecordedListener['listener'] {
  const ctx = fakeCtx(effectiveMode, approval)
  plugin.apply(ctx as never)
  expect(ctx.listeners, 'the plugin registers exactly one listener').toHaveLength(1)
  expect(ctx.listeners[0].event).toBe('tools/pre-execute')
  return ctx.listeners[0].listener
}

const nextResult = Symbol('next')
const next = (): unknown => nextResult
const askShape = { kind: 'ask', reason: 'p2sdk policy: ordinary shell commands require user approval' }

it('exports the function-plugin shape (named name/apply, no default export)', () => {
  expect(plugin.name).toBe('p2sdk-shell-ask')
  expect(plugin.apply).toBeTypeOf('function')
  expect((plugin as { default?: unknown }).default).toBeUndefined()
})

it('asks for an ordinary bash call (no sandbox_permissions)', () => {
  const listener = registeredListener('workspace-write')
  const decision = listener(
    { name: 'bash', arguments: { command: 'touch /tmp/canary', description: 'x' } },
    next,
  )
  expect(decision).toEqual(askShape)
})

it('delegates a bash call whose sandbox_permissions is strictly wider than the effective mode', () => {
  const listener = registeredListener('workspace-write')
  expect(
    listener({ name: 'bash', arguments: { command: 'ls /root', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'need root listing' } }, next),
    'workspace-write -> danger-full-access goes through tool-bash own escalation approval',
  ).toBe(nextResult)
  const roListener = registeredListener('read-only')
  expect(
    roListener({ name: 'bash', arguments: { command: 'ls', description: 'x', sandbox_permissions: 'workspace-write', justification: 'need writes' } }, next),
    'read-only -> workspace-write is strictly wider too',
  ).toBe(nextResult)
})

// T-12 (REVIEW R6/R12): repeating the effective mode must NOT skip the ask —
// tool-bash validateBashArgs early-returns on sandbox_permissions === effectiveMode
// (packages/shell/tool-bash/src/index.ts:83) and approveEscalation returns it
// without approval (packages/sandbox/sandbox/src/escalation.ts:174), so nobody
// else would ask; the policy is the only gate left.
it('asks for a bash call whose sandbox_permissions repeats the effective mode', () => {
  const listener = registeredListener('workspace-write')
  const decision = listener(
    { name: 'bash', arguments: { command: 'touch /tmp/canary', description: 'x', sandbox_permissions: 'workspace-write', justification: 'same mode probe' } },
    next,
  )
  expect(decision).toEqual(askShape)
})

it('asks for a bash call whose sandbox_permissions is narrower or unknown (fail closed)', () => {
  const listener = registeredListener('workspace-write')
  expect(listener({ name: 'bash', arguments: { command: 'ls', description: 'x', sandbox_permissions: 'read-only', justification: 'narrower probe' } }, next)).toEqual(askShape)
  expect(listener({ name: 'bash', arguments: { command: 'ls', description: 'x', sandbox_permissions: 'made-up-mode', justification: 'unknown probe' } }, next)).toEqual(askShape)
})

it('asks when the current effective mode cannot be resolved (no sandboxPolicy service)', () => {
  const listener = registeredListener(undefined)
  const decision = listener(
    { name: 'bash', arguments: { command: 'ls /root', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'no policy service' } },
    next,
  )
  expect(decision, 'cannot prove strictly-wider -> ask; dedupe is left to the user').toEqual(askShape)
})

it('delegates every non-bash tool untouched', () => {
  const listener = registeredListener('workspace-write')
  for (const name of ['fs_write', 'glob', 'subagent']) {
    expect(listener({ name, arguments: {} }, next), `${name} delegates to next()`).toBe(nextResult)
  }
})

it('treats absent/null arguments as ordinary (asks)', () => {
  const listener = registeredListener('workspace-write')
  expect(listener({ name: 'bash' }, next)).toMatchObject({ kind: 'ask' })
  expect(listener({ name: 'bash', arguments: null }, next)).toMatchObject({ kind: 'ask' })
})

// T-12.f1 (增量 L 复审 R2): the session's effective approval policy folds as
// overrideOf(session) ?? config.policy ?? 'ask' — the same fold as upstream
// user-approval effectivePolicy (packages/interaction/user-approval/src/
// index.ts:270-272) and permission-presets derive (permission-presets/src/
// index.ts:348-361). An explicit 'never' (danger-full-access preset switch, or
// the base bundle's DSH_PERMISSION_MODE=danger-full-access config) must let
// bash through: user-approval rejects every ask deterministically under never
// (index.ts:301), so an ask here is a guaranteed deny with nobody prompted —
// the R2 deadlock. Every other value (the pinned 'ask' of the default preset
// included) keeps asking, so the default preset's behavior is unchanged.
describe('T-12.f1: explicit approval=never releases the ask', () => {
  const agent = { session: {} }

  it('delegates an ordinary bash call when the session override is never', () => {
    const listener = registeredListener('danger-full-access', approvalSvc('never'))
    expect(listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toBe(nextResult)
  })

  it('delegates even with sandbox_permissions set (an ask under never is a guaranteed deny)', () => {
    const listener = registeredListener('danger-full-access', approvalSvc('never'))
    expect(listener({
      name: 'bash', agent,
      arguments: { command: 'ls', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'repeat probe' },
    }, next)).toBe(nextResult)
  })

  it('delegates when only the deployment config policy is never (no session override yet)', () => {
    const listener = registeredListener('danger-full-access', approvalSvc(undefined, 'never'))
    expect(listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toBe(nextResult)
  })

  it('still asks when the override is the default preset pinned ask', () => {
    const listener = registeredListener('workspace-write', approvalSvc('ask'))
    expect(listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(askShape)
  })

  it('still asks for any non-never policy value (only exact never releases)', () => {
    const listener = registeredListener('workspace-write', approvalSvc('always'))
    expect(listener({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next))
      .toEqual(askShape)
  })

  it('still asks when the approval service or its state is unreadable (fail closed)', () => {
    const noSvc = registeredListener('workspace-write')
    expect(noSvc({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
    const noOverrideNoConfig = registeredListener('workspace-write', approvalSvc(undefined, undefined))
    expect(noOverrideNoConfig({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
    const throwing = registeredListener('workspace-write', approvalSvc(undefined, undefined, true))
    expect(throwing({ name: 'bash', agent, arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
  })

  it('still asks when the exec carries no agent/session (cannot prove never)', () => {
    const listener = registeredListener('workspace-write', approvalSvc('never'))
    expect(listener({ name: 'bash', arguments: { command: 'ls', description: 'x' } }, next)).toEqual(askShape)
  })
})
