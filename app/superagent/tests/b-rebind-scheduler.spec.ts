// UI 验收 B2 残余（顾问复核 F1）：DS-Bot 换段后 masterId 的重算时机。
// 覆盖 createRebindScheduler 的节流 / 合并 / 串行 / 不破链 / 停止 / unref，dsBotStateWatcher 对 state.json
// 原子替换的触发、无关文件不触发、目录缺失自愈、close 后失效，以及 resolveLiveMasterId 在「新段进入会话列表」
// 前后由 ② 转到 ①。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRebindScheduler, dsBotStateWatcher, resolveLiveMasterId } from '../src/app/master-id.ts'

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

describe('createRebindScheduler（重算节流）', () => {
  afterEach(() => { vi.useRealTimers() })

  it('soon() 在 firstMs 与 settleMs 各重算一次，之后不再重算', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const s = createRebindScheduler(run, { firstMs: 300, settleMs: 3000 })
    s.soon()
    await vi.advanceTimersByTimeAsync(299)
    expect(run).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2699)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('连续落盘合并成一轮：后一次 soon() 重置计时', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const s = createRebindScheduler(run, { firstMs: 300, settleMs: 3000 })
    s.soon()
    await vi.advanceTimersByTimeAsync(200)
    s.soon()
    await vi.advanceTimersByTimeAsync(299)
    expect(run).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2699)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('now() 串行：上一轮未结束时不叠新轮', async () => {
    let release = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const s = createRebindScheduler(run, { firstMs: 300, settleMs: 3000 })
    const a = s.now()
    const b = s.now()
    const c = s.now()
    await flush()
    expect(run).toHaveBeenCalledTimes(1)
    release()
    await flush()
    expect(run).toHaveBeenCalledTimes(2)
    release()
    await flush()
    expect(run).toHaveBeenCalledTimes(3)
    release()
    await Promise.all([a, b, c])
  })

  it('now() 等到的是自己这一轮，不是整条链上后来的轮次', async () => {
    const run = vi.fn(async () => {})
    const s = createRebindScheduler(run, { firstMs: 300, settleMs: 3000 })
    const first = s.now()
    const second = s.now()
    let secondDone = false
    void second.then(() => { secondDone = true })
    await first
    await flush()
    expect(secondDone).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('run 拒绝不破链：下一轮照常执行，now() 把拒绝交给调用方', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const s = createRebindScheduler(run, { firstMs: 300, settleMs: 3000 })
    await expect(s.now()).rejects.toThrow('boom')
    await expect(s.now()).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('stop() 之后 now()/soon() 不再触发，挂起的定时器被清掉', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const s = createRebindScheduler(run, { firstMs: 300, settleMs: 3000 })
    s.soon()
    s.stop()
    s.soon()
    await s.now()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).toHaveBeenCalledTimes(0)
  })

  it('节流定时器 unref：挂起期间不增加进程的活动 Timeout 资源', () => {
    const s = createRebindScheduler(async () => {}, { firstMs: 60_000, settleMs: 120_000 })
    const timeouts = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
    const before = timeouts()
    s.soon()
    expect(timeouts()).toBe(before)
    s.stop()
  })
})

describe('dsBotStateWatcher（state.json 原子替换 → 回调）', () => {
  const until = async (pred: () => boolean, ms = 3000) => {
    const end = Date.now() + ms
    while (!pred()) {
      if (Date.now() > end) return false
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return true
  }
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  // store.js save() 的落盘方式：先写 state.json.<pid>.tmp，再 rename 到位。
  const atomicReplace = (dir: string, text: string) => {
    const temp = join(dir, 'bot', 'state.json.' + process.pid + '.tmp')
    writeFileSync(temp, text, 'utf8')
    renameSync(temp, join(dir, 'bot', 'state.json'))
  }
  const tmp = () => mkdtempSync(join(tmpdir(), 'sa-statewatch-'))

  it('state.json 原子替换触发回调；重复 ensure() 不重复装', async () => {
    const dir = tmp()
    try {
      mkdirSync(join(dir, 'bot'))
      const onChange = vi.fn()
      const w = dsBotStateWatcher(dir, onChange)
      w.ensure()
      w.ensure()
      atomicReplace(dir, '{"mainBotIds":["session-b"]}')
      expect(await until(() => onChange.mock.calls.length >= 1)).toBe(true)
      w.close()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('无关文件（state.lock）不触发', async () => {
    const dir = tmp()
    try {
      mkdirSync(join(dir, 'bot'))
      const onChange = vi.fn()
      const w = dsBotStateWatcher(dir, onChange)
      w.ensure()
      await pause(100) // 等 watcher 真正装上
      writeFileSync(join(dir, 'bot', 'state.lock'), '')
      await pause(400)
      expect(onChange).not.toHaveBeenCalled()
      w.close()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('目录还不存在：ensure() 不抛；建好目录后再次 ensure() 自愈并开始触发', async () => {
    const dir = tmp()
    try {
      const onChange = vi.fn()
      const w = dsBotStateWatcher(dir, onChange)
      expect(() => w.ensure()).not.toThrow()
      mkdirSync(join(dir, 'bot'))
      w.ensure()
      atomicReplace(dir, '{"mainBotIds":["session-b"]}')
      expect(await until(() => onChange.mock.calls.length >= 1)).toBe(true)
      w.close()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('close() 之后不再装、不再触发', async () => {
    const dir = tmp()
    try {
      mkdirSync(join(dir, 'bot'))
      const onChange = vi.fn()
      const w = dsBotStateWatcher(dir, onChange)
      w.ensure()
      w.close()
      w.ensure()
      atomicReplace(dir, '{"mainBotIds":["session-c"]}')
      await pause(400)
      expect(onChange).not.toHaveBeenCalled()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('dataDir 为空：ensure()/close() 空操作不抛', () => {
    const w = dsBotStateWatcher(undefined, () => {})
    expect(() => { w.ensure(); w.close() }).not.toThrow()
  })
})

describe('resolveLiveMasterId 在换段窗口的两步', () => {
  it('新段未进会话列表时保持旧段（②）；进入后跟到 DS-Bot 认定的当前段（①）', async () => {
    const identity = { current: 'session-new', owned: new Set(['session-chief', 'session-old', 'session-new']) }
    const listed = new Map([['session-old', 2]])
    const controller = { list: async () => ({ items: [...listed].map(([sessionId, updatedAt]) => ({ sessionId, updatedAt })) }) }
    expect(await resolveLiveMasterId('session-old', controller, identity)).toBe('session-old')
    listed.set('session-new', 3)
    expect(await resolveLiveMasterId('session-old', controller, identity)).toBe('session-new')
  })
})
