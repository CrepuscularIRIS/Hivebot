// P5-01 单测：never-roots.mjs（决策 6/13/15）——凭证根单一清单模块。
// 常量逐项对照 PLAN 决策 13 ① 的 v1 列表与本机扫描（evidence/P5-01/host-cred-paths.md），
// 防止清单被顺手改动；computeRoots 只在测试自建目录树里断言，不读真实凭证内容。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CREDENTIAL_HOME_ENTRIES,
  HOME_OUTSIDE_NEVER,
  TOOLCHAIN_CREDENTIALS,
  TOOLCHAIN_DIRS,
  computeRoots,
} from '../../src/policy/never-roots.mjs'

describe('常量（决策 13 ① v1 清单 + 本机扫描）', () => {
  it('CREDENTIAL_HOME_ENTRIES 逐项等于决策 13 ① 的 13 项，顺序无关', () => {
    expect([...CREDENTIAL_HOME_ENTRIES].sort()).toEqual([
      '.aws',
      '.claude*',
      '.config/**/credentials*',
      '.config/gh',
      '.docker/config.json',
      '.git-credentials',
      '.gnupg',
      '.grokbot',
      '.kube',
      '.netrc',
      '.npmrc',
      '.pypirc',
      '.ssh',
    ].sort())
  })

  it('工具链白名单与工具链内凭证文件（宿主扫描 2026-11-03）', () => {
    expect([...TOOLCHAIN_DIRS].sort()).toEqual(['.local/bin', '.npm-global', 'miniconda3'])
    expect([...TOOLCHAIN_CREDENTIALS].sort()).toEqual(['miniconda3/.condarc', 'miniconda3/etc/aau_token'])
  })

  it('HOME 外清单来自宿主扫描（/etc/ppp 拨号凭证）', () => {
    expect(HOME_OUTSIDE_NEVER).toContain('/etc/ppp/chap-secrets')
    expect(HOME_OUTSIDE_NEVER).toContain('/etc/ppp/pap-secrets')
  })
})

/** 建一棵假 HOME/数据目录树；只创建路径不写敏感内容。 */
function fakeTree(): { home: string; dataDir: string; passwdHome: string } {
  const root = mkdtempSync(join(tmpdir(), 'p5-01-neverroots-'))
  const home = join(root, 'env-home')
  const passwdHome = join(root, 'passwd-home')
  const dataDir = join(root, 'data')
  for (const d of [
    join(home, '.ssh'), join(home, '.config', 'gh'), join(home, '.claude'),
    join(passwdHome, 'miniconda3', 'etc'), join(passwdHome, '.local', 'bin'),
    join(home, '.dsh-x'), join(home, 'pkg'), dataDir,
  ]) mkdirSync(d, { recursive: true })
  writeFileSync(join(home, '.claude.json'), '{}')
  writeFileSync(join(passwdHome, 'miniconda3', '.condarc'), 'x')
  writeFileSync(join(dataDir, 'standing-grants.json'), '{}')
  writeFileSync(join(dataDir, 'policy-state.json'), '{}')
  return { home, dataDir, passwdHome }
}

