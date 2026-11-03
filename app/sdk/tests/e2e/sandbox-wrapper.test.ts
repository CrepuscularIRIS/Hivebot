// P5-01 ⑤ 及挂载序证明：app/sdk/sandbox/bwrap-wrap.py 直测（不经 runtime）。
// 覆盖：wrapper 文件缺失的 python3 加载失败诊断（无前缀、退出码 2）；wrapper 自身
// 错误的 `bwrap: ` 前缀 + 非零退出 + 不 exec；挂载序（dry-run）；HOME 祖先拒绝；
// 再遮（目录 --tmpfs / 文件 --ro-bind /dev/null）；真实 exec 冒烟（遮蔽生效）。
// 决策 4：解释器 /usr/bin/python3 -I；PLAN P5-01 ⑤ 的两格在 sandbox-hardened.test.ts
// 里再经真实 launcher + fake bash 各证一遍。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WRAPPER = join(fileURLToPath(import.meta.url), '..', '..', '..', 'sandbox', 'bwrap-wrap.py')
const PY = '/usr/bin/python3'

/** dsh sandbox-local 0.2.2-alpha.2 bwrapProfileArgs 的固定形状（workspace-write 档）。 */
function profileArgs(workspace: string): string[] {
  return ['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent',
    '--tmpfs', '/tmp', '--bind', workspace, workspace]
}

function runWrapper(args: string[], env: Record<string, string> = {}) {
  return spawnSync(PY, ['-I', WRAPPER, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...env } })
}

/** dry-run 输出 → 最终 bwrap argv（每行一个元素，首行是标记）。 */
function dryRun(args: string[]): string[] {
  const res = runWrapper(args, { BWRAP_WRAP_DRY_RUN: '1' })
  expect(res.status, `dry-run must succeed:\n${res.stderr}`).toBe(0)
  return res.stdout.trim().split('\n')
}

describe('⑤ wrapper 文件缺失（v2.1 唯一例外：无前缀、退出码 2）', () => {
  it('python3 -I 在加载脚本前报 Errno 2 诊断，退出码 2', () => {
    const res = spawnSync(PY, ['-I', '/tmp/p5-01-no-such-dir/bwrap-wrap.py', '--home', '/tmp'], { encoding: 'utf8' })
    expect(res.status).toBe(2)
    expect(res.stderr).toContain("can't open file")
    expect(res.stderr).toContain('bwrap-wrap.py')
    expect(res.stderr).toContain('[Errno 2]')
  })
})

