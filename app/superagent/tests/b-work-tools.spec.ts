import { describe, it, expect } from 'vitest'
import { REQUIRED_WORK_TOOLS, missingWorkTools } from '../src/app/sessions.ts'

// 复测 #2（4b922fde）工具契约：必需能力声明——worker 缺必需工具必须 fail-closed 可见，不得静默丢。
// 旧 workOnly 的 WORK_TOOLS.filter(...) 把缺位工具无声过滤，worker 跑着却写不了盘/交不了回执。

function probe(present: string[]): (name: string) => boolean {
  return name => present.includes(name)
}

describe('worker 必需工具契约（复测 #2：缺即 error，不静默降级）', () => {
  it('全可用：缺口为空', () => {
    expect(missingWorkTools(probe(REQUIRED_WORK_TOOLS))).toEqual([])
  })

  it('缺 write：报出缺口（文件落盘/回执失败的无声根因）', () => {
    const got = missingWorkTools(probe(REQUIRED_WORK_TOOLS.filter(n => n !== 'write')))
    expect(got).toEqual(['write'])
  })

  it('宿主可选工具缺位不算缺口：必需集之外全缺也通过', () => {
    // 只有必需集在场（pwsh/web_*/subagent/skill/read_image 全缺）——缺口仍为空
    expect(missingWorkTools(probe([...REQUIRED_WORK_TOOLS]))).toEqual([])
  })

  it('多点缺位：按 REQUIRED 顺序全部报出', () => {
    const got = missingWorkTools(probe(['read', 'edit', 'bash']))
    expect(got).toEqual(['write', 'glob', 'grep', 'job_output', 'job_list', 'job_kill', 'todo_write'])
  })
})
