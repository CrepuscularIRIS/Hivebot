// P5-41.f1 ①（GU-P5-41 两席 HIGH）：theme-dual 审计曾丢前景 alpha —— rgba(28,28,28,.56) on #fcfcfc 报 16.61（与不透明同值），
// 实为 3.93。合成顺序：背景从最近的不透明祖先起、向子级逐层合成；前景再与该有效背景合成；祖先 opacity 乘进前景 alpha。
import { describe, expect, it } from 'vitest'
import { auditRatio, contrastRatio, effectiveBackground, parseColor } from '../../support/contrast'

describe('contrast：WCAG 比率（alpha 合成）', () => {
  it('反例：半透明前景先与底色合成（工具行预览 3.93，旧算法 16.61）', () => {
    expect(contrastRatio(parseColor('rgba(28, 28, 28, 0.56)')!, [252, 252, 252])).toBeCloseTo(3.93, 2)
    // 不透明前景不受影响
    expect(contrastRatio(parseColor('rgb(28, 28, 28)')!, [252, 252, 252])).toBeCloseTo(16.61, 1)
    // 席 A 另两行：时间分隔 / Deny once（.68 前景）
    expect(contrastRatio(parseColor('rgba(28, 28, 28, 0.68)')!, [252, 252, 252])).toBeCloseTo(5.80, 1)
    expect(contrastRatio(parseColor('rgba(28, 28, 28, 0.68)')!, [255, 255, 255])).toBeCloseTo(5.86, 1)
  })

  it('背景由祖先向子级合成：叶子半透明叠在父不透明之上，而不是反过来压白底', () => {
    // 叶子 = 黑 50%、父 = 纯红（不透明）→ 有效底 = (127.5, 0, 0)
    const bg = effectiveBackground([parseColor('rgba(0, 0, 0, 0.5)'), parseColor('rgb(255, 0, 0)')])
    expect(bg.map(Math.round)).toEqual([128, 0, 0])
    // 两层半透明：子 黑 50% over 父 黑 50% over 白画布 → 255 × .5 × .5 = 63.75
    const two = effectiveBackground([parseColor('rgba(0, 0, 0, 0.5)'), parseColor('rgba(0, 0, 0, 0.5)')])
    expect(two[0]).toBeCloseTo(63.75, 5)
    // 最近的不透明层之上的祖先不参与（被遮住）
    expect(effectiveBackground([null, parseColor('rgb(10, 20, 30)'), parseColor('rgb(255, 255, 255)')])).toEqual([10, 20, 30])
    // 全透明链 → 画布白
    expect(effectiveBackground([null, parseColor('rgba(0, 0, 0, 0)')])).toEqual([255, 255, 255])
  })

  it('color(srgb …) 与 color-mix 产物可解析（不解析会被当透明，结论失真）', () => {
    expect(parseColor('color(srgb 0.1 0.2 0.3 / 0.5)')).toEqual([25.5, 51, 76.5, 0.5])
    expect(parseColor('color(srgb 1 1 1)')).toEqual([255, 255, 255, 1])
    expect(parseColor('transparent')).toBeNull()
  })

  it('auditRatio：链上 opacity 乘进前景 alpha；最近不透明底以下才算', () => {
    const r = auditRatio('rgb(28, 28, 28)', [{ bg: null, opacity: 0.56 }, { bg: 'rgb(252, 252, 252)', opacity: 1 }])
    expect(r).toBeCloseTo(3.93, 2)
  })
})
