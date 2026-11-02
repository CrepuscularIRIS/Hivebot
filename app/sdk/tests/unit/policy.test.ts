// Unit tests for the shell-ask policy decision itself (src/policy/shell-ask.mjs).
// The plugin's in-runtime wiring (loader row, approval round-trip over $events)
// is covered end-to-end by tests/e2e/approval.test.ts.
import { expect, it } from 'vitest'
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
 * service is absent, as in a no-sandbox composition.
 */
function fakeCtx(effectiveMode?: string): { listeners: RecordedListener[] } & {
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
      return undefined
    },
  }
}

/** The pre-execute listener apply() registered for one effective mode, or fail. */
function registeredListener(effectiveMode?: string): RecordedListener['listener'] {
  const ctx = fakeCtx(effectiveMode)
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
