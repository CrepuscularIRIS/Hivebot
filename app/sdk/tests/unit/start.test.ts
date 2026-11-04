import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_MODEL,
  buildArgs,
  childEnv,
  isReadyLine,
  main,
  mockReplayOverride,
  normalizeApiBase,
  resolveConfig,
  validateStart,
  writeRuntimePatch,
} from '../../src/start.ts'

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
  it('real provider without P2SDK_LLM_API_KEY fails naming the variable', () => {
    const err = validateStart(resolveConfig({}))
    expect(err).toContain('P2SDK_LLM_API_KEY')
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
    expect(patches, 'p2sdk.yml + approval.yml + market.yml + runtime patch + extras').toHaveLength(5)
    expect(patches[3]).toBe('/tmp/h/runtime-patch.yml')
    expect(patches[4]).toBe('/tmp/x.yml')
  })

  // T-12 (REVIEW R3/R5/R13): the shell-ask approval policy ships in the
  // DEFAULT boot chain — `pnpm start` with no P2SDK_PATCH must ask on every
  // ordinary bash call (CLAUDE.md 安全反例: openclaw exec 默认不审批).
  it('mounts profile/patches/approval.yml by default between the static and runtime patches', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_PATCH: '/tmp/x.yml' })
    const patches = buildArgs(cfg, '/tmp/h/runtime-patch.yml').filter((_, i, a) => a[i - 1] === '--patch')
    expect(patches[1].endsWith(join('profile', 'patches', 'approval.yml')), `second patch is approval.yml (got ${patches[1]})`).toBe(true)
    expect(patches, 'p2sdk.yml, approval.yml, market.yml, runtime patch, extras').toHaveLength(5)
  })

  // P5-58：market.yml（plugin-market + p2temp 两个 insert 行）进默认链——生产启动
  // pluginMarket/* 与 p2temp/session.createWithConnectors 开箱可用（UI M1 白名单
  // 两者都在）；目录源仍由 P2SDK_MARKET_INDEXES 配，缺省空目录 = 诚实空态。
  it('mounts profile/patches/market.yml by default after approval.yml', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock' })
    const patches = buildArgs(cfg, '/tmp/h/runtime-patch.yml').filter((_, i, a) => a[i - 1] === '--patch')
    expect(patches[2].endsWith(join('profile', 'patches', 'market.yml')), `third patch is market.yml (got ${patches[2]})`).toBe(true)
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
})

describe('writeRuntimePatch', () => {
  it('mock mode inserts llm-replay with a file:// specifier plus the handoff row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p2sdk-patch-'))
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
    const dir = mkdtempSync(join(tmpdir(), 'p2sdk-patch-'))
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
  it('exits 1 before spawning when the real provider key is missing', async () => {
    const errors: string[] = []
    const original = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      errors.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    try {
      const env = { P2SDK_LLM_API_KEY: '' }
      const previous: Record<string, string | undefined> = {}
      for (const key of Object.keys(env)) {
        previous[key] = process.env[key]
        process.env[key] = env[key]
      }
      delete process.env.P2SDK_LLM_API_KEY
      delete process.env.P2SDK_PROVIDER
      const code = await main()
      expect(code).toBe(1)
      expect(errors.join('')).toContain('P2SDK_LLM_API_KEY')
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    } finally {
      process.stderr.write = original
    }
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
    const dir = mkdtempSync(join(tmpdir(), 'p2sdk-p5-patch-'))
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
    const dir = mkdtempSync(join(tmpdir(), 'p2sdk-p521-patch-'))
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
    const dir = mkdtempSync(join(tmpdir(), 'p2sdk-p521-def-'))
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: dir, HOME: dir })
    mkdirSync(join(dir, '.config', 'pbots-ui'), { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain(join(dir, '.config', 'pbots-ui', 'policy-state.json'))
  })
})


describe('writeRuntimePatch · sandbox 行 (P5-01 决策 4)', () => {
  it('生成 id: sandbox 行：python3 -I wrapper、遮蔽/挂回清单、bwrap: 失败签名', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p2sdk-p5-patch-'))
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
