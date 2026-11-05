// P7-F3: main owns F1; SDK owns native Assignment repair. A socket epoch only cancels work,
// never establishes a new SDK process generation or grants a management permission.
import type { OperationsLedger, OperationsView } from './operations'

interface Frame { type: string; value?: unknown }
interface RecoveryDsh {
  currentGeneration?: number
  onConnected(fn: (generation: number) => void): unknown
  onDisconnected(fn: () => void): unknown
  ready(): Promise<{ openStream(endpoint: string, args: unknown, cb: (frame: Frame) => void): { cancel(): void } }>
  rpc(method: string, args: unknown): Promise<{ ok: boolean; value?: unknown }>
}
interface Handoff { processId: string; challenge: string }
interface Summary { processId: string; interrupted: unknown[]; held: unknown[]; issues: Array<{ sessionId: string; reason: string }> }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const handoffOf = (value: unknown): value is Handoff => object(value) && typeof value.processId === 'string' && value.processId !== '' && typeof value.challenge === 'string' && value.challenge !== ''
const summaryOf = (value: unknown): value is Summary => object(value) && typeof value.processId === 'string' && Array.isArray(value.interrupted) && Array.isArray(value.held) && Array.isArray(value.issues) && value.issues.every((issue) => object(issue) && typeof issue.sessionId === 'string' && typeof issue.reason === 'string')
const operations = (view: OperationsView) => [...view.inProgress, ...view.completed, ...view.failed, ...view.undone]

/** Wire the recovery control stream on main's own Peer. Never replay an in-progress operation. */
export function wireAdminRecovery(deps: {
  dsh: RecoveryDsh
  ledger: OperationsLedger
  restore: (connectionGeneration: number) => Promise<void>
  log?: (message: string) => void
}) {
  const log = deps.log ?? ((message: string) => console.warn(message))
  const initialized = deps.ledger.init()
  let closed = false
  let epoch = 0
  let ready = false
  let current: { cancel(): void } | undefined
  let ticket: Handoff | undefined
  let hostProcess: string | undefined
  let hostGeneration = 0
  let connectionGeneration = deps.dsh.currentGeneration ?? 0
  const invalidate = () => { ++epoch; ready = false; ticket = undefined }
  const check = (expected: number) => {
    if (closed || expected !== epoch) throw new Error('obsolete recovery connection')
  }

  const restore = async (handoff: Handoff, expected: number, connection: number) => {
    try {
      await initialized
      check(expected)
      const view = deps.ledger.readOperations() // throws for an unhealthy ledger
      await deps.restore(connection)
      check(expected)
      const result = await deps.dsh.rpc('pbots/orchestration.recoveryPrepare', { request: { challenge: handoff.challenge } })
      check(expected)
      if (!result.ok || !summaryOf(result.value) || result.value.processId !== handoff.processId) throw new Error('untrusted Assignment recovery response')
      if (hostProcess !== handoff.processId) {
        hostGeneration = Math.max(hostGeneration, ...operations(view).flatMap((operation) => [operation.generation, operation.receipt?.generation ?? 0])) + 1
        hostProcess = handoff.processId
      }
      for (const issue of result.value.issues) {
        check(expected)
        const audit = await deps.ledger.beginOperation({ action: 'recovery', actor: 'host', turnCategory: 'delegated', generation: hostGeneration, target: issue.sessionId, dedupeKey: `recovery:${handoff.processId}:${issue.sessionId}:${issue.reason}` })
        if (audit.created) await deps.ledger.finishOperation(audit.operationId, { outcome: 'failed', error: issue.reason })
      }
      if (result.value.issues.length) throw new Error('unmatched Assignment relationships; audit recorded')
      check(expected)
      deps.ledger.readOperations() // health recheck immediately before release
      const completed = await deps.dsh.rpc('pbots/orchestration.recoveryComplete', { request: { challenge: handoff.challenge } })
      check(expected)
      if (!completed.ok || !object(completed.value) || completed.value.processId !== handoff.processId || completed.value.ready !== true) throw new Error('recovery completion not confirmed')
      ticket = handoff
      ready = true
    } catch (error) {
      if (expected === epoch && !closed) { ready = false; log(`[admin] recovery stays closed: ${String(error)}`) }
    }
  }

  const subscribe = async () => {
    invalidate()
    const expected = epoch
    const connection = connectionGeneration
    try {
      const socket = await deps.dsh.ready()
      check(expected)
      current = socket.openStream('pbots/orchestration.recovery', {}, (frame) => {
        if (closed || expected !== epoch) return
        if (frame.type !== 'item') {
          invalidate()
          return
        }
        if (!handoffOf(frame.value) || ticket !== undefined) { invalidate(); log('[admin] invalid recovery handoff'); return }
        // Mark the frame consumed now, not after asynchronous repair (duplicate frames cannot race).
        ticket = frame.value
        void restore(frame.value, expected, connection)
      })
    } catch (error) {
      if (expected === epoch && !closed) { invalidate(); log(`[admin] recovery subscription failed: ${String(error)}`) }
    }
  }
  deps.dsh.onDisconnected(invalidate)
  deps.dsh.onConnected((generation) => {
    connectionGeneration = generation
    invalidate()
    try { current?.cancel() } catch { /* dead socket already invalidated its SDK lease */ }
    current = undefined
    void subscribe()
  })
  void subscribe()

  return {
    initialized,
    isReady: () => ready && !closed,
    generation: () => ready ? hostGeneration : undefined,
    // F4 owns restart receipts. A client of an external SDK cannot issue one.
    close() {
      closed = true
      invalidate()
      try { current?.cancel() } catch { /* connection already closed */ }
    },
  }
}
