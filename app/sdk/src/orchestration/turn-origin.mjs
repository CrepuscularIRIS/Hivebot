// P6-21 turn-origin foundation (PLAN 决策 29 + §11 R2-1). A turn's origin is
// the set of sources it has claimed (`agent/inbox/claimed`, P6-09 (c)).
// 拦截口径按 R2-1（2026-11-04 G2-r2 两席裁定）：只认 `pbots-worker`（主 bot 侧
// 的回报来源）为污染；宿主内部来源（user-approval / user-question-reply /
// working-directory / agent-message / subagent-settled / schedule）与未知 kind
// 不拦截，只进审计（auditKinds）——审批档位切换、提问迟到答复、schedule 触发
// 不得被误拒。P6-12 的 taint-guard 在 pre-execute 层消费 classify 结果。
// T-taint（2026-11-05，G1-r2 A 席 R2-1 发现 / Q-021 定稿）：goal / schedule
// 来源回合对协调者工具（COORDINATOR_TOOLS：create/send/stop）也算污染
// （coordinatorTainted）——自主回合不是用户直接对话，不提供委派入口
// （发布任务直接执行、缺信息再问）。全工具污染（tainted，taint-guard 消费）
// 仍只认 pbots-worker（R2-1 口径零变化）。
/** Turn-origin classification: user turn vs tainted turn (决策 29 / R2-1). */

/** The one source kind that taints a turn (reports delivered to the main bot). */
export const TAINT_KIND = 'pbots-worker'

/** Kinds that pollute a turn FOR COORDINATOR TOOLS (T-taint): worker reports
 *  plus autonomous round-driver sources (goal / schedule). */
export const COORDINATOR_TAINT_KINDS = ['pbots-worker', 'goal', 'schedule']

/**
 * Classify a turn by the source kinds it has claimed so far.
 * @param {string[]} kinds claimed source kinds (order preserved per claim).
 * @returns {{ tainted: boolean, coordinatorTainted: boolean, coordinatorTaintKinds: string[], auditKinds: string[] }}
 * tainted = 全工具污染（只认 pbots-worker，taint-guard 消费）；
 * coordinatorTainted = 协调者工具污染（T-taint：pbots-worker ∪ goal/schedule，
 * create/send/stop 的 when/execute 消费）。auditKinds = the deduplicated claim
 * set, for logging only — never a deny input (R2-1).
 */
export function classifyTurn(kinds) {
  const list = [...kinds]
  const auditKinds = [...new Set(list)]
  const coordinatorTaintKinds = COORDINATOR_TAINT_KINDS.filter((kind) => auditKinds.includes(kind))
  return {
    tainted: list.includes(TAINT_KIND),
    coordinatorTainted: coordinatorTaintKinds.length > 0,
    coordinatorTaintKinds,
    auditKinds,
  }
}

/**
 * Per-agent claim ledger for the running process: record every
 * `agent/inbox/claimed` payload (probe (c) pattern — execute reads it
 * synchronously), classify any turn on demand. Turns never lose their claim
 * set mid-flight (污染在回合内单调).
 */
export class TurnOrigin {
  #claims = new Map() // agentId -> Map<turn, kinds[]>
  #lastTurn = new Map() // agentId -> newest turn with a claim

  /**
   * Record one claimed message's source kind.
   * @param {string} agentId @param {number} turn @param {string} sourceKind
   */
  record(agentId, turn, sourceKind) {
    let per = this.#claims.get(agentId)
    if (!per) { per = new Map(); this.#claims.set(agentId, per) }
    let kinds = per.get(turn)
    if (!kinds) { kinds = []; per.set(turn, kinds) }
    kinds.push(sourceKind)
    this.#lastTurn.set(agentId, turn)
  }

  /** Newest turn number with a claim for the agent, or undefined. @param {string} agentId */
  lastTurn(agentId) {
    return this.#lastTurn.get(agentId)
  }

  /** Claimed source kinds of one turn (copy). @param {string} agentId @param {number} turn */
  claims(agentId, turn) {
    return [...(this.#claims.get(agentId)?.get(turn) ?? [])]
  }

  /**
   * Classify a turn; defaults to the agent's latest claimed turn. An agent or
   * turn with no recorded claims classifies as a user turn (nothing claimed
   * from us → nothing to deny).
   * @param {string} agentId @param {number} [turn]
   */
  classify(agentId, turn = this.lastTurn(agentId)) {
    if (turn === undefined || turn === null) return { tainted: false, auditKinds: [] }
    return classifyTurn(this.claims(agentId, turn))
  }
}
