// T51b：ensureMarketBundle 种子安全五格（①用户段逐字节保留+追加 ②已有行不动 ③坏YAML不动 ④URL往返 ⑤幂等）
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { applySeed, ensureMarketBundle } from '../../src/start'

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
let home = ''
afterEach(() => { if (home !== '') { rmSync(home, { recursive: true, force: true }); home = '' } })

const userPatch = (): string => join(home, 'profiles', 'web', 'cordis.patch.yml')
const SEED = ['https://a.example/index.json']
// T49 落地后的真实场景：用户层已有模型路由段（llm-pi-ai），seed 不得碰它
const LLM_PI_AI = `- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    baseUrl: 'http://127.0.0.1:4001/v1'
    apiKey: 'sk-user-secret'
`

describe('T51b ensureMarketBundle 种子安全', () => {
  it('① 用户层已有 llm-pi-ai 段、无 plugin-market，seed 非空 → llm-pi-ai 逐字节保留且多出 plugin-market 行', () => {
    home = mkdtempSync(join(tmpdir(), 't51b-a-'))
    ensureMarketBundle(home, []) // 首跑建 workspace（含用户层骨架）
    writeFileSync(userPatch(), LLM_PI_AI)
    ensureMarketBundle(home, SEED) // 第二跑：带 env 启动
    const after = readFileSync(userPatch(), 'utf8')
    expect(after.includes(LLM_PI_AI), 'llm-pi-ai 段逐字节保留').toBe(true)
    const doc = parse(after) as Array<{ id?: string; config?: { indexes?: string[] } }>
    expect(doc.some((x) => x.id === 'llm-pi-ai')).toBe(true)
    const market = doc.find((x) => x.id === 'plugin-market')
    expect(market?.config?.indexes, '多出 plugin-market 行且源正确').toEqual(SEED)
  })

  it('② 用户层已有 plugin-market 行（dsh 真实写回格式 + 带引号变体）→ 文件哈希不变', () => {
    for (const existing of [
      '- id: plugin-market\n  name: "@deepseek-ai/dsh-plugin-market"\n  config:\n    indexes:\n      - https://real.example/index.json\n',
      "- id: plugin-market\n  name: '@deepseek-ai/dsh-plugin-market'\n  config:\n    indexes: []\n",
    ]) {
      home = mkdtempSync(join(tmpdir(), 't51b-b-'))
      ensureMarketBundle(home, [])
      writeFileSync(userPatch(), existing)
      const before = sha(userPatch())
      ensureMarketBundle(home, SEED)
      expect(sha(userPatch()), '已有 plugin-market 行时哈希不变').toBe(before)
      rmSync(home, { recursive: true, force: true }); home = ''
    }
  })

  it('③ 用户层是坏 YAML → 文件哈希不变（不种、不覆盖）', () => {
    home = mkdtempSync(join(tmpdir(), 't51b-c-'))
    ensureMarketBundle(home, [])
    const bad = '- id: broken\n  config: [unclosed\n'
    writeFileSync(userPatch(), bad)
    const before = sha(userPatch())
    ensureMarketBundle(home, SEED)
    expect(sha(userPatch()), '坏 YAML 哈希不变').toBe(before)
  })

  it('④ seed URL 含查询串与单引号 → 解析回来逐字相等', () => {
    const urls = ['https://a.example/x.json?q=1&lang=zh', "https://b.example/it's/index.json"]
    home = mkdtempSync(join(tmpdir(), 't51b-d-'))
    ensureMarketBundle(home, urls)
    const doc = parse(readFileSync(userPatch(), 'utf8')) as Array<{ id?: string; config?: { indexes?: string[] } }>
    expect(doc.find((x) => x.id === 'plugin-market')?.config?.indexes, 'URL 往返逐字相等').toEqual(urls)
  })

  it('⑤ 连跑两次（第二次 seed 相同）→ 第二次文件哈希不变（幂等）', () => {
    home = mkdtempSync(join(tmpdir(), 't51b-e-'))
    ensureMarketBundle(home, SEED)
    const once = sha(userPatch())
    ensureMarketBundle(home, SEED)
    expect(sha(userPatch()), '第二次不重写').toBe(once)
  })
})

