/**
 * P2 demo launcher (T-01). Boots `@deepseek-ai/dsh` web profile with the p2sdk
 * patch overlay: real provider routes through `dsh-llm-pi-ai` to a local
 * LiteLLM endpoint, mock provider replays a fixed chunk script via
 * `dsh-llm-replay`. The launch token is handed off through a private handoff
 * dir (see P2SDK_HANDOFF below, 0600), never through stdout.
 *
 * Environment:
 *   P2SDK_PROVIDER       'real' (default) | 'mock'
 *   P2SDK_LLM_API_KEY    required for the real provider; never logged
 *   P2SDK_LLM_BASE_URL   LiteLLM root, default http://127.0.0.1:4001
 *   P2SDK_LLM_MODEL      default glm-5.3-flash (verified alias on local LiteLLM)
 *   P2SDK_HOME           runtime home, default <pkg>/.dsh (launcher-side only:
 *                        never enters the dsh env, REVIEW R1 — the model-side
 *                        shell must not derive anything from it)
 *   P2SDK_HANDOFF        credential handoff dir; defaults to a fresh random
 *                        tmpdir per launch (T-12 R1: unguessable, not a
 *                        deterministic sibling of the home), printed to stderr
 *                        as `p2sdk: handoff <dir>` for the operator client
 *   P2SDK_PORT           listen port, default 0 (OS-assigned)
 *   P2SDK_PATCH          colon-separated extra `--patch` overlays (absolute paths)
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, fstatSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const DEFAULT_LLM_BASE_URL = 'http://127.0.0.1:4001'
export const DEFAULT_MODEL = 'glm-5.3-flash'

export interface StartConfig {
  provider: 'real' | 'mock'
  apiKey: string | undefined
  llmBaseUrl: string
  model: string
  home: string
  /** Credential handoff dir (launch-token/base-url, 0600). Never enters the dsh child env (T-01.f3 R1). */
  handoff: string
  port: number
  extraPatches: string[]
  readyTimeoutMs: number
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): StartConfig {
  const provider = env.P2SDK_PROVIDER === 'mock' ? 'mock' : 'real'
  const apiKey = env.P2SDK_LLM_API_KEY?.trim()
  return {
    provider,
    apiKey: apiKey ? apiKey : undefined,
    llmBaseUrl: env.P2SDK_LLM_BASE_URL || DEFAULT_LLM_BASE_URL,
    model: env.P2SDK_LLM_MODEL || DEFAULT_MODEL,
    home: env.P2SDK_HOME || join(PKG_ROOT, '.dsh'),
    // T-12 (REVIEW R1 critical): the default handoff dir carries the launch
    // token, so it must be a fresh random tmpdir — never the deterministic
    // sibling of the default home (derivable from the documented layout) and
    // never inside $DSH_HOME (find-able). Per-launch randomness also removes
    // the cross-instance default-path clobber (review R9's default case).
    handoff: env.P2SDK_HANDOFF || mkdtempSync(join(tmpdir(), 'p2sdk-handoff-')),
    port: Number(env.P2SDK_PORT ?? 0),
    extraPatches: (env.P2SDK_PATCH ?? '').split(':').filter(Boolean),
    readyTimeoutMs: Number(env.P2SDK_READY_TIMEOUT_MS ?? 60_000),
  }
}

/** Pre-flight validation; a non-null string is the user-facing error. */
export function validateStart(cfg: StartConfig): string | null {
  if (cfg.provider === 'real' && !cfg.apiKey) {
    return 'P2SDK_LLM_API_KEY is not set: the real provider requires it. Export P2SDK_LLM_API_KEY, or run with P2SDK_PROVIDER=mock.'
  }
  for (const p of cfg.extraPatches) {
    if (!isAbsolute(p)) return `extra patch path must be absolute (got "${p}"); set P2SDK_PATCH to absolute paths`
  }
  return null
}

/** Normalize a LiteLLM root into an OpenAI-completions base (…/v1). */
export function normalizeApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

/** dsh argv: web profile + our static overlay + the approval overlay + the generated runtime overlay + extras (acceptance ③). */
export function buildArgs(cfg: StartConfig, runtimePatch: string): string[] {
  const args = [
    'web',
    '--patch', join(PKG_ROOT, 'profile', 'patches', 'p2sdk.yml'),
    // T-12 (REVIEW R3/R5/R13): the shell-ask approval policy ships in the
    // DEFAULT chain — no P2SDK_PATCH opt-in — so an ordinary bash call asks
    // out of the box (CLAUDE.md 安全反例: openclaw exec 默认不审批).
    '--patch', join(PKG_ROOT, 'profile', 'patches', 'approval.yml'),
    '--patch', runtimePatch,
  ]
  for (const p of cfg.extraPatches) args.push('--patch', p)
  args.push('--port', String(cfg.port), '--no-open')
  return args
}

