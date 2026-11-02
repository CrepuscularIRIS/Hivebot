// U-21 theme：<html data-theme> 跟随系统亮/暗（原版 RRn 的 dataset.theme = cursor-light|cursor-dark），
// 图标 = 原版 cursor-icons 字形（码点取自字体 cmap，名字与原版 icon id 一致，RE-ui-shell §2.3），
// 品牌 mark = 01-boot.png 的眼睛 blob（原版是程序化动画 dT/Tn 渲染器，静态近似；见 PAB-final R15）。
import './sand-tokens.css'
import './dsw.css'

export function applyTheme(): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const set = (): void => {
    document.documentElement.dataset.theme = mq.matches ? 'cursor-dark' : 'cursor-light'
    document.documentElement.style.colorScheme = mq.matches ? 'dark' : 'light'
  }
  set()
  mq.addEventListener('change', set)
}

/** 原版图标 id → cursor-icons-16 码点（fontTools 读 cmap；'loading' 在原版是 spinner 字形）。 */
const ICONS = {
  plus: 0xea60, storefront: 0xf483, star: 0xf3fd, wrench: 0xeb6d, loading: 0xedca, 'x-circle': 0xea87,
  check: 0xeab2, x: 0xed82, stop: 0xed86, 'arrow-up': 0xeaa1, 'arrow-right': 0xea9c, 'arrow-down': 0xea9a,
  'chevron-down': 0xeab4, 'chevron-right': 0xeab6, 'circle-filled': 0xf38f,
  // U-23 P-D/P-C（同一字体 cmap 实测）：锁定配置、失效角标、用此配置新建、info-pane 开合、市场返回/搜索
  'lock-locked': 0xea75, 'slash-circle': 0xeabd, copy: 0xebcc, 'layout-sidebar-right': 0xec00,
  'arrow-left': 0xea9b, 'magnifying-glass': 0xea6d,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, className }: { name: IconName; className?: string }): JSX.Element {
  return <i className={className === undefined ? 'icon' : `icon ${className}`} aria-hidden="true">{String.fromCodePoint(ICONS[name])}</i>
}

export function GrokMark({ size }: { size: number }): JSX.Element {
  return (
    <svg className="grok-mark" width={size} height={size * 0.78} viewBox="0 0 66 51" aria-hidden="true">
      <ellipse cx="33" cy="25.5" rx="33" ry="25.5" fill="currentColor" />
      {/* 两只 ∩ 眼：外宽 14、高 12.5，左/右中心 x=22.25/42.25（按 01-boot.png 4× 放大实测） */}
      <path d="M18 30.5V25a4.25 4.25 0 0 1 8.5 0v5.5M38 30.5V25a4.25 4.25 0 0 1 8.5 0v5.5" fill="none" stroke="var(--dsw-alias-bg-base)" strokeWidth="5.5" />
    </svg>
  )
}
