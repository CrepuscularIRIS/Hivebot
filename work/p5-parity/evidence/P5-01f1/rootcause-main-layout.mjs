// P5-01.f1 取证：主仓布局下 cwd=REPO_ROOT 的 wrapper 判定（复刻 start.ts 组装）
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { computeRoots } from 'file:///home/lingxufeng/bot/app/sdk/src/policy/never-roots.mjs'

const PKG_ROOT = '/home/lingxufeng/bot/app/sdk'
const REPO_ROOT = resolve(PKG_ROOT, '..', '..')
const TEST_HOME = '/home/lingxufeng/bot/.test-homes/p5-01'
// 与 setupTestHome 相同的最小哨兵
rmSync(TEST_HOME, { recursive: true, force: true })
mkdirSync(join(TEST_HOME, '.ssh'), { recursive: true })
writeFileSync(join(TEST_HOME, '.ssh', 'sentinel-key'), 'p501-sentinel')
mkdirSync(join(TEST_HOME, 'pbots-data', 'workspaces', 'other-bot'), { recursive: true })
writeFileSync(join(TEST_HOME, 'pbots-data', 'token-sentinel'), 'p501-token')
const dshHome = join(PKG_ROOT, '.dsh')
mkdirSync(dshHome, { recursive: true })
writeFileSync(join(dshHome, 'session-log-sentinel'), 'p501')
const handoff = '/tmp/p2sdk-handoff-proof'

const roots = computeRoots({
  envHome: TEST_HOME, passwdHome: userInfo().homedir, home: dshHome, handoff,
  dataDirs: [join(TEST_HOME, 'pbots-data')], extraMaskRoots: [],
  pkgRoot: PKG_ROOT, repoRoot: REPO_ROOT,
})
const argv = ['/usr/bin/python3', '-I', join(PKG_ROOT, 'sandbox', 'bwrap-wrap.py'),
  ...roots.homes.flatMap((p) => ['--home', p]),
  ...roots.maskRoots.flatMap((p) => ['--mask', p]),
  ...roots.neverRoots.flatMap((p) => ['--never', p]),
  ...roots.toolchainDirs.flatMap((p) => ['--tool', p]),
  ...roots.policyRoots.flatMap((p) => ['--policy', p]),
  // dsh sandbox-local workspace-write 档形状
  '--ro-bind', '/', '/', '--dev', '/dev', '--unshare-pid', '--proc', '/proc', '--die-with-parent',
  '--tmpfs', '/tmp', '--bind', REPO_ROOT, REPO_ROOT,
  '--', '/bin/sh', '-c', 'echo RESULT probe=ran']
console.log('=== cwd=REPO_ROOT (main layout) ===')
const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 30_000 })
console.log('status:', r.status)
console.log('stdout:', r.stdout)
console.log('stderr:', r.stderr)
