// R9（REVIEW-P4终审）：凭证隔离只作用于 SDK 子进程 env 副本。
// 修复前 sdk-runtime.ts 直接 delete process.env 的凭证 key —— playwright workers:1 下
// 同一 worker 跑完全部 spec，字母序在前的 spec 先调 helper 把 key 删掉，轮到
// journeys/d1-real-model.spec.ts（U-31 交付门）时读到 undefined，验收结果依赖测试顺序。
// 独立成文件（无 __dirname 等顶层副作用）以便 vitest 单测直接 import。

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
