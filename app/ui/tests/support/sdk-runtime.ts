// 来源: app/sdk/tests/support/runtime.ts（launchRuntime/launchFakeRuntime 的精简复刻）。
// 为什么不直接 import：playwright 把 spec 链 CJS 化（app/ui 无 "type":"module"），该文件的
// import.meta 与 harness.ts 接口里的默认参数签名都过不了 esbuild；examples/lib/client.mjs 是
// .mjs，经 pathToFileURL 动态 import 走 node 原生 ESM，不经转译。
// launcher 逻辑（spawn 参数、ready 行轮询、stop 升级）保持与上游一致，改动只有：去 coverage
// 分支（playwright 下无 NODE_V8_COVERAGE）、writeScriptCalls 内联（原在 fake/harness.ts）。
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmkdir } from './tmp-sweep.ts'
import { sdkChildEnv, sdkDataDirEnv } from './sdk-env'

export interface SdkRuntime {
  home: string
  /** Operator-side credential handoff dir（launch-token/base-url）。 */
  handoff: string
  baseUrl: string
  token: string
  client: { call(method: string, args?: unknown): Promise<unknown>; close(): void }
  child: ChildProcess
  writeScriptCalls(sessionId: string, calls: object[]): void
  stop(): Promise<void>
}

const SDK_ROOT = join(__dirname, '..', '..', '..', 'sdk')

interface ClientModule {
  connect(opts: { baseUrl: string; token: string; interactions?: string }): Promise<{
    call(method: string, args?: unknown): Promise<unknown>
    close(): void
  }>
}

let clientMod: ClientModule | undefined
async function dshClient(): Promise<ClientModule> {
  if (clientMod === undefined) {
    clientMod = (await import(pathToFileURL(join(SDK_ROOT, 'examples', 'lib', 'client.mjs')).href)) as ClientModule
  }
  return clientMod
}

/** fake LLM overlay（来源：app/sdk/tests/support/fake/harness.ts overlayEnv 同款）。 */
export function fakeOverlayPath(): string {
  const dir = tmkdir('bot-ui-fake-patch-')
  const pluginUrl = pathToFileURL(join(SDK_ROOT, 'tests', 'support', 'fake', 'plugin.mjs')).href
  const overlay = join(dir, 'fake-llm.yml')
  writeFileSync(overlay, `\
- id: agent-default-model
  config:
    provider: p2fake
    model: p2fake
- insert:
    - id: p2sdk-fake-llm
      name: '${pluginUrl}'
      config:
        providers:
          - id: p2fake
            name: P2 Fake
            models:
              - id: p2fake
                contextWindow: 131072
`)
  return overlay
}

/** Boot the p2sdk runtime in mock mode and return a connected client（runtime.ts 同款流程）。 */
/** cwd：runtime 进程工作目录 = 未带 cwd 建的 session 的默认 cwd（产品 UI 建 bot 不带 cwd，U-21 起由临时目录承接，副作用不落仓内）。 */
/** home：复用上一运行期的 P2SDK_HOME（U-23 D10c1：删 bundle 后同 home 重启）；env：额外环境（市场目录源 URL 等）。 */
export async function launchSdkRuntime(opts: { patch: string; readyTimeoutMs?: number; cwd?: string; home?: string; dataDir?: string; env?: Record<string, string> } ): Promise<SdkRuntime> {
  // R9（REVIEW-P4终审）：凭证 key 在子进程 env 副本上剔除（sdkChildEnv），不再 delete worker 的
  // process.env —— workers:1 下那是全 spec 共享的，删了会饿死后跑的真模型旅程（顺序依赖失败）。
  const home = opts.home ?? tmkdir('p2sdk-runtime-')
  const handoff = tmkdir('p2sdk-handoff-')
  const child = spawn(process.execPath, [join(SDK_ROOT, 'scripts', 'start.mjs')], {
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    env: sdkChildEnv({
      P2SDK_PROVIDER: 'mock',
      P2SDK_HOME: home,
      P2SDK_HANDOFF: handoff,
      P2SDK_PORT: '0',
      P2SDK_PATCH: opts.patch,
      P2SDK_READY_TIMEOUT_MS: String(opts.readyTimeoutMs ?? 60_000),
      ...sdkDataDirEnv(opts.dataDir),
      ...opts.env,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { output += c })
  child.stderr!.on('data', (c: string) => { output += c })

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 60_000)
  for (;;) {
    if (/\[p2sdk\] ready http/.test(output)) break
    if (child.exitCode !== null) throw new Error(`runtime exited early (code ${child.exitCode}):\n${output}`)
    if (Date.now() >= deadline) throw new Error(`runtime not ready in ${opts.readyTimeoutMs ?? 60_000}ms:\n${output}`)
    await new Promise((r) => setTimeout(r, 200))
  }

  const baseUrl = readFileSync(join(handoff, 'base-url'), 'utf8').trim()
  const token = readFileSync(join(handoff, 'launch-token'), 'utf8').trim()
  const mod = await dshClient()
  // interactions=answer：$events/result 等作答调用要求（gateway 对 none 连接报 interactions-forbidden）
  const client = await mod.connect({ baseUrl, token, interactions: 'answer' })

  return {
    home,
    handoff,
    baseUrl,
    token,
    client,
    child,
    writeScriptCalls(sessionId: string, calls: object[]): void {
      const dir = join(home, 'fake', 'scripts')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls }))
    },
    async stop(): Promise<void> {
      client.close()
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 10_000)
        child.on('exit', () => { clearTimeout(timer); resolve() })
        if (child.exitCode !== null) { clearTimeout(timer); resolve() }
      })
    },
  }
}
