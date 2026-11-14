import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createStdoutGate,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_MODEL,
  buildArgs,
  childEnv,
  isReadyLine,
  main,
  mockReplayOverride,
  normalizeApiBase,
  resolveConfig as resolveConfigRaw,
  seedDefaultRoute,
  validateStart,
  writeRuntimePatch,
} from '../../src/start.ts'
import { tmkdir, trackTmpDir } from '../support/tmp-sweep.ts'

// P5-H1：resolveConfig 不带 P2SDK_HANDOFF 时兜底会急切 mkdtemp 一个 handoff
// （本文件单测故意覆盖该兜底，每次调用漏一个）；在 import 边界登记，文件末清扫。
type StartConfig = ReturnType<typeof resolveConfigRaw>
const resolveConfig = (env: NodeJS.ProcessEnv): StartConfig => {
  const cfg = resolveConfigRaw(env)
  if (!env.P2SDK_HANDOFF) trackTmpDir(cfg.handoff)
  return cfg
}

describe('resolveConfig', () => {
  it('applies the documented defaults for an empty env', () => {
    const cfg = resolveConfig({})
    expect(cfg.provider).toBe('real')
    expect(cfg.apiKey).toBeUndefined()
    expect(cfg.llmBaseUrl).toBe(DEFAULT_LLM_BASE_URL)
    expect(cfg.model).toBe(DEFAULT_MODEL)
    expect(cfg.port).toBe(0)
    expect(cfg.extraPatches).toEqual([])
  })

  it('reads every P2SDK_* variable', () => {
    const cfg = resolveConfig({
      P2SDK_PROVIDER: 'mock',
      P2SDK_LLM_API_KEY: 'sk-test',
      P2SDK_LLM_BASE_URL: 'http://10.0.0.2:4001/',
      P2SDK_LLM_MODEL: 'glm-5.3',
      P2SDK_HOME: '/tmp/p2-home',
      P2SDK_PORT: '4599',
      P2SDK_PATCH: '/tmp/a.yml:/tmp/b.yml',
    })
    expect(cfg.provider).toBe('mock')
    expect(cfg.apiKey).toBe('sk-test')
    expect(cfg.llmBaseUrl).toBe('http://10.0.0.2:4001/')
    expect(cfg.model).toBe('glm-5.3')
    expect(cfg.home).toBe('/tmp/p2-home')
    expect(cfg.port).toBe(4599)
    expect(cfg.extraPatches).toEqual(['/tmp/a.yml', '/tmp/b.yml'])
  })

  it('treats a blank API key as missing', () => {
    expect(resolveConfig({ P2SDK_LLM_API_KEY: '   ' }).apiKey).toBeUndefined()
  })

  // T-12 (REVIEW R1 critical): the default handoff dir holds the launch token,
  // so it must be a fresh random tmpdir — never the deterministic sibling of
  // the default home (<pkg>/.dsh-handoff), which a model-side shell could
  // derive from P2SDK_HOME or find under a known root.
  it('defaults the handoff dir to a fresh random tmpdir, not a deterministic path', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock' })
    expect(cfg.handoff.startsWith(tmpdir()), `handoff under tmpdir (got ${cfg.handoff})`).toBe(true)
    expect(existsSync(cfg.handoff), 'the default handoff dir exists').toBe(true)
    expect(cfg.handoff, 'per-launch random segment').not.toBe(resolveConfig({ P2SDK_PROVIDER: 'mock' }).handoff)
    expect(cfg.handoff, 'not the legacy fixed default').not.toContain('.dsh-handoff')
  })

  // T-13 (REVIEW R9): two instances started with different P2SDK_HOME and no
  // P2SDK_HANDOFF must not share a handoff dir — the per-launch random tmpdir
  // keeps their launch-token/base-url files from clobbering each other.
  it('gives concurrent instances on different homes distinct handoff dirs (no cross-home clobber)', () => {
    const a = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/p2sdk-home-a' })
    const b = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/p2sdk-home-b' })
    expect(a.home).not.toBe(b.home)
    expect(a.handoff).not.toBe(b.handoff)
    expect(a.handoff, 'handoff is not derived from the home').not.toContain('p2sdk-home-a')
    expect(b.handoff, 'handoff is not derived from the home').not.toContain('p2sdk-home-b')
    for (const h of [a.handoff, b.handoff]) {
      expect(h.startsWith(tmpdir()), `handoff under tmpdir (got ${h})`).toBe(true)
      expect(existsSync(h), 'each default handoff dir exists').toBe(true)
    }
  })
})

describe('validateStart (acceptance ③)', () => {
  it('T50a 反转：real provider without key no longer blocks boot（请求时才报 MISSING_CREDENTIAL）', () => {
    expect(validateStart(resolveConfig({}))).toBeNull()
  })

  it('mock provider does not require the key', () => {
    expect(validateStart(resolveConfig({ P2SDK_PROVIDER: 'mock' }))).toBeNull()
  })

  it('real provider with the key passes', () => {
    expect(validateStart(resolveConfig({ P2SDK_LLM_API_KEY: 'sk-x' }))).toBeNull()
  })

  it('rejects relative extra patch paths', () => {
    const err = validateStart(resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_PATCH: 'rel.yml' }))
    expect(err).toContain('absolute')
  })
})

describe('normalizeApiBase', () => {
  it('appends /v1 to a bare LiteLLM root', () => {
    expect(normalizeApiBase('http://127.0.0.1:4001')).toBe('http://127.0.0.1:4001/v1')
  })

  it('keeps a root that already ends with /v1 and strips trailing slashes', () => {
    expect(normalizeApiBase('http://127.0.0.1:4001/v1/')).toBe('http://127.0.0.1:4001/v1')
  })
})