describe('⑤ wrapper 内部错误（一切错误 bwrap: 前缀、非零、不 exec）', () => {
  it('未知 flag → bwrap: 前缀、非零退出', () => {
    const res = runWrapper(['--wat', 'x', ...profileArgs('/tmp'), '--', '/bin/true'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })

  it('--home 缺值 → bwrap: 前缀（内部 IndexError 不裸抛）', () => {
    const res = runWrapper(['--home', ...profileArgs('/tmp'), '--', '/bin/true'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })

  it('缺 -- 分隔符 → bwrap: 前缀', () => {
    const res = runWrapper(['--home', '/tmp'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })

  it('profile 出现未知参数（上游形状漂移）→ bwrap: 前缀', () => {
    const res = runWrapper(['--home', '/tmp', '--chdir', '/x', '--', '/bin/true'])
    expect(res.status).not.toBe(0)
    expect(res.stderr).toContain('bwrap: ')
  })
})

describe('挂载序（dry-run，PLAN P5-01 挂载顺序逐段）', () => {
  it('base → --unshare-net → 遮蔽 → 工具链挂回 → 工作区重 bind → 策略根 → 再遮 → 命令', () => {
    const ws = mkdtempSync(join(tmpdir(), 'p5-01-ws-'))
    const maskDir = mkdtempSync(join(tmpdir(), 'p5-01-mask-'))
    const tool = mkdtempSync(join(tmpdir(), 'p5-01-tool-'))
    const policy = mkdtempSync(join(tmpdir(), 'p5-01-policy-'))
    const neverUnderTool = join(tool, '.condarc')
    writeFileSync(neverUnderTool, 'x')
    const argv = dryRun(['--home', '/tmp/p5-01-nohome', '--mask', maskDir, '--never', neverUnderTool, '--tool', tool, '--policy', policy,
      ...profileArgs(ws), '--', '/bin/sh', '-c', 'true'])
    expect(argv[0]).toBe('/usr/bin/bwrap')
    // base 段原样在前（ro-bind / / … 共 9 个元素，占 argv[1..9]）
    expect(argv.slice(1, 10)).toEqual(['--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent'])
    // 断网紧跟 base
    expect(argv[10]).toBe('--unshare-net')
    // 遮蔽（目录 tmpfs）在工具链之前
    const maskAt = argv.indexOf(maskDir)
    const toolAt = argv.indexOf(tool)
    expect(maskAt).toBeGreaterThan(10)
    expect(maskAt).toBeLessThan(toolAt)
    // 工具链 ro-bind 在工作区重 bind 之前
    expect(argv[toolAt - 1]).toBe('--ro-bind')
    expect(toolAt).toBeLessThan(argv.indexOf(ws))
    // 策略根在工作区之后
    expect(argv.indexOf(policy)).toBeGreaterThan(argv.indexOf(ws))
    // 再遮垫底：never(工具链内文件)用 /dev/null 覆盖
    const remaskAt = argv.indexOf(neverUnderTool)
    expect(remaskAt).toBeGreaterThan(argv.indexOf(policy))
    expect(argv[remaskAt - 1]).toBe('/dev/null')
    expect(argv[remaskAt - 2]).toBe('--ro-bind')
    // 末尾 -- 与命令
    expect(argv.at(-1)).toBe('true')
    expect(argv.includes('--')).toBe(true)
  })
})

describe('⑧④ 前置：HOME 祖先拒绝（决策 13 ④）与再遮闭合', () => {
  it('工作区等于/是任一 HOME 的祖先 → bwrap: 拒绝、不 exec；工作区在 HOME 之下放行', () => {
    const home = mkdtempSync(join(tmpdir(), 'p5-01-home-'))
    const inside = join(home, 'ws')
    mkdirSync(inside)
    // 等值 → 拒
    const eq = runWrapper(['--home', home, ...profileArgs(home), '--', '/bin/true'])
    expect(eq.status).not.toBe(0)
    expect(eq.stderr).toContain('bwrap: ')
    // 祖先（HOME 的父目录）→ 拒
    const anc = runWrapper(['--home', home, ...profileArgs(join(home, '..')), '--', '/bin/true'])
    expect(anc.status).not.toBe(0)
    expect(anc.stderr).toContain('bwrap: ')
    // 工作区在 HOME 之下（生产 ~/.config/<app>/workspaces/X 布局）→ 放行
    const ok = runWrapper(['--home', home, ...profileArgs(inside), '--', '/bin/true'])
    expect(ok.status, `bind under HOME must run (stderr: ${ok.stderr})`).toBe(0)
    rmSync(home, { recursive: true, force: true })
  })

  it('再遮：mask 根 == 工作区 → 整根 tmpfs 垫底（⑨ 的再遮一步）', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'p5-01-data-'))
    writeFileSync(join(dataDir, 'standing-grants.json'), '{}')
    const argv = dryRun(['--home', '/tmp/p5-01-nohome', '--mask', dataDir, '--never', join(dataDir, 'standing-grants.json'),
      ...profileArgs(dataDir), '--', '/bin/true'])
    // bind 对（src==dst 各一次）之后还有一次 --tmpfs dataDir（再遮整根）
    const bindAt = argv.indexOf('--bind')
    expect(argv[bindAt + 1]).toBe(dataDir)
    expect(argv[bindAt + 2]).toBe(dataDir)
    const remaskAt = argv.lastIndexOf(dataDir)
    expect(argv[remaskAt - 1]).toBe('--tmpfs')
    expect(remaskAt).toBeGreaterThan(bindAt)
    // 更深的 never（standing-grants.json）被顶层 dataDir 覆盖，不再单独出现
    expect(argv).not.toContain(join(dataDir, 'standing-grants.json'))
    rmSync(dataDir, { recursive: true, force: true })
  })
})

describe('真实 exec 冒烟（不经 dry-run）', () => {
  it('遮蔽目录内哨兵不可见、命令退出码透传', () => {
    const secret = mkdtempSync(join(tmpdir(), 'p5-01-secret-'))
    writeFileSync(join(secret, 'sentinel'), 'x')
    const ws = mkdtempSync(join(tmpdir(), 'p5-01-ws-'))
    const res = runWrapper(['--home', '/tmp/p5-01-nohome', '--mask', secret, ...profileArgs(ws), '--',
      '/bin/sh', '-c', 'test -e ' + join(secret, 'sentinel')])
    expect(res.status, `遮蔽后哨兵不可见（stderr: ${res.stderr}）`).toBe(1)
    // 未遮路径正常执行：命令自身退出码 7 透传
    const ok = runWrapper(['--home', '/tmp/p5-01-nohome', ...profileArgs(ws), '--', '/bin/sh', '-c', 'exit 7'])
    expect(ok.status).toBe(7)
    for (const d of [secret, ws]) rmSync(d, { recursive: true, force: true })
  })
})