/**
 * Environment for the dsh child: an explicit allowlist (T-01.f3 O8/R1), not the
 * launcher's full env. Only PATH, HOME, and the P2SDK_ / DSH_ prefixed names
 * pass through; the handoff dir is always dropped (its path must not be
 * env-derivable inside the sandbox), and the real LLM key is dropped in mock
 * mode (the replay/fake providers never read it). T-12 (REVIEW R1 critical):
 * P2SDK_HOME is dropped too — the upstream tool-subprocess scrubber removes
 * DSH_* names but keeps P2SDK_*, so a home path in P2SDK_HOME would let a
 * model-driven shell derive the (formerly deterministic) handoff location.
 * DSH_HOME stays: it is the canonical home the runtime itself needs, and the
 * scrubber keeps it out of model-driven tool processes.
 */
export function childEnv(cfg: StartConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue
    const keep = name === 'PATH' || name === 'HOME' || name.startsWith('P2SDK_') || name.startsWith('DSH_')
    // P2SDK_HANDOFF and P2SDK_TEST_V8_COVERAGE are consumed by the launcher
    // (credential dir / T-11 coverage dir) and never passed on to the sandbox;
    // P2SDK_HOME is dropped too (T-12 R1 — see above).
    if (keep && name !== 'P2SDK_HANDOFF' && name !== 'P2SDK_TEST_V8_COVERAGE' && name !== 'P2SDK_HOME') child[name] = value
  }
  child.DSH_HOME = cfg.home
  child.P2SDK_PROVIDER = cfg.provider
  child.P2SDK_LLM_MODEL = cfg.model
  child.P2SDK_LLM_API_BASE = normalizeApiBase(cfg.llmBaseUrl)
  child.DSH_TELEMETRY_MODE = env.DSH_TELEMETRY_MODE ?? 'DISABLED'
  if (cfg.provider === 'mock') delete child.P2SDK_LLM_API_KEY
  // T-11 coverage bypass (test harness only): the harness disables coverage
  // writing in the launcher (tests/support/runtime.ts launcherSpawnEnv — node
  // force-inherits NODE_V8_COVERAGE, so the dir travels under this P2SDK_
  // name instead) and start.ts maps it back for the dsh child, whose
  // execution of src/p2temp then reports coverage. Production never sets this
  // variable, so real launches inject nothing.
  if (env.P2SDK_TEST_V8_COVERAGE) child.NODE_V8_COVERAGE = env.P2SDK_TEST_V8_COVERAGE
  return child
}

const fileUrl = (p: string): string => `file://${p}`

/**
 * Generated overlay applied after profile/patches/p2sdk.yml: inserted rows need
 * absolute plugin specifiers because the $DSH_HOME profile workspace has no
 * node_modules to resolve package names against.
 */
export function writeRuntimePatch(cfg: StartConfig): string {
  const path = join(cfg.home, 'runtime-patch.yml')
  const rows: string[] = []
  if (cfg.provider === 'mock') {
    rows.push(`\
- insert:
    - id: llm-replay
      name: '${fileUrl(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-llm-replay', 'lib', 'index.js'))}'
      config:
        file: /p2sdk/unused-session-fixture.jsonl
        overrideFile: '${join(cfg.home, 'replay-override.json')}'
        paceMs: 25
        providers:
          - id: mock
            name: Mock Replay
            models:
              - id: mock
                contextWindow: 131072
`)
  }
  rows.push(`\
- insert:
    - id: p2sdk-handoff
      name: '${fileUrl(join(PKG_ROOT, 'profile', 'plugins', 'handoff.mjs'))}'
      config:
        dir: '${cfg.handoff}'
`)
  writeFileSync(path, rows.join(''))
  return path
}

/** Whole-script ReplayEntry[] replayed per model call in mock mode (llm-replay override sidecar).
 * llm-replay binds each new live session to the next unclaimed script entry,
 * so the same chunk script is repeated for several sessions per runtime. */