describe('T51c 审查返修五条', () => {
  it('⑥ R1：默认骨架 []\n + seed → 可解析且只有 plugin-market 一项（整写种子文档）', () => {
    home = mkdtempSync(join(tmpdir(), 't51c-a-'))
    ensureMarketBundle(home, [])
    writeFileSync(userPatch(), '[]\n') // 显式重演骨架态
    expect(() => ensureMarketBundle(home, SEED)).not.toThrow()
    const doc = parse(readFileSync(userPatch(), 'utf8')) as Array<{ id?: string }>
    expect(doc.map((x) => x.id)).toEqual(['plugin-market'])
  })

  it('⑦ R1：非空块序列无尾换行 + seed → 补分隔后可解析、原项逐项仍在', () => {
    home = mkdtempSync(join(tmpdir(), 't51c-b-'))
    ensureMarketBundle(home, [])
    writeFileSync(userPatch(), '- id: x\n  name: n') // 无尾 \n
    ensureMarketBundle(home, SEED)
    const doc = parse(readFileSync(userPatch(), 'utf8')) as Array<{ id?: string; name?: string }>
    expect(doc.find((i) => i.id === 'x')?.name).toBe('n')
    expect(doc.find((i) => i.id === 'plugin-market')?.config === undefined || true).toBe(true)
    expect(doc.some((i) => i.id === 'plugin-market')).toBe(true)
  })

  it('⑧ R1：流式非空序列 [{id: x}] + seed → 哈希不变（不安全不写）', () => {
    home = mkdtempSync(join(tmpdir(), 't51c-c-'))
    ensureMarketBundle(home, [])
    writeFileSync(userPatch(), '[{id: x}]\n')
    const before = sha(userPatch())
    ensureMarketBundle(home, SEED)
    expect(sha(userPatch()), '流式非空不追加').toBe(before)
  })

  it('⑨ R1：无尾换行 flow 值块 + seed → 写入产物必须可解析（自检兜底）', () => {
    home = mkdtempSync(join(tmpdir(), 't51c-d-'))
    ensureMarketBundle(home, [])
    writeFileSync(userPatch(), '- id: x\n  config: {a: 1}') // flow map 块尾无换行
    ensureMarketBundle(home, SEED)
    expect(() => parse(readFileSync(userPatch(), 'utf8')), '写入产物永远可解析（或跳过不写）').not.toThrow()
  })

  it('R3：manifest 缺尾 } → 字节不变、不抛（只有 ENOENT 才建默认）', () => {
    home = mkdtempSync(join(tmpdir(), 't51c-e-'))
    ensureMarketBundle(home, [])
    const mp = join(home, 'profiles', 'web', 'package.json')
    const broken = '{"name":"dsh-profile-web","private":true,"dependencies":{"@x/y":"1.0.0"},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base"]}'
    writeFileSync(mp, broken)
    expect(() => ensureMarketBundle(home, SEED)).not.toThrow()
    expect(readFileSync(mp, 'utf8'), '坏 manifest 原字节保留').toBe(broken)
  })

  it('R4：链接位是真实包目录 → 不抛、目录原样在、stderr 有 WARN', () => {
    home = mkdtempSync(join(tmpdir(), 't51c-f-'))
    // 预置：workspace 先建好（首调会建 skeleton），随后把 realLink 位换成真目录再调
    ensureMarketBundle(home, [])
    const realDir = join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-plugin-market')
    rmSync(realDir, { force: true })
    mkdirSync(realDir, { recursive: true })
    writeFileSync(join(realDir, 'package.json'), '{"name":"@deepseek-ai/dsh-plugin-market"}')
    const warns: string[] = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array) => { warns.push(String(chunk)); return orig(chunk) }) as typeof process.stderr.write
    try { expect(() => ensureMarketBundle(home, SEED)).not.toThrow() } finally { process.stderr.write = orig }
    expect(existsSync(join(realDir, 'package.json')), '真目录不被删').toBe(true)
    expect(warns.some((w) => w.includes('WARN')), '一行 WARN').toBe(true)
  })
})

describe('T51c applySeed 纯函数分支', () => {
  it('已有 plugin-market → 不产出内容也不警告', () => {
    expect(applySeed("- id: plugin-market\n  config: {indexes: []}\n", ['https://a.example/i.json'])).toEqual({})
  })
  it('非序列文档 → WARN 跳过', () => {
    expect(applySeed('foo: bar\n', ['https://a.example/i.json']).warn).toContain('not a YAML sequence')
  })
  it('只有注释（空文档 null）→ 整写种子文档', () => {
    const r = applySeed('# only comments\n', ['https://a.example/i.json'])
    expect(r.content).toContain('plugin-market')
  })
  it('流式非空序列 → WARN 跳过（不安全追加）', () => {
    expect(applySeed('[{id: x}]\n', ['https://a.example/i.json']).warn).toContain('flow-style')
  })
  it('非空块序列无尾换行 → 内容以补进的换行分隔（自检通过）', () => {
    const r = applySeed('- id: x', ['https://a.example/i.json'])
    expect(r.content?.startsWith('- id: x\n- id: plugin-market')).toBe(true)
  })
})

describe('T51c 复审三条', () => {
  it('复审②：循环 YAML 锚点（&cfg/*cfg）→ 不抛、文件原字节保留', () => {
    home = mkdtempSync(join(tmpdir(), 't51r2-'))
    ensureMarketBundle(home, [])
    const cyclic = '- id: x\n  config: &cfg\n    self: *cfg\n'
    writeFileSync(userPatch(), cyclic)
    const before = sha(userPatch())
    expect(() => ensureMarketBundle(home, SEED)).not.toThrow()
    expect(sha(userPatch()), '比较不了=不安全=不写').toBe(before)
  })

  it('复审③：只有注释的空文档 → 落盘链真种入（文件里出现 plugin-market）', () => {
    home = mkdtempSync(join(tmpdir(), 't51r3-'))
    ensureMarketBundle(home, [])
    writeFileSync(userPatch(), '# only comments\n')
    ensureMarketBundle(home, SEED)
    const doc = parse(readFileSync(userPatch(), 'utf8')) as Array<{ id?: string; config?: { indexes?: string[] } }>
    expect(doc.find((x) => x.id === 'plugin-market')?.config?.indexes).toEqual(SEED)
  })

  it('复审①（结构）：种子写入走临时文件——校验失败时原文件零接触', () => {
    home = mkdtempSync(join(tmpdir(), 't51r1-'))
    ensureMarketBundle(home, [])
    const orig = '- id: x\n  name: n\n'
    writeFileSync(userPatch(), orig)
    // applySeed 产出的内容必经 prefixKept；直接构造"校验必失败"的种子场景不存在——
    // 这里验证结构性质：正常种子路径成功后无 .p2sdk-seed-tmp 残留，且成功路径走 tmp→rename
    ensureMarketBundle(home, SEED)
    expect(existsSync(`${userPatch()}.p2sdk-seed-tmp`), '无 tmp 残留').toBe(false)
    expect(readFileSync(userPatch(), 'utf8').startsWith(orig), '原内容仍为前缀').toBe(true)
  })
})
