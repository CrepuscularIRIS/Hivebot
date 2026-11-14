// T70：启动配置来自条目数据（src/market/picks.json）——wrapper 按 spec 查表透传 +
// {workspace} 占位替换，不解释包。先红锚：picks.json 不存在 / wrapper 仍按代码 Map 取值。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { marketWrapperDirFor } from '../../src/market/wrapper.mjs'
import { tmkdir } from '../support/tmp-sweep.ts'

type Pick = { name: string; version: string; launch?: { args?: string[]; env?: Record<string, string> } }
type Row = { config: { args: string[]; env: Record<string, string> } }

const SRC = fileURLToPath(new URL('../../src/market', import.meta.url))
const PICKS_PATH = join(SRC, 'picks.json')
const WRAPPER_SRC = readFileSync(join(SRC, 'wrapper.mjs'), 'utf8')

const rowOf = (dir: string): Row =>
  (JSON.parse(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')) as Array<{ insert?: Row[] }>)
    .flatMap((p) => p.insert ?? [])[0] as Row

/** fake 预置树（同 tests/unit/market-wrapper.proc.mjs 口径）：一个裸 npm MCP 包 + mcp-client 入口。 */
function fakeSdkRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 't70-sdk-'))
  const pkgDir = join(root, 'node_modules', 'fake-mcp')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'fake-mcp', version: '1.0.0', bin: { 'fake-mcp': 'bin/mcp.cjs' } }))
  mkdirSync(join(pkgDir, 'bin'), { recursive: true })
  writeFileSync(join(pkgDir, 'bin', 'mcp.cjs'), '// fake\n')
  const entry = join(root, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')
  mkdirSync(join(entry, '..'), { recursive: true })
  writeFileSync(entry, '// fake\n')
  return root
}

it('① picks.json 每条：launch 经 {workspace} 替换后落进 wrapper 行（期望从数据现算）', () => {
  const picks = JSON.parse(readFileSync(PICKS_PATH, 'utf8')) as Pick[]
  expect(picks.length, '能装条目 ≥4（四包预置）').toBeGreaterThanOrEqual(4)
  for (const p of picks) {
    const home = join(tmkdir('t70-a-'), 'dsh-home')
    const dir = marketWrapperDirFor({ spec: `${p.name}@${p.version}`, dshHome: home })
    expect(dir, `${p.name} wrapper 生成`).toBeTruthy()
    const ws = join(home, 'workspace')
    const sub = (v: string): string => v.replaceAll('{workspace}', ws)
    const cfg = rowOf(dir!).config
    expect(cfg.args.slice(1), `${p.name} args = 数据替换后（首项入口之外）`).toEqual((p.launch?.args ?? []).map(sub))
    expect(cfg.env, `${p.name} env = 数据替换后`).toEqual(Object.fromEntries(Object.entries(p.launch?.env ?? {}).map(([k, v]) => [k, sub(v)])))
  }
})

it('② 数据自检：launch 键只许 args/env；值全 string；替换后无残留花括号（防拼错占位符）', () => {
  const picks = JSON.parse(readFileSync(PICKS_PATH, 'utf8')) as Pick[]
  for (const p of picks) {
    if (p.launch === undefined) continue
    for (const k of Object.keys(p.launch)) expect(['args', 'env'], `${p.name} launch 键白名单`).toContain(k)
    const vals: unknown[] = [...(p.launch.args ?? []), ...Object.values(p.launch.env ?? {})]
    expect(vals.length, `${p.name} launch 非空`).toBeGreaterThan(0)
    for (const v of vals) {
      expect(typeof v, `${p.name} launch 值是 string`).toBe('string')
      expect(String(v).replaceAll('{workspace}', '/w'), `${p.name} 替换后不残留 { }`).not.toMatch(/[{}]/)
    }
  }
})

it('③ wrapper.mjs 源码无包名相关取值（差异不许回代码）', () => {
  for (const banned of ['REQUIRED_ARGS', 'PACKAGE_ENV', 'launchArgsFor', 'launchEnvFor', 'MEMORY_FILE_PATH', 'allowed-directories']) {
    expect(WRAPPER_SRC.includes(banned), `wrapper.mjs 不含字面量 ${banned}`).toBe(false)
  }
})

it('⑤ {workspace} 是字面替换：dshHome 含 $& $\' 等 replaceAll 模式字符也不被解释（T70 审中条）', () => {
  const picks = JSON.parse(readFileSync(PICKS_PATH, 'utf8')) as Pick[]
  const fs = picks.find((p) => p.name === '@agent-infra/mcp-server-filesystem')!
  const home = join(tmkdir('t70-c-'), 'dsh-$&-path') // $& 是 replaceAll 字符串替换的特殊模式
  const dir = marketWrapperDirFor({ spec: `${fs.name}@${fs.version}`, dshHome: home })
  expect(dir).toBeTruthy()
  const want = join(home, 'workspace') // 期望直接算，不复用替换算法
  expect(rowOf(dir!).config.args).toContain(want)
})

it('④ 不在 picks.json 的预置坐标 → 零参数零 env（同现行表外包）', () => {
  const sdk = fakeSdkRoot()
  try {
    const home = join(tmkdir('t70-b-'), 'dsh-home')
    const dir = marketWrapperDirFor({ spec: 'fake-mcp@1.0.0', sdkRoot: sdk, dshHome: home })
    expect(dir).toBeTruthy()
    const cfg = rowOf(dir!).config
    expect(cfg.args, 'args 仅入口').toHaveLength(1)
    expect(cfg.env).toEqual({})
  } finally {
    rmSync(sdk, { recursive: true, force: true })
  }
})
