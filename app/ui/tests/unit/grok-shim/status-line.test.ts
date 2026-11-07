// T23：状态行短语引擎纯函数（规格 = work/tickets/doing/T23-statusline-phrases.md；0.79.3 锚点
// tZ/ren/Jpt/Gjn/Kjn/aen/Yjn）。时间与随机数全部注入——不读 Date.now，假时钟可全时序推演。
import { describe, expect, it, vi } from 'vitest'
import {
  EXIT_MS, begin, exitUntil, formatElapsed, nextWakeMs, phraseOf, render, step,
} from '../../../renderer-grok/overrides/modules/status-line'

const T = (d = 0.5) => () => d
const thinking = () => ({ kind: 'thinking' }) as const
const tool = (name: string) => ({ kind: 'tool', tool: name }) as const

describe('T23 状态行 · 短语表（a）', () => {
  it('thinking 三句按 draw 0 / 0.34 / 0.99 逐字相等（附录 A）', () => {
    expect(phraseOf(thinking(), 0)).toBe('Thinking it through')
    expect(phraseOf(thinking(), 0.34)).toBe('Mulling it over')
    expect(phraseOf(thinking(), 0.99)).toBe('Putting it together')
  })
  it('working 五句按 draw 0 / 0.99 取首末句；单句类恒定', () => {
    expect(phraseOf(tool('Task'), 0)).toBe('Getting it done')
    expect(phraseOf(tool('Task'), 0.99)).toBe('Chipping away')
    expect(phraseOf(tool('Shell'), 0.3)).toBe('Running a few commands')
    expect(phraseOf(tool('Read'), 0.3)).toBe('Reading the file')
    expect(phraseOf(tool('Skill'), 0.3)).toBe('Reading the file')
    expect(phraseOf(tool('WebSearch'), 0.3)).toBe('Digging around')
    expect(phraseOf(tool('WebFetch'), 0.3)).toBe('Doing some reading')
    expect(phraseOf(tool('SendToAgent'), 0.3)).toBe('Checking with another Bot')
    expect(phraseOf(tool('write'), 0.3)).toBe('Making progress') // 其他工具 → working 池（0.3 → [1]）
    expect(phraseOf(null, 0.3)).toBe('Making progress') // running 无活动 → working 池
  })
})

describe('T23 状态行 · 不轮换（b）', () => {
  it('thinking 从 now=0 推进到 600000 文字恒同一句（T20 实测 12s 固定的根）', () => {
    let s = begin(thinking(), 0, T(0.1))
    for (const now of [100, 2500, 5000, 12000, 600000]) {
      s = step(s, thinking(), now, T(0.9))
      expect(render(s, now, 0).text).toBe('Thinking it through')
    }
  })
})

describe('T23 状态行 · 800ms 防抖（c）', () => {
  it('t=300 切 Shell 不生效且 nextWake=800；t=800 切到；t=900 切立即生效', () => {
    let s = begin(thinking(), 0, T(0.1))
    s = step(s, tool('Shell'), 300, T(0.2))
    expect(render(s, 300, 0).text).toBe('Thinking it through')
    expect(nextWakeMs(s, 300, 0)).toBe(800)
    s = step(s, tool('Shell'), 800, T(0.2))
    expect(render(s, 800, 0).text).toBe('Running a few commands')
    // 另一路：900 才切（已显示 ≥800ms）→ 立即
    let s2 = begin(thinking(), 0, T(0.1))
    s2 = step(s2, tool('Shell'), 900, T(0.2))
    expect(render(s2, 900, 0).text).toBe('Running a few commands')
  })
})

describe('T23 状态行 · 排队取最新（d）', () => {
  it('t=100 Shell、t=200 WebSearch，t=800 显示 Digging around', () => {
    let s = begin(thinking(), 0, T(0.1))
    s = step(s, tool('Shell'), 100, T(0.2))
    s = step(s, tool('WebSearch'), 200, T(0.3))
    s = step(s, tool('WebSearch'), 800, T(0.3))
    expect(render(s, 800, 0).text).toBe('Digging around')
  })
})

describe('T23 状态行 · 同类不重抽（e）', () => {
  it('Shell → Shell（新调用）shownAtMs/draw 不变；rand 只调 1 次', () => {
    const rand = vi.fn(T(0.2))
    let s = begin(thinking(), 0, T(0.1))
    s = step(s, tool('Shell'), 1000, rand as unknown as () => number)
    const at = s.shownAtMs
    const draw = s.draw
    s = step(s, tool('Shell'), 2000, rand as unknown as () => number)
    expect(s.shownAtMs).toBe(at)
    expect(s.draw).toBe(draw)
    expect(rand).toHaveBeenCalledTimes(1)
  })
})

describe('T23 状态行 · 5s 静默（f）', () => {
  it('泛 working：t<5000 text=null，t=5000 出文字，nextWake 恰 5000；thinking t=0 即有文字', () => {
    let s = begin(tool('Task'), 0, T(0.2))
    expect(render(s, 4999, 0).text).toBeNull()
    expect(nextWakeMs(s, 0, 0)).toBe(5000)
    expect(render(s, 5000, 0).text).toBe('Making progress') // draw 0.2 → working[1]
    const th = begin(thinking(), 0, T(0.1))
    expect(render(th, 0, 0).text).toBe('Thinking it through')
  })
  it('thinking 3s 后切 write：静默从可见时刻起算（visibleSince=0 → 5000 出文字）', () => {
    let s = begin(thinking(), 0, T(0.1))
    s = step(s, tool('write'), 3000, T(0.4))
    expect(render(s, 4999, 0).text).toBeNull()
    expect(render(s, 5000, 0).text).toBe('Working on it') // draw 0.4 → working[2]
  })
})

describe('T23 状态行 · elapsed（g）', () => {
  it('59999 null；60000 → 1m；125000 → 2m；3600000 → 1h；3720000 → 1h 2m；nextWake 落整分钟边界', () => {
    const s = begin(thinking(), 0, T(0.1))
    expect(render(s, 59999, 0).elapsed).toBeNull()
    expect(render(s, 60000, 0).elapsed).toBe('1m')
    expect(render(s, 125000, 0).elapsed).toBe('2m')
    expect(render(s, 3600000, 0).elapsed).toBe('1h')
    expect(render(s, 3720000, 0).elapsed).toBe('1h 2m')
    expect(nextWakeMs(s, 61000, 0)).toBe(120000)
  })
})

describe('T23 状态行 · 退场（h）', () => {
  it(`exitUntil = now + ${EXIT_MS}；EXIT_MS=140`, () => {
    expect(EXIT_MS).toBe(140)
    expect(exitUntil(1000)).toBe(1140)
  })
})
