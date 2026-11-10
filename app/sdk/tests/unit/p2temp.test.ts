// T-11②: driver for tests/unit/p2temp.proc.mjs — the p2temp unit assertions
// run in one plain node subprocess so the module is measured in raw
// (subprocess) coverage coordinates, same as inside dsh; see the runner's
// header for why. One spawn, per-case it()s from the runner's JSON result.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'p2temp.proc.mjs')

interface CaseResult {
  name: string
  ok: boolean
  error?: string
}

function runOnce(): CaseResult[] {
  const res = spawnSync(process.execPath, [RUNNER], { encoding: 'utf8', timeout: 60_000 })
  const lastLine = res.stdout.trim().split('\n').pop() ?? ''
  try {
    const parsed = JSON.parse(lastLine) as CaseResult[]
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    /* fall through to the hard failure below */
  }
  return [
    {
      name: 'p2temp runner completes and reports',
      ok: false,
      error: `runner exited ${res.status}:\n${res.stdout}\n${res.stderr}`,
    },
  ]
}

const results = runOnce()

for (const r of results) {
  it(`${r.name} (subprocess runner)`, () => {
    expect(r.ok, r.error ?? 'case reported failure').toBe(true)
  })
}
