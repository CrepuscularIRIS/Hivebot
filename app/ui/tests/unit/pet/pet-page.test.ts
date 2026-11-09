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
