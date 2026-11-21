// Blind integrity check: output booleans/counts only, never held-out model prose.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../../..')
const { ROUTING_PROMPT } = await import(pathToFileURL(join(repo, 'app/sdk/src/orchestration/routing-prompt.mjs')).href)
console.log(`routing-sha256=${createHash('sha256').update(ROUTING_PROMPT).digest('hex')}`)
const keys = ['P2SDK_LLM_API_KEY', 'LITELLM_MASTER_KEY'].map((k) => process.env[k]).filter((v) => v && v.length >= 8)
let credentialMatches = 0
for (const phase of ['dev', 'heldout']) {
  const raw = join(here, phase, 'raw')
  let mains = 0, workers = 0, retries = 0, rateLimits = 0, timeouts = 0, groupRetries = 0
  for (const file of readdirSync(raw).filter((f) => f.endsWith('.jsonl'))) {
    const text = readFileSync(join(raw, file), 'utf8')
    credentialMatches += keys.filter((key) => text.includes(key)).length
    const [meta, ...frames] = text.trim().split('\n').map(JSON.parse)
    const events = frames.filter((f) => f.type === 'event').map((f) => f.event)
    retries += events.filter((e) => e.type === 'llm/retry').length
    rateLimits += events.filter((e) => e.type === 'turn/end' && e.data?.reason?.kind === 'error' && /429|rate.?limit|too many requests/i.test(JSON.stringify(e.data))).length
    if (meta.type === 'd3o-worker-meta') { workers++; continue }
    assert.equal(meta.type, 'd3o-meta')
    assert.equal(meta.model, 'glm-5.3')
    assert.equal(meta.provider, 'litellm')
    assert(['create_bot', 'send_to_bot', 'stop_bot'].every((t) => meta.toolNames.includes(t)))
    assert([`/tmp/bot-p622r2-${phase}/work/`, `/tmp/bot-p622r2b-${phase}/work/`, `/tmp/bot-p622r2c-${phase}/work/`].some((root) => meta.cwd.startsWith(root)))
    const systems = events.filter((e) => e.type === 'system/message').map((e) => (e.data.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'))
    assert(systems.some((s) => s.includes(ROUTING_PROMPT)), `${phase}: routing absent`)
    timeouts += meta.timeouts.length > 0 ? 1 : 0
    groupRetries += meta.retryCount ?? 0
    mains++
  }
  console.log(`${phase}: mainRaw=${mains}/${phase === 'dev' ? 10 : 36} workerRaw=${workers}; model/provider/tools/routing-input PASS; timeout=${timeouts}; llm/retry=${retries}; terminal429=${rateLimits}; groupRetries=${groupRetries}`)
  assert.equal(retries, 0)
}
console.log(`credential-value matches=${credentialMatches}`)
assert.equal(credentialMatches, 0)
