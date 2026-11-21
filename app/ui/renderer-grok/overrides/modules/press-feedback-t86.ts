// T86：发送钮按压 spring——pointerdown 挂 .t86-pressing（animationend 自摘），整段播完
// 不依赖 :active（松开即截断——经理抓）。原生 43 档 linear() 在 CSS。
export function installPressFeedback(): () => void {
  const onDown = (ev: PointerEvent): void => {
    const el = ev.target instanceof HTMLElement ? ev.target.closest('button[aria-label="Send message"]') as HTMLElement | null : null
    if (el === null) return
    el.classList.add('t86-pressing')
    el.addEventListener('animationend', () => el.classList.remove('t86-pressing'), { once: true })
  }
  document.addEventListener('pointerdown', onDown, true)
  return () => document.removeEventListener('pointerdown', onDown, true)
}
