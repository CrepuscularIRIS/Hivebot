// Run legacy directional suites with fixture roots relocated under a temporary HOME.
// Temporary source copies preserve relative imports and are deleted even on failure.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// T1：自建临时目录登记，进程退出时删除（.proc.mjs import 不了 TS 登记簿）
const __t1Dirs = []
const regTmp = (d) => { __t1Dirs.push(d); return d }
process.on('exit', () => { for (const d of __t1Dirs) { try { rmSync(d, { recursive: true, force: true }) } catch (e) { /* 删除失败不阻断退出 */ } } })

const sdk = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const root = regTmp(mkdtempSync(join(tmpdir(), 'bot-p626t-regression-')))
const names = ['tiers-policy', 'w1ap0-matrix', 'guard-escalation']
const copies = []
try {
  for (const name of names) {
    const path = join(sdk, 'tests/e2e', `p626t-regress-${name}.test.ts`)
    let source = readFileSync(join(sdk, 'tests/e2e', `${name}.test.ts`), 'utf8')
      .replaceAll('/home/lingxufeng/bot/.test-homes/', root + '/')
    if (name === 'w1ap0-matrix') {
      // Stock bwrap hides /tmp. Rebind only these synthetic fixture roots for its
      // positive controls (the original /home fixtures were visible via /).
      source = source.replace('# P5-06 stock 差分：同时摘掉三层 P5 防线（wrapper / fs-guard / shell-ask）',
        '# P626T stock-only synthetic fixture mounts\n- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: ${WS}\n    additionalWritableRoots: [${TEST_HOME}, ${DATA_DIR_B}]')
    }
    writeFileSync(path, source)
    copies.push(path)
  }
  const result = spawnSync('pnpm', ['test', ...copies, 'tests/e2e/approval.test.ts', 'tests/e2e/write-outside.test.ts', 'tests/e2e/process-tiers.test.ts', 'tests/unit/policy.test.ts'], {
    cwd: sdk, env: { ...process.env, HOME: root }, stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  for (const file of copies) rmSync(file, { force: true })
}
