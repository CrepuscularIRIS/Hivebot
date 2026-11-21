// T73b：standing-grants 门——记住「始终允许这个 bot 用这个连接器」。
// 安全三保：①粒度 bot×连接器不外溢（③④）②授权只能来自活卡作答（⑤⑥）
// ③存储坏回出卡不回放行（⑧）。单测直接驱动判定+RPC（shell-ask apply 的 mcp 分支
// 与 connector-grants 模块），存储与待答经临时 dataDir 隔离。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const grantsPath = (): string => join(mkdtempSync(join(tmpdir(), 't73b-ut-')), 'standing-grants.json')
const writeRaw = (p: string, raw: string): void => writeFileSync(p, raw)

// 判定驱动：直接 import shell-ask 的 apply 太重（要完整 ctx）——待答/查询经
// connector-grants 模块的导出面；shell-ask 侧接线由「判定行为等价」覆盖：
// 待答登记（judgeAsk 前）→ remember → judgeAgain。见 beforeEach 动态 import。
type Grants = {
  judge: (botId: string, serverName: string) => 'allow' | 'ask'
  markPending: (botId: string, serverName: string) => void
  remember: (botId: string, serverName: string) => { ok: boolean; reason?: string }
  clear: () => { clearedCount: number }
}
const load = async (): Promise<{ createGrants: (opts: { path: string; pendingTtlMs?: number }) => Grants }> => {
  vi.resetModules()
  return import('../../src/p2sdk/connector-grants.mjs')
}

describe('T73b standing-grants 门', () => {
  let dir: string
  let path: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 't73b-ut-')); path = join(dir, 'standing-grants.json') })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('① 无记录 → ask 且登记待答', async () => {
    const g = (await load()).createGrants({ path })
    expect(g.judge('bot-a', 'server-memory-30e6e77d')).toBe('ask')
    g.markPending('bot-a', 'server-memory-30e6e77d')
    expect(g.remember('bot-a', 'server-memory-30e6e77d').ok, '待答存在 → 可写入').toBe(true)
  })

  it('② remember 后同 bot 同连接器 → allow', async () => {
    const g = (await load()).createGrants({ path })
    g.markPending('bot-a', 'mem')
    expect(g.remember('bot-a', 'mem').ok).toBe(true)
    expect(g.judge('bot-a', 'mem')).toBe('allow')
  })

  it('③ 另一个 bot 同连接器 → 仍 ask（粒度不外溢到别的 bot）', async () => {
    const g = (await load()).createGrants({ path })
    g.markPending('bot-a', 'mem'); await g.remember('bot-a', 'mem')
    expect(g.judge('bot-b', 'mem')).toBe('ask')
  })

  it('④ 同 bot 另一个连接器 → 仍 ask', async () => {
    const g = (await load()).createGrants({ path })
    g.markPending('bot-a', 'mem'); await g.remember('bot-a', 'mem')
    expect(g.judge('bot-a', 'fs-abc')).toBe('ask')
  })

  it('⑤ 无待答直接 remember → refused 且文件未写', async () => {
    const g = (await load()).createGrants({ path })
    const r = g.remember('bot-a', 'mem')
    expect(r.ok).toBe(false)
    // refused 不创建/不改文件：不存在 = 从未写入；存在（此前写过）= 内容不变
    expect(existsSync(path), 'refused 不落文件').toBe(false)
  })

  it('⑥ 待答过期后 remember → refused', async () => {
    vi.useFakeTimers()
    try {
      const mod = await load()
      const g = mod.createGrants({ path, pendingTtlMs: 1 })
      g.markPending('bot-a', 'mem')
      vi.advanceTimersByTime(2)
      expect(g.remember('bot-a', 'mem').ok).toBe(false)
      expect(g.judge('bot-a', 'mem')).toBe('ask')
    } finally { vi.useRealTimers() }
  })

  it('⑦ clear → {clearedCount:N} 且之后回 ask', async () => {
    const g = (await load()).createGrants({ path })
    g.markPending('bot-a', 'mem'); g.remember('bot-a', 'mem')
    g.markPending('bot-b', 'fs'); g.remember('bot-b', 'fs')
    g.markPending('bot-c', 'ctx'); g.remember('bot-c', 'ctx')
    expect(g.clear()).toEqual({ clearedCount: 3 })
    expect(g.judge('bot-a', 'mem')).toBe('ask')
  })

  it('⑧ 坏 JSON / 版本不符 → fail closed（ask）', async () => {
    writeRaw(path, '{not json')
    const g = (await load()).createGrants({ path })
    expect(g.judge('bot-a', 'mem')).toBe('ask')
    writeRaw(path, '{"version":99,"connectors":{"bot-a":["mem"]}}')
    const g2 = (await load()).createGrants({ path })
    expect(g2.judge('bot-a', 'mem'), '版本不符不当授权').toBe('ask')
  })

  it('⑩ T73b 三审中①：批准放行消费待答——答完后 remember refused（半边生命周期闭环）', async () => {
    const g = (await load()).createGrants({ path })
    g.markPending('bot-a', 'mem')
    expect(g.remember('bot-a', 'mem').ok, '活卡期 remember 合法').toBe(true)
    g.markPending('bot-b', 'mem')
    g.consumePending('bot-b', 'mem') // dsh 批准放行的 next 回调
    expect(g.remember('bot-b', 'mem').ok, '答完的卡不再是活卡').toBe(false)
    expect(g.judge('bot-b', 'mem'), '未记住的不放行').toBe('ask')
  })

  it('⑨ remember/clear 形状校验：坏 botId / serverName 拒（文件未变）', async () => {
    const g = (await load()).createGrants({ path })
    g.markPending('bot-a', 'mem')
    expect(g.remember('../evil', 'mem').ok).toBe(false)
    expect(g.remember('bot-a', 'mem ../../x').ok).toBe(false)
    expect(g.remember('', '').ok).toBe(false)
    expect(existsSync(path), '坏形状不落文件').toBe(false)
  })
})
