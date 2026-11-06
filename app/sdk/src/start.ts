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
import { tmpdir, userInfo } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { remoteRoots, computeRoots } from './policy/never-roots.mjs'

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
  /** Launcher $HOME — the mask list source for the sandbox wrapper (P5-01 决策 4). */
  envHome: string | undefined
  /** Mask roots derived from PBOTS_DATA_DIR, or the default userData layout when unset (P5-01 决策 15). */
  dataDirs: string[]
  /** True when PBOTS_DATA_DIR was set (main() emits the 1-line WARN otherwise). */
  dataDirExplicit: boolean
  /** Extra mask roots from P2SDK_SANDBOX_MASK (launcher-only, decision 15). */
  extraMaskRoots: string[]
  /** T9a：ssh 模式五件套（全给=ssh 模式；全空=本机模式不变）。P2SDK_SSH_NODE=远端 node 绝对路径。 */
  ssh?: { host: string; remoteRoot: string; helper: string; helperHash: string; node: string; remoteHome?: string }
  /** T9a：P2SDK_SSH_* 给了但不齐（resolveConfig 时记录；validateStart 消费后不再用）。 */
  sshMissing?: string[]
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
    envHome: env.HOME || undefined,
    // P5-01 决策 15: the SDK launcher reads the SAME PBOTS_DATA_DIR the UI main
    // uses (main/index.ts), so both sides converge on one data root without any
    // env handoff. Unset → the default userData layout ($HOME/.config/pbots-ui
    // and <passwd home>/.config/pbots-ui — app/ui package name `pbots-ui`, no
    // setPath/productName) plus exactly one WARN line, not a failure.
    dataDirs: env.PBOTS_DATA_DIR
      ? [env.PBOTS_DATA_DIR]
      : [...new Set([env.HOME, userInfo().homedir].filter(Boolean).map((h) => join(h, '.config', 'pbots-ui')))],
    dataDirExplicit: Boolean(env.PBOTS_DATA_DIR),
    extraMaskRoots: (env.P2SDK_SANDBOX_MASK ?? '').split(':').filter(Boolean),
    ssh: readSshConfig(env),
    sshMissing: sshMissingKeys(env),
  }
}

/** T9a：五个全给=ssh 模式；全空=undefined（本机模式）；给了但不齐=配置错误（validateStart 拒）。 */
function readSshConfig(env: NodeJS.ProcessEnv): StartConfig['ssh'] {
  const keys = ['P2SDK_SSH_HOST', 'P2SDK_SSH_REMOTE_ROOT', 'P2SDK_SSH_HELPER', 'P2SDK_SSH_HELPER_HASH', 'P2SDK_SSH_NODE'] as const
  const vals = keys.map((k) => env[k])
  const given = vals.filter((v) => v !== undefined && v !== '').length
  if (given === 0) return undefined
  if (given !== keys.length) return undefined // 不齐——sshMissingKeys 单独记
  // T9b（D2/D13）：remoteHome 可选——缺省=不做远端凭证根（远端围栏兜底）。
  const remoteHome = env.P2SDK_SSH_REMOTE_HOME !== undefined && env.P2SDK_SSH_REMOTE_HOME !== '' ? env.P2SDK_SSH_REMOTE_HOME : undefined
  return { host: vals[0]!, remoteRoot: vals[1]!, helper: vals[2]!, helperHash: vals[3]!, node: vals[4]!, remoteHome }
}

/** T9a：给了但不齐 → 返回缺的变量名（调用点拼完整报错）。 */
export function sshMissingKeys(env: NodeJS.ProcessEnv): string[] {
  const keys = ['P2SDK_SSH_HOST', 'P2SDK_SSH_REMOTE_ROOT', 'P2SDK_SSH_HELPER', 'P2SDK_SSH_HELPER_HASH', 'P2SDK_SSH_NODE']
  const given = keys.filter((k) => env[k] !== undefined && env[k] !== '')
  if (given.length === 0 || given.length === keys.length) return []
  return keys.filter((k) => !given.includes(k))
}

