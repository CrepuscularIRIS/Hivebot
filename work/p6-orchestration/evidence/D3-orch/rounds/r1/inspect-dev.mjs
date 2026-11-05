// Intentionally dev-only: never open held-out raw here.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../../..')
const { ROUTING_PROMPT } = await import(pathToFileURL(join(repo, 'app/sdk/src/orchestration/routing-prompt.mjs')).href)
const raw = join(here, 'dev/raw')
const lines = [`routing text sha256=${createHash('sha256').update(ROUTING_PROMPT).digest('hex')}`]
for (const file of readdirSync(raw).filter((f) => /^dev-.*-1\.jsonl$/.test(f)).sort()) {
  const [meta, ...frames] = readFileSync(join(raw, file), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(meta.model, 'glm-5.3')
  const system = frames.filter((f) => f.event?.type === 'system/message').map((f) => (f.event.data.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'))
  assert(system.some((t) => t.includes(ROUTING_PROMPT)), `${file}: routing prompt absent`)
  lines.push(`\n${file}: outcome=${meta.outcome} timeouts=${meta.timeouts.join(',')} workers=${meta.workers.length} routing-exact=true`)
  for (const [i, f] of frames.entries()) {
    const e = f.event
    if (e?.type === 'assistant/message') {
      const blocks = e.data.message.content
      lines.push(`line ${i + 2} turn=${e.data.turn} step=${e.data.step}: ` + blocks.map((b) => b.type === 'tool-call' ? `tool=${b.name}` : `${b.type}=${(b.text ?? '').slice(0, 1600)}`).join(' | '))
    }
    if (e?.type === 'llm/retry') lines.push(`WARNING retry event line=${i + 2}`)
  }
}
writeFileSync(join(here, 'dev/observations.txt'), lines.join('\n').replace(/[ \t]+$/gm, '') + '\n')
console.log(lines.join('\n'))
