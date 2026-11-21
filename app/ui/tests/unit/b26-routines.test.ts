// B26：schedule/list → RoutineRow 纯映射（routines.ts）
import { describe, expect, it } from 'vitest'
import { describeTiming, routineRowsFrom } from '../../renderer-grok/frontend/src/recovered/features/agent-info/settings/routines'

describe('routineRowsFrom', () => {
  it('items → 行：title 优先、无 title 用 prompt、全无用 Untitled routine；DSH typed timing 描述', () => {
    const rows = routineRowsFrom({ items: [
      { id: 'a', title: 'Morning brief', kind: 'daily', time: '09:00:00.000', timeZone: 'UTC', status: 'active' },
      { id: 'b', prompt: 'Check mail', kind: 'weekly', time: '08:30:00.000', timeZone: 'UTC', status: 'active' },
      { id: 'c' },
    ] })
    expect(rows.map((r) => r.name)).toEqual(['Morning brief', 'Check mail', 'Untitled routine'])
    expect(rows[0].schedule).toBe('Every day at 09:00')
    expect(rows[1].schedule).toBe('Every week at 08:30')
    expect(rows[0].enabled).toBe(true)
  })
  it('status paused/ended → enabled:false；active → true', () => {
    expect(routineRowsFrom({ items: [{ id: 'x', title: 'T', status: 'paused' }] })[0].enabled).toBe(false)
    expect(routineRowsFrom({ items: [{ id: 'x', title: 'T', status: 'ended' }] })[0].enabled).toBe(false)
    expect(routineRowsFrom({ items: [{ id: 'x', title: 'T', status: 'active' }] })[0].enabled).toBe(true)
    expect(routineRowsFrom({ items: [{ id: 'x', title: 'T' }] })[0].enabled).toBe(true) // 无 status 默认开
  })
  it('无 id 项跳过；非数组 items → []', () => {
    expect(routineRowsFrom({ items: [{ title: 'no id' }] })).toEqual([])
    expect(routineRowsFrom({})).toEqual([])
    expect(routineRowsFrom(null)).toEqual([])
  })
})

describe('describeTiming（DSH typed timing → 0.78.1 Kj 频度词）', () => {
  it('daily/weekly 带 HH:mm；未知 kind → Custom schedule', () => {
    expect(describeTiming({ kind: 'daily', time: '09:00:00.000', timeZone: 'UTC' })).toBe('Every day at 09:00')
    expect(describeTiming({ kind: 'weekly', time: '23:15:00.000', timeZone: 'UTC' })).toBe('Every week at 23:15')
    expect(describeTiming({ kind: 'cron' })).toBe('Custom schedule')
    expect(describeTiming({})).toBe('Custom schedule')
  })
})