describe('buildArgs', () => {
  it('boots the web profile with the static, approval, market, and runtime patches, then extras', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_PORT: '4599', P2SDK_PATCH: '/tmp/x.yml' })
    const args = buildArgs(cfg, '/tmp/h/runtime-patch.yml')
    expect(args[0]).toBe('web')
    expect(args).toContain('--no-open')
    expect(args).toContain('--port')
    expect(args[args.indexOf('--port') + 1]).toBe('4599')
    const patches = args.filter((_, i) => args[i - 1] === '--patch')
    expect(patches[0].endsWith('profile/patches/p2sdk.yml')).toBe(true)
    expect(patches, 'p2sdk.yml + approval.yml + market.yml + awareness.yml + orchestration.yml + runtime patch + extras').toHaveLength(7)
    expect(patches[5]).toBe('/tmp/h/runtime-patch.yml')
    expect(patches[6]).toBe('/tmp/x.yml')
  })

  // T-12 (REVIEW R3/R5/R13): the shell-ask approval policy ships in the
  // DEFAULT boot chain — `pnpm start` with no P2SDK_PATCH must ask on every
  // ordinary bash call (CLAUDE.md 安全反例: openclaw exec 默认不审批).
  it('mounts profile/patches/approval.yml by default between the static and runtime patches', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_PATCH: '/tmp/x.yml' })
    const patches = buildArgs(cfg, '/tmp/h/runtime-patch.yml').filter((_, i, a) => a[i - 1] === '--patch')
    expect(patches[1].endsWith(join('profile', 'patches', 'approval.yml')), `second patch is approval.yml (got ${patches[1]})`).toBe(true)
    expect(patches, 'p2sdk.yml, approval.yml, market.yml, awareness.yml, orchestration.yml, runtime patch, extras').toHaveLength(7)
  })

  // P5-58：market.yml（plugin-market + p2temp 两个 insert 行）进默认链——生产启动
  // pluginMarket/* 与 p2temp/session.createWithConnectors 开箱可用（UI M1 白名单
  // 两者都在）；目录源仍由 P2SDK_MARKET_INDEXES 配，缺省空目录 = 诚实空态。
  it('mounts profile/patches/market.yml by default after approval.yml', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock' })
    const patches = buildArgs(cfg, '/tmp/h/runtime-patch.yml').filter((_, i, a) => a[i - 1] === '--patch')
    expect(patches[2].endsWith(join('profile', 'patches', 'market.yml')), `third patch is market.yml (got ${patches[2]})`).toBe(true)
  })

  // T33：awareness.yml（产品认知提示段）进默认链，位置在 market.yml 之后、runtime patch 之前。
  it('mounts profile/patches/awareness.yml by default after market.yml and before the runtime patch', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock' })
    const patches = buildArgs(cfg, '/tmp/h/runtime-patch.yml').filter((_, i, a) => a[i - 1] === '--patch')
    expect(patches[3].endsWith(join('profile', 'patches', 'awareness.yml')), `fourth patch is awareness.yml (got ${patches[3]})`).toBe(true)
    expect(patches[5], 'runtime patch comes after orchestration.yml').toBe('/tmp/h/runtime-patch.yml')
  })

  // T34：orchestration.yml（编排开闸）进默认链——awareness 之后、runtime patch 之前；patch 总数 7。
  it('mounts profile/patches/orchestration.yml by default after awareness.yml and before the runtime patch', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock' })
    const patches = buildArgs(cfg, '/tmp/h/runtime-patch.yml').filter((_, i, a) => a[i - 1] === '--patch')
    expect(patches, '无 extras 场景恰 6：p2sdk/approval/market/awareness/orchestration/runtime').toHaveLength(6)
    expect(patches[4].endsWith(join('profile', 'patches', 'orchestration.yml')), `fifth patch is orchestration.yml (got ${patches[4]})`).toBe(true)
    expect(patches[5], 'runtime patch comes after orchestration.yml').toBe('/tmp/h/runtime-patch.yml')
  })

  // T34 childEnv：数据根以 DSH_PBOTS_DATA_DIR 注入（P2SDK_* 不被上游擦除会泄路径——决策 15）。
  it('childEnv injects DSH_PBOTS_DATA_DIR from PBOTS_DATA_DIR without leaking P2SDK_* or PBOTS_DATA_DIR', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', PBOTS_DATA_DIR: '/tmp/x-t34' })
    const env = childEnv(cfg, { HOME: '/tmp/h' }) as Record<string, string>
    expect(env.DSH_PBOTS_DATA_DIR, 'DSH_ 键注入').toBe('/tmp/x-t34')
    expect(env.PBOTS_DATA_DIR, 'PBOTS_DATA_DIR 不进子 env').toBeUndefined()
    for (const [k, v] of Object.entries(env)) {
      if (k.startsWith('P2SDK_')) expect(v, `P2SDK_* 键 ${k} 不得携带数据根`).not.toBe('/tmp/x-t34')
    }
  })
})

