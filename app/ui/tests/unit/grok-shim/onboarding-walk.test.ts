// T28：0.79.3 引导步骤序列（探针：dh 九步、Qge={tools,create} 被滤除——walk 恒无这两步）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ATTRIBUTION, CONNECT, NAV, ROLE, WALK, creatorContext, next, prev, shuffle } from '../../../renderer-grok/overrides/modules/onboarding-walk'

describe('T28 onboarding walk', () => {
  it('WALK = meet→computer-demo→jobs→role→attribution→connect（无 tools/create）', () => {
    expect(WALK).toEqual(['meet', 'computer-demo', 'jobs', 'role', 'attribution', 'connect'])
  })
  it('next：jobs→role；attribution→connect；connect→hand-off；prev 往返', () => {
    expect(next('jobs')).toBe('role')
    expect(next('attribution')).toBe('connect')
    expect(next('connect')).toBe('hand-off')
    expect(prev('role')).toBe('jobs')
    expect(next(prev('role')!)).toBe('role')
  })
  it('creatorContext：选 Engineering → 设定句含 Engineering；null → 空串', () => {
    expect(creatorContext('engineering')).toContain('Engineering')
    expect(creatorContext(null)).toBe('')
  })
})


describe('T28 文案对照（工单验收 1：与 0.79.3 extract 逐字全等——V3 变异的检测面）', () => {
  const extract = JSON.parse(readFileSync(join(import.meta.dirname ?? '.', '../../../../..', 'work/grok-0.79.3-re/onboarding-0793-extract.json'), 'utf8')) as {
    role: { title: string; choices: [string, string, string, string][] }
    attribution: { title: string; choices: [string, string][] }
    connect: { title: string; skip?: string }
  }

  it('role：标题与 9 项 id/label 逐条全等', () => {
    expect(ROLE.title).toBe(extract.role.title)
    expect(ROLE.choices.map((c) => [c.id, c.label])).toEqual(extract.role.choices.map(([id, label]) => [id, label]))
  })
  it('attribution：标题与 12 项 id/label 逐条全等（集合比较——洗牌在运行期）', () => {
    expect(ATTRIBUTION.title).toBe(extract.attribution.title)
    expect([...ATTRIBUTION.choices].map((c) => `${c.id}|${c.label}`).sort()).toEqual(extract.attribution.choices.map(([id, label]) => `${id}|${label}`).sort())
  })
  it('connect：标题逐字', () => {
    expect(CONNECT.title).toBe(extract.connect.title)
  })
})


describe('T28c 补格（工单验收 1 明文项）', () => {
  it("prev('meet')===null", () => {
    expect(prev('meet')).toBeNull()
  })
  it("creatorContext('ops-finance') 逐字", () => {
    expect(creatorContext('ops-finance')).toBe('The user primarily works in Ops & Finance — tailor suggestions and work to that area.')
  })
  it('attribution 原始顺序（不 sort）逐条等于 extract', () => {
    const extract = JSON.parse(readFileSync(join(import.meta.dirname ?? '.', '../../../../..', 'work/grok-0.79.3-re/onboarding-0793-extract.json'), 'utf8')) as { attribution: { choices: [string, string][] } }
    expect(ATTRIBUTION.choices.map((c) => [c.id, c.label])).toEqual(extract.attribution.choices.map(([id, label]) => [id, label])) // extract 每项 4 元（id/label/icon/color）——比对前两元
  })
  it('NAV 五项逐字等于 extract nav', () => {
    const extract = JSON.parse(readFileSync(join(import.meta.dirname ?? '.', '../../../../..', 'work/grok-0.79.3-re/onboarding-0793-extract.json'), 'utf8')) as { nav: Record<string, string> }
    expect(NAV.nextDefault).toBe(extract.nav.next_default)
    expect(NAV.back).toBe(extract.nav.back)
    expect(NAV.continueLabel).toBe(extract.nav.continue)
    expect(NAV.skip).toBe(extract.nav.skip)
    expect(NAV.skipForNow).toBe(extract.nav.skip_for_now)
  })
  it('shuffle：同 rand 序列两次相同；是排列；不改入参', () => {
    const randSeq = () => { const xs = [0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6, 0.25, 0.75, 0.05]; let i = 0; return () => xs[i++ % xs.length]! }
    const input = ATTRIBUTION.choices.map((c) => c.id)
    const a = shuffle(input, randSeq())
    const b = shuffle(input, randSeq())
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual([...input].sort())
    expect(input).toEqual(ATTRIBUTION.choices.map((c) => c.id)) // 未改
  })
})
