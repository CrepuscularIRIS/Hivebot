// P5-02 验收 ⑩：isPathUnder 复制件（来源 deepseek-harness@ce7073d）的路径
// 形态单测 —— `..` 拼写、大小写、末尾斜杠。真实路径判定走 e2e（guard-fs）。
import { describe, expect, it } from 'vitest'
import { isPathUnder } from '../../src/policy/containment.mjs'

describe('isPathUnder (P5-02 ⑩)', () => {
  it('相等与真前缀', async () => {
    await expect(isPathUnder('/a/b', '/a/b')).resolves.toBe(true)
    await expect(isPathUnder('/a/b/c', '/a/b')).resolves.toBe(true)
    await expect(isPathUnder('/a/bc', '/a/b')).resolves.toBe(false)
  })

  it('`..` 拼写：非 canonical 输入走保守 lexical 前缀（fail closed）；等价实路径由身份比对兜底', async () => {
    // 复制件约定输入 canonical；带字面 `..` 的非 canonical 拼写按前缀保守命中
    // （/a/x/../b startsWith /a/ → true），guard 侧输入一律先经 ctx.fs.resolve。
    await expect(isPathUnder('/a/x/../b', '/a')).resolves.toBe(true)
    await expect(isPathUnder('/x/../a/b', '/a/c')).resolves.toBe(false)
    // 真实目录 + 符号链接到达同一 inode → 身份比对命中（lexical 不一致时兜底）
    const { mkdirSync, symlinkSync, rmSync, realpathSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = join(realpathSync(tmpdir()), 'bot-p5-02-containment')
    rmSync(root, { recursive: true, force: true })
    mkdirSync(join(root, 'x'), { recursive: true })
    symlinkSync(root, join(root, 'x', 'alias'))
    try {
      await expect(isPathUnder(join(root, 'x', 'alias'), root)).resolves.toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('大小写：POSIX 大小写敏感（默认 caseSensitive=true）', async () => {
    await expect(isPathUnder('/A/B/c', '/a/b')).resolves.toBe(false)
    await expect(isPathUnder('/a/b/c', '/a/b', false)).resolves.toBe(true)
  })

  it('末尾斜杠：根与目标带不带尾斜杠结果一致', async () => {
    await expect(isPathUnder('/a/b/', '/a/b')).resolves.toBe(true)
    await expect(isPathUnder('/a/b/c/', '/a/b/')).resolves.toBe(true)
    await expect(isPathUnder('/a/bc/', '/a/b/')).resolves.toBe(false)
  })

  it('缺失目标回退：不存在时 lexical 不命中即 false，不抛错', async () => {
    await expect(isPathUnder('/nonexistent-p5-02/x', '/nonexistent-p5-02/y')).resolves.toBe(false)
  })
})
