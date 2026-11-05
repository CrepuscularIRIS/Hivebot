// Verifier-only observation; no product file is changed.
import Inspect from '/tmp/bot-wt/P6-12/app/sdk/tests/support/orchestration-create-inspect.mjs'
import { Reporter } from '/tmp/bot-wt/P6-12/app/sdk/src/orchestration/report.mjs'
const original = Reporter.prototype.withdrawPendingReports
Reporter.prototype.withdrawPendingReports = function (...args) {
  try {
    const value = original.apply(this, args)
    console.warn('[p612-vfy] withdraw succeeded')
    return value
  } catch (error) {
    console.warn('[p612-vfy] withdraw failed: ' + error.message)
    throw error
  }
}
const control = Inspect.prototype.control
Inspect.prototype.control = async function (request) {
  if (request.op === 'arm-reject' && request.matchId === '*') {
    this.ctx.on('agent/pre-step', (payload, next) => {
      if (String(payload.agent.id) === request.sessionId) return { kind: 'reject' }
      return next()
    }, true)
    return { armed: true }
  }
  return control.call(this, request)
}
export default Inspect
