// P5-H2 回归：handoffSiblings() 的 statSync TOCTOU。全量并发下其他 vitest fork 的
// e2e afterAll（guard-fs.test.ts / sandbox-hardened.test.ts 的 rmSync(rt.handoff)）
// 会在 readdir→stat 的窗口里删掉 /tmp/p2sdk-handoff-*；旧实现两遍扫描（isDir 一遍
// + mtime 一遍），第二遍 statSync 无守卫 → computeRoots 抛 ENOENT → 调用它的
// never-roots 用例偶发红（单文件恒绿、复跑恒绿）。并发交错无法在单线程单测里真实
// 触发，故 mock node:fs.statSync 对目标目录**第二次**调用抛 ENOENT——精确复刻
// 「pass 1 看见、pass 2 消失」的形状；修复（单次 stat + 容错）只调一次，不会踩中。
// 独立文件：vi.mock 是文件级，不把其余 10 个 never-roots 用例卷进 mock。
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { tmkdir } from '../support/tmp-sweep.ts'

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const calls = new Map<string, number>()
  return {
    ...real,
    statSync(path: unknown, ...opts: unknown[]) {
      // U-18：vitest teardown 会以零参调用 mock —— 直接返回 undefined，不碰真 fs
      if (path === undefined) return undefined
      if (typeof path === 'string' && path.includes('p2sdk-handoff-race')) {
        const n = (calls.get(path) ?? 0) + 1
        calls.set(path, n)
        if (n >= 2) {
          const e = new Error(`ENOENT: no such file or directory, stat '${path}'`) as NodeJS.ErrnoException
          e.code = 'ENOENT'
          throw e
        }
      }
      return real.statSync(path as Parameters<typeof real.statSync>[0], ...(opts as []))
    },
  }
})

describe('computeRoots 并发容错（P5-H2 TOCTOU）', () => {
  it('handoff sibling 在 readdir 与 stat 之间被并发 teardown 删除时不抛 ENOENT，其余 sibling 照常入列', async () => {
    const root = tmkdir('p5-h2-race-')
    const home = join(root, 'home')
    for (const d of ['.dsh-x', 'pkg', 'd']) mkdirSync(join(home, d), { recursive: true })
    // 竞争目标（含 magic 前缀 p2sdk-handoff-race → statSync 第 2 次起抛 ENOENT）
    const target = tmkdir('p2sdk-handoff-race-')
    // 无 magic 前缀的存活 sibling：永远走真 stat
    const survivor = tmkdir('p2sdk-handoff-')

    const { computeRoots } = await import('../../src/policy/never-roots.mjs')
    let thrown: unknown = null
    let roots: ReturnType<typeof computeRoots> | null = null
    try {
      roots = computeRoots({
        envHome: home, passwdHome: home, home: join(home, '.dsh-x'), handoff: join(home, 'ho'),
        dataDirs: [join(home, 'd')], pkgRoot: join(home, 'pkg'),
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown, `computeRoots 不应抛（旧实现此处抛 ENOENT）: ${String(thrown)}`).toBeNull()
    expect(roots!.maskRoots, '存活 sibling 仍在遮蔽清单').toContain(survivor)

    rmSync(root, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
    rmSync(survivor, { recursive: true, force: true })
  })
})