describe('childEnv', () => {
  // T-12 (REVIEW R1 critical): P2SDK_HOME must never enter the dsh env — the
  // upstream tool-subprocess scrubber drops DSH_* names but keeps P2SDK_*,
  // so a home path in P2SDK_HOME would be derivable (dirname sibling
  // .dsh-handoff) or find-able inside the sandbox.
  it('points DSH_HOME at the runtime home and never sets P2SDK_HOME', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'sk-secret', P2SDK_HOME: '/tmp/h' })
    const env = childEnv(cfg, { PATH: '/bin' })
    expect(env.DSH_HOME).toBe('/tmp/h')
    expect(env.P2SDK_HOME).toBeUndefined()
    expect(env.P2SDK_LLM_API_BASE).toBe('http://127.0.0.1:4001/v1')
    expect(env.DSH_TELEMETRY_MODE).toBe('DISABLED')
  })

  it('T9a-① ssh 五件套给齐 → runtime patch 含 ssh 族/PTC 禁/guard extraNeverTools，不含本机 wrapper 与 fs-zone', () => {
    const cfg = resolveConfig({
      P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h',
      P2SDK_SSH_HOST: 'pbots-ssh-test', P2SDK_SSH_REMOTE_ROOT: '/remote/root',
      P2SDK_SSH_HELPER: '/remote/helper.js', P2SDK_SSH_HELPER_HASH: 'a'.repeat(64), P2SDK_SSH_NODE: '/remote/node',
    })
    expect(validateStart(cfg)).toBeNull()
    mkdirSync('/tmp/h', { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain('dsh-fs-ssh')
    expect(yaml).toContain('dsh-subprocess-ssh')
    expect(yaml).toContain('dsh-sandbox-ssh')
    expect(yaml).not.toContain('- id: ptc-runtime') // T9ab: D8 变更
    expect(yaml).toContain('extraNeverTools')
    expect(yaml, 'extraNeverTools 在 guard config 级（4 格），不在 roots 内').toContain('\n    extraNeverTools:\n      - glob\n      - grep\n')
    expect(yaml).not.toMatch(/id: sandbox\n\s+config:/) // 本机 wrapper 不生成
    expect(yaml).not.toContain('fs-zone.mjs') // 本机 fs-zone 不插（T9b 起 ssh 模式插 fs-zone-ssh）
    expect(yaml).toContain('fs-zone-ssh.mjs') // T9b：ssh 模式 provider 层收口
    expect(yaml).toContain('neverRoots: []') // T9b：remoteHome 未给 → 远端根缺省空
    // T9b2（终验 M4/M5 欠账）：第六变量与原版行禁用都要有格看
    const env6 = {
      P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h',
      P2SDK_SSH_HOST: 'pbots-ssh-test', P2SDK_SSH_REMOTE_ROOT: '/remote/root',
      P2SDK_SSH_HELPER: '/remote/helper.js', P2SDK_SSH_HELPER_HASH: 'a'.repeat(64), P2SDK_SSH_NODE: '/remote/node',
      P2SDK_SSH_REMOTE_HOME: '/r/home',
    }
    const yaml6 = readFileSync(writeRuntimePatch(resolveConfig(env6)), 'utf8')
    expect(yaml6, '六变量齐：fs-zone-ssh 带远端硬 NEVER 根').toContain(`- '/r/home/.ssh'`)
    expect(yaml6, '原版 fs-ssh 行被禁（fs-zone-ssh 才是生效后端）').toMatch(/ {4}- id: fs-ssh\n {6}name: 'file:\/\/[^']*dsh-fs-ssh[^']*'\n {6}disabled: true\n/)
    const envOut = childEnv(resolveConfig(env6), { ...env6, PATH: '/bin' })
    expect(envOut.P2SDK_SSH_REMOTE_HOME, 'REMOTE_HOME 进删除表（不泄漏给子进程）').toBeUndefined()
    // T9b3：guardRow 写 remoteHome（校验消费）+ 不给时两者都不出现
    expect(yaml6, 'guard 行带 remoteHome（校验接线）').toMatch(/- id: p2sdk-fs-guard\n {2}config:\n {4}sshMode: 'ssh'\n {4}remoteRoot: '\/remote\/root'\n {4}remoteHome: '\/r\/home'\n/)
    expect(yaml, '不给 REMOTE_HOME：guard 行无 remoteHome 键').not.toContain('remoteHome:')
    expect(yaml, '不给 REMOTE_HOME：无远端凭证根').not.toContain(`- '/r/home/.ssh'`)
    expect(yaml).not.toContain('IdentityFile') // 凭证不进生成行
  })

  it('T9a-② 缺任一 → validateStart 报错；全空 → 本机模式 patch 不含 ssh 行', () => {
    const full = { P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', P2SDK_SSH_HOST: 'a', P2SDK_SSH_REMOTE_ROOT: 'b', P2SDK_SSH_HELPER: 'c', P2SDK_SSH_HELPER_HASH: 'd', P2SDK_SSH_NODE: 'e' }
    for (const k of Object.keys(full).filter((x) => x.startsWith('P2SDK_SSH_'))) {
      const partial = { ...full } as Record<string, string | undefined>
      delete partial[k]
      const cfg = resolveConfig(partial)
      expect(validateStart(cfg)).toContain('P2SDK_SSH_')
    }
    const local = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    expect(validateStart(local)).toBeNull()
    const yaml = readFileSync(writeRuntimePatch(local), 'utf8')
    expect(yaml).not.toContain('dsh-fs-ssh')
    expect(yaml).not.toContain('extraNeverTools')
  })

  it('T9a-③ childEnv：P2SDK_SSH_* 不进子进程；ssh 模式设 P2SDK_SSH_MODE=1', () => {
    const sshEnv = { P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', P2SDK_SSH_HOST: 'a', P2SDK_SSH_REMOTE_ROOT: 'b', P2SDK_SSH_HELPER: 'c', P2SDK_SSH_HELPER_HASH: 'd', P2SDK_SSH_NODE: 'e' }
    const sshCfg = resolveConfig(sshEnv)
    const env1 = childEnv(sshCfg, { ...sshEnv, PATH: '/bin' })
    expect(env1.P2SDK_SSH_HOST).toBeUndefined()
    expect(env1.P2SDK_SSH_MODE).toBe('1')
    const localCfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    const env0 = childEnv(localCfg, { PATH: '/bin' })
    expect(env0.P2SDK_SSH_MODE).toBeUndefined()
  })

  it('T9ae-C4 本机模式清掉继承的 P2SDK_SSH_MODE；ssh 模式不论继承值都设 1', () => {
    const localCfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    expect(childEnv(localCfg, { PATH: '/bin', P2SDK_SSH_MODE: '1' }).P2SDK_SSH_MODE, '本机模式不继承 MODE').toBeUndefined()
    const sshEnv = { P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', P2SDK_SSH_HOST: 'a', P2SDK_SSH_REMOTE_ROOT: 'b', P2SDK_SSH_HELPER: 'c', P2SDK_SSH_HELPER_HASH: 'd', P2SDK_SSH_NODE: 'e' }
    expect(childEnv(resolveConfig(sshEnv), { ...sshEnv, PATH: '/bin', P2SDK_SSH_MODE: '0' }).P2SDK_SSH_MODE).toBe('1')
  })

  it('T9ae-C3 runtime patch 的插值全部是单引号标量（含 \' 的路径、像布尔的 host）', () => {
    const cfg = resolveConfig({
      P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', P2SDK_HANDOFF: "/tmp/h/ho'x",
      P2SDK_SSH_HOST: 'true', P2SDK_SSH_REMOTE_ROOT: "/srv/O'Brien/work",
      P2SDK_SSH_HELPER: "/remote/it's.js", P2SDK_SSH_HELPER_HASH: 'a'.repeat(64), P2SDK_SSH_NODE: "/remote/n'ode",
    })
    mkdirSync('/tmp/h', { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain("        host: 'true'\n")
    expect(yaml).toContain("        workspace: '/srv/O''Brien/work'\n")
    expect(yaml).toContain("    workspaceRoot: '/srv/O''Brien/work'\n")
    expect(yaml).toContain("        helper: '/remote/it''s.js'\n")
    expect(yaml).toContain("node: '/remote/n''ode' }")
    expect(yaml).toContain("        dir: '/tmp/h/ho''x'\n")
    expect(yaml, '不留未转义的单引号插值').not.toContain("O'Brien")
  })

  it('T6: DSH_AGENTS_HOME 恒指运行时 home 下的 agents（覆盖父进程同名变量，关真实 ~/.agents 泄漏）', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    const env = childEnv(cfg, { HOME: '/home/x', DSH_AGENTS_HOME: '/home/x/.agents' })
    expect(env.DSH_AGENTS_HOME).toBe('/tmp/h/agents')
  })

  it('drops a parent P2SDK_HOME/P2SDK_HANDOFF instead of passing them through', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock' })
    const env = childEnv(cfg, { P2SDK_HOME: '/tmp/leak', P2SDK_HANDOFF: '/tmp/leak-ho' })
    expect(env.P2SDK_HOME).toBeUndefined()
    expect(env.P2SDK_HANDOFF).toBeUndefined()
  })

  it('never carries the key or derived secrets', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    const env = childEnv(cfg, {})
    expect(env.P2SDK_LLM_API_KEY).toBeUndefined()
  })

  it('T-11: NODE_V8_COVERAGE reaches the dsh child only via the test-harness name', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    // Production launch: NODE_V8_COVERAGE present in the launcher's own env is
    // NOT forwarded (the allowlist never picks it up) — no injection.
    const prod = childEnv(cfg, { PATH: '/bin', NODE_V8_COVERAGE: '/tmp/cov' })
    expect(prod.NODE_V8_COVERAGE).toBeUndefined()
    // Test harness: the dir travels as P2SDK_TEST_V8_COVERAGE and is mapped to
    // the dsh child's NODE_V8_COVERAGE.
    const test = childEnv(cfg, { PATH: '/bin', P2SDK_TEST_V8_COVERAGE: '/tmp/cov' })
    expect(test.NODE_V8_COVERAGE).toBe('/tmp/cov')
    expect(test.P2SDK_TEST_V8_COVERAGE).toBeUndefined()
  })

  // L-7 O1: the sandbox-behavior test vars must not leak from a production
  // launcher env (residue after manual debugging) — they are honored only
  // behind the explicit P2SDK_TEST_SANDBOX=1 opt-in.
  it('L-7 O1: P2SDK_TEST_SLIRP_* reach the dsh child only with P2SDK_TEST_SANDBOX=1', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    const prod = childEnv(cfg, {
      PATH: '/bin',
      P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD: '1',
      P2SDK_TEST_SLIRP_BIN: '/tmp/evil-helper',
    })
    expect(prod.P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD).toBeUndefined()
    expect(prod.P2SDK_TEST_SLIRP_BIN).toBeUndefined()
    const test = childEnv(cfg, {
      PATH: '/bin',
      P2SDK_TEST_SANDBOX: '1',
      P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD: '1',
      P2SDK_TEST_SLIRP_BIN: '/tmp/slirp-stub',
    })
    expect(test.P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD).toBe('1')
    expect(test.P2SDK_TEST_SLIRP_BIN).toBe('/tmp/slirp-stub')
  })
})

