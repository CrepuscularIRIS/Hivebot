/**
 * P2 demo launcher (T-01). Boots `@deepseek-ai/dsh` web profile with the p2sdk
 * patch overlay: real provider routes through `dsh-llm-pi-ai` to a local
 * LiteLLM endpoint, mock provider replays a fixed chunk script via
 * `dsh-llm-replay`. The launch token is handed off through
 * `$P2SDK_HOME/launch-token` (0600), never through stdout.
 *
 * Environment:
 *   P2SDK_PROVIDER       'real' (default) | 'mock'
 *   P2SDK_LLM_API_KEY    required for the real provider; never logged
 *   P2SDK_LLM_BASE_URL   LiteLLM root, default http://127.0.0.1:4001
 *   P2SDK_LLM_MODEL      default glm-5.3-flash (verified alias on local LiteLLM)
 *   P2SDK_HOME           runtime home, default <pkg>/.dsh
 *   P2SDK_PORT           listen port, default 0 (OS-assigned)
 *   P2SDK_PATCH          colon-separated extra `--patch` overlays (absolute paths)
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, fstatSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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

/** dsh argv: web profile + our static overlay + the generated runtime overlay + extras (acceptance ③). */
export function buildArgs(cfg: StartConfig, runtimePatch: string): string[] {
  const args = [
    'web',
    '--patch', join(PKG_ROOT, 'profile', 'patches', 'p2sdk.yml'),
    '--patch', runtimePatch,
  ]
  for (const p of cfg.extraPatches) args.push('--patch', p)
  args.push('--port', String(cfg.port), '--no-open')
  return args
}

/** Environment for the dsh child: isolated home, routed provider, quiet telemetry. */
export function childEnv(cfg: StartConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    DSH_HOME: cfg.home,
    P2SDK_HOME: cfg.home,
    P2SDK_PROVIDER: cfg.provider,
    P2SDK_LLM_MODEL: cfg.model,
    P2SDK_LLM_API_BASE: normalizeApiBase(cfg.llmBaseUrl),
    DSH_TELEMETRY_MODE: env.DSH_TELEMETRY_MODE ?? 'DISABLED',
  }
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
  /** Recorded pid; null when the content is empty or not a pid. */
  pid: number | null
  /** Inode identity of the file the pid was read from. */
  dev: number
  ino: number
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
    const pid = Number(readFileSync(fd, 'utf8').trim())
    return { pid: Number.isInteger(pid) && pid > 0 ? pid : null, dev: st.dev, ino: st.ino }
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

/** True when a live process (any user) holds the pid. */
function pidHeld(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch (e) {
    // EPERM means the pid exists but belongs to another user: the home is held.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
  return true
}

/**
 * One launcher per P2SDK_HOME (T-01.f2 acceptance ①, review R4): concurrent
 * launches would overwrite runtime-patch.yml and the handoff files under the
 * shared home. Acquisition publishes `<pid>\n` atomically via link(2) from an
 * O_EXCL temp file, so the lock path never shows a half-written lock (review
 * R1 interleave 1: an empty/unparsable lock is refused, never reclaimed).
 * Stale reclaim (dead pid) captures the path with rename(2) under a private
 * name and restores a live replacement it captured by mistake, so a reclaimer
 * paused mid-reclaim cannot delete the next holder's fresh lock (interleave
 * 2); release() only unlinks the inode it published (interleave 3). Returns a
 * release() thunk, or a user-facing error string when the home is held.
 */
export function acquireHomeLock(home: string): string | (() => void) {
  const lockPath = join(home, LOCK_FILE)
  const refuse = (pid: number) =>
    `P2SDK_HOME "${home}" is already in use by launcher pid ${pid}: a second instance would clobber its runtime-patch.yml and handoff files`

  /** Publish `<pid>\n` at lockPath atomically; null when someone else holds it. */
  const publish = (): (() => void) | null => {
    const tmp = join(home, `.launcher-lock.${process.pid}.${randomUUID()}`)
    const fd = openSync(tmp, 'wx')
    writeFileSync(fd, `${process.pid}\n`)
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
    return () => {
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
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const release = publish()
    if (release) return release
    const view = readLock(lockPath)
    if (!view) continue // vanished between publish and read: race again
    if (view.pid === null) {
      return `P2SDK_HOME "${home}" has an uninitialized ${LOCK_FILE} (no pid recorded): if no launcher is mid-start on this home, remove ${lockPath} and retry`
    }
    if (pidHeld(view.pid)) return refuse(view.pid)
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
      captured = readLock(aside) ?? { pid: null, dev: -1, ino: -1 }
    } catch {
      continue // path vanished: another racer reclaimed it first
    }
    if (
      captured.pid === view.pid &&
      captured.dev === view.dev &&
      captured.ino === view.ino &&
      !pidHeld(view.pid) // the dead pid must not have come alive (reuse) meanwhile
    ) {
      try {
        unlinkSync(aside) // exactly the stale inode we judged dead: remove it
      } catch {
        /* already gone */
      }
    } else {
      // We captured a live lock replaced since our read: restore it. If a
      // third racer published at lockPath inside the capture→restore gap, the
      // link fails EEXIST and we leave the captured inode aside rather than
      // destroy a live lock (a leaked inert file is the lesser evil).
      // ponytail: userspace floor — that µs capture→restore gap is the only
      // remaining window (needs ≥3 racers); an airtight fix requires kernel
      // arbitration (flock, as upstream dsh session locks use), unavailable in
      // node:fs without a native addon.
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
  const release = acquireHomeLock(cfg.home)
  if (typeof release === 'string') {
    process.stderr.write(`p2sdk: ${release}\n`)
    return 1
  }
  process.on('exit', release)
  const handle = startRuntime(cfg)
  process.stderr.write(`p2sdk: dsh pid ${handle.child.pid}\n`)
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
