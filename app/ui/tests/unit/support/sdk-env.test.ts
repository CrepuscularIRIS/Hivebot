// R9（REVIEW-P4终审）：launchSdkRuntime 曾直接 delete worker process.env 的凭证 key ——
// playwright workers:1 下同一 worker 跑完全部 spec，字母序在前的 d1.spec.ts 等先调 helper，
// 轮到 journeys/d1-real-model.spec.ts 时 LITELLM_MASTER_KEY 已被删（顺序依赖失败）。
// 修复后：只在子进程 env 副本上剔除，worker 的 process.env 不动。
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sdkChildEnv, sdkDataDirEnv, shellChildEnv } from '../../support/sdk-env'

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

// U-32 O4（REVIEW-P4终审复审）：R9 停止删除 worker process.env 后，launchShell 的
// ...process.env 仍把真实凭证 spread 进被测 Electron 主进程及其 Chromium 子进程。
// 修复：shellChildEnv 复用 SANDBOXED_CREDENTIAL_KEYS 同口径剥副本；worker 原值不动
// （真模型旅程照常经 creds 路径拿 key）。
describe('U-32 O4：shellChildEnv —— 被 Electron 的 env 副本同口径剥凭证键', () => {
  it('凭证 key 不进 Electron env；沙箱路径与显式 extra 照常；worker process.env 不动', () => {
    const home = '/tmp/bot-u32-shell-home'
    const env = shellChildEnv(home, { PBOTS_DSH_HANDOFF: '/tmp/bot-u32-handoff' })
    for (const k of KEYS) {
      expect(env[k], k).toBeUndefined() // Electron 主/Chromium 子进程不继承真实凭证
    }
    expect(env.HOME).toBe(home)
    expect(env.XDG_CONFIG_HOME).toBe(join(home, '.config'))
    expect(env.PBOTS_DATA_DIR).toBe(join(home, 'data'))
    expect(env.PBOTS_DSH_HANDOFF).toBe('/tmp/bot-u32-handoff') // launchProduct 传入的显式变量照传
    for (const k of KEYS) {
      expect(process.env[k], k).toBe(`real-${k}`) // worker env 未被动（credentials 仍可经 creds 路径取）
    }
  })
})

// P5-01 决策 15：sdk-runtime 的可选 dataDir 参数经 sdkChildEnv 变成 PBOTS_DATA_DIR
// 传给 SDK 子进程；纯函数放 sdk-env（无顶层副作用）以便本单测直接 import。
describe('P5-01：sdkDataDirEnv —— dataDir → PBOTS_DATA_DIR', () => {
  it('未传 dataDir 时不设变量（缺省不传）', () => {
    expect(sdkDataDirEnv(undefined)).toEqual({})
  })

  it('传了 dataDir 则映射为 PBOTS_DATA_DIR', () => {
    expect(sdkDataDirEnv('/home/lingxufeng/bot/.test-homes/p5-ui/data')).toEqual({
      PBOTS_DATA_DIR: '/home/lingxufeng/bot/.test-homes/p5-ui/data',
    })
  })
})