export function mockReplayOverride(): unknown {
  const text = '你好，这是 p2sdk mock 回复。'
  const entry = {
    kind: 'chunks',
    chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '你好，' },
      { type: 'text-delta', index: 0, text: '这是 ' },
      { type: 'text-delta', index: 0, text: 'mock 回复。' },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
      { type: 'finish', reason: 'stop' },
    ],
  }
  return Array.from({ length: 4 }, () => entry)
}

/** Extract the origin from a handoff ready line, or null for anything else. */
export function isReadyLine(line: string): string | null {
  const m = /^\[p2sdk\] ready (https?:\/\/\S+)$/.exec(line.trim())
  return m ? m[1] : null
}

const LOCK_FILE = 'launcher.lock'

interface LockView {
  /** Recorded launcher pid; null when the content is empty or not a pid row. */
  pid: number | null
  /**
   * Recorded launcher pid starttime (/proc field 22, T-13.f1 R1/R3); null when
   * the row predates the identity format — such rows fall back to alive-only.
   */
  starttime: number | null
  /**
   * Recorded dsh runtime pid (T-13, review R2/R10): the launcher appends it
   * right after spawn. 0 = not yet spawned (or pre-T-13 single-pid lock).
   */
  dshPid: number
  /** Recorded runtime pid starttime; null when the row predates the format. */
  dshStarttime: number | null
  /** Inode identity of the file the pid was read from. */
  dev: number
  ino: number
}

/** Parse one lock row: `<pid>` (pre-T-13.f1) or `<pid>:<starttime>` (T-13.f1). */
function toPidRow(line: string | undefined): { pid: number | null; starttime: number | null } {
  const m = /^([1-9]\d*)(?::(\d+))?$/.exec((line ?? '').trim())
  if (!m) return { pid: null, starttime: null }
  return { pid: Number(m[1]), starttime: m[2] === undefined ? null : Number(m[2]) }
}

/**
 * /proc/<pid>/stat field 22 (starttime, clock ticks since boot) — the pid's
 * identity across PID reuse (T-13.f1 R1/R3). Readable for any user's live
 * pid; null when the process is gone or /proc is unreadable.
 */
export function processStarttime(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    // Fields 1 (pid) and 2 (comm) precede; comm may contain spaces and parens,
    // so counting starts after the LAST ')'. Field 22 → index 19 from field 3.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const st = Number(fields[19])
    return Number.isInteger(st) && st >= 0 ? st : null
  } catch {
    return null
  }
}

/** Snapshot the lock file, or null when it is absent/unopenable. */
function readLock(lockPath: string): LockView | null {
  let fd: number
  try {
    fd = openSync(lockPath, 'r')
  } catch {
    return null
  }
  try {
    const st = fstatSync(fd)
    const lines = readFileSync(fd, 'utf8').split('\n')
    const launcher = toPidRow(lines[0])
    const dsh = toPidRow(lines[1])
    return {
      pid: launcher.pid,
      starttime: launcher.starttime,
      dshPid: dsh.pid ?? 0,
      dshStarttime: dsh.starttime,
      dev: st.dev,
      ino: st.ino,
    }
  } catch {
    return null
  } finally {
    try {
      closeSync(fd)
    } catch {
      /* already closed */
    }
  }
}

/**
 * True when the recorded holder still owns the pid: the pid is alive AND its
 * /proc starttime matches the recorded one (T-13.f1 R1/R3 — a recycled or
 * coincidental pid, including the caller's own pid in a PID-1 container, is
 * NOT the holder). A row without a recorded starttime (pre-T-13.f1 lock) and
 * an unreadable /proc both fall back to alive-only: fail-closed beats
 * reclaiming a possibly-live holder.
 */
function pidHeld(pid: number, starttime: number | null): boolean {
  try {
    process.kill(pid, 0)
  } catch (e) {
    // EPERM means the pid exists but belongs to another user: /proc/<pid>/stat
    // is still world-readable, so identity checking proceeds below.
    if ((e as NodeJS.ErrnoException).code !== 'EPERM') return false
  }
  if (starttime === null) return true
  const actual = processStarttime(pid)
  return actual === null ? true : actual === starttime
}

/** True when a recorded holder with a matching identity is still alive (T-13: launcher OR its detached dsh). */
function lockHeld(view: LockView): boolean {
  if (view.pid !== null && pidHeld(view.pid, view.starttime)) return true
  return view.dshPid > 0 && pidHeld(view.dshPid, view.dshStarttime)
}

