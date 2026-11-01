import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireHomeLock } from '../../src/start.ts'
import { launcherSpawnEnv } from '../support/runtime.ts'

/** A pid that exists for no process (kill → ESRCH), as used in review R1's reproduction. */
const DEAD_PID = 2_147_483_647

const homes: string[] = []
afterEach(() => {
  while (homes.length) rmSync(homes.pop()!, { recursive: true, force: true })
})

const newHome = (): string => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-lock-'))
  homes.push(home)
  return home
}
const lockPathOf = (home: string) => join(home, 'launcher.lock')
const inodeOf = (path: string) => {
  const st = statSync(path)
  return `${st.dev}:${st.ino}`
}
/** Temp publish files (.launcher-lock.*) a crashed racer might leave behind. */
const tempLeftovers = (home: string) => readdirSync(home).filter((n) => n.startsWith('.launcher-lock.'))

describe('acquireHomeLock — review R1 interleave 1: uninitialized lock window', () => {
  it('refuses on an empty lock file instead of reclaiming it as stale', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), '')
    const r = acquireHomeLock(home)
    expect(r).toBeTypeOf('string')
    expect(r).toContain('uninitialized')
    // The file must survive byte-identical: it may belong to a mid-start publisher.
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe('')
    expect(tempLeftovers(home)).toEqual([])
  })

  it('refuses on a malformed (non-pid) lock file', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), 'not-a-pid')
    expect(acquireHomeLock(home)).toBeTypeOf('string')
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe('not-a-pid')
  })

  it('ignores leftover temp files from a crashed publisher and acquires cleanly', () => {
    const home = newHome()
    writeFileSync(join(home, '.launcher-lock.999.deadbeef'), `${DEAD_PID}\n`)
    const r = acquireHomeLock(home)
    expect(r).toBeTypeOf('function')
    ;(r as () => void)()
    expect(existsSync(lockPathOf(home))).toBe(false)
    // The crashed publisher's temp is not ours to clean; it must not become the lock.
    expect(readFileSync(join(home, '.launcher-lock.999.deadbeef'), 'utf8')).toBe(`${DEAD_PID}\n`)
  })
})

describe('acquireHomeLock — review R1 interleave 2: stale-reclaim race', () => {
  it('a stale-reclaimer resuming after another racer reclaimed must refuse, not delete the live lock', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${DEAD_PID}\n`)
    // A read the stale lock and pauses here (review reproduction point)…
    // …B completes the full reclaim and becomes the live holder.
    const b = acquireHomeLock(home)
    expect(b).toBeTypeOf('function')
    const liveInode = inodeOf(lockPathOf(home))
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}\n`)
    // A resumes: its next step is the dev+ino re-check before unlink.
    const a = acquireHomeLock(home)
    expect(a).toBeTypeOf('string')
    expect(a).toContain('already in use')
    // B's lock is intact — same inode, same pid.
    expect(inodeOf(lockPathOf(home))).toBe(liveInode)
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}\n`)
    expect(tempLeftovers(home)).toEqual([])
    ;(b as () => void)()
    expect(existsSync(lockPathOf(home))).toBe(false)
  })
})

describe('release — review R1 interleave 3: ownership check', () => {
  it('a stolen holder releases without deleting the next holder’s lock (same-pid steal proves inode check)', () => {
    const home = newHome()
    const a = acquireHomeLock(home) as () => void
    expect(inodeOf(lockPathOf(home))).toBeTruthy()
    // Steal A's lock out from under it; the replacement carries the SAME pid
    // (both acquires ran in this process), so only an inode check can tell them apart.
    unlinkSync(lockPathOf(home))
    const b = acquireHomeLock(home) as () => void
    const bInode = inodeOf(lockPathOf(home))
    a()
    expect(existsSync(lockPathOf(home))).toBe(true)
    expect(inodeOf(lockPathOf(home))).toBe(bInode)
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}\n`)
    b()
    expect(existsSync(lockPathOf(home))).toBe(false)
  })

  it('release is idempotent', () => {
    const home = newHome()
    const r = acquireHomeLock(home) as () => void
    r()
    r()
    expect(existsSync(lockPathOf(home))).toBe(false)
  })
})

describe('acquireHomeLock — T-01.f2 acceptance ① behavior preserved', () => {
  it('second acquire on a live lock is refused and touches nothing', () => {
    const home = newHome()
    const first = acquireHomeLock(home)
    expect(first).toBeTypeOf('function')
    const before = inodeOf(lockPathOf(home))
    const second = acquireHomeLock(home)
    expect(second).toBeTypeOf('string')
    expect(second).toContain(`launcher pid ${process.pid}`)
    expect(inodeOf(lockPathOf(home))).toBe(before)
    expect(tempLeftovers(home)).toEqual([])
    ;(first as () => void)()
  })

  it('a stale dead-pid lock is taken over', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${DEAD_PID}\n`)
    const r = acquireHomeLock(home)
    expect(r).toBeTypeOf('function')
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}\n`)
    ;(r as () => void)()
    expect(existsSync(lockPathOf(home))).toBe(false)
  })

  it('after release the next instance boots on the same home', () => {
    const home = newHome()
    ;(acquireHomeLock(home) as () => void)()
    const again = acquireHomeLock(home)
    expect(again).toBeTypeOf('function')
    ;(again as () => void)()
  })
})

