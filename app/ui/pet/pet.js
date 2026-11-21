// T45a 宠物页：状态→动画、点击/拖动/右键。所有文件名逐字对 dsh-pet 资产。
const V = /** @type {HTMLVideoElement} */ (document.getElementById('v'))
const ANIM = {
  idle: '待机呼吸休闲.webm',
  waiting: '工作状态-原地踱步张望.webm',
  thinking: '工作状态-思考冒泡.webm',
  working: '工作状态-忙碌点按.webm',
  error: '工作状态-垂头叹气冒汗.webm',
  success: '工作状态-雀跃庆祝.webm',
}
const ONCE = new Set(['error', 'success'])
const CLICK = '点击回应-元气挥手.webm'
const DRAG = '被鼠标拖拽悬空反馈.webm'
let current = 'idle'
let overriding = null // 'click' | 'drag' | null
const base = (s) => ANIM[s] ?? ANIM.idle
const play = (name, loop) => {
  if (V.currentSrc.endsWith(encodeURIComponent(name)) && V.loop === loop) return
  V.src = `assets/fish/${name}` // 协议 handler 原样路径（中文文件名不编码——encodeURIComponent 会 404）
  V.loop = loop
  V.play().catch(() => {})
}
const render = () => {
  if (overriding === 'click') return // 一次动画播完由 ended 回 render
  if (overriding === 'drag') { play(DRAG, true); return }
  const s = current
  play(base(s), !ONCE.has(s))
}
V.addEventListener('ended', () => {
  // T45c M1 + 审查 M1'：区分结束的是点击动画还是状态动画——点击动画结束恢复 current 态
  //（若 current 是 error/success 会重播一次再由下一次 ended 消费）；仅状态动画自身结束才消费 ONCE 回 idle
  const wasClick = overriding === 'click'
  overriding = null
  if (!wasClick && ONCE.has(current)) { current = 'idle'; document.body.dataset.state = 'idle' }
  render()
})
window.pet.onState((s) => { current = s; document.body.dataset.state = s; if (!overriding) render() })
// 点击 vs 拖动（<4px 算点击；不用 -webkit-app-region: drag——收不到点击）
let down = null
const endPointer = (e) => { // T45c M2：所有松手/取消路径第一步先清 down——松手后 move 不再跟随
  down = null
  document.body.classList.remove('dragging')
  if (overriding === 'drag') { overriding = null; render(); return true }
  return false
}
addEventListener('pointerdown', (e) => { down = { x: e.screenX, y: e.screenY }; document.body.classList.add('dragging'); try { document.body.setPointerCapture(e.pointerId) } catch { /* 不支持则靠 window 级事件 */ } })
addEventListener('pointercancel', (e) => { endPointer(e) })
addEventListener('lostpointercapture', () => { if (down !== null) endPointer(null) })
addEventListener('pointermove', (e) => {
  if (down === null) return
  const dx = e.screenX - down.x, dy = e.screenY - down.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { overriding = 'drag'; render(); window.pet.move(Math.round(dx), Math.round(dy)); down = { x: e.screenX, y: e.screenY } }
})
addEventListener('pointerup', () => {
  if (endPointer(null)) return // 拖动结束
  overriding = 'click'; play(CLICK, false); window.pet.click()
})
addEventListener('contextmenu', (e) => { e.preventDefault(); window.pet.menu() })
render() // 初始动画（onState 未到前的待机）