describe('writeRuntimePatch', () => {
  it('mock mode inserts llm-replay with a file:// specifier plus the handoff row', () => {
    const dir = tmkdir('p2sdk-patch-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir })
    const path = writeRuntimePatch(cfg)
    const yaml = readFileSync(path, 'utf8')
    expect(yaml).toContain("id: llm-replay")
    expect(yaml).toMatch(/name: 'file:\/\/\S+dsh-llm-replay\/lib\/index\.js'/)
    expect(yaml).toContain(`overrideFile: '${join(dir, 'replay-override.json')}'`)
    expect(yaml).toContain('paceMs: 25')
    expect(yaml).toContain('id: p2sdk-handoff')
    expect(yaml).toMatch(/name: 'file:\/\/\S+profile\/plugins\/handoff\.mjs'/)
  })

  it('real mode inserts only the handoff row', () => {
    const dir = tmkdir('p2sdk-patch-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'real', P2SDK_HOME: dir })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).not.toContain('llm-replay')
    expect(yaml).toContain('id: p2sdk-handoff')
  })
})

describe('mockReplayOverride', () => {
  it('is a whole-script ReplayEntry[] repeating a >1-text-delta entry per session slot', () => {
    const doc = mockReplayOverride() as Array<{ kind: string; chunks: Array<{ type: string; text?: string }> }>
    expect(Array.isArray(doc)).toBe(true)
    expect(doc.length).toBeGreaterThanOrEqual(2)
    for (const entry of doc) {
      const deltas = entry.chunks.filter((c) => c.type === 'text-delta')
      expect(deltas.length).toBeGreaterThanOrEqual(2)
      expect(entry.chunks.at(-1)?.type).toBe('finish')
    }
  })
})

describe('isReadyLine', () => {
  it('extracts the origin from the handoff ready line', () => {
    expect(isReadyLine('[p2sdk] ready http://127.0.0.1:4599')).toBe('http://127.0.0.1:4599')
  })

  it('rejects other lines', () => {
    expect(isReadyLine('dsh web: http://127.0.0.1:4599/?token=x')).toBeNull()
    expect(isReadyLine('random log')).toBeNull()
  })
})

describe('main', () => {
  // T50a 反转：原「无 key exits 1 before spawning」语义消亡（现在就要启动）。无 key 的
  // 行为链=validateStart null（上面反转格）+ main 打一行 WARN（stderr，由 e2e launcher.spec
  // ③a 真进程验证「stderr 恰一行含 Settings → Models」）+ 请求时 MISSING_CREDENTIAL（§0 探针帧）。
  // 这里只保底：real 无 key 的 resolveConfig 形态确实会进 WARN 分支（provider real + apiKey 空）。
  it('T50a：real without key resolves to the WARN path (provider real, apiKey unset)', () => {
    const cfg = resolveConfig({})
    expect(cfg.provider).toBe('real')
    expect(cfg.apiKey).toBeUndefined()
    expect(validateStart(cfg)).toBeNull()
  })
})

// --- P5-01（决策 15）：数据根与追加遮蔽根的启动器侧派生 ---

describe('resolveConfig · PBOTS_DATA_DIR / P2SDK_SANDBOX_MASK (P5-01)', () => {
  it('未设 PBOTS_DATA_DIR：缺省 $HOME/.config/pbots-ui + passwd home 同路径（去重）', () => {
    const home = '/tmp/p5-01-fake-home'
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', HOME: home })
    expect(cfg.dataDirs).toEqual([join(home, '.config', 'pbots-ui'), join(userInfo().homedir, '.config', 'pbots-ui')].filter((v, i, a) => a.indexOf(v) === i))
    expect(cfg.dataDirExplicit).toBe(false)
  })

  it('设了 PBOTS_DATA_DIR：单一数据根，标记 explicit', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', HOME: '/tmp/h', PBOTS_DATA_DIR: '/var/data/bots' })
    expect(cfg.dataDirs).toEqual(['/var/data/bots'])
    expect(cfg.dataDirExplicit).toBe(true)
  })

  it('P2SDK_SANDBOX_MASK 冒号分隔解析为追加根', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_SANDBOX_MASK: '/a:/b' })
    expect(cfg.extraMaskRoots).toEqual(['/a', '/b'])
  })

  it('envHome 进 cfg（wrapper 遮蔽 $HOME 的来源）', () => {
    expect(resolveConfig({ P2SDK_PROVIDER: 'mock', HOME: '/tmp/h5' }).envHome).toBe('/tmp/h5')
  })
})