describe('acquireHomeLock — real multiprocess race', () => {
  it('two child processes racing on one home: exactly one acquires, per round (5 rounds)', async () => {
    const startTs = pathToFileURL(fileURLToPath(new URL('../../src/start.ts', import.meta.url))).href
    const childScript = `
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { acquireHomeLock } from ${JSON.stringify(startTs)}
const { LOCK_HOME: home, LOCK_CTL: ctl, LOCK_ID: id } = process.env
const lockPath = join(home, 'launcher.lock')
const journal = (ev) => appendFileSync(join(ctl, 'journal'), JSON.stringify({ id, ev, t: Date.now() }) + '\\n')
writeFileSync(join(ctl, 'ready-' + id), '')
const deadline = Date.now() + 10_000
while (!existsSync(join(ctl, 'go'))) {
  if (Date.now() > deadline) { console.log('BARRIER_TIMEOUT'); process.exit(9) }
}
const r = acquireHomeLock(home)
if (typeof r === 'function') {
  journal('ACQUIRE')
  // A losing stale-reclaimer may transiently rename our lock aside and put it
  // back; tolerate that µs window while proving the lock names OUR pid.
  let recorded = ''
  for (let i = 0; i < 200; i++) {
    try { recorded = readFileSync(lockPath, 'utf8').trim() } catch { recorded = '' }
    if (recorded === String(process.pid)) break
    await new Promise((res) => setTimeout(res, 5))
  }
  if (recorded !== String(process.pid)) { console.log('CORRUPT ' + recorded); process.exit(8) }
  await new Promise((res) => setTimeout(res, 600))
  r()
  journal('RELEASE')
} else {
  journal('REFUSED')
}
`
    for (let round = 0; round < 5; round++) {
      const home = newHome()
      if (round % 2 === 1) writeFileSync(lockPathOf(home), `${DEAD_PID}\n`) // both children race through the stale-reclaim path
      const ctl = mkdtempSync(join(tmpdir(), 'p2sdk-race-'))
      homes.push(ctl)
      const children = ['a', 'b'].map((id) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', childScript], {
          stdio: ['ignore', 'pipe', 'pipe'],
          // T-11: these children import src/start.ts raw; without the strip
          // (launcherSpawnEnv) their V8 dump would merge into the worker's
          // vite-coordinate coverage of the same file and lose ranges.
          env: { ...launcherSpawnEnv(), LOCK_HOME: home, LOCK_CTL: ctl, LOCK_ID: id },
        })
        const out: string[] = []
        const closed = new Promise<number | null>((res) => child.on('close', res))
        child.stdout!.setEncoding('utf8')
        child.stdout!.on('data', (c: string) => out.push(c))
        child.stderr!.setEncoding('utf8')
        child.stderr!.on('data', (c: string) => out.push(c))
        return { child, closed, out: () => out.join('') }
      })
      const deadline = Date.now() + 10_000
      while (!existsSync(join(ctl, 'ready-a')) || !existsSync(join(ctl, 'ready-b'))) {
        if (children.some(({ child }) => child.exitCode !== null)) break // crash: let the close assertions report it
        if (Date.now() > deadline) throw new Error('children never became ready')
        await new Promise((res) => setTimeout(res, 5))
      }
      writeFileSync(join(ctl, 'go'), '')
      const codes = await Promise.all(children.map(({ closed }) => closed))
      const outputs = children.map((c) => c.out())
      const events = readFileSync(join(ctl, 'journal'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { id: string; ev: string; t: number })
      const holds = ['a', 'b']
        .map((id) => {
          const acq = events.find((e) => e.id === id && e.ev === 'ACQUIRE')
          const rel = events.find((e) => e.id === id && e.ev === 'RELEASE')
          return acq && rel ? { id, from: acq.t, to: rel.t } : null
        })
        .filter((h): h is { id: string; from: number; to: number } => h !== null)
      expect(codes, `round ${round}: ${outputs.join(' | ')}\n${JSON.stringify(events)}`).toEqual([0, 0])
      expect(holds.length, `round ${round}: nobody acquired — ${outputs.join(' | ')}`).toBeGreaterThanOrEqual(1)
      // The mutual-exclusion invariant: at most one holder at any instant. A
      // sequentially second acquire after the first fully released is legal.
      for (let i = 0; i < holds.length; i++) {
        for (let j = i + 1; j < holds.length; j++) {
          const overlap = holds[i].from < holds[j].to && holds[j].from < holds[i].to
          expect(overlap, `round ${round}: concurrent holders ${JSON.stringify(holds)}`).toBe(false)
        }
      }
      // A winner releasing inside a robber's µs capture→restore gap legally
      // leaves its (now dead-pid) lock behind; the invariant is that the home
      // is always re-acquirable once every racer exited, via stale reclaim.
      const after = acquireHomeLock(home)
      expect(after, `round ${round}: home not re-acquirable after racers exited`).toBeTypeOf('function')
      ;(after as () => void)()
      expect(existsSync(lockPathOf(home))).toBe(false)
      expect(tempLeftovers(home)).toEqual([])
    }
  }, 60_000)
})
