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
V.addEventListener('ended', () => { overriding = null; render() })
window.pet.onState((s) => { current = s; document.body.dataset.state = s; if (!overriding) render() })
// 点击 vs 拖动（<4px 算点击；不用 -webkit-app-region: drag——收不到点击）
let down = null
addEventListener('pointerdown', (e) => { down = { x: e.screenX, y: e.screenY }; document.body.classList.add('dragging') })
addEventListener('pointermove', (e) => {
  if (down === null) return
  const dx = e.screenX - down.x, dy = e.screenY - down.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { overriding = 'drag'; render(); window.pet.move(Math.round(dx), Math.round(dy)); down = { x: e.screenX, y: e.screenY } }
})
addEventListener('pointerup', () => {
  document.body.classList.remove('dragging')
  if (overriding === 'drag') { overriding = null; render(); return }
  overriding = 'click'; play(CLICK, false); window.pet.click()
  down = null
})
addEventListener('contextmenu', (e) => { e.preventDefault(); window.pet.menu() })
render() // 初始动画（onState 未到前的待机）
