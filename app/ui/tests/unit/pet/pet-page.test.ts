// T45c ⑪–⑬：宠物页行为单测（node vm 执行 pet/pet.js + 假 video/window——探针 /tmp/t45a-mgr/probe.mjs 转写）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import vm from 'node:vm'

const src = readFileSync(resolve(__dirname, '../../../pet/pet.js'), 'utf8')

function mk() {
  const L: Record<string, (e?: unknown) => void> = {}
  const VL: Record<string, () => void> = {}
  const log: string[] = []
  const V = {
    loop: false, _src: '',
    get currentSrc() { return this._src },
    set src(v: string) { this._src = v.split('/').map(encodeURIComponent).join('/'); log.push('src=' + v) },
    play() { return Promise.resolve() },
    addEventListener(t: string, f: () => void) { VL[t] = f },
  }
  const ctx = {
    document: { getElementById: () => V, body: { dataset: {} as Record<string, string>, classList: { add() {}, remove() {} } } },
    window: { pet: { onState: (cb: (s: string) => void) => { L.state = cb }, click() { log.push('click') }, move(dx: number, dy: number) { log.push(`move(${dx},${dy})`) }, menu() {} } },
    addEventListener: (t: string, f: (e?: unknown) => void) => { L[t] = f },
    encodeURIComponent,
  }
  vm.runInNewContext(src, ctx)
  return { L, VL, V, log, body: ctx.document.body }
}
const fileName = (v: { currentSrc: string }): string => decodeURIComponent(v.currentSrc).split('/').pop() ?? ''

describe('T45c 宠物页行为', () => {
  it('⑪ success 的 ended 后回 idle：data-state=idle 且 src 切待机呼吸', () => {
    const p = mk()
    p.L.state!('success')
    expect(p.body.dataset.state).toBe('success')
    p.VL.ended!()
    expect(p.body.dataset.state, 'ended 后 data-state 回 idle').toBe('idle')
    expect(fileName(p.V), 'src 切回待机动画').toBe('待机呼吸休闲.webm')
    expect(p.V.loop, '待机循环').toBe(true)
  })
  it('⑫ 拖动松手后不再跟随：pointerup 后 pointermove 不发 pet.move', () => {
    const p = mk()
    p.L.pointerdown!({ screenX: 0, screenY: 0 })
    p.L.pointermove!({ screenX: 10, screenY: 0 })
    expect(p.log.some((x) => x.startsWith('move(')), '拖动中确实在发 move').toBe(true)
    p.L.pointerup!({})
    p.log.length = 0
    p.L.pointermove!({ screenX: 40, screenY: 0, buttons: 0 })
    expect(p.log.filter((x) => x.startsWith('move(')), '松手后零 move').toEqual([])
  })
  it('⑭ 点击动画结束不吞状态：success → 点击 → 点击 ended → 仍 success（重播）→ 状态动画 ended → idle', () => {
    const p = mk()
    p.L.state!('success')
    p.L.pointerdown!({ screenX: 0, screenY: 0 })
    p.L.pointerup!({}) // <4px：点击（overriding='click'，播挥手）
    expect(p.V.currentSrc.includes(encodeURIComponent('点击回应')), '点击动画在播').toBe(true)
    p.VL.ended!() // 挥手播完——恢复 current 态（success 重播），不得清成 idle
    expect(p.body.dataset.state, '点击 ended 后仍 success').toBe('success')
    expect(fileName(p.V), '重播雀跃').toBe('工作状态-雀跃庆祝.webm')
    p.VL.ended!() // 状态动画自身结束 → 消费 ONCE → idle
    expect(p.body.dataset.state).toBe('idle')
    expect(fileName(p.V)).toBe('待机呼吸休闲.webm')
  })
  it('⑮ 点击期间收到新状态：thinking → 点击 → onState(error) → 点击 ended → error 真播（不被吞）', () => {
    const p = mk()
    p.L.state!('thinking')
    p.L.pointerdown!({ screenX: 0, screenY: 0 })
    p.L.pointerup!({})
    p.L.state!('error') // 点击动画（overriding='click'）期间状态更新——onState 因 overriding 跳过 render
    p.VL.ended!() // 挥手播完 → render → current=error 播垂头（不被 ended 吞成 idle）
    expect(p.body.dataset.state).toBe('error')
    expect(fileName(p.V), 'error 动画真播').toBe('工作状态-垂头叹气冒汗.webm')
  })
  it('⑬ pointercancel 与 pointerup 同样终止拖动', () => {
    const p = mk()
    p.L.pointerdown!({ screenX: 0, screenY: 0 })
    p.L.pointermove!({ screenX: 10, screenY: 0 })
    p.L.pointercancel!({})
    p.log.length = 0
    p.L.pointermove!({ screenX: 40, screenY: 0 })
    expect(p.log.filter((x) => x.startsWith('move(')), 'cancel 后零 move').toEqual([])
  })
})
