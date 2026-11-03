// R9（REVIEW-P4终审）：launchSdkRuntime 曾直接 delete worker process.env 的凭证 key ——
// playwright workers:1 下同一 worker 跑完全部 spec，字母序在前的 d1.spec.ts 等先调 helper，
// 轮到 journeys/d1-real-model.spec.ts 时 LITELLM_MASTER_KEY 已被删（顺序依赖失败）。
// 修复后：只在子进程 env 副本上剔除，worker 的 process.env 不动。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sdkChildEnv } from '../../support/sdk-env'

const KEYS = ['P2SDK_LLM_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LITELLM_MASTER_KEY'] as const
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

beforeAll(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; process.env[k] = `real-${k}` }
})
afterAll(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]! }
})

describe('R9：sdkChildEnv 剔除凭证只作用于子进程 env 副本', () => {
  it('凭证 key 不进 SDK 子进程 env，worker 的 process.env 保持原值', () => {
    const child = sdkChildEnv({ P2SDK_PROVIDER: 'mock', P2SDK_LLM_API_KEY: 'explicit' })
    for (const k of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'LITELLM_MASTER_KEY']) {
      expect(child[k], k).toBeUndefined() // 子进程不继承真实凭证（原剔除语义保持）
    }
    expect(child.P2SDK_LLM_API_KEY).toBe('explicit') // opts.env 显式传入的照传（真模型旅程 d1-real-model）
    expect(child.P2SDK_PROVIDER).toBe('mock')
    for (const k of KEYS) {
      expect(process.env[k], k).toBe(`real-${k}`) // worker env 未被删（修复前：undefined → 红）
    }
  })
})
