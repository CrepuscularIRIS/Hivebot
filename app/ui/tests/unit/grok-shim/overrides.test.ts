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
const WHOLE_REPLACEMENTS = new Set([
  // T40cb 收窄（经理口径：无 `export * from '../../frontend/src/<上游>'` 才算整复制——
  // 2026-11-15 亲跑 grep 判定）。曾把 15 个仍是 re-export 包装的覆盖也塞进来（关掉了
  // 包装检查）——退回。market-surface 为「借类型整面替换」（见下测）。
  'market-surface.tsx',
  'character.tsx',        // T24 整模块复制（补 7 形状）
  'rich-text-editor.tsx', // T94 整模块复制（仅发送键 mod+enter；receipts/T94.acceptance.md 经理裁决）
  'agent-avatar.tsx',     // T88 换 0.78.1 引擎
  'mermaid.tsx',          // T89 npm 化
  'math.tsx',             // T89 npm 化
  'emoji-catalog.ts',     // T90 emojibase-data
  'agent-row-actions.tsx',  // T77 菜单项原语
 
])

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
    // T24：character.tsx 是「复制改造」（搬运阶梯第 3 级）——整文件抄上游后在副本上补
    // 形状，文件头已注来源；它与 market-surface（借类型自己写）不同，单列并查来源头。
    const COPIES = new Set(['character.tsx', 'rich-text-editor.tsx', 'agent-avatar.tsx', 'mermaid.tsx', 'math.tsx', 'emoji-catalog.ts', 'agent-row-actions.tsx', ]) // T40cb：整复制族（唯 market-surface 借类型走原断言） // T40c：整复制族全列（唯 market-surface 走「借类型」分支保留原断言）
    for (const ours of WHOLE_REPLACEMENTS) {
      if (!existsSync(join(ROOT, 'overrides', 'modules', ours))) continue // T40cb：存在性先行（agent-row-actions 在 feat/T77，合并后文件才在）
      const text = readFileSync(join(ROOT, 'overrides', 'modules', ours), 'utf8')
      if (COPIES.has(ours)) { expect(text).toMatch(/来源|整模块复制|整复制|覆盖/) ; continue } // T40cb：来源/覆盖头断言恢复（任一风格）
      const upstream = Object.entries(MODULE_OVERRIDES).find(([, o]) => o === ours)![0].replace(/\.tsx?$/, '')
      const imports = text.split('\n').filter((l) => l.includes(`frontend/src/${upstream}'`))
      expect(imports.length).toBeGreaterThan(0)
      for (const line of imports) expect(line).toMatch(/^(import|export) type /)
    }
  })
})
