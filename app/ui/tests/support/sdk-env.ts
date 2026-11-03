// R9（REVIEW-P4终审）：凭证隔离只作用于 SDK 子进程 env 副本。
// 修复前 sdk-runtime.ts 直接 delete process.env 的凭证 key —— playwright workers:1 下
// 同一 worker 跑完全部 spec，字母序在前的 spec 先调 helper 把 key 删掉，轮到
// journeys/d1-real-model.spec.ts（U-31 交付门）时读到 undefined，验收结果依赖测试顺序。
// 独立成文件（无 __dirname 等顶层副作用）以便 vitest 单测直接 import。
// U-32 O4（REVIEW-P4终审复审）：同口径扩展到被测 Electron shell（launch.ts 原先
// ...process.env 直 spread，R9 停删后真实凭证进 Electron 主/Chromium 子进程）。
import { join } from 'node:path'

/** 不进 SDK mock runtime 的真实凭证 key（原 sdk-runtime.ts 的剔除清单，语义保持）。 */
export const SANDBOXED_CREDENTIAL_KEYS = [
  'P2SDK_LLM_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LITELLM_MASTER_KEY',
] as const

/**
 * SDK 子进程 env：{...process.env} 副本上剔除凭证 key（副本上删，worker 的 process.env 不动），
 * 再叠加内置变量与显式 extra（真模型旅程经 extra 显式传 key，照传不剔）。
 */
export function sdkChildEnv(builtIn: Record<string, string>, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { ...process.env }
  for (const key of SANDBOXED_CREDENTIAL_KEYS) delete child[key]
  return { ...child, ...builtIn, ...extra }
}

/** 被 Electron shell 子进程 env（launchShell 用，U-32 O4）：同一副本剥离口径 + 临时 HOME
 * 沙箱路径 + 显式 extra 照传（如 launchProduct 的 PBOTS_DSH_HANDOFF）。worker 原值不动。 */
export function shellChildEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return sdkChildEnv({
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_CACHE_HOME: join(home, '.cache'),
    PBOTS_DATA_DIR: join(home, 'data'),
  }, extra)
}
