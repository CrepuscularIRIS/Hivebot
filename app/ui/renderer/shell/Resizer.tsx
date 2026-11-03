// 列宽拖拽条（U-21 侧栏内联版抽出，U-23 info-pane 共用）：pointer 拖动 + ←/→ 键 8px 步进。
// side = 拖拽条贴在哪一侧：'right'（侧栏，向右拉变宽）/ 'left'（info-pane，向左拉变宽）。
// P5-11 A13：可选 compact 档（侧栏折叠）。照 0.18 sidebar-layout-state：折叠是独立布尔（compact.key），
// spec.key 只存展开宽；拖拽只在 [min,max] 夹紧、不吸附折叠（折叠走 collapse 钮），折叠态向外拖越过中点才展开。
import type { PointerEvent } from 'react'

export interface ColumnSpec { min: number; max: number; initial: number; key: string; compact?: { width: number; key: string } }

/** 上次的展开宽（不看折叠位）。 */
export function readExpanded(spec: ColumnSpec): number {
  try {
    const v = Number(localStorage.getItem(spec.key))
    return v >= spec.min && v <= spec.max ? v : spec.initial
  } catch { return spec.initial }
}

export function readColumn(spec: ColumnSpec): number {
  try {
    if (spec.compact !== undefined && localStorage.getItem(spec.compact.key) === '1') return spec.compact.width
  } catch { /* 仅偏好 */ }
  return readExpanded(spec)
}

export function saveColumn(spec: ColumnSpec, w: number): void {
  try {
    const compact = spec.compact !== undefined && w === spec.compact.width
    if (spec.compact !== undefined) localStorage.setItem(spec.compact.key, compact ? '1' : '0')
    if (!compact) localStorage.setItem(spec.key, String(w))
  } catch { /* 仅偏好，失败不影响使用 */ }
}

export function Resizer({ spec, width, side, label, onWidth }: {
  spec: ColumnSpec; width: number; side: 'left' | 'right'; label: string; onWidth(w: number, persist: boolean): void
}): JSX.Element {
  const sign = side === 'right' ? 1 : -1
  const clamp = (w: number): number => Math.max(spec.min, Math.min(spec.max, Math.round(w)))
  const fromCompact = (w: number): number =>
    spec.compact !== undefined && width === spec.compact.width && w < (spec.compact.width + spec.min) / 2 ? spec.compact.width : clamp(w)
  const drag = (e: PointerEvent<HTMLDivElement>): void => {
    const startX = e.clientX
    const startW = width
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const at = (x: number): number => fromCompact(startW + sign * (x - startX))
    const move = (ev: globalThis.PointerEvent): void => onWidth(at(ev.clientX), false)
    const up = (ev: globalThis.PointerEvent): void => {
      onWidth(at(ev.clientX), true)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div
      className={`resizer ${side}`} role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      aria-valuemin={spec.compact?.width ?? spec.min} aria-valuemax={spec.max} aria-valuenow={width}
      onPointerDown={drag}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const next = width + sign * (e.key === 'ArrowRight' ? 8 : -8)
          // 折叠态：向外一步直接回 min（展开），向内不动
          onWidth(spec.compact !== undefined && width === spec.compact.width ? (next > width ? spec.min : width) : clamp(next), true)
        }
      }}
    />
  )
}