/** Pre-flight validation; a non-null string is the user-facing error. */
export function validateStart(cfg: StartConfig): string | null {
  if (cfg.provider === 'real' && !cfg.apiKey) {
    return 'P2SDK_LLM_API_KEY is not set: the real provider requires it. Export P2SDK_LLM_API_KEY, or run with P2SDK_PROVIDER=mock.'
  }
  for (const p of cfg.extraPatches) {
    if (!isAbsolute(p)) return `extra patch path must be absolute (got "${p}"); set P2SDK_PATCH to absolute paths`
  }
  // P5-01 决策 15: same absolute-path rule as P2SDK_PATCH (start.ts:75).
  for (const d of cfg.dataDirs) {
    if (!isAbsolute(d)) return `PBOTS_DATA_DIR must be an absolute path (got "${d}")`
  }
  for (const m of cfg.extraMaskRoots) {
    if (!isAbsolute(m)) return `P2SDK_SANDBOX_MASK must be absolute colon-separated paths (got "${m}")`
  }
  // T9a：ssh 五件套给了但不齐 → fail loud（半配置是最危险的静默回落）
  const missing = cfg.sshMissing ?? []
  if (missing.length > 0) {
    return `P2SDK_SSH_* is partially set: missing ${missing.join(', ')}. Set all five for ssh mode, or none for local mode.`
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
    // P5-58：market.yml（plugin-market + p2temp）同样进默认链——生产启动开箱
    // 即有 pluginMarket/* 与 p2temp/session.createWithConnectors（UI M1 白名单
    // 两者都在，缺这个 patch 时它们 404）。目录源仍由 P2SDK_MARKET_INDEXES 配；
    // 缺省空目录 = 诚实空态（不是桩）。测试再显式链 market.yml 时同 id insert
    // 行整行替换，无副作用（market-source.yml 同款语义）。
    '--patch', join(PKG_ROOT, 'profile', 'patches', 'market.yml'),
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
  // L-7 O1: the sandbox-behavior test vars (drop --disable-host-loopback, swap the
  // verified slirp4netns binary) must not leak from a production launcher env
  // (residue after manual debugging / inherited launch scripts). They are honored
  // only behind the explicit P2SDK_TEST_SANDBOX=1 opt-in, set by the e2e harness.
  const testSandbox = env.P2SDK_TEST_SANDBOX === '1'
  const testOnlySandboxVars = new Set(['P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD', 'P2SDK_TEST_SLIRP_BIN'])
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue
    const keep = name === 'PATH' || name === 'HOME' || name.startsWith('P2SDK_') || name.startsWith('DSH_')
    // P2SDK_HANDOFF and P2SDK_TEST_V8_COVERAGE are consumed by the launcher
    // (credential dir / T-11 coverage dir) and never passed on to the sandbox;
    // P2SDK_HOME is dropped too (T-12 R1 — see above); PBOTS_DATA_DIR and
    // P2SDK_SANDBOX_MASK are launcher-only (P5-01 决策 15: mask roots never
    // enter the model-side env — bash must not learn the data layout).
    if (
      keep &&
      name !== 'P2SDK_HANDOFF' && name !== 'P2SDK_TEST_V8_COVERAGE' && name !== 'P2SDK_HOME' &&
      name !== 'PBOTS_DATA_DIR' && name !== 'P2SDK_SANDBOX_MASK' &&
      (testSandbox || !testOnlySandboxVars.has(name))
    ) child[name] = value
  }
  child.DSH_HOME = cfg.home
  // T6（L4-b）：agents 根无条件收进运行时 home——dsh-home-paths 在 $DSH_AGENTS_HOME 未设时
  // 取 homedir()/.agents，会把真实/测试 HOME 的 ~/.agents（skill-filesystem 与
  // agent-instructions 两个消费者、所有 preset 共扫）泄给每个 bot；覆盖父进程同名变量。
  child.DSH_AGENTS_HOME = join(cfg.home, 'agents')
  child.P2SDK_PROVIDER = cfg.provider
  child.P2SDK_LLM_MODEL = cfg.model
  child.P2SDK_LLM_API_BASE = normalizeApiBase(cfg.llmBaseUrl)
  child.DSH_TELEMETRY_MODE = env.DSH_TELEMETRY_MODE ?? 'DISABLED'
  // T9a：launcher-only 变量不进 dsh 子进程（照 PBOTS_DATA_DIR 的做法）；
  // ssh 模式标记（T9b containment 读它；本单只设不读）
  // T9ae（审查 C4）：继承来的 MODE 也先删，下一行按 cfg.ssh 重设——本机 bot 不因
  // launcher 环境残留的 MODE 被 approval.yml 条件禁用误伤 workflow
  const sshKeys = ['P2SDK_SSH_HOST', 'P2SDK_SSH_REMOTE_ROOT', 'P2SDK_SSH_HELPER', 'P2SDK_SSH_HELPER_HASH', 'P2SDK_SSH_NODE', 'P2SDK_SSH_REMOTE_HOME', 'P2SDK_SSH_MODE']
  for (const k of sshKeys) delete child[k]
  if (cfg.ssh !== undefined) child.P2SDK_SSH_MODE = '1'
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

/** One single-quoted YAML scalar (' doubled — paths from the local fs). */
const yamlScalar = (s: string): string => `'${s.replaceAll("'", "''")}'`

/**
 * P5-01 决策 4: the `id: sandbox` row pointing the dsh sandbox provider at
 * app/sdk/sandbox/bwrap-wrap.py. The wrapper receives the mask/mount-back lists
 * as argv (all runtime values from computeRoots — one list, two consumers: the
 * wrapper here and the guard rows P5-02 adds). runnerFailureSignatures makes
 * every `bwrap: `-prefixed wrapper error a classified runner failure.
 */
function sandboxRow(cfg: StartConfig): string {
  const roots = computeRoots({
    envHome: cfg.envHome,
    home: cfg.home,
    handoff: cfg.handoff,
    dataDirs: cfg.dataDirs,
    extraMaskRoots: cfg.extraMaskRoots,
    pkgRoot: PKG_ROOT,
  })
  // P5-22（D-1 ⑤）：联网许可根（数据根下，整棵已在 maskRoots 内被 wrapper
  // --tmpfs 遮蔽、guard 软遮蔽兜底——bash test -e 退出码 1）与 slirp4netns
  // 静态二进制（sandbox/bin/README.md 记来源与 sha256）。wrapper 命中许可才走
  // supervisor；目录缺失 = 无许可 = 断网路径，不预创建。
  const argv = [
    '/usr/bin/python3', '-I', join(PKG_ROOT, 'sandbox', 'bwrap-wrap.py'),
    ...roots.homes.flatMap((p) => ['--home', p]),
    ...roots.maskRoots.flatMap((p) => ['--mask', p]),
    ...roots.neverRoots.flatMap((p) => ['--never', p]),
    ...roots.toolchainDirs.flatMap((p) => ['--tool', p]),
    ...roots.policyRoots.flatMap((p) => ['--policy', p]),
    '--permit-root', join(cfg.dataDirs[0] ?? cfg.home, 'network-permits'),
    '--slirp', join(PKG_ROOT, 'sandbox', 'bin', 'slirp4netns'),
  ]
  return `\
- id: sandbox
  config:
    runnerCommand: [${argv.map(yamlScalar).join(', ')}]
    runnerFailureSignatures: ['bwrap: ']
`
}

/**
 * P5-02 决策 6/13: the guard row feeding src/policy/guard.mjs (mounted by
 * approval.yml; guard pins itself OUTERMOST in the pre-execute waterfall via
 * ctx.on(…, true) — P5-04.f1 proved insert order unreliable, see guard.mjs).
 * The whole roots list comes from computeRoots (one source,
 * two consumers: wrapper argv here via sandboxRow, guard config here); the
 * row only overrides config, so a missing guard row leaves the approval.yml
 * insert row without roots → guard.mjs fails loud at load (决策 6).
 */
function guardRow(cfg: StartConfig): string {
  const roots = computeRoots({
    envHome: cfg.envHome,
    home: cfg.home,
    handoff: cfg.handoff,
    dataDirs: cfg.dataDirs,
    extraMaskRoots: cfg.extraMaskRoots,
    pkgRoot: PKG_ROOT,
  })
  const g = mergedGuardRoots(cfg, roots)
  const homes = mergedHomes(cfg, roots)
  const list = (xs: readonly string[]): string => (xs.length === 0 ? ' []' : `\n${xs.flatMap((p) => [`        - ${yamlScalar(p)}`]).join('\n')}`)
  return `\
- id: p2sdk-fs-guard
  config:
${cfg.ssh?.remoteHome !== undefined && cfg.ssh.remoteHome.length > 0 ? `    remoteHome: ${yamlScalar(cfg.ssh.remoteHome)}
` : ''}    roots:
      hardRoots:${list(g.hardRoots)}
      dataMaskRoots:${list(g.dataMaskRoots)}
      homes:${list(homes)}
      toolchainDirs:${list(roots.toolchainDirs)}
      policyRoots:${list(roots.policyRoots)}${
        cfg.ssh !== undefined
          ? `\n    extraNeverTools:\n      - glob\n      - grep`
          : ''
      }
`
}

/**
 * P6-25.f1：禁用 stock fs-sandbox，插入继承它的执行期区域后端。
 * Loader patch 的 name 仅用于匹配，不会替换插件名，故必须 disable + insert。
 * neverRoots 与 guardRow 同取 computeRoots.guardRoots.hardRoots。
 * file URL 让 $DSH_HOME 下的 Loader 能定位本仓插件。
 */
function fsSandboxRow(cfg: StartConfig): string {
  const roots = computeRoots({
    envHome: cfg.envHome,
    home: cfg.home,
    handoff: cfg.handoff,
    dataDirs: cfg.dataDirs,
    extraMaskRoots: cfg.extraMaskRoots,
    pkgRoot: PKG_ROOT,
  })
  const list = (xs: readonly string[]): string => (xs.length === 0 ? ' []' : `\n${xs.flatMap((p) => [`        - ${yamlScalar(p)}`]).join('\n')}`)
  return `\
- id: fs-sandbox
  disabled: true
- insert:
    - id: p2sdk-fs-zone
      name: ${yamlScalar(fileUrl(join(PKG_ROOT, 'src', 'policy', 'fs-zone.mjs')))}
      config:
        neverRoots:${list(roots.guardRoots.hardRoots)}
`
}

/**
 * P5-21（决策 16a）：p2sdk-shell-ask 行的运行时 config。loader 对同 id 行整键
 * 替换 config（cordis-plugin-include applyEntryPatches），approval.yml 的 insert
 * 行不带 config，运行时值全在这里：handoff（launch-token 所在；插件算
 * sha256(launch-token) 得本实例 id——main 连上后把同一个 sha256 写进它自己数据
 * 目录的 policy-state.instance，P5-29）与 policyStatePaths（从数据根推导，
 * PBOTS_DATA_DIR 或缺省布局，决策 15 同源——不设独立 env，路径两侧同源可机械
 * 证明）。档位表本身在 profile/tiers.json（静态数据，插件自读），不经此行。
 * L-7 O5：permitDir 与 requestNetRow 同一推导（shell-ask 用它免去 request_network
 * 批准后同命令 bash 的重复出卡），两侧可机械对证。
 */
function shellAskRow(cfg: StartConfig): string {
  const list = (xs: readonly string[]): string => (xs.length === 0 ? ' []' : `\n${xs.flatMap((p) => [`        - ${yamlScalar(p)}`]).join('\n')}`)
  return `\
- id: p2sdk-shell-ask
  config:
    handoff: ${yamlScalar(cfg.handoff)}
    permitDir: ${yamlScalar(join(cfg.dataDirs[0] ?? cfg.home, 'network-permits'))}
    policyStatePaths:${list(cfg.dataDirs.map((d) => join(d, 'policy-state.json')))}
`
}

/**
 * P5-22（D-1 定稿 ⑤）：p2sdk-request-net 行的运行时 config（同 id 整键替换，
 * approval.yml 的 insert 行不带 config）。permitDir 与 sandboxRow 的
 * --permit-root 同源于 dataDirs[0]（单一推导，两侧可机械对证）；ttlMs 生产
 * 恒 60000（D1-r1 TTL≈60s），仅测试经 P2SDK_TEST_NET_TTL_MS 注入短值——
 * launcher-only 名字，childEnv 只透传 P2SDK_* 前缀，本行在 launcher 侧消费。
 */
function requestNetRow(cfg: StartConfig): string {
  const ttl = Number(process.env.P2SDK_TEST_NET_TTL_MS) > 0 ? Number(process.env.P2SDK_TEST_NET_TTL_MS) : 60_000
  return `\
- id: p2sdk-request-net
  config:
    permitDir: ${yamlScalar(join(cfg.dataDirs[0] ?? cfg.home, 'network-permits'))}
    ttlMs: ${ttl}
`
}

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
      name: ${yamlScalar(fileUrl(join(PKG_ROOT, 'node_modules', '@deepseek-ai', 'dsh-llm-replay', 'lib', 'index.js')))}
      config:
        file: /p2sdk/unused-session-fixture.jsonl
        overrideFile: ${yamlScalar(join(cfg.home, 'replay-override.json'))}
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
      name: ${yamlScalar(fileUrl(join(PKG_ROOT, 'profile', 'plugins', 'handoff.mjs')))}
      config:
        dir: ${yamlScalar(cfg.handoff)}
`)
  if (cfg.ssh === undefined) {
    // 本机模式：行为与改前逐字相同（T9a 验收 2-② 钉住）
    rows.push(sandboxRow(cfg))
    rows.push(fsSandboxRow(cfg))
    rows.push(guardRow(cfg))
  } else {
    // T9a ssh 模式：禁本机 wrapper 行与 fs-zone（T9b 插 fs-zone-ssh）
    rows.push(guardRow(cfg))
    rows.push(sshRows(cfg))
  }
  rows.push(shellAskRow(cfg))
  rows.push(requestNetRow(cfg))
  writeFileSync(path, rows.join(''))
  return path
}

/** T9b3（D2）：ssh 模式给了 remoteHome → guard 管远端凭证根（hardRoots 并
 * remoteRoots 非通配凭证项；一个清单多个消费者——guardRow 与 fs-zone-ssh 行
 * 都取 mergedGuardRoots）。 */
function mergedGuardRoots(cfg: StartConfig, roots: ReturnType<typeof computeRoots>) {
  if (cfg.ssh?.remoteHome === undefined || cfg.ssh.remoteHome.length === 0) return roots.guardRoots
  const remote = remoteRoots(cfg.ssh.remoteHome, undefined)
  return { hardRoots: [...roots.guardRoots.hardRoots, ...remote.hardRoots], dataMaskRoots: roots.guardRoots.dataMaskRoots }
}

/** remoteHome 进 homes 软遮蔽（整棵遮、例外=会话 cwd 子树，guard.mjs:13-15 同款）。 */
function mergedHomes(cfg: StartConfig, roots: ReturnType<typeof computeRoots>): string[] {
  if (cfg.ssh?.remoteHome === undefined || cfg.ssh.remoteHome.length === 0) return roots.homes
  return [...roots.homes, cfg.ssh.remoteHome]
}

/**
 * T9a（L8-d）：ssh 组合骨架（DESIGN-ssh-composition.md D13）。凭证（私钥、known_hosts）
 * 不进任何生成行——只有 OpenSSH 别名；远端路径由 dsh 侧 OpenSSH 配置解析。
 * PTC 全族禁 base `ptc-runtime` 断嵌套依赖（D8）；sandbox-policy 只覆盖回落 workspaceRoot（D5）。
 */
/**
 * T9b/T9b3（D2）：fs-zone-ssh 行的 NEVER 根——与 guard hardRoots 同一份（merged
 * guardRoots：宿主根 ∪ 远端非通配凭证项；远端=本机时宿主根即远端可达根）。
 */
function sshNeverList(cfg: StartConfig, roots: ReturnType<typeof computeRoots>): string {
  return mergedGuardRoots(cfg, roots).hardRoots.map((r) => `\n          - ${yamlScalar(r)}`).join('')
}

function sshRows(cfg: StartConfig): string {
  const ssh = cfg.ssh!
  const lib = (name: string): string => fileUrl(join(PKG_ROOT, 'node_modules', '@deepseek-ai', name, 'lib', 'index.js'))
  return `\
- id: fs-sandbox
  disabled: true
- id: subprocess
  disabled: true
- id: sandbox
  disabled: true
- id: session-title-llm
  disabled: true
- id: workflow-ptc
  disabled: true
- id: tool-workflow
  disabled: true
- id: tool-executor-ptc
  disabled: true
- insert:
    - id: ssh
      name: ${yamlScalar(lib('dsh-ssh'))}
      config:
        host: ${yamlScalar(ssh.host)}
        launch: { kind: node-script, node: ${yamlScalar(ssh.node)} }
        helper: ${yamlScalar(ssh.helper)}
        helperHash: ${yamlScalar(ssh.helperHash)}
        workspace: ${yamlScalar(ssh.remoteRoot)}
    - id: p2sdk-fs-zone-ssh
      name: ${yamlScalar(fileUrl(join(PKG_ROOT, 'src', 'policy', 'fs-zone-ssh.mjs')))}
      config:
        neverRoots:${ssh.remoteHome === undefined
    ? ' []'
    : // 与 guard 同一份（T9b3）；roots 由 writeRuntimePatch 算好传入——这里重算成本可忽略（纯函数+小清单）
      sshNeverList(cfg, computeRoots({
        envHome: cfg.envHome, home: cfg.home, handoff: cfg.handoff,
        dataDirs: cfg.dataDirs, extraMaskRoots: cfg.extraMaskRoots, pkgRoot: PKG_ROOT,
      }))}
    - id: fs-ssh
      name: ${yamlScalar(lib('dsh-fs-ssh'))}
      disabled: true
    - id: subprocess-ssh
      name: ${yamlScalar(lib('dsh-subprocess-ssh'))}
    - id: sandbox-ssh
      name: ${yamlScalar(lib('dsh-sandbox-ssh'))}
- id: sandbox-policy
  config:
    workspaceRoot: ${yamlScalar(ssh.remoteRoot)}
`
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
 * force-exiting on a duplicate signal. P5-02: stderr is piped (not inherited)
 * so the launcher can watch the guard activation-failure signature dsh prints
 * there (`dsh: warning: N entry did not activate` + plugin Error) — every
 * byte is still forwarded to the launcher's own stderr.
 */
export function dshSpawnOptions(cfg: StartConfig): {
  env: NodeJS.ProcessEnv
  stdio: ['ignore', 'pipe', 'pipe']
  detached: boolean
} {
  return { env: childEnv(cfg, process.env), stdio: ['ignore', 'pipe', 'pipe'], detached: true }
}

export interface RuntimeHandle {
  child: import('node:child_process').ChildProcess
  /** Resolves true once the token-free ready line arrived, false on timeout/early exit. */
  ready: Promise<boolean>
  /** Resolves with the child's exit code. */
  exited: Promise<number>
  /** P5-02 决策 6: guard 激活失败签名（stdout 逐块匹配），未见为 null。 */
  guardFailed(): string | null
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
  let guardFailure: string | null = null
  const watchGuardFailure = (chunk: string): void => {
    if (guardFailure !== null) return
    // P5-02 决策 6: cordis 把插件激活失败记成 `dsh: warning: N entry did not
    // activate` 后继续跑 —— guard 行缺失/不合法（后置 overlay 覆盖 config）会
    // 静默退回无文件工具 NEVER 的 stock 行为。launcher 监测 dsh stderr 上的
    // 激活失败签名（插件名 + Error 行），main() 在 ready 后的短窗口内查到即终止。
    const m = /^(p2sdk-fs-guard \([^)]*\): Error: .+)$/m.exec(chunk)
    if (m) guardFailure = m[1]
  }
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
  child.stderr!.setEncoding('utf8')
  child.stderr!.on('data', (chunk: string) => {
    process.stderr.write(chunk)
    watchGuardFailure(chunk)
  })
  const timer = setTimeout(() => {
    if (!announced) readyResolve(false)
  }, cfg.readyTimeoutMs)
  const exited = new Promise<number>((resolveExit) => child.on('exit', (code) => resolveExit(code ?? 1)))
  child.on('exit', () => {
    clearTimeout(timer)
    if (!announced) readyResolve(false)
  })
  return {
    child,
    ready,
    exited,
    /** P5-02 决策 6: the guard activation-failure line seen on stdout, or null. */
    guardFailed(): string | null { return guardFailure },
  }
}

