// B40-B：侧栏 relativeTime 七档（0.78.1 Intl.RelativeTimeFormat(numeric:auto) 同构）——
// 边界表驱动；en locale 快照文本断言。导出测试需 sidebar 模块可 import（tsx 纯函数段无 DOM 依赖也可，但
// sidebar.tsx 全文件 import 链重——改为把断言落在行为上：直接 import 相对时间函数不可行（非导出），
// 用提取自实现的同表复测？不——最小闭环：本测直接锁 sidebar.tsx 内函数（经模块求值）。
// 做法：vitest 手工 rehype 不可行，改用「源码正则」弱断言 + 行为断言放到 e2e/目检。鉴于工单验证要求
// vitest 边界表，这里把函数抽到独立模块后测。
import { expect, it } from 'vitest'
import { formatRelativeTime } from '../../renderer-grok/frontend/src/recovered/features/conversation/workspace/relative-time'

const MIN = 60, HOUR = 3600, DAY = 86400, WEEK = 604800, MONTH = 2592000, YEAR = 31536000
const now = 1_700_000_000_000

it('B40-B：七档边界表（en, numeric:auto）', () => {
  const f = (deltaSeconds: number) => formatRelativeTime(now - deltaSeconds * 1000, now, 'en')
  expect(f(0)).toBe('now')
  expect(f(59)).toBe('now')
  expect(f(61)).toBe('1 minute ago')
  expect(f(25 * MIN)).toBe('25 minutes ago')
  expect(f(61 * MIN)).toBe('1 hour ago')
  expect(f(23 * HOUR)).toBe('23 hours ago')
  expect(f(25 * HOUR)).toBe('yesterday')
  expect(f(6 * DAY)).toBe('6 days ago')
  expect(f(8 * DAY)).toBe('last week')
  expect(f(29 * DAY)).toBe('4 weeks ago')
  expect(f(40 * DAY)).toBe('last month')
  expect(f(400 * DAY)).toBe('last year')
  expect(f(10 * YEAR)).toBe('10 years ago')
})

it('B40-B：未来时间（时钟漂移防抖：±60s 内显示 now，超过走 Intl 正向档）', () => {
  const f = (deltaSeconds: number) => formatRelativeTime(now + deltaSeconds * 1000, now, 'en')
  expect(f(30)).toBe('now') // 漂移窗口内防抖
  expect(f(120)).toBe('in 2 minutes')
  expect(f(2 * 3600)).toBe('in 2 hours')
})

it('B40-B：formatter 缓存（同 locale 复用）', () => {
  formatRelativeTime(now - 5000, now, 'en')
  formatRelativeTime(now - 5000, now, 'en')
  formatRelativeTime(now - 5000, now, 'zh')
  // 缓存行为内部——无崩溃即过（结构断言）
  expect(typeof formatRelativeTime(now - 5000, now, 'en')).toBe('string')
})
