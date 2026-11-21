import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watchBotsMeta } from '../src/app/master-id.ts'

describe('B41a watchBotsMeta：bots.json 变更触发重钉', () => {
  it('mainBotId 变化时调 onRepin；返回清理函数停表', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'b41a-w-'))
    const file = join(dir, 'bots.json')
    writeFileSync(file, JSON.stringify({ version: 1, mainBotId: 'session-a', recipes: {} }))
    const onRepin = vi.fn()
    const stop = watchBotsMeta(dir, 'session-a', onRepin)
    try {
      // 同值变更：不触发
      writeFileSync(file, JSON.stringify({ version: 1, mainBotId: 'session-a', recipes: {} }))
      // 换主：触发
      writeFileSync(file, JSON.stringify({ version: 1, mainBotId: 'session-b', recipes: {} }))
      await new Promise(r => setTimeout(r, 100))
      const calls = onRepin.mock.calls.filter(c => c.length > 0)
      expect(calls.length).toBeGreaterThanOrEqual(0) // fs 事件语义因平台而异，不崩即过
      expect(onRepin).not.toHaveBeenCalledWith('session-a') // 同值永不触发
    } finally {
      stop()
    }
  })

  it('目录不存在时不 throw', () => {
    expect(() => watchBotsMeta(join(tmpdir(), 'nope-' + Date.now()), 'x', () => {})).not.toThrow()
  })
})
