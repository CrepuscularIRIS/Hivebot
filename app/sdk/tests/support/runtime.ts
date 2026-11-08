// Shared test launcher (T-01 acceptance ⑧). Boots src/start.ts in mock
// provider mode against a fresh mkdtemp P2SDK_HOME, connects an
// examples/lib client, and exposes release(gateId): the cross-process
// barrier channel touches $P2SDK_HOME/gates/<gateId> and opens no port.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { tmkdir } from './tmp-sweep.ts'
import { TEST_HOMES_PARENT } from './sandbox-home.ts'
import { connect, type DshClient } from '../../examples/lib/client.mjs'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface Runtime {
  home: string
  /** Operator-side credential handoff dir (launch-token/base-url); never inside home (T-01.f3 R1). */
  handoff: string
  baseUrl: string
  token: string
  client: DshClient
  /** Barrier release: touch $P2SDK_HOME/gates/<gateId> (no port, no signal). */
  release(gateId: string): void
  child: ChildProcess
  /** Launcher stderr so far (P5-01 ⑨: WARN 行计数). */
  readStderr(): string
  stop(): Promise<void>
}

export interface LaunchOptions {
  /** Extra env for the runtime child (default {}). */
  env?: Record<string, string>
  /** Milliseconds to wait for the ready line (default 60000). */
  readyTimeoutMs?: number
}

/**
 * Env for spawning scripts/start.mjs (T-11 coverage split). vitest's
 * autoAttachSubprocess sets NODE_V8_COVERAGE in the worker; the launcher must
 * NOT inherit it (src/start.ts is measured by in-process unit tests in vite
 * coordinates — merging a raw subprocess entry for the same URL loses ranges),
 * so it is stripped and re-exposed as P2SDK_TEST_V8_COVERAGE, which
 * src/start.ts childEnv forwards to the dsh child: src/p2temp is then measured
 * entirely in raw subprocess coordinates (dsh + the p2temp unit runner alike).
 * Outside coverage runs the variable is unset and this is an identity copy.
 */
export function launcherSpawnEnv(): NodeJS.ProcessEnv {
  const v8 = process.env.NODE_V8_COVERAGE
  if (!v8) return { ...process.env }
  // NODE_V8_COVERAGE is force-inherited by node children even when `env` is
  // passed explicitly (node 22/24 verified); an empty string is the only opt-
  // out, so the launcher and lock-race children run with writing disabled and
  // the real dir travels under a P2SDK_ name for src/start.ts childEnv to
  // forward to the dsh child.
  return { ...process.env, NODE_V8_COVERAGE: '', P2SDK_TEST_V8_COVERAGE: v8 }
}

/** Boot the p2sdk runtime in mock mode and return a connected client. */
export async function launchRuntime(opts: LaunchOptions = {}): Promise<Runtime> {
  // P5-01: opts.env 可覆盖 P2SDK_HOME（沙箱用例把 DSH_HOME 放进测试树）；返回值与
  // 子进程 env 必须同源，fake 脚本目录（$DSH_HOME/fake）才找得到。
  const home = opts.env?.P2SDK_HOME ?? tmkdir('p2sdk-runtime-')
  // T34 回归播种：orchestration 进默认链后每个 bot 都过信封，envelope 对 bots.json
  // 缺失按 unknown→worker 拒（subagent/后台 bash 全没了）。生产无碍（main 先写骨架，
  // VERIFY-P6-14f4 已证），但不起 UI main 的 SDK 测试数据目录里没这个文件。规则：
  // 编排测试自管身份（P2SDK_ORCH_DATA_DIR 已设）→ 不播；目标目录不在 os.tmpdir() 下
  // → 不写（绝不碰真实 ~/.config/pbots-ui）；已存在 → 不覆盖。
  if (opts.env?.P2SDK_ORCH_DATA_DIR === undefined) {
    const dataRoot = opts.env?.PBOTS_DATA_DIR ?? join(opts.env?.HOME ?? process.env.HOME ?? '', '.config', 'pbots-ui')
    // T34 任务C：测试 HOME 根（决策 8）在仓内 .test-homes 而非 /tmp——一并认；
    // sep 防前缀误判（/tmpfoo ≠ /tmp 下）
    if ([tmpdir(), TEST_HOMES_PARENT].some((r) => dataRoot.startsWith(r + sep))) {
      const botsJson = join(dataRoot, 'bots.json')
      if (!existsSync(botsJson)) {
        mkdirSync(dataRoot, { recursive: true })
        writeFileSync(botsJson, JSON.stringify({ version: 1 }))
      }
    }
  }
  // T-01.f3 R1: credentials hand off through a separate random dir that never
  // enters the dsh child environment (start.ts drops P2SDK_HANDOFF there).
  const handoff = tmkdir('p2sdk-handoff-')
  const child = spawn(process.execPath, [join(PKG_ROOT, 'scripts', 'start.mjs')], {
    env: {
      ...launcherSpawnEnv(),
      P2SDK_PROVIDER: 'mock',
      P2SDK_HOME: home,
      P2SDK_HANDOFF: handoff,
      P2SDK_PORT: '0',
      P2SDK_READY_TIMEOUT_MS: String(opts.readyTimeoutMs ?? 60_000),
      // P5-01: opts.env 放最后——沙箱用例要覆盖 P2SDK_HOME（DSH_HOME 落进遮蔽/再遮清单）
      ...opts.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let stderr = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => { output += c; stderr += c })

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 60_000)
  while (Date.now() < deadline) {
    if (/\[p2sdk\] ready http/.test(output)) break
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):\n${output}`)
    await new Promise((r) => setTimeout(r, 200))
  }

  const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
  // T9a：ssh 模式下 dsh 加载 ssh 插件可能在 ready 输出后短暂不可用——连接重试
  let client: Awaited<ReturnType<typeof connect>>
  let lastErr: unknown
  for (let i = 0; i < 30; i++) {
    try { client = await connect({ baseUrl, token }); break } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 500)) }
  }
  // T9b3 ②d：dsh 在 ready 后被 guard fail-closed（exit 86）时，错误须带 stderr
  // 尾部（固定串透传给断言/排错）。
  if (client === undefined) throw new Error(`runtime connect failed after 15s retry: ${String(lastErr)}
stderr tail:
${stderr.slice(-600)}`)

  return {
    home,
    handoff,
    baseUrl,
    token,
    client,
    child,
    readStderr() {
      return stderr
    },
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
