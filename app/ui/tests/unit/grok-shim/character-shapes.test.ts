// T24：picker 13 形状——覆盖模块（overrides/modules/character.tsx）的形状几何。
// 先红口径：模块覆盖前从上游 import 无 PICKER_SHAPES（不存在）即红。
import { describe, expect, it } from 'vitest'
import { PICKER_COLORS, PICKER_SHAPES, personaInk, personaShapePath, resolvePersonaColor, resolvePersonaShape } from '../../../renderer-grok/overrides/modules/character'

describe('T24 形状面', () => {
  it('PICKER_SHAPES 恰 13 个且 DOM 序（0.79.3 pn）', () => {
    expect(PICKER_SHAPES).toEqual(['blob', 'cloud', 'square', 'sparkle', 'clover', 'heart', 'flower', 'teardrop', 'tablet', 'wedge', 'house', 'star', 'hex'])
  })
  it('13 个形状全部有非空 path（M 起头）', () => {
    for (const shape of PICKER_SHAPES) {
      const path = personaShapePath(shape)
      expect(path.startsWith('M'), shape).toBe(true)
      expect(path.length, shape).toBeGreaterThan(100)
    }
  })
  it('clover 轮廓纵横对称（review M1 防回归：ks 圆心纵横均 ±38，宽=高）', async () => {
    const { PERSONA_SHAPE_PATHS } = await import('../../../renderer-grok/overrides/modules/character')
    const nums = (PERSONA_SHAPE_PATHS.clover!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]!); ys.push(nums[i + 1]!) }
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
    expect(Math.abs(w - h)).toBeLessThan(6) // 圆心对称 → 三叶/四叶轮廓纵横同尺寸
  })
  it('7 个新增形状与回落 blob 各不相同（几何互异）', () => {
    const paths = new Set(PICKER_SHAPES.map((s) => personaShapePath(s)))
    expect(paths.size).toBe(13)
  })
  it('resolvePersonaShape：15 个可显式指定；哈希回落仍只在原 8 个', () => {
    for (const shape of [...PICKER_SHAPES, 'pebble', 'squircle']) expect(resolvePersonaShape('ag_x', shape)).toBe(shape)
    const fallback = resolvePersonaShape('ag_x', 'no-such')
    expect(['blob', 'pebble', 'squircle', 'tablet', 'wedge', 'hex', 'cloud', 'teardrop']).toContain(fallback)
  })
})

describe('T24 颜色面', () => {
  it('PICKER_COLORS 恰 11 个含 black，DOM 序', () => {
    expect(PICKER_COLORS).toEqual(['black', 'brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'gray'])
  })
  it('personaInk：black 暗色为白、亮色为黑；未知色走回落', () => {
    expect(personaInk('black', 'dark')).toBe('#FFFFFF')
    expect(personaInk('black', 'light')).toBe('#000000')
    expect(personaInk(null, 'light')).toMatch(/^#/)
  })
})

describe('T24 验收补格', () => {
  it('path 只用 M/L/C/Q/A/Z 命令、坐标都是有限数（无 NaN/科学计数乱码）', () => {
    for (const shape of PICKER_SHAPES) {
      const path = personaShapePath(shape)
      expect(path[0]).toBe('M')
      expect(path).toMatch(/^[-\d\s.,MLCQAZ]+$/)
      for (const num of path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []) expect(Number.isFinite(Number(num)), `${shape}:${num}`).toBe(true)
    }
  })
  it('哈希回落与上游完全相同（20 个固定 id × shape 与 color 各自逐 id 对照）', async () => {
    const upstream = await import('../../../renderer-grok/frontend/src/recovered/features/onboarding/signed-in/character')
    const ids = Array.from({ length: 20 }, (_, i) => `ag-fixed-${i}`)
    for (const id of ids) {
      expect(resolvePersonaShape(id, 'nope'), id).toBe(upstream.resolvePersonaShape(id, 'nope'))
      expect(resolvePersonaShape(id, null), id).toBe(upstream.resolvePersonaShape(id, null))
      // review M2：color 回落同样逐 id 对照（原缺口——颜色回落恒 gray 的变异曾漏过）
      expect(resolvePersonaColor(id, 'nope'), id).toBe(upstream.resolvePersonaColor(id, 'nope'))
      expect(resolvePersonaColor(id, null), id).toBe(upstream.resolvePersonaColor(id, null))
    }
  })
  it('initialCharacter 假随机：rand 队列 [0,0] → blob+black；[0.999,0.999] → hex+gray；形状颜色各调一次', async () => {
    const { initialCharacter } = await import('../../../renderer-grok/overrides/modules/new-bot-dialog')
    expect(initialCharacter(() => 0)).toEqual({ shape: 'blob', color: 'black' })
    expect(initialCharacter(() => 0.999)).toEqual({ shape: 'hex', color: 'gray' })
    // review M2：形状与颜色各用队列里各自的取值（原缺口——两次同值证明不了独立取值）
    const queue = (values: number[]) => { let i = 0; return () => values[i++]! }
    expect(initialCharacter(queue([0.1, 0.5]))).toEqual({ shape: 'cloud', color: 'green' }) // 0.1×13→[1]=cloud，0.5×11→[5]=green
    expect(initialCharacter(queue([0.99, 0.0]))).toEqual({ shape: 'hex', color: 'black' })
  })
  it('toAgentRecord：avatarShape/Color 直传、未给 null、无旧 shape/color 键，且过上游 projectRendererAgent 后仍带同值', async () => {
    const { toAgentRecord } = await import('../../../renderer-grok/shim/src/agents')
    const { projectRendererAgent } = await import('../../../renderer-grok/frontend/src/production/model')
    const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})
    const base = { sessionId: 's1', title: 'T', isMain: false, running: false, unread: false, activity: null, updatedAt: 1 }
    const withAvatar = rec(toAgentRecord({ ...base, avatarShape: 'heart', avatarColor: 'violet' }))
    expect(withAvatar.avatarShape).toBe('heart')
    expect(withAvatar.avatarColor).toBe('violet')
    expect('shape' in withAvatar).toBe(false)
    expect('color' in withAvatar).toBe(false)
    expect(rec(toAgentRecord(base)).avatarShape).toBeNull()
    const projected = rec(projectRendererAgent(withAvatar, 'stub'))
    expect(projected.avatarShape).toBe('heart')
    expect(projected.avatarColor).toBe('violet')
  })
})
