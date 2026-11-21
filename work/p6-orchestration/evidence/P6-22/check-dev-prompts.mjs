// No model calls. Exact/normalized wording and task identifiers/assets audit.
// Semantic task disjointness still requires reviewing both case lists.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (name) => JSON.parse(readFileSync(new URL(`../D3-orch/${name}`, import.meta.url), 'utf8')).cases
const dev = read('dev-prompts.json')
const held = read('prompts.json')
const wording = (cases) => cases.flatMap((c) => c.turns ?? [c.prompt])
const normalize = (s) => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '')
const heldText = new Set(wording(held).map(normalize))
const duplicates = wording(dev).filter((s) => heldText.has(normalize(s)))
const assets = (cases) => new Set(wording(cases).flatMap((s) => s.match(/\b[\w-]+\.(?:txt|md|py|json|csv|svg|html|mjs)\b/g) ?? []))
const heldAssets = assets(held)
const overlappingAssets = [...assets(dev)].filter((s) => heldAssets.has(s))
const counts = Object.fromEntries(['single', 'parallel', 'attach', 'stop', 'direct', 'chat'].map((kind) => [kind, dev.filter((c) => c.kind === kind).length]))
assert.deepEqual(counts, { single: 4, parallel: 2, attach: 1, stop: 1, direct: 1, chat: 1 })
assert.equal(new Set(dev.map((c) => c.id)).size, 10)
assert.equal(new Set(dev.map((c) => c.task)).size, 10)
assert.equal(dev.filter((c) => held.some((h) => h.id === c.id)).length, 0)
assert.deepEqual(duplicates, [])
assert.deepEqual(overlappingAssets, [])
console.log(JSON.stringify({ devCases: dev.length, heldCases: held.length, counts, normalizedWordingDuplicates: duplicates.length, overlappingTaskAssets: overlappingAssets.length, uniqueDevTaskLabels: 10 }))
console.log('Semantic audit: dev = CSV conversion / SVG drawing / JSON validation / Markdown link extraction / CSS card + length units / poem + regex / allergy recipe revision / timed sampling cancellation / HTTP status / tea break; held-out tasks are distinct. This statement is manual review, not an automated semantic proof.')
