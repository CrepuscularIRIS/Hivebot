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
