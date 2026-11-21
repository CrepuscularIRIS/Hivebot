// P6-21 assignment foundation (PLAN 决策 27① / 28，R2-2): generate assignment
// ids, build the `pbots-assign:*` message, and recover each assignment's
// consuming turn / end state / undecided asks from a worker session log.
//
// foldAssignments 骨架来源: work/p6-orchestration/evidence/p6-09/probe.mjs
// `P609Probe.foldAssignments`（P6-09 (f4)/(g) 实证），同类参考
// deepseek-harness@ce7073d packages/core/agent/src/consumed-work.ts:69-101
// （claim = 无 outcome 的移除落在 open turn 内；canceled 移除 = 撤回）。
// R2-2 约束：必须重放 agent/inbox/spliced + turn/start，不得只扫 user/message。
/** Assignment identity and worker-log folding (P6-21). */

import { randomUUID } from 'node:crypto'

/** Message id prefix marking a task assignment (决策 27①). */
export const ASSIGN_PREFIX = 'pbots-assign:'
/** Source kind of assignment messages injected into a worker session. */
export const ASSIGN_SOURCE_KIND = 'pbots-main'
/** The tool name dsh uses for human questions (P6-09 (b)). */
export const QUESTION_TOOL = 'ask_user_question'

/** A fresh assignment id (opaque, unique). @returns {string} */
export function newAssignmentId() {
  return randomUUID()
}

/** The stable assign-message id for one assignment. @param {string} assignmentId */
export function assignMessageId(assignmentId) {
  return ASSIGN_PREFIX + assignmentId
}

/**
 * Build the task message injected into a worker session: own source kind,
 * stable id, relay form (决策 27①). The turn that claims it is the
 * Assignment turn (决策 14).
 * @param {{ assignmentId: string, mainBotId: string, text: string }} parts
 */
export function buildAssignMessage({ assignmentId, mainBotId, text }) {
  return {
    id: assignMessageId(assignmentId),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: ASSIGN_SOURCE_KIND, form: 'relay', assignmentId, mainBotId },
  }
}

/**
 * Fold a worker session's projected log (delivery.mjs `projectEvent` shape)
 * into assignment state. Single pass replaying both inbox lists:
 *  - claim = a removal splice without `outcome` inside an open turn — that
 *    turn is the Assignment turn (P6-09 (f4): claim splice alone recovers it
 *    even with no user/message, e.g. crash windows and pre-step rejects);
 *  - a `canceled` removal is a withdrawal; the same id re-inserted right
 *    after is the (f2) wake reorder, never a consumption;
 *  - turn/end records the end reason and voids that turn's undecided asks
 *    (决策 28: ask 不跨回合，由 end 覆盖).
 * @param {object[]} events projected worker-log events.
 * @returns {{
 *   assignments: Map<string, { turn: number, ended: string | undefined, asks: Array<{ eventId: string, awaiting: 'approval' | 'question' }> }>,
 *   pendingAssigns: Array<{ id: string, assignmentId: string }>,
 * }} ended === undefined → the consuming turn never closed (crash; caller
 *   decides stopped vs still-running from agent idleness).
 */
export function foldAssignments(events) {
  const lists = { 'next-turn': [], 'next-step': [] }
  const claimedIn = new Map() // turn -> claimed message summaries (insertion order = event order)
  const ends = new Map() // turn -> turn/end reason kind
  const asksByTurn = new Map() // turn -> Map<eventId, awaiting>
  const askTurn = new Map() // eventId -> turn owning the undecided ask
  let openTurn = null
  const recordAsk = (turn, eventId, awaiting) => {
    let per = asksByTurn.get(turn)
    if (!per) { per = new Map(); asksByTurn.set(turn, per) }
    per.set(eventId, awaiting)
    askTurn.set(eventId, turn)
  }
  const dropAsk = (eventId) => {
    const turn = askTurn.get(eventId)
    if (turn === undefined) return
    askTurn.delete(eventId)
    asksByTurn.get(turn)?.delete(eventId)
  }
  for (const ev of events) {
    if (ev.type === 'turn/start') {
      openTurn = ev.turn
    } else if (ev.type === 'turn/end') {
      ends.set(ev.turn, ev.reason)
      if (openTurn === ev.turn) openTurn = null
      for (const eventId of asksByTurn.get(ev.turn)?.keys() ?? []) askTurn.delete(eventId)
      asksByTurn.delete(ev.turn) // turn closed → its undecided asks are void (covered by the end key)
    } else if (ev.type === 'agent/inbox/spliced') {
      const removed = lists[ev.target].splice(ev.start, ev.removedCount ?? 0, ...(ev.inserted ?? []))
      if (openTurn !== null && ev.outcome === undefined && removed.length) {
        let claimed = claimedIn.get(openTurn)
        if (!claimed) { claimed = []; claimedIn.set(openTurn, claimed) }
        claimed.push(...removed)
      }
    } else if (ev.type === 'approval/asked') {
      if (openTurn !== null) recordAsk(openTurn, ev.id, 'approval')
    } else if (ev.type === 'approval/decided') {
      dropAsk(ev.id)
    } else if (ev.type === 'tool/call' && ev.name === QUESTION_TOOL) {
      if (openTurn !== null) recordAsk(openTurn, ev.callId, 'question')
    } else if (ev.type === 'tool/result') {
      dropAsk(ev.callId)
    }
  }
  const assignments = new Map()
  for (const [turn, claimed] of claimedIn) {
    // ponytail: 一个 turn 只认领一条 next-turn，多条 assign 同 turn 不会发生
    // (busy 拒绝 + claim 语义)；真发生时取第一条。
    const assign = claimed.find((m) => String(m.id ?? '').startsWith(ASSIGN_PREFIX))
    if (!assign) continue
    const assignmentId = String(assign.id).slice(ASSIGN_PREFIX.length)
    const asks = [...(asksByTurn.get(turn) ?? new Map()).entries()].map(([eventId, awaiting]) => ({ eventId, awaiting }))
    // Later turns overwrite earlier ones for the same assignment: a re-inserted
    // (rewoken) assign consumed again reports its newest turn's state.
    assignments.set(assignmentId, { turn, ended: ends.get(turn), asks })
  }
  const pendingAssigns = [...lists['next-turn'], ...lists['next-step']]
    .filter((m) => String(m.id ?? '').startsWith(ASSIGN_PREFIX))
    .map((m) => ({ id: String(m.id), assignmentId: String(m.id).slice(ASSIGN_PREFIX.length) }))
  return { assignments, pendingAssigns }
}
