// 列宽拖拽条（U-21 侧栏内联版抽出，U-23 info-pane 共用）：pointer 拖动 + ←/→ 键 8px 步进。
// side = 拖拽条贴在哪一侧：'right'（侧栏，向右拉变宽）/ 'left'（info-pane，向左拉变宽）。
import type { PointerEvent } from 'react'

export interface ColumnSpec { min: number; max: number; initial: number; key: string }

export function readColumn(spec: ColumnSpec): number {
  try {
    const v = Number(localStorage.getItem(spec.key))
    return v >= spec.min && v <= spec.max ? v : spec.initial
  } catch { return spec.initial }
}

export function saveColumn(spec: ColumnSpec, w: number): void {
  try { localStorage.setItem(spec.key, String(w)) } catch { /* 仅偏好，失败不影响使用 */ }
}

export function Resizer({ spec, width, side, label, onWidth }: {
  spec: ColumnSpec; width: number; side: 'left' | 'right'; label: string; onWidth(w: number, persist: boolean): void
}): JSX.Element {
  const sign = side === 'right' ? 1 : -1
  const clamp = (w: number): number => Math.max(spec.min, Math.min(spec.max, Math.round(w)))
  const drag = (e: PointerEvent<HTMLDivElement>): void => {
    const startX = e.clientX
    const startW = width
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const at = (x: number): number => clamp(startW + sign * (x - startX))
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
      aria-valuemin={spec.min} aria-valuemax={spec.max} aria-valuenow={width}
      onPointerDown={drag}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          onWidth(clamp(width + sign * (e.key === 'ArrowRight' ? 8 : -8)), true)
        }
      }}
    />
  )
}
