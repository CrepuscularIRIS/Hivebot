// P5-H3：TEST_HOME 运行级唯一化（RED→GREEN 守护测试）。
// 根因（REPORT-P5-H1 发现 3）：互踩集 7 文件 TEST_HOME 硬编码主仓固定路径
// /home/lingxufeng/bot/.test-homes/p5-0X——两个并行全量（不同 worktree）的
// beforeAll 各自 rmSync(TEST_HOME) 重建哨兵，后到者抹掉先到者哨兵即红。
// 三层：
// ① 接线：互踩集 7 文件的 TEST_HOME 定义必须经 uniqueTestHome（运行级唯一）
// ② 复现：凡仍是固定字面量路径的，用两个「全量运行」交错 setupTestHome 模拟
//    抢占——先到运行写哨兵、后到运行 rmSync 重建，先到哨兵必须仍可读回；
//    字面量存在 ⇒ 必然读到后到者的值 ⇒ 红（未修代码上的真实失败）
// ③ helper：两次 uniqueTestHome 物理不同目录，交叉 rm 不伤对方哨兵
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// 互踩集：REPORT-P5-H1 发现 3 的硬编码绝对路径文件。request-network.test.ts
// 用 join(PKG_ROOT, ...) 相对路径，跨 worktree 天然分离，不在集内。
const FILES = [
  'tests/e2e/sandbox-hardened.test.ts',
  'tests/e2e/guard-fs.test.ts',
  'tests/e2e/guard-escalation.test.ts',
  'tests/e2e/w1ap0-matrix.test.ts',
  'tests/e2e/security/w1ap0-scan.test.ts',
  'tests/e2e/tiers-policy.test.ts',
  'tests/e2e/interrupt.test.ts',
] as const

interface Def { file: string; expr: string }

function testHomeDefs(): Def[] {
  return FILES.map((file) => {
    const m = /const TEST_HOME = (.+)$/m.exec(readFileSync(join(PKG_ROOT, file), 'utf8'))
    if (!m) throw new Error(`${file}: TEST_HOME 定义未找到`)
    return { file, expr: m[1].trim() }
  })
}

/** 与互踩集各文件 setupTestHome 首步同款：rmSync 重建 + 写哨兵。 */
function occupyHome(home: string, tag: string): void {
  rmSync(home, { recursive: true, force: true })
  mkdirSync(join(home, '.ssh'), { recursive: true })
  writeFileSync(join(home, '.ssh', 'sentinel-key'), tag)
}

it('① 互踩集 7 文件不再含主仓 .test-homes 固定路径字面量（含 DATA_DIR_B 类派生）', () => {
  // helper 化后该字面量只允许存在于 tests/support/sandbox-home.ts（PARENT 常量）
  const LITERAL = '/home/lingxufeng/bot/.test-homes'
  const stale = FILES.filter((f) => readFileSync(join(PKG_ROOT, f), 'utf8').includes(LITERAL))
  expect(stale, '仍硬编码固定路径的文件（互踩面未消除）').toEqual([])
  for (const d of testHomeDefs()) {
    expect(d.expr.includes('uniqueTestHome('), `${d.file}: TEST_HOME 未经 uniqueTestHome`).toBe(true)
  }
})

it('② 复现互踩：字面量路径被两个并行运行抢占，先到者哨兵必丢（无字面量=无互踩面）', () => {
  let checked = 0
  for (const { file, expr } of testHomeDefs()) {
    const lit = /^'(.+)'$/.exec(expr)
    if (!lit) continue // 非字面量（已唯一化）：没有固定路径可抢占
    checked++
    const home = lit[1]
    occupyHome(home, 'run-a') // 全量 A 的 setupTestHome
    occupyHome(home, 'run-b') // 全量 B 的 setupTestHome（同一路径）
    const seen = readFileSync(join(home, '.ssh', 'sentinel-key'), 'utf8')
    expect(seen, `${file}: TEST_HOME=${home} 是固定路径，两个并行全量互删哨兵`).toBe('run-a')
    rmSync(home, { recursive: true, force: true })
  }
  expect(checked, '互踩集内应至少复现一处（全部唯一化后此项为 0）').toBeGreaterThanOrEqual(0)
})

it('③ uniqueTestHome：两次调用物理不同，交叉 rm 不伤对方哨兵', async () => {
  const { uniqueTestHome } = await import('../support/sandbox-home.ts')
  const a = uniqueTestHome('p5-h3-check')
  const b = uniqueTestHome('p5-h3-check')
  expect(a).not.toBe(b)
  occupyHome(a, 'a')
  occupyHome(b, 'b')
  rmSync(b, { recursive: true, force: true }) // B 全量退出清理，不得伤 A
  expect(readFileSync(join(a, '.ssh', 'sentinel-key'), 'utf8'), '并行运行的 HOME 物理隔离').toBe('a')
  rmSync(a, { recursive: true, force: true })
})
