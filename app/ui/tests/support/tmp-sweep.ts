// P5-H1 测试临时目录登记簿（与 app/sdk/tests/support/tmp-sweep.ts 同构；ui 侧因 playwright
// CJS 转译约束不跨包 import，独立成文件）。只删本进程登记过的目录，进程退出时统一清扫。
// 为什么不在 stop() 里立即删：settings.spec.ts:147 等用例 stop 后还要用同一 home 重启；
// 退出清扫对「崩溃没调 stop」同样兜底。原则（派发）：按创建记录删、不扫 /tmp；
// 清理失败只 console.warn，绝不 fail 测试。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface SweepState { dirs: string[]; hooked: boolean }
const g = globalThis as typeof globalThis & { __pbotsTmpSweep?: SweepState }
// vitest 隔离会在同一 worker 里重求值模块：globalThis 保证全进程一张登记簿、一个 exit 钩子
const state: SweepState = (g.__pbotsTmpSweep ??= { dirs: [], hooked: false })

/** 登记一个本测试进程创建的临时目录（返回原路径，便于内联使用）。 */
export function trackTmpDir(dir: string): string {
  state.dirs.push(dir)
  if (!state.hooked) {
    state.hooked = true
    process.on('exit', sweepTmpDirs)
  }
  return dir
}

/** mkdtempSync(join(tmpdir(), prefix)) 的受管版本：建目录并登记。 */
export function tmkdir(prefix: string): string {
  return trackTmpDir(mkdtempSync(join(tmpdir(), prefix)))
}

/** 清扫全部登记目录；单目录失败只 warn 不抛；幂等（清空登记簿）。 */
export function sweepTmpDirs(): void {
  const pending = state.dirs
  state.dirs = []
  for (const dir of pending) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      console.warn(`[tmp-sweep] cleanup failed (ignored): ${dir}:`, err)
    }
  }
}
