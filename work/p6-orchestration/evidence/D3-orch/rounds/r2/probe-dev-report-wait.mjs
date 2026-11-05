// Dev-only probe: preserve collection/scoring, expose the existing wait predicate's false timeout.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const [meta, ...frames] = readFileSync(join(here, 'archive-r2a/dev/dev-attach-recipe-allergy-1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
// Historical r2a scan before 5092c75, without the 240s wait; fixed function tested in test-report-wait.mjs.
let lastReportIdx = -1
for (let i = 0; i < frames.length; i++) {
  const f = frames[i]
  if (f?.type !== 'event' || f.event?.type !== 'user/message') continue
  const kind = f.event.data?.source?.kind ?? ''
  if (kind === 'pbots-worker') { lastReportIdx = i; continue }
  if (kind === 'user' && lastReportIdx >= 0) { lastReportIdx = -1; break }
}
const reportIndices = frames.flatMap((f, i) => f.event?.type === 'user/message' && f.event.data?.source?.kind === 'pbots-worker' ? [i] : [])
const finalReportIdx = reportIndices.at(-1)
const finalReportEnded = frames.slice(finalReportIdx + 1).some((f) => f.event?.type === 'turn/end')
assert.equal(reportIndices.length, 2)
assert.equal(lastReportIdx, -1)
assert(finalReportEnded)
assert.deepEqual(meta.timeouts, ['report'])
console.log(`dev attach: reports=${reportIndices.length}; raw lines=${reportIndices.map((i) => i + 2).join(',')}; final-report-turn/end=${finalReportEnded}; existing-wait-lastReportIdx=${lastReportIdx}; meta-timeouts=${meta.timeouts.join(',')}`)
console.log('Historical r2a confirmed: old scan breaks at follow-up user/message, never reaching the second report. Archived outcome remains timeout/incomplete; current fixed collector is checked by test-report-wait.mjs.')
