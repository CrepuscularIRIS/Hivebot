import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  it('boots the web profile with the static and runtime patches, then extras', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_PORT: '4599', P2SDK_PATCH: '/tmp/x.yml' })
    const args = buildArgs(cfg, '/tmp/h/runtime-patch.yml')
    expect(args[0]).toBe('web')
    expect(args).toContain('--no-open')
    expect(args).toContain('--port')
    expect(args[args.indexOf('--port') + 1]).toBe('4599')
    const patches = args.filter((_, i) => args[i - 1] === '--patch')
    expect(patches[0].endsWith('profile/patches/p2sdk.yml')).toBe(true)
    expect(patches).toEqual([patches[0], '/tmp/h/runtime-patch.yml', '/tmp/x.yml'])
  })
})

describe('childEnv', () => {
  it('points DSH_HOME and P2SDK_HOME at the runtime home and never logs the key', () => {
    const cfg = resolveConfig({ P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'sk-secret', P2SDK_HOME: '/tmp/h' })
    const env = childEnv(cfg, { PATH: '/bin' })
    expect(env.DSH_HOME).toBe('/tmp/h')
    expect(env.P2SDK_HOME).toBe('/tmp/h')
    expect(env.P2SDK_LLM_API_BASE).toBe('http://127.0.0.1:4001/v1')
    expect(env.DSH_TELEMETRY_MODE).toBe('DISABLED')
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
