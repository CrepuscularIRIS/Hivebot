import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireHomeLock, acquireHomeLockDetailed, processStarttime, type HomeLockHold } from '../../src/start.ts'
import { launcherSpawnEnv } from '../support/runtime.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

/** A pid that exists for no process (kill → ESRCH), as used in review R1's reproduction. */
const DEAD_PID = 2_147_483_647

/** /proc/<pid>/stat field 22 (starttime) — the test's own oracle for the recorded identity (T-13.f1). */
const starttimeOf = (pid: number): number => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19])
}

const homes: string[] = []
afterEach(() => {
  while (homes.length) rmSync(homes.pop()!, { recursive: true, force: true })
})

// --- T-13 (REVIEW-L R2/R7/R8/R10): lock integrity around launcher death and 3-racer strands ---

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const START_TS = resolve(PKG_ROOT, 'src', 'start.ts')

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const waitPidDead = async (pid: number, ms = 10_000): Promise<void> => {
  const end = Date.now() + ms
  while (pidAlive(pid)) {
    if (Date.now() > end) throw new Error(`pid ${pid} still alive after ${ms}ms`)
    await new Promise((res) => setTimeout(res, 50))
  }
}
const waitClose = (child: ChildProcess, ms: number): Promise<number | null> =>
  new Promise((res, rej) => {
    // 'exit', not 'close': close also waits for stdio drain, and a stream the
    // test destroyed itself (test ② kills the stdout pipe read end) never ends.
    const timer = setTimeout(() => rej(new Error('child did not exit in time')), ms)
    child.on('exit', (code) => {
      clearTimeout(timer)
      res(code)
    })
    if (child.exitCode !== null) {
      clearTimeout(timer)
      res(child.exitCode)
    }
  })

