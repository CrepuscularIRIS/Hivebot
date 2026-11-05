// P5-H3：TEST_HOME 运行级唯一化。互踩集 7 文件原先各自硬编码
// /home/lingxufeng/bot/.test-homes/p5-0X（决策 8），两个并行全量（不同
// worktree）共享同一物理目录，beforeAll 的 rmSync 互删哨兵即红
// （REPORT-P5-H1 发现 3）。修法：保留决策 8 的父目录不变（sandbox-hardened ⑧
// 的 repoRootContainsHome 布局分支依赖「主仓跑 = HOME 在仓根之下、worktree
// 跑 = 不在」这一事实），叶子加 mkdtemp 随机后缀 → 每次运行唯一；
// trackTmpDir 走 H1 登记簿（tests/support/tmp-sweep.ts），进程退出兜底清扫。
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { trackTmpDir } from './tmp-sweep.ts'

const PARENT = '/home/lingxufeng/bot/.test-homes' // 决策 8（主仓 .gitignore 已覆盖）

/** 每次运行唯一的测试 HOME：PARENT/<slug>-<mkdtemp 随机>。 */
export function uniqueTestHome(slug: string): string {
  return trackTmpDir(mkdtempSync(join(PARENT, `${slug}-`)))
}
