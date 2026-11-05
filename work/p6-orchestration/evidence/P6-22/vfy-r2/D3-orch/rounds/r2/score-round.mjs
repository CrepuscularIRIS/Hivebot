// P6-22: reuse frozen P6-20 scoreGroup verbatim; never print held-out prose.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const base = resolve(here, '../..')
const scorer = join(base, 'score.mjs')
const source = readFileSync(scorer, 'utf8')
// Remove only CLI execution, retaining the exact exported scoring functions.
const moduleSource = source.slice(0, source.indexOf('const selfOnly =')).replaceAll('import.meta.url', JSON.stringify(pathToFileURL(scorer).href))
const { scoreGroup } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)
const phase = process.argv[2]
assert(['dev', 'heldout'].includes(phase))
const cases = JSON.parse(readFileSync(join(base, phase === 'dev' ? 'dev-prompts.json' : 'prompts.json'), 'utf8')).cases
const planned = cases.flatMap((c) => Array.from({ length: phase === 'dev' || ['direct', 'chat'].includes(c.kind) ? 1 : 3 }, (_, i) => ({ entry: c, rep: i + 1 })))
assert.equal(planned.length, phase === 'dev' ? 10 : 36)
const rows = planned.map(({ entry, rep }) => {
  const id = `${entry.id}-${rep}`
  const path = join(here, phase, 'raw', `${id}.jsonl`)
  if (!existsSync(path)) return { id, kind: entry.kind, missing: true }
  const content = readFileSync(path, 'utf8')
  const [meta, ...frames] = content.trim().split('\n').map(JSON.parse)
  const result = scoreGroup(entry, meta, frames.filter((f) => f.type !== 'snapshot-header'))
  return { id, ...result, timeouts: meta.timeouts, sha256: createHash('sha256').update(content).digest('hex') }
})
writeFileSync(join(here, phase, 'scores.json'), JSON.stringify(rows, null, 2) + '\n')
const lines = [`phase=${phase} model=glm-5.3 planned=${planned.length} collected=${rows.filter((r) => !r.missing).length}`]
for (const kind of ['single', 'parallel', 'attach', 'stop', 'direct', 'chat']) {
  const rs = rows.filter((r) => r.kind === kind)
  lines.push(`${kind}: correct=${rs.filter((r) => r.routeOk).length}/${rs.length} complete-route-fail=${rs.filter((r) => r.complete && !r.routeOk).length} timeout=${rs.filter((r) => r.outcome === 'timeout').length} other-incomplete=${rs.filter((r) => !r.missing && !r.complete && r.outcome !== 'timeout').length} missing=${rs.filter((r) => r.missing).length}`)
}
const delegated = rows.filter((r) => !['direct', 'chat'].includes(r.kind))
const sentinels = rows.filter((r) => ['direct', 'chat'].includes(r.kind))
const reports = rows.flatMap((r) => r.reports ?? [])
const toolSuccess = reports.reduce((n, r) => n + r.toolSuccess, 0)
const badReports = reports.filter((r) => r.tailTexts !== 1).length
const correct = delegated.filter((r) => r.routeOk).length
const misdispatch = sentinels.filter((r) => r.misdispatch).length
const complete = rows.every((r) => !r.missing && r.complete)
lines.push(`subset=${correct}/${delegated.length}; sentinel-misdispatch=${misdispatch}/${sentinels.length}; sentinel-correct=${sentinels.filter((r) => r.routeOk).length}/${sentinels.length}`)
lines.push(`hard: polluted-tool-success=${toolSuccess}; reports=${reports.length}; report-tailTexts-not-one=${badReports}`)
lines.push(`converged=${complete && correct >= 22 && misdispatch === 0 && toolSuccess === 0 && badReports === 0} (requires complete collection; timeout is not a demonstrated routing failure)`)
lines.push('Per-group score table (no raw prose):')
for (const r of rows) lines.push(`${r.id}\t${r.missing ? 'MISSING' : `${r.routeOk ? 'OK' : r.complete ? 'ROUTE-FAIL' : 'INCOMPLETE'}\toutcome=${r.outcome}\tcreate=${r.scoredTurn.create ?? '-'} send=${r.scoredTurn.send ?? '-'} stop=${r.scoredTurn.stop ?? '-'}\ttimeouts=${r.timeouts?.join(',') || '-'}`}`)
writeFileSync(join(here, phase, 'SCORE.txt'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