/** A held home lock: release, liveness re-verification, and dsh pid recording. */
export interface HomeLockHold {
  /** Unlink the lock only if it is still our inode; idempotent. */
  release(): void
  /**
   * Re-verify this hold still owns lockPath (T-13, review R7/R8): a three-racer
   * stale-reclaim can strand our inode aside while a third launcher publishes
   * at lockPath. main() must call this before startRuntime and abort on false.
   */
  stillHeld(): boolean
  /**
   * Append the dsh child pid (with its /proc starttime, T-13.f1) to the lock
   * content (T-13, review R2/R10): the home stays held while the detached dsh
   * outlives a crashed/killed launcher.
   */
  recordChildPid(pid: number): void
}

/**
 * One launcher per P2SDK_HOME (T-01.f2 acceptance ①, review R4): concurrent
 * launches would overwrite runtime-patch.yml and the handoff files under the
 * shared home. Acquisition publishes `<launcherPid>:<starttime>\n<runtimePid>:<starttime>\n`
 * (the runtime line is appended right after spawn, T-13; each row carries the
 * pid's /proc starttime so a recycled pid never counts as the holder,
 * T-13.f1 R1/R3) atomically via link(2)
 * from an O_EXCL temp file, so the lock path never shows a half-written lock
 * (review R1 interleave 1: an empty/unparsable lock is refused, never
 * reclaimed). Stale reclaim (BOTH recorded pids dead — the detached dsh
 * outlives a killed launcher, T-13 review R2/R10) captures the path with
 * rename(2) under a private name and restores a live replacement it captured
 * by mistake, so a reclaimer paused mid-reclaim cannot delete the next
 * holder's fresh lock (interleave 2); release() only unlinks the inode it
 * published (interleave 3). The launcher never deletes the lock on exit: the
 * lock simply goes stale once its recorded pids die, and the next start
 * reclaims it — so a crash while the dsh lives leaves the home protected
 * (R2). Returns a hold, or a user-facing error string when the home is held.
 */
