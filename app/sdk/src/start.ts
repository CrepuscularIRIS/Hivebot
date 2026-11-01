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
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
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

/** Pid recorded in an existing lock file, or null when absent/unreadable/stale. */
function lockHolder(lockPath: string): number | null {
  let pid: number
  try {
    pid = Number(readFileSync(lockPath, 'utf8').trim())
  } catch {
    return null
  }
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
  } catch (e) {
    // EPERM means the pid exists but belongs to another user: the home is held.
    return (e as NodeJS.ErrnoException).code === 'EPERM' ? pid : null
  }
  return pid
}

/**
 * One launcher per P2SDK_HOME (T-01.f2 acceptance ①, review R4): concurrent
 * launches would overwrite runtime-patch.yml and the handoff files under the
 * shared home. O_EXCL makes acquisition atomic; a lock naming a dead pid is
 * stale and gets taken over. Returns a release() thunk, or a user-facing
 * error string when a live launcher holds the home.
 */
export function acquireHomeLock(home: string): string | (() => void) {
  const lockPath = join(home, LOCK_FILE)
  const openExcl = () => openSync(lockPath, 'wx')
  const refuse = (pid: number) =>
    `P2SDK_HOME "${home}" is already in use by launcher pid ${pid}: a second instance would clobber its runtime-patch.yml and handoff files`
  let fd: number
  try {
    fd = openExcl()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    const held = lockHolder(lockPath)
    if (held) return refuse(held)
    // Stale lock (crashed holder): reclaim once; a racing winner's EEXIST is refused below.
    try {
      unlinkSync(lockPath)
    } catch {
      /* the racing winner removed it first */
    }
    try {
      fd = openExcl()
    } catch (e2) {
      if ((e2 as NodeJS.ErrnoException).code !== 'EEXIST') throw e2
      const winner = lockHolder(lockPath)
      return winner ? refuse(winner) : `P2SDK_HOME "${home}" lock is contended; retry`
    }
  }
  writeFileSync(fd, `${process.pid}\n`)
  let released = false
  return () => {
    if (released) return
    released = true
    try {
      unlinkSync(lockPath)
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