describe('computeRoots', () => {
  it('homes 去重（envHome == passwdHome 只留一份）；maskRoots 覆盖决策 15 的数据根与运行时根', () => {
    const { home, dataDir } = fakeTree()
    const handoff = mkdtempSync(join(tmpdir(), 'p2sdk-handoff-'))
    const roots = computeRoots({
      envHome: home, passwdHome: home, home: join(home, '.dsh-x'), handoff,
      dataDirs: [dataDir], pkgRoot: join(home, 'pkg'),
    })
    expect(roots.homes).toEqual([home])
    for (const m of [home, join(home, '.dsh-x'), handoff, dataDir, `/run/user/${process.getuid()}`, ...HOME_OUTSIDE_NEVER]) {
      expect(roots.maskRoots, `maskRoots 含 ${m}`).toContain(m)
    }
    rmSync(join(home, 'pkg'), { recursive: true, force: true })
  })

  it('neverRoots：凭证类别实体 + .claude* 通配展开 + 数据根下 policy-state/standing-grants + 工具链凭证', () => {
    const { home, dataDir, passwdHome } = fakeTree()
    const handoff = mkdtempSync(join(tmpdir(), 'p2sdk-handoff-'))
    const roots = computeRoots({
      envHome: home, passwdHome, home: join(home, '.dsh-x'), handoff,
      dataDirs: [dataDir], pkgRoot: join(home, 'pkg'),
    })
    expect(roots.neverRoots).toContain(join(home, '.ssh'))
    expect(roots.neverRoots).toContain(join(home, '.config', 'gh'))
    // .claude* 顶层通配：.claude 目录与 .claude.json 都进清单
    expect(roots.neverRoots).toContain(join(home, '.claude'))
    expect(roots.neverRoots).toContain(join(home, '.claude.json'))
    // 决策 16/v2.1：数据根下的 policy-state.json 与 standing-grants.json 显式列为硬 NEVER
    expect(roots.neverRoots).toContain(join(dataDir, 'policy-state.json'))
    expect(roots.neverRoots).toContain(join(dataDir, 'standing-grants.json'))
    // 工具链白名单目录内的凭证（v2.1：.condarc 等登记进 never-roots）
    expect(roots.neverRoots).toContain(join(passwdHome, 'miniconda3', '.condarc'))
    // 不存在的凭证类别（本例 .aws）不进清单（存在性过滤）
    expect(roots.neverRoots).not.toContain(join(home, '.aws'))
  })

  it('handoff 通配：宿主 /tmp 下既有 p2sdk-handoff-* 目录也遮蔽（决策 13 ①）', () => {
    const { home, dataDir } = fakeTree()
    const mine = mkdtempSync(join(tmpdir(), 'p2sdk-handoff-'))
    const sibling = mkdtempSync(join(tmpdir(), 'p2sdk-handoff-'))
    const roots = computeRoots({
      envHome: home, passwdHome: home, home: join(home, '.dsh-x'), handoff: mine,
      dataDirs: [dataDir], pkgRoot: join(home, 'pkg'),
    })
    expect(roots.maskRoots, '本次 handoff 在列').toContain(mine)
    expect(roots.maskRoots, '宿主 /tmp 下其他 p2sdk-handoff-* 也在').toContain(sibling)
  })

  it('toolchainDirs：passwd home 下存在的白名单目录，缺失项跳过', () => {
    const { home, passwdHome } = fakeTree()
    const roots = computeRoots({
      envHome: home, passwdHome, home: join(home, '.dsh-x'), handoff: join(home, 'ho'),
      dataDirs: [join(home, 'd')], pkgRoot: join(home, 'pkg'),
    })
    expect(roots.toolchainDirs).toEqual([join(passwdHome, 'miniconda3'), join(passwdHome, '.local', 'bin')])
  })

  it('policyRoots：pkgRoot + repoRoot/.claude + .git（worktree 下 .git 为指针文件时解析 gitdir）', () => {
    const { home } = fakeTree()
    const repo = join(home, 'repo')
    mkdirSync(join(repo, '.claude'), { recursive: true })
    mkdirSync(join(repo, 'gitdir-real'), { recursive: true })
    writeFileSync(join(repo, '.git'), `gitdir: ${join(repo, 'gitdir-real')}\n`)
    const roots = computeRoots({
      envHome: home, passwdHome: home, home: join(home, '.dsh-x'), handoff: join(home, 'ho'),
      dataDirs: [join(home, 'd')], pkgRoot: join(home, 'pkg'), repoRoot: repo,
    })
    expect(roots.policyRoots).toEqual([join(home, 'pkg'), join(repo, '.claude'), join(repo, 'gitdir-real')])
  })

  it('本机真实布局：passwd home 工具链与 /run/user/<uid> 都在（只探存在性）', () => {
    const real = userInfo().homedir
    const { home } = fakeTree()
    const roots = computeRoots({
      envHome: home, passwdHome: real, home: join(home, '.dsh-x'), handoff: join(home, 'ho'),
      dataDirs: [join(home, 'd')], pkgRoot: join(home, 'pkg'),
    })
    expect(roots.toolchainDirs).toContain(join(real, 'miniconda3'))
    expect(roots.maskRoots).toContain(`/run/user/${process.getuid()}`)
    expect(roots.neverRoots).toContain(join(real, 'miniconda3', 'etc', 'aau_token'))
  })
})