describe('validateStart · 相对路径拒绝 (P5-01)', () => {
  it('PBOTS_DATA_DIR 相对路径报错并点名变量', () => {
    const err = validateStart(resolveConfig({ P2SDK_PROVIDER: 'mock', PBOTS_DATA_DIR: 'rel/data' }))
    expect(err).toContain('PBOTS_DATA_DIR')
    expect(err).toContain('absolute')
  })

  it('P2SDK_SANDBOX_MASK 相对路径报错并点名变量', () => {
    const err = validateStart(resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_SANDBOX_MASK: '/ok:rel/bad' }))
    expect(err).toContain('P2SDK_SANDBOX_MASK')
    expect(err).toContain('absolute')
  })
})

describe('childEnv · launcher-only 丢弃 (P5-01 决策 15)', () => {
  it('PBOTS_DATA_DIR / P2SDK_SANDBOX_MASK 不进 dsh 子进程 env', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', PBOTS_DATA_DIR: '/d', P2SDK_SANDBOX_MASK: '/m' })
    const env = childEnv(cfg, { PATH: '/bin', PBOTS_DATA_DIR: '/d', P2SDK_SANDBOX_MASK: '/m' })
    expect(env.PBOTS_DATA_DIR).toBeUndefined()
    expect(env.P2SDK_SANDBOX_MASK).toBeUndefined()
  })
})

