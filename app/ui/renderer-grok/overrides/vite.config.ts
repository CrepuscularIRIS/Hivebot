// P5-52 · 覆盖层构建配置（ours）：上游 frontend/vite.config.ts 原样合并，只加一个模块替换插件。
// 覆盖模块（modules/*）按「上游路径 → 我们的文件」整模块替换；覆盖模块自己 import 上游原模块时不再替换，
// 所以覆盖模块写成「re-export 上游 + 包一层」：剥掉回调 prop / 过滤列表，让上游自己的 null 门控收起入口。
// 上游文件零改动（pnpm check diff=0）；纯上游构建用 pnpm build:upstream。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig, type Plugin } from 'vite'
import upstream from '../frontend/vite.config.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../frontend/src')

/** 上游模块（frontend/src 相对路径）→ 覆盖模块（overrides/modules）。 */
export const MODULE_OVERRIDES: Record<string, string> = {
  'recovered/features/conversation/workspace/sidebar.tsx': 'sidebar.tsx',
  'recovered/features/conversation/workspace/chat-header.tsx': 'chat-header.tsx',
  'recovered/features/computer/shell/view.tsx': 'computer-view.tsx',
  'production/agent-row-actions-model.ts': 'agent-row-actions-model.ts',
  'production/CommandPalette.tsx': 'CommandPalette.tsx',
  'recovered/features/conversation/workspace/transcript.tsx': 'transcript.tsx',
  'recovered/features/conversation/workspace/rich-text-editor.tsx': 'rich-text-editor.tsx',
  'recovered/features/settings/overlay/view.tsx': 'settings-view.tsx',
  'recovered/features/settings/overlay/panels.tsx': 'settings-panels.tsx',
  'recovered/features/permissions/local-tool/view.tsx': 'local-tool-view.tsx',
  // P5-57：市场 / 配置面板 / 失效禁发 / 入口文案
  'recovered/features/plugins/overlay/desktop-surface.tsx': 'market-surface.tsx',
  'recovered/features/agent-info/settings/view.tsx': 'agent-settings.tsx',
  'recovered/features/conversation/workspace/composer.tsx': 'composer.tsx',
  'production/evidence.ts': 'evidence.ts',
}

const byUpstream = new Map(Object.entries(MODULE_OVERRIDES).map(([up, ours]) => [path.join(src, up), path.join(here, 'modules', ours)]))

function moduleOverrides(): Plugin {
  return {
    name: 'pbots-module-overrides',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (importer === undefined || importer.startsWith(path.join(here, 'modules'))) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved === null ? null : byUpstream.get(resolved.id) ?? null
    },
  }
}

export default mergeConfig(upstream, { plugins: [moduleOverrides()] })
