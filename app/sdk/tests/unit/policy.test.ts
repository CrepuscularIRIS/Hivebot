// Unit tests for the shell-ask policy decision itself (src/policy/shell-ask.mjs).
// The plugin's in-runtime wiring (loader row, approval round-trip over $events)
// is covered end-to-end by tests/e2e/approval.test.ts.
import { expect, it } from 'vitest'
import * as plugin from '../../src/policy/shell-ask.mjs'

interface RecordedListener {
  event: string
  listener: (exec: { name: string; arguments?: unknown }, next: () => unknown) => unknown
}

/** Minimal ctx capturing the one ctx.on registration apply() makes. */
function fakeCtx(): { listeners: RecordedListener[] } & { on(event: string, listener: RecordedListener['listener']): void } {
  const listeners: RecordedListener[] = []
  return {
    listeners,
    on(event, listener) {
      listeners.push({ event, listener })
    },
  }
}

/** The pre-execute listener apply() registered, or fail the test. */
function registeredListener(): RecordedListener['listener'] {
  const ctx = fakeCtx()
  plugin.apply(ctx as never)
  expect(ctx.listeners, 'the plugin registers exactly one listener').toHaveLength(1)
  expect(ctx.listeners[0].event).toBe('tools/pre-execute')
  return ctx.listeners[0].listener
}

const nextResult = Symbol('next')
const next = (): unknown => nextResult

it('exports the function-plugin shape (named name/apply, no default export)', () => {
  expect(plugin.name).toBe('p2sdk-shell-ask')
  expect(plugin.apply).toBeTypeOf('function')
  expect((plugin as { default?: unknown }).default).toBeUndefined()
})

it('asks for an ordinary bash call (no sandbox_permissions)', () => {
  const listener = registeredListener()
  const decision = listener(
    { name: 'bash', arguments: { command: 'touch /tmp/canary', description: 'x' } },
    next,
  )
  expect(decision).toEqual({ kind: 'ask', reason: 'p2sdk policy: ordinary shell commands require user approval' })
})

it('delegates a bash call that escalates (sandbox_permissions asks through tool-bash itself)', () => {
  const listener = registeredListener()
  const decision = listener(
    { name: 'bash', arguments: { command: 'ls /root', sandbox_permissions: 'danger-full-access' } },
    next,
  )
  expect(decision).toBe(nextResult)
})

it('delegates every non-bash tool untouched', () => {
  const listener = registeredListener()
  for (const name of ['fs_write', 'glob', 'subagent']) {
    expect(listener({ name, arguments: {} }, next), `${name} delegates to next()`).toBe(nextResult)
  }
})

it('treats absent/null arguments as ordinary (asks)', () => {
  const listener = registeredListener()
  expect(listener({ name: 'bash' }, next)).toMatchObject({ kind: 'ask' })
  expect(listener({ name: 'bash', arguments: null }, next)).toMatchObject({ kind: 'ask' })
})
