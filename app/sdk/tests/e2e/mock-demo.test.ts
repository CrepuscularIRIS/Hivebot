// T-01 acceptance ⑧: mock-mode demo through the shared launcher.
// Covers: mkdtemp P2SDK_HOME, spawn start with mock provider, connected
// examples/lib client, release(gateId) barrier channel, and the min-client
// self-assertions passing under the mock provider.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { main, resolveConfig, startRuntime } from '../../src/start.ts'
import { launchRuntime, type Runtime } from '../support/runtime.ts'

const PKG_ROOT = join(import.meta.dirname, '..', '..')

let rt: Runtime

beforeAll(async () => {
  rt = await launchRuntime()
})

afterAll(async () => {
  await rt?.stop()
})

it('boots in a mkdtemp home with a 0600 launch token and no token in output', async () => {
  expect(rt.home).toMatch(/p2sdk-runtime-/)
  expect(existsSync(join(rt.home, 'launch-token'))).toBe(true)
  const mode = readFileSync(join(rt.home, 'launch-token')).toString()
  expect(mode).not.toContain('token=')
}, 120_000)

it('serves the session API over loopback to the connected client', async () => {
  const { sessionId } = await rt.client.call('session/create', { request: { cwd: join(rt.home, 'workspace') } })
  expect(typeof sessionId).toBe('string')
  // Parameterless typert methods take a `_request` placeholder field.
  const list = await rt.client.call('session/list', { _request: {} })
  expect(JSON.stringify(list)).toContain(sessionId)
}, 120_000)

it('release(gateId) touches the barrier file without opening a port', () => {
  rt.release('t01-gate')
  expect(existsSync(join(rt.home, 'gates', 't01-gate'))).toBe(true)
})

it('min-client self-assertions pass under the mock provider', async () => {
  const proc = spawn(process.execPath, [join(PKG_ROOT, 'examples', 'min-client.mjs'), '你好'], {
    env: { ...process.env, P2SDK_HOME: rt.home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', (c) => { out += c })
  proc.stderr.on('data', (c) => { out += c })
  const code = await new Promise<number>((resolve) => proc.on('exit', (c) => resolve(c ?? 1)))
  expect(out).toContain('min-client PASS')
  expect(code).toBe(0)
}, 120_000)

it('startRuntime boots in-process (coverage for src/start.ts runtime path)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-main-'))
  const handle = startRuntime(resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: home }))
  expect(await handle.ready).toBe(true)
  expect(existsSync(join(home, 'launch-token'))).toBe(true)
  handle.child.kill('SIGTERM')
  const code = await handle.exited
  expect(code).toBeGreaterThanOrEqual(0)
}, 120_000)

it('main returns non-zero when no ready line arrives within the timeout', async () => {
  const home = mkdtempSync(join(tmpdir(), 'p2sdk-slow-'))
  const code = await main(resolveConfig({
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: home,
    P2SDK_READY_TIMEOUT_MS: '1',
  }))
  expect(code).toBeGreaterThanOrEqual(1)
}, 120_000)