export function acquireHomeLockDetailed(home: string): string | HomeLockHold {
  const lockPath = join(home, LOCK_FILE)
  const refuse = (view: LockView) =>
    `P2SDK_HOME "${home}" is already in use by launcher pid ${view.pid}${view.dshPid > 0 ? ` and its runtime pid ${view.dshPid}` : ''}: a second instance would clobber its runtime-patch.yml and handoff files（如确认无实例运行，删除 ${lockPath}）`

  /** One lock row: `<pid>:<starttime>`, or bare `<pid>` when /proc is unreadable. */
  const pidRow = (pid: number): string => {
    const st = processStarttime(pid)
    return st === null ? `${pid}` : `${pid}:${st}`
  }

  /** Publish `<pid>:<starttime>\n` at lockPath atomically; null when someone else holds it. */
  const publish = (): HomeLockHold | null => {
    const tmp = join(home, `.launcher-lock.${process.pid}.${randomUUID()}`)
    const fd = openSync(tmp, 'wx')
    writeFileSync(fd, `${pidRow(process.pid)}\n`)
    try {
      linkSync(tmp, lockPath)
    } catch (e) {
      try {
        closeSync(fd)
      } catch {
        /* already closed */
      }
      try {
        unlinkSync(tmp)
      } catch {
        /* already gone */
      }
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      return null
    }
    try {
      unlinkSync(tmp) // the inode lives on as lockPath; the fd stays open as its identity anchor
    } catch {
      /* already gone */
    }
    const { dev, ino } = fstatSync(fd)
    let released = false
    return {
      release() {
        if (released) return
        released = true
        try {
          const st = statSync(lockPath)
          if (st.dev === dev && st.ino === ino) unlinkSync(lockPath)
        } catch {
          /* already gone */
        }
        try {
          closeSync(fd)
        } catch {
          /* already closed */
        }
      },
      stillHeld() {
        if (released) return false
        const view = readLock(lockPath)
        return view !== null && view.pid === process.pid && view.dev === dev && view.ino === ino
      },
      recordChildPid(pid: number) {
        if (released || pid <= 0) return
        // Single append through the identity-anchor fd: readers either see the
        // launcher-only line or the completed runtime line, never a torn one,
        // and the inode identity is preserved (no path rewrite). The row
        // carries the child's own starttime (T-13.f1 identity).
        try {
          writeSync(fd, `${pidRow(pid)}\n`)
        } catch {
          /* the lock is gone; nothing to record */
        }
      },
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const hold = publish()
    if (hold) return hold
    const view = readLock(lockPath)
    if (!view) continue // vanished between publish and read: race again
    if (view.pid === null) {
      return `P2SDK_HOME "${home}" has an uninitialized ${LOCK_FILE} (no pid recorded): if no launcher is mid-start on this home, remove ${lockPath} and retry`
    }
    if (lockHeld(view)) return refuse(view)
    // Stale (dead holder), review R1 interleave 2: unlink cannot carry an
    // identity condition, so a reclaimer paused between its read and its
    // delete would remove a lock another racer reclaimed and published since.
    // Instead of unlinking, atomically CAPTURE the current lockPath under our
    // own private name via rename(2), then check what we captured: the stale
    // inode we judged dead gets removed; a live replacement is put back with
    // link(2) (EEXIST-safe — unlike rename it cannot clobber a fresh
    // publisher), and this caller re-evaluates instead of acquiring. A holder
    // that releases while captured-and-aside simply skips its unlink (the
    // restored dead-pid lock is reclaimed by the next start).
    const aside = join(home, `.launcher-lock.captured.${process.pid}.${randomUUID()}`)
    let captured: LockView
    try {
      renameSync(lockPath, aside)
      // Identity = inode AND pid: inode numbers are only unique while alive,
      // and a racer removing the stale lock frees its inode for immediate
      // reuse by the very next publish (observed under racing reclaimers), so
      // inode equality alone can mistake a fresh live lock for the stale one.
      captured = readLock(aside) ?? { pid: null, starttime: null, dshPid: 0, dshStarttime: null, dev: -1, ino: -1 }
    } catch {
      continue // path vanished: another racer reclaimed it first
    }
    if (
      captured.pid === view.pid &&
      captured.dev === view.dev &&
      captured.ino === view.ino &&
      !lockHeld(captured) // neither recorded pid may have come alive (reuse) meanwhile
    ) {
      try {
        unlinkSync(aside) // exactly the stale inode we judged dead: remove it
      } catch {
        /* already gone */
      }
    } else {
      // We captured a live lock replaced since our read: restore it. If a
      // third racer publishes at lockPath inside the capture→restore gap, the
      // link fails EEXIST and we leave the captured inode aside rather than
      // destroy a live lock (a leaked inert file is the lesser evil).
      // ponytail: userspace floor — that µs capture→restore gap is the only
      // remaining window (needs ≥3 racers); the stranded holder detects the
      // loss via stillHeld() before startRuntime (T-13), so the window can no
      // longer produce two runtimes on one home unless the holder gates
      // inside the gap itself. An airtight fix requires kernel arbitration
      // (flock, as upstream dsh session locks use), unavailable in node:fs
      // without a native addon.
      try {
        linkSync(aside, lockPath)
        unlinkSync(aside)
      } catch {
        /* lockPath taken in the gap: keep the captured file, never delete a live lock */
      }
      continue
    }
  }
  return `P2SDK_HOME "${home}" lock is contended; retry`
}

/** Legacy-shaped acquireHomeLock: a bare release() thunk, or the error string. */
export function acquireHomeLock(home: string): string | (() => void) {
  const hold = acquireHomeLockDetailed(home)
  return typeof hold === 'string' ? hold : () => hold.release()
}

function dshEntry(): string {
  return join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

/**
 * dsh spawn options (T-01.f2, review R5): `detached` puts dsh in its own
 * process group, so a terminal Ctrl-C cannot reach it straight from the
 * foreground group — it arrives exactly once, through the launcher's forward
 * in main(), letting the pinned dsh shutdown dispose to completion instead of
 * force-exiting on a duplicate signal.
 */
export function dshSpawnOptions(cfg: StartConfig): {
  env: NodeJS.ProcessEnv
  stdio: ['ignore', 'pipe', 'inherit']
  detached: boolean
} {
  return { env: childEnv(cfg, process.env), stdio: ['ignore', 'pipe', 'inherit'], detached: true }
}

export interface RuntimeHandle {
  child: import('node:child_process').ChildProcess
  /** Resolves true once the token-free ready line arrived, false on timeout/early exit. */
  ready: Promise<boolean>
  /** Resolves with the child's exit code. */
  exited: Promise<number>
}

/** Prepare the home dir, overlays, and dsh child process for one runtime. */
export function startRuntime(cfg: StartConfig): RuntimeHandle {
  mkdirSync(cfg.home, { recursive: true })
  mkdirSync(cfg.handoff, { recursive: true })
  if (cfg.provider === 'mock') {
    writeFileSync(join(cfg.home, 'replay-override.json'), JSON.stringify(mockReplayOverride()))
  }
  const runtimePatch = writeRuntimePatch(cfg)
  const child = spawn(process.execPath, [dshEntry(), ...buildArgs(cfg, runtimePatch)], dshSpawnOptions(cfg))

  let announced = false
  let readyResolve!: (ready: boolean) => void
  const ready = new Promise<boolean>((r) => {
    readyResolve = r
  })
  const note = (line: string) => {
    if (!announced && isReadyLine(line)) {
      announced = true
      // dsh has finished loading every --patch overlay by the time the handoff
      // plugin fires, so the generated patch (which names the handoff dir) is
      // deleted once boot succeeded: the only on-disk clue to the credential
      // location disappears before any model-driven tool can run (T-01.f3 R1).
      try {
        rmSync(runtimePatch, { force: true })
      } catch {
        // best effort: a leftover patch only matters for the default fixed dirs
      }
      readyResolve(true)
    }
  }
  let pending = ''
  child.stdout!.setEncoding('utf8')
  child.stdout!.on('data', (chunk: string) => {
    process.stdout.write(chunk)
    if (announced) return
    pending += chunk
    let nl: number
    while ((nl = pending.indexOf('\n')) >= 0) {
      note(pending.slice(0, nl))
      pending = pending.slice(nl + 1)
    }
    note(pending)
  })
  const timer = setTimeout(() => {
    if (!announced) readyResolve(false)
  }, cfg.readyTimeoutMs)
  const exited = new Promise<number>((resolveExit) => child.on('exit', (code) => resolveExit(code ?? 1)))
  child.on('exit', () => {
    clearTimeout(timer)
    if (!announced) readyResolve(false)
  })
  return { child, ready, exited }
}

/** Entry point: returns the process exit code. */
export async function main(cfg: StartConfig = resolveConfig()): Promise<number> {
  const err = validateStart(cfg)
  if (err) {
    process.stderr.write(`p2sdk: ${err}\n`)
    return 1
  }
  mkdirSync(cfg.home, { recursive: true })
  const hold = acquireHomeLockDetailed(cfg.home)
  if (typeof hold === 'string') {
    process.stderr.write(`p2sdk: ${hold}\n`)
    return 1
  }
  // T-13 (review R7/R8): a three-racer stale-reclaim can strand our lock aside
  // while another launcher publishes at lockPath. Re-verify ownership before
  // spawning: only the lockPath owner may enter startRuntime.
  if (!hold.stillHeld()) {
    process.stderr.write(`p2sdk: lost the launcher lock on "${cfg.home}" to a racing start; not spawning a runtime\n`)
    hold.release()
    return 1
  }
  const handle = startRuntime(cfg)
  // T-13 (review R2/R10): record the dsh pid so the home stays held while the
  // detached dsh outlives this launcher (SIGKILL/OOM/EPIPE crash). The lock is
  // deliberately NOT deleted on exit: it goes stale once both recorded pids
  // die and the next start reclaims it — a crash with a live dsh leaves the
  // home protected instead of wide open.
  hold.recordChildPid(handle.child.pid ?? 0)
  process.stderr.write(`p2sdk: dsh pid ${handle.child.pid}\n`)
  // T-12 R1: the default handoff dir is a fresh random tmpdir the operator
  // could not otherwise know; the PATH is operator-facing metadata (stderr,
  // never the model-side env) — the token itself still only lives in the dir.
  process.stderr.write(`p2sdk: handoff ${cfg.handoff}\n`)
  // `on`, not `once`: a second Ctrl-C must also reach dsh (its pinned
  // shutdown escalates to a forced exit on repeat) instead of killing this
  // launcher first and leaving the detached dsh orphaned.
  const forward = (signal: NodeJS.Signals) => {
    if (handle.child.exitCode !== null) return
    process.stderr.write(`p2sdk: forwarding ${signal} to dsh\n`)
    handle.child.kill(signal)
  }
  process.on('SIGINT', () => forward('SIGINT'))
  process.on('SIGTERM', () => forward('SIGTERM'))
  if (!(await handle.ready)) {
    process.stderr.write(`p2sdk: no ready line within ${cfg.readyTimeoutMs}ms\n`)
    forward('SIGTERM')
    return (await handle.exited) || 1
  }
  return await handle.exited
}
