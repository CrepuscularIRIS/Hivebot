/**
 * B31: SuperAgent main-bot routing semantics (pure functions).
 *
 * Semantics borrowed from dsh-superagent-prototype's DshExecutor (executor/dsh.ts):
 * per-ticket persistent worker sessions named `worker-<ticketId>`, results relayed
 * back to the main session. We keep only that naming + relay shape here; the Engine
 * transaction machinery is intentionally not ported (shortcut: full work-item
 * lifecycle with evals/replies arrives with B32 if routing proves useful).
 */

export const SUPERAGENT_ROUTER_VERSION = 'b31-v1'

export type MainBotRoute =
  | { kind: 'direct'; text: string }
  | { kind: 'delegate'; workerSessionId: string; targetBotId: string; text: string }

export interface MainBotRouteInput {
  /** Feature flag; off by default so legacy behavior is untouched. */
  enabled: boolean
  mainBotId: string
  targetId: string
  text: string
}

// Delegation grammar: @Bot Name (may contain spaces) then whitespace then a verb
// anchor (CJK or English). No lookbehind tricks: plain three-group capture.
const MENTION = /^@(.+?)\s+(去|请|帮我|开始|执行|run|do|go|start|collect)(.*)$/is

export function routeMainBotPrompt(input: MainBotRouteInput): MainBotRoute {
  const { enabled, mainBotId, targetId, text } = input
  if (!enabled || targetId !== mainBotId) return { kind: 'direct', text }
  const m = MENTION.exec(text.trim())
  if (!m) return { kind: 'direct', text }
  const [, targetBotId, verb, tail] = m
  // task text keeps the verb anchor so the worker prompt stays natural
  const rest = `${verb}${tail}`.trim()
  // worker session id mirrors superagent's worker-<ticketId> convention
  const workerSessionId = `worker-${targetBotId.toLowerCase().replace(/\s+/g, '-')}`
  return { kind: 'delegate', workerSessionId, targetBotId, text: rest }
}
