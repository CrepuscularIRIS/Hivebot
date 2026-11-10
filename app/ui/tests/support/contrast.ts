// P5-41.f1 ①：WCAG 2.x 对比度，带 alpha 合成（GU-P5-41 两席 HIGH：旧审计丢前景 alpha，rgba .56 报成不透明值）。
// 页内只采原始数据（前景色串 + 祖先链 {bg, opacity}），合成在 node 里算——纯函数可单测（tests/unit/support/contrast.test.ts）。
import type { Page } from 'playwright/test'

export type RGB = readonly [number, number, number]
export type RGBA = readonly [number, number, number, number]
/** 祖先链一层：leaf → root 顺序；bg = backgroundColor（或背景渐变首色）原串，null = 无背景。 */
export interface Layer { bg: string | null; opacity: number }

const CANVAS: RGB = [255, 255, 255] // html 之下仍透明：浏览器画布白

/** rgb()/rgba()/color(srgb …)；transparent 与无法解析的串 → null（调用方按透明处理）。 */
export function parseColor(c: string): RGBA | null {
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(c)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  // Chromium 把 color-mix(in srgb, …) 序列化为 color(srgb r g b / a)，分量 0–1
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/.exec(c)
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])]
  return null
}

const over = (top: RGBA, under: RGB): RGB => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])) as unknown as RGB

/** layers：leaf → root。从最近的不透明层（或画布）起，向叶子逐层合成半透明层。 */
export function effectiveBackground(layers: ReadonlyArray<RGBA | null>): RGB {
  const opaque = layers.findIndex((c) => c !== null && c[3] >= 0.999)
  let acc: RGB = opaque === -1 ? CANVAS : [layers[opaque]![0], layers[opaque]![1], layers[opaque]![2]]
  for (let i = (opaque === -1 ? layers.length : opaque) - 1; i >= 0; i -= 1) {
    const c = layers[i]
    if (c != null && c[3] > 0) acc = over(c, acc)
  }
  return acc
}

const luminance = (c: RGB): number => {
  const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

/** 前景先与有效背景合成，再按 WCAG 公式算比率。 */
export function contrastRatio(fg: RGBA, bg: RGB): number {
  const l1 = luminance(over(fg, bg))
  const l2 = luminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** 审计一个目标：链上（最近不透明底以下的）opacity 乘进前景 alpha。
 * ponytail: opacity<1 的祖先若自身也带半透明底，严格做法是分组合成；本审计目标里没有这种结构，出现再改。 */
export function auditRatio(fgColor: string, chain: readonly Layer[]): number | null {
  const fg = parseColor(fgColor)
  if (fg === null) return null
  const layers = chain.map((l) => (l.bg === null ? null : parseColor(l.bg)))
  const opaque = layers.findIndex((c) => c !== null && c[3] >= 0.999)
  const fade = chain.slice(0, opaque === -1 ? chain.length : opaque).reduce((a, l) => a * l.opacity, 1)
  return contrastRatio([fg[0], fg[1], fg[2], fg[3] * fade], effectiveBackground(layers))
}

/** 显示用：合成后的有效底色串。 */
export const bgString = (chain: readonly Layer[]): string =>
  `rgb(${effectiveBackground(chain.map((l) => (l.bg === null ? null : parseColor(l.bg)))).map((v) => Math.round(v)).join(',')})`

// ---- e2e 审计（theme-dual / market 共用）----
export interface Target { id: string; sel: string; icon?: boolean; pseudo?: '::before' | '::placeholder' }

/** 页内采样（自包含，page.evaluate 序列化）：前景色串 + leaf→root 祖先链 {bg, opacity}；合成在 node 侧（contrast.ts）。 */
export const COLLECT = (targets: Target[]): Array<{ id: string; fg: string; chain: Layer[]; size: string; weight: string }> => {
  const out: Array<{ id: string; fg: string; chain: Layer[]; size: string; weight: string }> = []
  for (const t of targets) {
    const el = document.querySelector(t.sel)
    if (el === null || !(el instanceof HTMLElement)) continue
    const cs = getComputedStyle(el, t.pseudo ?? null)
    const chain: Layer[] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      const ns = getComputedStyle(n)
      // 背景渐变：取首个颜色停靠点（本 UI 的渐变都是同色两停靠 = 纯色层）
      const grad = ns.backgroundImage !== 'none' ? /(rgba?\([^)]*\)|color\(srgb[^)]*\))/.exec(ns.backgroundImage)?.[1] ?? null : null
      const solid = ns.backgroundColor === 'rgba(0, 0, 0, 0)' || ns.backgroundColor === 'transparent' ? null : ns.backgroundColor
      chain.push({ bg: solid ?? grad, opacity: Number(ns.opacity) })
    }
    out.push({ id: t.id, fg: cs.color, chain, size: cs.fontSize, weight: cs.fontWeight })
  }
  return out
}
export type AuditRow = { id: string; ratio: number; fg: string; bg: string; size: string; weight: string }
export async function AUDIT(page: Page, targets: Target[]): Promise<AuditRow[]> {
  const raw = await page.evaluate(COLLECT, targets)
  return raw.flatMap((r) => {
    const ratio = auditRatio(r.fg, r.chain)
    return ratio === null ? [] : [{ id: r.id, ratio: Math.round(ratio * 100) / 100, fg: r.fg, bg: bgString(r.chain), size: r.size, weight: r.weight }]
  })
}
