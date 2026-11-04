// P6-21 orchestration foundation barrel (PLAN §2 通用约定: index.* 由 P6-21
// 建，后续任务只在此追加自己的注册行并串行合并). Library only — the
// orchestration.yml patch and its plugin wiring arrive with P6-10.
export {
  OWN_SOURCE_KINDS,
  deliveryIdOf,
  projectEvent,
  Delivery,
} from './delivery.mjs'
export {
  ASSIGN_PREFIX,
  ASSIGN_SOURCE_KIND,
  QUESTION_TOOL,
  newAssignmentId,
  assignMessageId,
  buildAssignMessage,
  foldAssignments,
} from './assignment.mjs'
export {
  REPORT_SOURCE_KIND,
  REPORT_PREFIX,
  endOutcomeFor,
  foldMainLog,
  reportMessageId,
  buildReportMessage,
  computeDue,
} from './pending.mjs'
export {
  TAINT_KIND,
  classifyTurn,
  TurnOrigin,
} from './turn-origin.mjs'
// P6-10 注册行（PLAN §2 v4 接线归属：每任务只追加自己的导出，不重构）。
export { Slots, sharedSlots, DEFAULT_CAPACITY } from './slots.mjs'
export { orchDataDir, readMainBotId, BOTS_JSON } from './identity.mjs'
export {
  CreateChannel,
  DEFAULT_CREATE_TIMEOUT_MS,
  ORCH_REQUESTS_ENDPOINT,
  ORCH_RESPOND_METHOD,
  orchError,
} from './main-channel.mjs'
export { CREATE_BOT_TOOL, CREATE_BOT_DESCRIPTION, relayText } from './create.mjs'
// P6-11 注册行（PLAN §2 v4 接线归属：只追加本任务导出，不重构）。
export { SEND_TO_BOT_TOOL, SEND_TO_BOT_DESCRIPTION, sendRelayText, registerSendToBot } from './send.mjs'
// P6-12 注册行（PLAN §2 v4 接线归属：只追加本任务导出，不重构）。
export { BATCH_WINDOW_MS, RESULT_LIMIT, Reporter, resultTextFor, truncateResult } from './report.mjs'
export { registerTaintGuard } from './taint-guard.mjs'
// P6-13 注册行（PLAN §2 v4 接线归属：只追加本任务导出，不重构）。
export { STOP_BOT_TOOL, STOP_BOT_DESCRIPTION, registerStopBot } from './stop.mjs'
// P6-14 / P6-14.f1 注册行（PLAN §2 v4 接线归属：只追加本任务导出，不重构）。
export {
  COORDINATOR_TOOLS,
  DELEGATION_TOOLS,
  JOB_TOOLS,
  RESTRICT_TOOLS,
  ENTRY_ANNOTATIONS,
  judgeWorkerCall,
  enumerateInstalledEntries,
  registerEnvelope,
  workerRestrictDeny,
  applyWorkerRestriction,
  registerWorkerRestriction,
} from './envelope.mjs'
