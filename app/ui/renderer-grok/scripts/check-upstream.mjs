// Upstream diff=0 check: every file in SOURCES.tsv, minus its provenance header line,
// must hash to the recorded upstream sha256 (grok-bot-0.18-reconstructed@a9f633e).
// Overlay files (ours, not upstream) must NOT be listed in SOURCES.tsv.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rows = readFileSync(join(root, 'SOURCES.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
const bad = []
for (const row of rows) {
  const [rel, sha, headerLines] = row.split('\t')
  let buf = readFileSync(join(root, rel))
  for (let i = 0; i < Number(headerLines); i++) {
    const nl = buf.indexOf(10)
    if (!buf.subarray(0, nl).toString('utf8').includes('来源: grok-bot-0.18-reconstructed@a9f633e:' + rel)) bad.push(`${rel}: header missing`)
    buf = buf.subarray(nl + 1)
  }
  if (createHash('sha256').update(buf).digest('hex') !== sha) bad.push(`${rel}: content differs from upstream`)
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`upstream diff=0: ${rows.length} files`)
