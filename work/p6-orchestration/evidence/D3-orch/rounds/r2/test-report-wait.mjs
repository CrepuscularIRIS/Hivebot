// Regression: exercise the actual collector function, not a copied predicate.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../../run.mjs'), 'utf8')
const fn = source.slice(source.indexOf('async function waitReportConsumed('), source.indexOf('/** prompt 一次'))
const archived = join(here, 'archive-r2a/dev/dev-attach-recipe-allergy-1.jsonl')
const [, ...frames] = readFileSync(existsSync(archived) ? archived : join(here, 'dev/raw/dev-attach-recipe-allergy-1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
const reports = frames.flatMap((f, i) => f.event?.type === 'user/message' && f.event.data?.source?.kind === 'pbots-worker' ? [i] : [])
assert.equal(reports.length, 2)
const user2 = frames.findIndex((f, i) => i > reports[0] && f.event?.type === 'user/message' && f.event.data?.source?.kind === 'user')
assert(user2 > reports[0] && user2 < reports[1])
async function replay(input, append) {
  let now = 0
  const wait = runInNewContext(`${fn}; waitReportConsumed`, {
    T_REPORT: 12000, runtimeExited: false, rateLimited: false,
    Date: { now: () => now },
    sleep: async (ms) => { now += ms; if (append && now === 800) input.push(...append) },
  })
  return { ...(await wait(input, 12000)), elapsed: now }
}
assert.equal((await replay(frames.slice(0, user2))).ok, true, 'first batch still closes')
assert.equal((await replay(frames.slice(0, reports[1]))).ok, false, 'old batch must not satisfy follow-up')
assert.equal((await replay(frames.slice(0, reports[1] + 1))).ok, false, 'second batch needs turn/end')
assert.equal((await replay([...frames])).ok, true, 'completed second batch must close (dev raw replay)')
const delayed = await replay(frames.slice(0, reports[1]), frames.slice(reports[1]))
assert.equal(delayed.ok, true, 'second batch arriving during wait must close')
assert(delayed.elapsed >= 4800, 'wait for second batch plus quiet window')
console.log('PASS: 5 report-wait checks; real dev replay sees second batch; no held-out raw read')
