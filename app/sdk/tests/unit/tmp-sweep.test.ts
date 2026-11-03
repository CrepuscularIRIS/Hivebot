// P5-H1 单测：tmp-sweep（测试临时目录登记簿）。
// 核心性质：① 只删登记过的目录（同前缀未登记的兄弟目录必须幸存——按创建记录，不按前缀扫删）；
// ② 清理失败只 warn 不抛（不 fail 测试）；③ 幂等。
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sweepTmpDirs, tmkdir, trackTmpDir } from '../support/tmp-sweep'

const leftovers: string[] = []
afterEach(() => { for (const d of leftovers) rmSync(d, { recursive: true, force: true }); leftovers.length = 0 })

describe('P5-H1 tmp-sweep', () => {
  it('tmkdir：在 tmpdir 下按前缀建目录并登记，sweep 后消失', () => {
    const dir = tmkdir('p2sdk-h1-selfcheck-')
    expect(existsSync(dir)).toBe(true)
    sweepTmpDirs()
    expect(existsSync(dir)).toBe(false)
  })

  it('只删登记的：同前缀未登记的兄弟目录幸存（按创建记录，不按前缀扫删）', () => {
    const tracked = trackTmpDir(mkdtempSync(join(tmpdir(), 'p2sdk-h1-pair-')))
    const sibling = mkdtempSync(join(tmpdir(), 'p2sdk-h1-pair-')) // 原生 mkdtemp，未登记
    leftovers.push(sibling)
    sweepTmpDirs()
    expect(existsSync(tracked), '登记的应被删').toBe(false)
    expect(existsSync(sibling), '未登记的同前缀兄弟必须幸存').toBe(true)
  })

  it('清理失败只 warn 不抛，其余登记目录照常清', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parent = tmkdir('p2sdk-h1-ro-')
    const blocked = join(parent, 'blocked')
    mkdirSync(blocked)
    const other = tmkdir('p2sdk-h1-ro-other-')
    try {
      chmodSync(parent, 0o555) // 去写权限：递归删除需先删子项 → EACCES
      expect(() => sweepTmpDirs()).not.toThrow()
      expect(warn).toHaveBeenCalled()
    } finally {
      chmodSync(parent, 0o755)
    }
    expect(existsSync(other), '失败不影响后续目录').toBe(false)
    expect(existsSync(blocked), '受权限阻塞的目录本轮留置').toBe(true)
    warn.mockRestore()
    rmSync(parent, { recursive: true, force: true })
  })

  it('幂等：重复 sweep 不抛', () => {
    tmkdir('p2sdk-h1-idem-')
    sweepTmpDirs()
    expect(() => sweepTmpDirs()).not.toThrow()
  })
})