describe('writeRuntimePatch · guard 行 (P5-02 决策 6/13)', () => {
  it('生成 id: p2sdk-fs-guard 行：roots 五组清单，全部来自 computeRoots 单源', () => {
    const dir = tmkdir('p2sdk-p5-patch-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, PBOTS_DATA_DIR: join(dir, 'data') })
    mkdirSync(join(dir, 'data'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain('id: p2sdk-fs-guard')
    expect(yaml).toMatch(/hardRoots:\n(        - '\S+'\n)+/)
    expect(yaml).toContain('hardRoots:')
    expect(yaml).toContain('dataMaskRoots:')
    expect(yaml).toContain('homes:')
    expect(yaml).toContain('toolchainDirs:')
    expect(yaml).toContain('policyRoots:')
    // /proc 与数据根顶层凭证都在 hardRoots（决策 13 ① + guard 侧 /proc）
    expect(yaml).toContain("'/proc'")
    expect(yaml).toContain(join(dir, 'data'))
  })
})

describe('writeRuntimePatch · shell-ask 行 (P5-21 决策 16a)', () => {
  it('生成 id: p2sdk-shell-ask 行：handoff + 从数据根推导的 policyStatePaths（无独立 env）', () => {
    const dir = tmkdir('p2sdk-p521-patch-')
    const data = join(dir, 'data')
    mkdirSync(data, { recursive: true })
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, PBOTS_DATA_DIR: data })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain('id: p2sdk-shell-ask')
    expect(yaml).toMatch(new RegExp(`handoff: '${cfg.handoff.replaceAll("'", "''")}'`))
    expect(yaml).toContain(join(data, 'policy-state.json'))
    expect(yaml, '不写已取消的独立 env 通道（P2SDK_POLICY_STATE）').not.toContain('P2SDK_POLICY_STATE')
  })

  it('PBOTS_DATA_DIR 未设时 policyStatePaths 覆盖两个缺省数据根', () => {
    const dir = tmkdir('p2sdk-p521-def-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, HOME: dir })
    mkdirSync(join(dir, '.config', 'pbots-ui'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain(join(dir, '.config', 'pbots-ui', 'policy-state.json'))
  })
})


describe('writeRuntimePatch · sandbox 行 (P5-01 决策 4)', () => {
  it('生成 id: sandbox 行：python3 -I wrapper、遮蔽/挂回清单、bwrap: 失败签名', () => {
    const dir = tmkdir('p2sdk-p5-patch-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, PBOTS_DATA_DIR: join(dir, 'data') })
    mkdirSync(join(dir, 'data'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain('id: sandbox')
    expect(yaml).toContain("runnerFailureSignatures: ['bwrap: ']")
    expect(yaml).toMatch(/runnerCommand: \['\/usr\/bin\/python3', '-I', '\S+bwrap-wrap\.py'/)
    expect(yaml).toContain('--mask')
    expect(yaml).toContain('--never')
    expect(yaml).toContain('--tool')
    expect(yaml).toContain('--policy')
    // 数据根与 policy-state（决策 15/16）都由 computeRoots 派生进清单
    expect(yaml).toContain(join(dir, 'data'))
  })
})

// T46d：serve 模式（本机+P2SDK_WORKSPACE_ROOT）挂 p2sdk-workspace；ssh 模式优先；未设逐字不变
describe('writeRuntimePatch · T46d workspace 行（serve 模式）', () => {
  it('ⓐ 本机+env 设 /x/data → patch 含 id: p2sdk-workspace 且 remoteRoot: /x/data；handoff 行有 remoteRoot 无 sshMode', () => {
    const dir = tmkdir('p2sdk-t46d-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, PBOTS_DATA_DIR: join(dir, 'data'), P2SDK_WORKSPACE_ROOT: '/x/data' })
    mkdirSync(join(dir, 'data'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain('- id: p2sdk-workspace')
    expect(yaml).toContain("remoteRoot: '/x/data'")
    expect(yaml).toMatch(/id: p2sdk-handoff[\s\S]*?remoteRoot: '\/x\/data'/)
    expect(yaml).not.toContain('sshMode')
  })
  it('ⓑ env 未设 → 本机 patch 与改前逐字相同（无 p2sdk-workspace 行、handoff 无 remoteRoot）', () => {
    const dir = tmkdir('p2sdk-t46d-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, PBOTS_DATA_DIR: join(dir, 'data') })
    mkdirSync(join(dir, 'data'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).not.toContain('p2sdk-workspace')
    expect(yaml).not.toMatch(/id: p2sdk-handoff[\s\S]*?remoteRoot/)
  })
  it('ⓒ ssh 与 env 同时设 → 只有 ssh 的 remoteRoot（env 忽略），sshMode 在', () => {
    const dir = tmkdir('p2sdk-t46d-')
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, PBOTS_DATA_DIR: join(dir, 'data'), P2SDK_WORKSPACE_ROOT: '/x/data', P2SDK_SSH_HOST: 'h', P2SDK_SSH_REMOTE_ROOT: '/home/u', P2SDK_SSH_HELPER: '/r/h.js', P2SDK_SSH_HELPER_HASH: 'b'.repeat(64), P2SDK_SSH_NODE: '/r/node' })
    mkdirSync(join(dir, 'data'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).not.toContain("remoteRoot: '/x/data'")
    expect(yaml).toContain('sshMode')
    expect(yaml).toContain("remoteRoot: '/home/u'")
  })
})

// ---- T49a：默认 litellm 路由搬出 p2sdk.yml——启动种子经 settings/mutate 写 user 层 ----
describe('T49a seedDefaultRoute（首启种子，T51 env 口径）', () => {
  const baseCfg = (over: Partial<StartConfig> = {}): StartConfig => resolveConfigRaw({
    P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'k', P2SDK_HOME: join(tmkdir('t49a-home-'), ''), P2SDK_HANDOFF: tmkdir('t49a-ho-'),
    ...over as never,
  })
  const stub = (userHasLitellm: boolean) => {
    const calls: Array<{ method: string; args: unknown }> = []
    return {
      calls,
      client: {
        async call(method: string, args?: unknown): Promise<unknown> {
          calls.push({ method, args })
          if (method === 'settings/describe') {
            const user = userHasLitellm ? { providers: { litellm: { baseURL: 'http://user-changed/v1' } } } : {}
            return { namespaces: [{ ns: 'llm-pi-ai', user, value: {}, base: {}, schema: { uid: 1, refs: {} } }] }
          }
          if (method === 'settings/mutate') return { ns: 'llm-pi-ai' }
          throw new Error(`unexpected ${method}`)
        },
        close(): void {},
      },
    }
  }
  it('① user 层无 litellm → 恰一条 mutate：op=set path=[providers,litellm] 值=cfg 解析结果', async () => {
    const cfg = baseCfg()
    const { calls, client } = stub(false)
    await seedDefaultRoute(client as never, cfg)
    const mutates = calls.filter((c) => c.method === 'settings/mutate')
    expect(mutates.length).toBe(1)
    const ops = (mutates[0]!.args as { ns: string; ops: Array<{ op: string; path: string[]; value: Record<string, unknown> }> }).ops
    expect((mutates[0]!.args as { ns: string }).ns).toBe('llm-pi-ai')
    expect(ops.length).toBe(1)
    expect(ops[0]!.op).toBe('set')
    expect(ops[0]!.path).toEqual(['providers', 'litellm'])
    expect(ops[0]!.value.api).toBe('openai-completions')
    expect(ops[0]!.value.baseURL).toBe(normalizeApiBase(cfg.llmBaseUrl))
    expect(ops[0]!.value.apiKeyEnv).toBe('P2SDK_LLM_API_KEY')
    expect(ops[0]!.value.models).toEqual([{ id: cfg.model, contextWindow: 131072 }])
  })
  it('② user 层已有 litellm（用户改过 baseURL）→ 不发 mutate（不覆盖）', async () => {
    const { calls, client } = stub(true)
    await seedDefaultRoute(client as never, baseCfg())
    expect(calls.filter((c) => c.method === 'settings/mutate').length).toBe(0)
    expect(calls.filter((c) => c.method === 'settings/describe').length).toBe(1)
  })
  it('③ mock → 一概不发（describe 也不发）', async () => {
    const { calls, client } = stub(false)
    const cfg = baseCfg()
    const mockCfg = { ...cfg, provider: 'mock' } as StartConfig
    await seedDefaultRoute(client as never, mockCfg)
    expect(calls.length).toBe(0)
  })
  it('④ writeRuntimePatch mock 分支覆盖 agent-default-model 为 mock/mock（p2sdk.yml 静态化 litellm 后 mock 靠它）', () => {
    const cfg = baseCfg()
    const mockCfg = { ...cfg, provider: 'mock' } as StartConfig
    const yml = readFileSync(writeRuntimePatch(mockCfg), 'utf8')
    expect(yml).toContain('id: agent-default-model')
    expect(yml).toContain('provider: mock')
  })
})

// ---- T49ab（Sol M2/M3/M4）：default model 跟种子 / mutate 带 revision / ready 行在种子之后 ----
describe('T49ab', () => {
  it('① real：runtime-patch 含 agent-default-model 行且 model=cfg.model（P2SDK_LLM_MODEL=custom-review-model）', () => {
    const cfg = resolveConfigRaw({ P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'k', P2SDK_HOME: join(tmkdir('t49ab-h-'), ''), P2SDK_HANDOFF: tmkdir('t49ab-ho-'), P2SDK_LLM_MODEL: 'custom-review-model' })
    const yml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yml).toContain('id: agent-default-model')
    expect(yml).toContain('provider: litellm')
    expect(yml).toContain(`model: 'custom-review-model'`) // yamlScalar 带引号（同款输出）
  })
  it('② seed 发出的 mutate 带 describe 回的 revision；③ 冲突(settings-conflict)后重读已有 litellm → 放弃（不再写）', async () => {
    const cfg = resolveConfigRaw({ P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'k', P2SDK_HOME: join(tmkdir('t49ab-h2-'), ''), P2SDK_HANDOFF: tmkdir('t49ab-ho2-') })
    // ② revision 透传
    {
      const calls: Array<{ method: string; args: unknown }> = []
      const client = {
        async call(method: string, args?: unknown): Promise<unknown> {
          calls.push({ method, args })
          if (method === 'settings/describe') return { namespaces: [{ ns: 'llm-pi-ai', user: {}, revision: 7 }] }
          if (method === 'settings/mutate') return { ns: 'llm-pi-ai' }
          throw new Error(`unexpected ${method}`)
        },
        close(): void {},
      }
      await seedDefaultRoute(client as never, cfg)
      const mut = calls.find((c) => c.method === 'settings/mutate')!.args as { expectedRevision?: number; ops: unknown[] }
      expect(mut.expectedRevision, 'wire 键名 expectedRevision（DSH settings.mutate 第三参）').toBe(7)
    }
    // ③ 冲突一次 → 重读已有 litellm → 放弃
    {
      let describeCount = 0
      const mutates: unknown[] = []
      const client = {
        async call(method: string, args?: unknown): Promise<unknown> {
          if (method === 'settings/describe') {
            describeCount += 1
            // 首读无路由；冲突后重读已有（用户并发写了）
            const user = describeCount === 1 ? {} : { providers: { litellm: { baseURL: 'http://user-edited/v1' } } }
            return { namespaces: [{ ns: 'llm-pi-ai', user, revision: describeCount }] }
          }
          if (method === 'settings/mutate') {
            mutates.push(args)
            const err = new Error('settings-conflict') as Error & { code?: string }
            err.code = 'settings-conflict'
            throw err
          }
          throw new Error(`unexpected ${method}`)
        },
        close(): void {},
      }
      await seedDefaultRoute(client as never, cfg)
      expect(mutates.length, '只试写一次，冲突后放弃').toBe(1)
      expect(describeCount).toBe(2)
    }
  })
  it('④ stdoutGate：real 持有到 release 才放行（含 ready 行的 chunk 不得提前外泄）；exit 兜底 flush', async () => {
    const gate = createStdoutGate(false)
    const out: string[] = []
    gate.push('boot line\n', (s) => out.push(s))
    gate.push('[p2sdk] ready http://127.0.0.1:1 t\n', (s) => out.push(s))
    gate.push('later line\n', (s) => out.push(s))
    expect(out.join('')).toBe('') // 未 release：一概不出（M4 的核心）
    gate.release((s) => out.push(s))
    expect(out.join('')).toContain('[p2sdk] ready')
    expect(out.join('')).toContain('later line')
    gate.push('after release\n', (s) => out.push(s))
    expect(out.join('')).toContain('after release')
  })
  it('⑤ stdoutGate(mock)：ready 行立即放行（不持有、不需要 release）', async () => {
    const gate = createStdoutGate(true)
    const out: string[] = []
    gate.push('[p2sdk] ready http://127.0.0.1:1 t\n', (s) => out.push(s))
    expect(out.join('')).toContain('[p2sdk] ready')
  })
})

// ---- T49ac：种子失败时退出 flush 不得放出 ready 行（假 ready 会骗过 launcher）----
describe('T49ac gate exit 不放 ready 行', () => {
  it('① 未 release 时 flushOnExit：boot/错误行照出，ready 行被丢；已 release 后 flushOnExit 不重复输出', async () => {
    const gate = createStdoutGate(false)
    let out = ''
    const w = (s: string): void => { out += s }
    gate.push('dsh: boot line\n', w)
    gate.push('[p2sdk] ready http://127.0.0.1:1 tok\n', w)
    gate.push('\r[p2sdk] ready http://127.0.0.1:1 tok\n', w) // Sol:前导 CR 变体（解析器 trim 后认）
    gate.push('some error detail\n', w)
    expect(out).toBe('')
    gate.flushOnExit(w)
    expect(out).toContain('dsh: boot line')
    expect(out).toContain('some error detail')
    expect(out, '退出 flush 丢 ready 行（launcher 唯一就绪契约，种子失败不得出现）').not.toContain('[p2sdk] ready')
    const before = out
    gate.flushOnExit(w)
    expect(out).toBe(before) // 已 release：无重复
  })
  it('② seed 抛错（mutate 被拒：llm-pi-ai 插件被 patch 禁用）→ main 拒启：全程 stdout 无 ready 行、退出码非 0', { timeout: 90_000 }, async () => {
    // 集成单测（真起 start.mjs）：gateway 可达、ready 行已到（gate 持有中）、种子的 mutate
    // 被上游拒（No configurable plugin entry）→ main 拒启——这正是 launcher 会被假 ready
    // 骗过的那条失败路径（hivebot:196-198 先 grep ready 再查存活）。
    const { spawn } = await import('node:child_process')
    const { writeFileSync: wf } = await import('node:fs')
    const home = mkdtdir()
    const handoff = mkdtdir()
    const patch = mkdtdir()
    wf(join(patch, 'nollm.yml'), '- id: llm-pi-ai\n  disabled: true\n')
    const child = spawn(process.execPath, [join(PKG_ROOT_FOR_TEST, 'scripts', 'start.mjs')], {
      env: {
        ...process.env,
        P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'k', P2SDK_HOME: home, P2SDK_HANDOFF: handoff,
        P2SDK_PORT: '0', P2SDK_PATCH: join(patch, 'nollm.yml'), P2SDK_READY_TIMEOUT_MS: '30000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout!.setEncoding('utf8'); child.stdout!.on('data', (c: string) => { stdout += c })
    child.stderr!.setEncoding('utf8'); child.stderr!.on('data', (c: string) => { stderr += c })
    const code = await new Promise<number>((r) => { child.on('exit', (c) => r(c ?? 0)); setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } }, 85_000) })
    expect(code, '种子失败拒启：退出码 1').toBe(1)
    // Sol 增量复审 MINOR:必须证明真走到了种子失败分支(而非参数校验等早退)
    expect(stderr, 'stderr 含种子失败签名').toContain('seeding default llm route failed')
    expect(stderr).toContain('No configurable plugin entry')
    expect(stdout, '全程 stdout 无 ready 行（退出 flush 丢行生效——launcher 唯一就绪契约）').not.toContain('[p2sdk] ready')
  })
})

// 小工具：测试内临时目录 + 环境透传最小化
import { join as joinForTools } from 'node:path'
function mkdtdir(): string { return tmkdir('t49ac-') }
const PKG_ROOT_FOR_TEST = joinForTools(__dirname, '..', '..')