/** Entry point: returns the process exit code. */
export async function main(cfg: StartConfig = resolveConfig()): Promise<number> {
  const err = validateStart(cfg)
  if (err) {
    process.stderr.write(`p2sdk: ${err}\n`)
    return 1
  }
  // P5-01 决策 15: exactly one WARN line when PBOTS_DATA_DIR is unset — the
  // default userData layout is assumed, boot continues (NOT fail-closed).
  if (!cfg.dataDirExplicit) {
    process.stderr.write(`WARN p2sdk: PBOTS_DATA_DIR unset, assuming ${cfg.dataDirs.join(':')}\n`)
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
  // P5-02 决策 6（验收 ⑨）：dsh 把插件激活失败记成 warning 继续跑，guard 行
  // 缺失/不合法时会静默退回无 NEVER 的 stock 行为 —— launcher 在 ready 后的短
  // 窗口内监测激活失败签名（实测紧跟 ready 行到达），见到即终止并报原因。
  const guardDeadline = Date.now() + 3000
  while (Date.now() < guardDeadline && handle.guardFailed() === null && handle.child.exitCode === null) {
    await new Promise((r) => setTimeout(r, 100))
  }
  const guardFail = handle.guardFailed()
  if (guardFail !== null) {
    process.stderr.write(`p2sdk: guard plugin failed to activate; not serving: ${guardFail}\n`)
    forward('SIGTERM')
    return (await handle.exited) || 1
  }
  return await handle.exited
}
