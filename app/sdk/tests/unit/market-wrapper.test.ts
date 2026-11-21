// U-25: driver for tests/unit/market-wrapper.proc.mjs — same pattern as
// tests/unit/p2temp.test.ts (see its header for the raw-subprocess coverage
// coordinate rule). One spawn, per-case it()s from the runner's JSON result.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'market-wrapper.proc.mjs')

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
      name: 'market wrapper runner completes and reports',
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
