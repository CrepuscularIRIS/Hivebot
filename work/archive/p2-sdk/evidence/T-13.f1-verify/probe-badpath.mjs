// T-13.f1 verifier probe: independent oracle for /proc field 22 + bad-path rows.
// Run from app/sdk of the T-13.f1 worktree (HEAD 04c58d5).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { acquireHomeLockDetailed, processStarttime } from '../src/start.ts'

const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// --- 1. Independent oracle: impl starttime vs ps(1) wall-clock reconstruction ---
{
  const pid = process.pid
  const st = processStarttime(pid)
  const btime = Number(/^btime (\d+)$/m.exec(execFileSync('cat', ['/proc/stat'], { encoding: 'utf8' }))[1])
  const clkTck = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim())
  const fromProc = new Date((btime + st / clkTck) * 1000)
  const fromPs = new Date(execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim())
  const driftMs = Math.abs(fromProc - fromPs)
  check('field-22 parsing matches ps(1) lstart (independent oracle)', st !== null && driftMs < 1500,
    `impl=${st} ticks; /proc-derived=${fromProc.toISOString()} ps=${fromPs.toISOString()} drift=${driftMs}ms`)
}

const homes = []
const newHome = () => { const h = mkdtempSync(join(tmpdir(), 'p2sdk-f1probe-')); homes.push(h); return h }

// --- 2. Bad path A: old-format LIVE lock (upgrade transition) must refuse WITH the deletion hint ---
{
  const home = newHome()
  const lock = join(home, 'launcher.lock')
  writeFileSync(lock, `${process.pid}\n`) // pre-T-13.f1 format, pid genuinely alive (this probe)
  const r = acquireHomeLockDetailed(home)
  check('old-format live lock refused (conservative)', typeof r === 'string', String(r).slice(0, 90))
  check('refusal carries the manual-removal hint', typeof r === 'string' && r.includes('如确认无实例运行') && r.includes(lock))
}

// --- 3. Bad path B: malformed new-format rows must refuse (fail-closed), never reclaim ---
for (const [label, content] of [
  ['non-numeric starttime', `123:abc\n`],
  ['negative pid', `-3:5\n`],
  ['zero pid', `0:5\n`],
  ['trailing colon', `123:\n`],
]) {
  const home = newHome()
  writeFileSync(join(home, 'launcher.lock'), content)
  const r = acquireHomeLockDetailed(home)
  check(`malformed row (${label}) refused, not reclaimed`, typeof r === 'string', String(r).slice(0, 80))
}

// --- 4. R1 end-to-end against the REAL entry (not the unit-test harness): stale dual-row lock,
// runtime row = this live probe pid with a foreign starttime -> must be reclaimed, not bricked ---
{
  const home = newHome()
  writeFileSync(join(home, 'launcher.lock'), `2147483647:1\n${process.pid}:${processStarttime(process.pid) + 1}\n`)
  const r = acquireHomeLockDetailed(home)
  check('R1 live-but-reused runtime pid reclaimable via real acquire', typeof r !== 'string')
  if (typeof r !== 'string') r.release()
}

for (const h of homes) rmSync(h, { recursive: true, force: true })
console.log(results.join('\n'))
process.exit(results.some((l) => l.startsWith('FAIL')) ? 1 : 0)
