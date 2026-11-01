// Shared test launcher (T-01 acceptance ⑧). Boots src/start.ts in mock
// provider mode against a fresh mkdtemp P2SDK_HOME, connects an
// examples/lib client, and exposes release(gateId): the cross-process
// barrier channel touches $P2SDK_HOME/gates/<gateId> and opens no port.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, type DshClient } from '../../examples/lib/client.mjs'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface Runtime {
  home: string
  baseUrl: string
  token: string
  client: DshClient
  /** Barrier release: touch $P2SDK_HOME/gates/<gateId> (no port, no signal). */
  release(gateId: string): void
  child: ChildProcess
  stop(): Promise<void>
}

export interface LaunchOptions {
  /** Extra env for the runtime child (default {}). */
  env?: Record<string, string>
  /** Milliseconds to wait for the ready line (default 60000). */
  readyTimeoutMs?: number
}

/** Boot the p2sdk runtime in mock mode and return a connected client. */
export async function launchRuntime(opts: LaunchOptions = {}): Promise<Runtime> {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-runtime-'))
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: {
      ...process.env,
      ...opts.env,
      P2SDK_PROVIDER: 'mock',
      P2SDK_HOME: home,
      P2SDK_PORT: '0',
      P2SDK_READY_TIMEOUT_MS: String(opts.readyTimeoutMs ?? 60_000),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => { output += c })

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 60_000)
  while (Date.now() < deadline) {
    if (/\[p2sdk\] ready http/.test(output)) break
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):\n${output}`)
    await new Promise((r) => setTimeout(r, 200))
  }

  const baseUrl = readFileSync(join(home, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(home, 'launch-token'), 'utf8').trim()
  const client = await connect({ baseUrl, token })

  return {
    home,
    baseUrl,
    token,
    client,
    child,
    release(gateId: string) {
      mkdirSync(join(home, 'gates'), { recursive: true })
      writeFileSync(join(home, 'gates', gateId), '')
    },
    async stop() {
      client.close()
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 10_000)
        child.on('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        if (child.exitCode !== null) {
          clearTimeout(timer)
          resolve()
        }
      })
    },
  }
}
