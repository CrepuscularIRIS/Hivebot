// P7-F3: one process-owned recovery lease; no Assignment or operation state is stored here.
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { readFile as readText } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { foldAssignments } from '../orchestration/assignment.mjs'

// Module lifetime is the SDK process, not a socket or plugin mount.
const PROCESS_ID = randomUUID()

const require = createRequire(realpathSync(new URL('../../node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js', import.meta.url)))
const { interruptedTurnClosers } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')))

// 来源: https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/core/assignments.ts (MIT); local-only adaptation.
export const RECOVERY_NOTE = 'The host restarted during this assignment. Inspect the current worktree, operation records and existing results first. Do not repeat an already completed external operation. Unknown side effects must not be replayed automatically. Report the interrupted assignment status.'

/** Await readiness without allowing cancellation to be undone by a late resolve. */
export async function waitForRecovery(permit) {
  if (!permit) return
  permit.signal.throwIfAborted()
  let onAbort
  try {
    await Promise.race([
      permit.ready,
      new Promise((_, reject) => {
        onAbort = () => reject(permit.signal.reason)
        permit.signal.addEventListener('abort', onAbort, { once: true })
      }),
    ])
    permit.signal.throwIfAborted()
  } finally {
    if (onAbort) permit.signal.removeEventListener('abort', onAbort)
  }
}

/** Re-read the original logs, use native interrupted closers, then flush before acknowledgement. */
export async function recoverAssignments(orch, signal) {
  signal.throwIfAborted()
  const meta = JSON.parse(await readText(join(orch.config.dataDir, 'bots.json'), 'utf8'))
  if (!meta || meta.version !== 1 || (meta.mainBotId !== null && (typeof meta.mainBotId !== 'string' || meta.mainBotId === '')) ||
      (meta.bots !== undefined && (!meta.bots || typeof meta.bots !== 'object' || Array.isArray(meta.bots)))) {
    throw new Error('untrusted bot relationships; recovery stays closed')
  }
  const interrupted = []
  const held = []
  const issues = []
  for (const [id, bot] of Object.entries(meta.bots ?? {})) {
    if (id === meta.mainBotId) continue
    if (meta.mainBotId === null || bot?.createdBy !== meta.mainBotId) {
      issues.push({ sessionId: id, reason: 'unmatched-main' })
      continue
    }
    signal.throwIfAborted()
    let events = await orch.delivery.readLog(id)
    signal.throwIfAborted()
    const before = foldAssignments(events)
    const open = [...before.assignments].filter(([, assignment]) => assignment.ended === undefined)
    if (open.length) {
      // Do not resolveAgent/followup: that could release a restored inbox or goal driver.
      if (orch.ctx.agents.get(id) !== undefined) throw new Error('live unclosed assignment; recovery stays closed')
      const handle = await orch.ctx.sessionPersistence.open(id, 'write', { signal })
      try {
        signal.throwIfAborted()
        const { events: raw } = await handle.read(0, undefined, { signal })
        const closers = interruptedTurnClosers(raw)
        signal.throwIfAborted()
        if (closers.length) await handle.append(closers)
      } finally { await handle.close() }
      await orch.ctx.sessionPersistence.flush()
      signal.throwIfAborted()
      // Persisted termination, not computeDue's in-memory stopped projection.
      events = await orch.delivery.readLog(id)
      signal.throwIfAborted()
      const after = foldAssignments(events)
      for (const [assignmentId] of open) {
        if (after.assignments.get(assignmentId)?.ended !== 'interrupted') throw new Error('assignment termination not durable')
        interrupted.push({ sessionId: id, assignmentId })
      }
    }
    for (const pending of foldAssignments(events).pendingAssigns) held.push({ sessionId: id, assignmentId: pending.assignmentId })
  }
  signal.throwIfAborted()
  return { interrupted, held, issues, note: RECOVERY_NOTE }
}

/** Lifecycle owned by OrchestrationPlugin; peer identity comes only from the current invocation. */
export class HostRecovery {
  constructor(recover) {
    this.processId = PROCESS_ID
    this.lifetime = new AbortController()
    this.recover = recover
    this.current = this.makeLease(null)
    this.prepared = undefined
  }

  makeLease(peer) {
    const controller = new AbortController()
    const { promise, resolve } = Promise.withResolvers()
    return { peer, controller, signal: controller.signal, ready: promise, resolve, open: false, challenge: randomUUID(), prepared: false }
  }

  attach(peer) {
    this.lifetime.signal.throwIfAborted()
    this.current.controller.abort()
    this.current = this.makeLease(peer)
    return { processId: this.processId, challenge: this.current.challenge }
  }

  assert(peer, challenge) {
    const lease = this.current
    lease.signal.throwIfAborted()
    if (peer === null || lease.peer !== peer || lease.challenge !== challenge) throw new Error('stale or foreign recovery handoff')
    return lease
  }

  async prepare(peer, challenge) {
    const lease = this.assert(peer, challenge)
    // A reconnect is not an SDK restart. Native log repair is single-flight per process.
    this.prepared ??= this.recover(this.lifetime.signal)
    const summary = await this.prepared
    this.assert(peer, challenge)
    lease.prepared = !summary.issues?.length
    return { processId: this.processId, ...summary }
  }

  complete(peer, challenge) {
    const lease = this.assert(peer, challenge)
    if (!lease.prepared) throw new Error('assignments not restored')
    lease.open = true
    lease.resolve()
    return { processId: this.processId, ready: true }
  }

  detach(peer) {
    if (this.current.peer === peer) this.current.controller.abort()
  }

  stop() { this.lifetime.abort(); this.current.controller.abort() }
}
