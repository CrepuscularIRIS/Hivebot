import { describe, expect, it } from 'vitest'
import { resolveMasterId, readDiscoveredMasterId } from '../src/app/master-id.ts'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('B41a master-id discovered 来源（m3 bots.json）', () => {
  it('优先级：pin > discovered > stored > fallback', () => {
    expect(resolveMasterId('pin', 'disc', 'stored', 'fb')).toBe('pin')
    expect(resolveMasterId(undefined, 'disc', 'stored', 'fb')).toBe('disc')
    expect(resolveMasterId('', 'disc', 'stored', 'fb')).toBe('disc')
    expect(resolveMasterId(undefined, undefined, 'stored', 'fb')).toBe('stored')
    expect(resolveMasterId(undefined, undefined, undefined, 'fb')).toBe('fb')
    // 空串/空白串都当未配置
    expect(resolveMasterId(undefined, '  ', 'stored', 'fb')).toBe('stored')
  })

  it('readDiscoveredMasterId 读 $PBOTS_DATA_DIR/bots.json 的 mainBotId', () => {
    const dir = mkdtempSync(join(tmpdir(), 'b41a-'))
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: 'session-abc', recipes: {} }))
    expect(readDiscoveredMasterId(dir)).toBe('session-abc')
    // mainBotId null → undefined
    writeFileSync(join(dir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: null, recipes: {} }))
    expect(readDiscoveredMasterId(dir)).toBeUndefined()
    // 文件不存在 → undefined（不 throw）
    expect(readDiscoveredMasterId(join(dir, 'nope'))).toBeUndefined()
    // 坏 JSON → undefined（不 throw）
    writeFileSync(join(dir, 'bots.json'), '{broken')
    expect(readDiscoveredMasterId(dir)).toBeUndefined()
  })

  it('readDiscoveredMasterId 缺 dir 参数 → undefined', () => {
    expect(readDiscoveredMasterId(undefined)).toBeUndefined()
  })
})
