// T28：0.79.3 引导步骤序列（探针：dh 九步、Qge={tools,create} 被滤除——walk 恒无这两步）。
import { describe, expect, it } from 'vitest'
import { WALK, creatorContext, next, prev } from '../../../renderer-grok/overrides/modules/onboarding-walk'

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