/** Pids this file spawned (launchers and their dsh children) — killed in afterEach if a test leaked them. */
const spawnedPids = new Set<number>()
const track = (...pids: Array<number | undefined>): void => {
  for (const pid of pids) if (pid) spawnedPids.add(pid)
}
afterEach(() => {
  for (const pid of spawnedPids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
  spawnedPids.clear()
})

/** Boot scripts/start.mjs in mock mode until the `p2sdk: dsh pid N` stderr line (no ready wait). */
async function bootForLockTest(home: string): Promise<{ child: ChildProcess; dshPid: number; output: () => string }> {
  const handoff = tmkdir('p2sdk-handoff-')
  homes.push(handoff)
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: {
      ...launcherSpawnEnv(),
      P2SDK_PROVIDER: 'mock',
      P2SDK_HOME: home,
      P2SDK_HANDOFF: handoff,
      P2SDK_PORT: '0',
      P2SDK_READY_TIMEOUT_MS: '120000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  track(child.pid)
  let output = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => {
    output += c
  })
  child.stderr!.on('data', (c: string) => {
    output += c
  })
  const deadline = Date.now() + 30_000
  for (;;) {
    const m = /p2sdk: dsh pid (\d+)/.exec(output)
    if (m) {
      track(Number(m[1]))
      return { child, dshPid: Number(m[1]), output: () => output }
    }
    if (child.exitCode !== null) throw new Error(`launcher exited early (code ${child.exitCode}):\n${output}`)
    if (Date.now() > deadline) throw new Error(`no dsh pid line within 30s:\n${output}`)
    await new Promise((res) => setTimeout(res, 100))
  }
}

describe('T-13 R10 ① — SIGKILLed launcher with a live detached dsh still holds the home', () => {
  it('the lock records launcher+dsh pids; a second instance is refused until the dsh dies, then the home is reclaimable', async () => {
    const home = newHome()
    const rt = await bootForLockTest(home)
    // Dual-pid lock content: the launcher appends the dsh pid right after spawn
    // (T-13.f1: each row carries the pid's /proc starttime identity).
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(
      `${rt.child.pid}:${starttimeOf(rt.child.pid)}\n${rt.dshPid}:${starttimeOf(rt.dshPid)}\n`,
    )
    // SIGKILL the launcher only (uncatchable: no exit handler can run — review R10).
    rt.child.kill('SIGKILL')
    await waitClose(rt.child, 10_000)
    await waitPidDead(rt.child.pid!)
    expect(pidAlive(rt.dshPid), 'the detached dsh outlives the launcher').toBe(true)
    // A second instance must be refused while the orphaned dsh still runs.
    const second = acquireHomeLock(home)
    expect(second).toBeTypeOf('string')
    expect(second).toContain(`runtime pid ${rt.dshPid}`)
    // Once the dsh is truly dead the stale lock (both pids dead) is reclaimed.
    process.kill(rt.dshPid, 'SIGKILL')
    await waitPidDead(rt.dshPid)
    const after = acquireHomeLock(home)
    expect(after).toBeTypeOf('function')
    ;(after as () => void)()
  }, 60_000)
})

describe('T-13 R2 ② — launcher death by uncaught EPIPE leaves the lock behind', () => {
  it('an EPIPE crash (stdout consumer gone) keeps the lock; a second instance is refused while dsh lives', async () => {
    const home = newHome()
    const rt = await bootForLockTest(home)
    // Kill the stdout consumer: the next dsh output chunk makes the launcher's
    // process.stdout.write throw EPIPE -> uncaught exception -> exit handler
    // runs while the detached dsh is still alive (review R2's exact path).
    rt.child.stdout!.destroy()
    try {
      await waitClose(rt.child, 45_000)
    } catch (e) {
      throw new Error(`launcher did not die of EPIPE; output so far:\n${rt.output()}`)
    }
    expect(pidAlive(rt.dshPid), 'the detached dsh outlives the crashed launcher').toBe(true)
    expect(existsSync(lockPathOf(home)), 'the lock survives the launcher exit path (R2)').toBe(true)
    const second = acquireHomeLock(home)
    expect(second).toBeTypeOf('string')
    expect(second).toContain(`runtime pid ${rt.dshPid}`)
    process.kill(rt.dshPid, 'SIGKILL')
    await waitPidDead(rt.dshPid)
    const after = acquireHomeLock(home)
    expect(after).toBeTypeOf('function')
    ;(after as () => void)()
  }, 60_000)
})

const newHome = (): string => {
  const home = tmkdir('p2sdk-lock-')
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
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}:${starttimeOf(process.pid)}\n`)
    // A resumes: its next step is the dev+ino re-check before unlink.
    const a = acquireHomeLock(home)
    expect(a).toBeTypeOf('string')
    expect(a).toContain('already in use')
    // B's lock is intact — same inode, same pid.
    expect(inodeOf(lockPathOf(home))).toBe(liveInode)
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}:${starttimeOf(process.pid)}\n`)
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
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}:${starttimeOf(process.pid)}\n`)
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

// --- T-13.f1 (REVIEW-REVIEW-L R1+R3): lock rows carry pid identity (starttime) ---

describe('T-13.f1 R1/R3 — lock rows carry pid identity (starttime)', () => {
  /** A starttime that belongs to a later process: real pid reuse means the new holder started strictly after. */
  const foreignStarttime = (pid: number): number => starttimeOf(pid) + 1

  it('① publish records `<pid>:<starttime>`; recordChildPid appends the runtime row with its own identity', () => {
    const home = newHome()
    const hold = acquireHomeLockDetailed(home) as HomeLockHold
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}:${starttimeOf(process.pid)}\n`)
    // A live child pid gets ITS OWN starttime recorded (never the launcher's).
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' })
    track(child.pid)
    hold.recordChildPid(child.pid!)
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(
      `${process.pid}:${starttimeOf(process.pid)}\n${child.pid}:${starttimeOf(child.pid!)}\n`,
    )
    // Degraded row: a pid whose /proc is unreadable (already dead) is recorded bare.
    hold.recordChildPid(DEAD_PID)
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(
      `${process.pid}:${starttimeOf(process.pid)}\n${child.pid}:${starttimeOf(child.pid!)}\n${DEAD_PID}\n`,
    )
    expect(processStarttime(DEAD_PID)).toBeNull()
    hold.release()
    expect(existsSync(lockPathOf(home))).toBe(false)
  }, 30_000)

  it('① a live pid with a MATCHING starttime still holds — identity must not over-reclaim', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${process.pid}:${starttimeOf(process.pid)}\n`)
    const r = acquireHomeLock(home)
    expect(r).toBeTypeOf('string')
    expect(r).toContain(`launcher pid ${process.pid}`)
    // The genuinely-held lock is untouched.
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}:${starttimeOf(process.pid)}\n`)
    expect(tempLeftovers(home)).toEqual([])
  })

  it('② R1: a runtime-row pid alive but reused (starttime mismatch) is a stale lock, reclaimable', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${DEAD_PID}:1\n${process.pid}:${foreignStarttime(process.pid)}\n`)
    const r = acquireHomeLock(home)
    expect(r).toBeTypeOf('function')
    ;(r as () => void)()
    expect(tempLeftovers(home)).toEqual([])
  })

  it('③ R3: the launcher row naming THIS process pid with a foreign starttime is stale, reclaimable', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${process.pid}:${foreignStarttime(process.pid)}\n`)
    const r = acquireHomeLock(home)
    expect(r).toBeTypeOf('function')
    ;(r as () => void)()
    expect(tempLeftovers(home)).toEqual([])
  })

  it('④ the refuse message points at the lock file for manual recovery', () => {
    const home = newHome()
    const first = acquireHomeLock(home)
    expect(first).toBeTypeOf('function')
    const second = acquireHomeLock(home)
    expect(second).toBeTypeOf('string')
    expect(second).toContain('如确认无实例运行')
    expect(second).toContain(lockPathOf(home))
    ;(first as () => void)()
  })

  it('an old-format row (pre-T-13.f1 lock, no starttime) with a live pid still holds — conservative transition', () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${process.pid}\n`)
    expect(acquireHomeLock(home)).toBeTypeOf('string')
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
    expect(readFileSync(lockPathOf(home), 'utf8')).toBe(`${process.pid}:${starttimeOf(process.pid)}\n`)
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
    if (recorded.split(':')[0] === String(process.pid)) break
    await new Promise((res) => setTimeout(res, 5))
  }
  if (recorded.split(':')[0] !== String(process.pid)) { console.log('CORRUPT ' + recorded); process.exit(8) }
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
      const ctl = tmkdir('p2sdk-race-')
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

describe('T-13 R7/R8 ③ — three-racer strand: the pre-startRuntime gate admits at most one', () => {
  // Deterministic reproduction of the review R7/R8 interleaving with the
  // renameSync interception method: A reads the stale lock and pauses, B
  // reclaims it and holds, A's rename captures B's LIVE lock, C publishes
  // inside A's capture→restore gap, A's restore loses to EEXIST. Result: B and
  // C both hold release thunks while lockPath names only C (B's inode is
  // stranded aside). The fix under test is the main() gate — each holder
  // re-verifies it still owns lockPath before entering startRuntime — so at
  // most one of them may proceed.
  it('B and C both acquire, yet only C (the lockPath owner) passes the gate; B aborts', async () => {
    const home = newHome()
    writeFileSync(lockPathOf(home), `${DEAD_PID}\n`)
    const ctl = tmkdir('p2sdk-r3-')
    homes.push(ctl)
    const at = (name: string) => join(ctl, name)

    // Loader pieces, all written by this test into the ctl dir. The loader
    // redirects src/start.ts's `node:fs` import to the wrapper; the wrapper
    // synchronously runs the other racers at the two boundaries (before A's
    // capture renameSync, before A's restore linkSync), waiting for their
    // ACQUIRED marker before letting the real syscall through.
    const holderScript = (tag: 'b' | 'c') => `
const { acquireHomeLockDetailed } = await import(process.env.LOCK_START_URL)
const { writeFileSync, existsSync } = await import('node:fs')
const r = acquireHomeLockDetailed(process.env.LOCK_HOME)
if (typeof r === 'string') { writeFileSync(process.env.LOCK_${tag.toUpperCase()}_GATE, 'REFUSED'); process.exit(7) }
writeFileSync(process.env.LOCK_${tag.toUpperCase()}_ACQ, String(process.pid))
const end = Date.now() + 30_000
while (!existsSync(process.env.LOCK_${tag.toUpperCase()}_GO)) {
  if (Date.now() > end) { writeFileSync(process.env.LOCK_${tag.toUpperCase()}_GATE, 'TIMEOUT'); process.exit(9) }
  await new Promise((res) => setTimeout(res, 20))
}
// main()'s pre-startRuntime decision: only the lockPath owner may proceed.
writeFileSync(process.env.LOCK_${tag.toUpperCase()}_GATE, r.stillHeld() ? 'PROCEED' : 'ABORT')
// no release(): the hold's fd closes when this process exits, and the lock
// files must survive for the strand assertions below (afterEach cleans up).
`
    writeFileSync(at('b.mjs'), holderScript('b'))
    writeFileSync(at('c.mjs'), holderScript('c'))
    writeFileSync(at('a.mjs'), `
const { acquireHomeLockDetailed } = await import(process.env.LOCK_START_URL)
const { writeFileSync } = await import('node:fs')
const r = acquireHomeLockDetailed(process.env.LOCK_HOME)
writeFileSync(process.env.LOCK_A_OUT, typeof r === 'string' ? 'REFUSED' : 'HELD')
`)
    writeFileSync(at('wrapper.mjs'), `\
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import * as real from 'node:fs'
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const waitFile = (p) => {
  const end = Date.now() + 20_000
  while (!existsSync(p)) {
    if (Date.now() > end) throw new Error('lockrace marker timeout: ' + p)
    sleep(10)
  }
}
const fire = (script, marker) => {
  if (process.env.LOCK_INHOOK) return
  process.env.LOCK_INHOOK = '1'
  try {
    // unref: a live spawned child otherwise holds A's event loop open, so A
    // would not exit (and the test could not write the GO files) until the
    // parked holders time out on their own.
    spawn(process.execPath, [script], { env: { ...process.env }, stdio: ['ignore', 'ignore', 'inherit'] }).unref()
    waitFile(marker)
  } finally {
    process.env.LOCK_INHOOK = ''
  }
}
export const renameSync = (a, b) => {
  fire(process.env.LOCK_B_SCRIPT, process.env.LOCK_B_ACQ)
  return real.renameSync(a, b)
}
export const linkSync = (a, b) => {
  if (basename(a).startsWith('.launcher-lock.captured.')) fire(process.env.LOCK_C_SCRIPT, process.env.LOCK_C_ACQ)
  return real.linkSync(a, b)
}
export * from 'node:fs'
`)
    writeFileSync(
      at('loader.mjs'),
      `\
import { pathToFileURL } from 'node:url'
const wrapUrl = pathToFileURL(process.env.LOCK_WRAP).href
const startUrl = process.env.LOCK_START_URL
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'node:fs' && context.parentURL === startUrl) {
    return { url: wrapUrl, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
`,
    )
    writeFileSync(at('reg.mjs'), "import { register } from 'node:module'\nregister('./loader.mjs', import.meta.url)\n")

    const startUrl = pathToFileURL(START_TS).href
    const env = {
      ...launcherSpawnEnv(),
      LOCK_HOME: home,
      LOCK_START_URL: startUrl,
      LOCK_WRAP: at('wrapper.mjs'),
      LOCK_B_SCRIPT: at('b.mjs'),
      LOCK_C_SCRIPT: at('c.mjs'),
      LOCK_B_ACQ: at('b.acq'),
      LOCK_C_ACQ: at('c.acq'),
      LOCK_B_GO: at('b.go'),
      LOCK_C_GO: at('c.go'),
      LOCK_B_GATE: at('b.gate'),
      LOCK_C_GATE: at('c.gate'),
      LOCK_A_OUT: at('a.out'),
    }
    const a = spawn(process.execPath, ['--import', at('reg.mjs'), at('a.mjs')], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let aOut = ''
    a.stdout!.setEncoding('utf8')
    a.stderr!.setEncoding('utf8')
    a.stdout!.on('data', (c: string) => {
      aOut += c
    })
    a.stderr!.on('data', (c: string) => {
      aOut += c
    })
    await waitClose(a, 60_000)
    // A loses cleanly after its restore hits EEXIST: it must report refusal, not a hold.
    expect(readFileSync(env.LOCK_A_OUT, 'utf8')).toBe('REFUSED')

    // Release the parked holders; each now applies main()'s gate.
    writeFileSync(env.LOCK_B_GO, '')
    writeFileSync(env.LOCK_C_GO, '')
    const waitFile = async (p: string, ms: number): Promise<string> => {
      const end = Date.now() + ms
      for (;;) {
        try {
          return readFileSync(p, 'utf8').trim()
        } catch {
          /* not yet */
        }
        if (Date.now() > end) throw new Error(`timeout waiting for ${p}; A output: ${aOut}`)
        await new Promise((res) => setTimeout(res, 25))
      }
    }
    const bPid = Number(await waitFile(env.LOCK_B_ACQ, 15_000))
    const cPid = Number(await waitFile(env.LOCK_C_ACQ, 15_000))
    track(bPid, cPid)
    const bGate = await waitFile(env.LOCK_B_GATE, 15_000)
    const cGate = await waitFile(env.LOCK_C_GATE, 15_000)

    // The strand is real: both acquired, lockPath names only C, B's lock is aside.
    expect(bPid).not.toBe(cPid)
    expect(readFileSync(lockPathOf(home), 'utf8').trim(), 'lockPath carries C, the last publisher').toMatch(new RegExp(`^${cPid}:`))
    expect(tempLeftovers(home).some((n) => n.startsWith('.launcher-lock.captured.')), "B's live inode is stranded aside").toBe(true)

    // The gate: at most one holder may proceed into startRuntime.
    expect(bGate, 'B no longer owns lockPath — main() must abort it').toBe('ABORT')
    expect(cGate, 'C owns lockPath — main() lets it proceed').toBe('PROCEED')
    expect([bGate, cGate].filter((v) => v === 'PROCEED')).toHaveLength(1)
  }, 90_000)
})
