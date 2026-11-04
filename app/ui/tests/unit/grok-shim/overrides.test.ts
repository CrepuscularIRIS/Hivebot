// P5-52 · 覆盖层清单自检：每个模块覆盖都指向真实存在的上游文件（SOURCES.tsv 登记）与我们的覆盖文件；
// 覆盖文件不得进 SOURCES.tsv（README：overlay 永不登记，check-upstream 才能保持 diff=0）。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODULE_OVERRIDES } from '../../../renderer-grok/overrides/vite.config'

const ROOT = resolve(__dirname, '..', '..', '..', 'renderer-grok')
const sources = readFileSync(join(ROOT, 'SOURCES.tsv'), 'utf8').split('\n').map((l) => l.split('\t')[0])

/** P5-57：整面替换（不是包一层）——0.18 的 PluginsDesktopSurface 是 Cursor MCP 目录，P-C 市场是另一套功能；
 * 只借上游的 props 类型，不 import 上游实现（不把 desktop.mcp.* 的死链路打进包）。 */
const WHOLE_REPLACEMENTS = new Set(['market-surface.tsx'])

describe('renderer-grok overrides', () => {
  it('模块覆盖：上游目标在 SOURCES.tsv、覆盖文件存在且不在 SOURCES.tsv', () => {
    expect(Object.keys(MODULE_OVERRIDES).length).toBeGreaterThan(0)
    for (const [upstream, ours] of Object.entries(MODULE_OVERRIDES)) {
      expect(sources).toContain(`frontend/src/${upstream}`)
      expect(existsSync(join(ROOT, 'overrides', 'modules', ours))).toBe(true)
      expect(sources.some((s) => s.startsWith('overrides/'))).toBe(false)
    }
  })

  it('覆盖模块都 re-export 上游原模块（只包一层，不复制上游实现）', () => {
    for (const [upstream, ours] of Object.entries(MODULE_OVERRIDES)) {
      if (WHOLE_REPLACEMENTS.has(ours)) continue
      const text = readFileSync(join(ROOT, 'overrides', 'modules', ours), 'utf8')
      expect(text).toContain(`export * from '../../frontend/src/${upstream.replace(/\.tsx?$/, '')}'`)
    }
  })

  it('整面替换：只借上游类型，不 import 上游实现', () => {
    for (const ours of WHOLE_REPLACEMENTS) {
      const text = readFileSync(join(ROOT, 'overrides', 'modules', ours), 'utf8')
      const upstream = Object.entries(MODULE_OVERRIDES).find(([, o]) => o === ours)![0].replace(/\.tsx?$/, '')
      const imports = text.split('\n').filter((l) => l.includes(`frontend/src/${upstream}'`))
      expect(imports.length).toBeGreaterThan(0)
      for (const line of imports) expect(line).toMatch(/^(import|export) type /)
    }
  })
})
