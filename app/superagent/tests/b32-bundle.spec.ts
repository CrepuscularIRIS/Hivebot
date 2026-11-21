// B32 Task 1（plan Task 1）：bundle 结构守卫——plugin 面+双 preset+外部源默认关。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  dsh?: { bundle?: { patch?: string } }
}
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

describe('B32 bundle 结构', () => {
  it('是可加载的 dsh bundle', () => {
    expect(pkg.name).toBe('dsh-superagent')
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })
  it('声明 router/worker 两个 preset，外部监听源默认关闭', () => {
    expect(patch).toContain('dsh-superagent-router')
    expect(patch).toContain('dsh-superagent-worker')
    expect(patch).toMatch(/dsh-superagent-github[\s\S]{0,200}disabled: true/)
    expect(patch).toMatch(/dsh-superagent-feishu[\s\S]{0,200}disabled: true/)
  })
})
