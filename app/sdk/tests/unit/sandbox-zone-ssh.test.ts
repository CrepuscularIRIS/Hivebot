// T10 ④e（D4 验证节）：confine 改写的单元级三态——stub super.confine。
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { ZoneCheckedSshSandboxProvider } from '../../src/policy/sandbox-zone-ssh.mjs'

const require_ = createRequire(import.meta.url)
const { default: SshSandboxProvider } = await import(require_.resolve('@deepseek-ai/dsh-sandbox-ssh'))
const { SandboxUnavailableError } = await import(require_.resolve('@deepseek-ai/dsh-sandbox'))

const WRAPPER = ['/usr/bin/python3', '-I', '/sdk/sandbox/bwrap-wrap.py', '--home', '/h', '--slirp', '/s']
const PLAN = { argv: ['/usr/bin/bwrap', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--', 'bash', '-c', 'x'], enforcement: 'full', runnerFailureRules: [] }

function instance(config: object, plan: unknown = PLAN) {
  const inst = Object.create(ZoneCheckedSshSandboxProvider.prototype) as ZoneCheckedSshSandboxProvider & { confine(a: string[], p?: unknown, s?: unknown): Promise<{ argv: string[] }> }
  Object.assign(inst, {
    p2sdkWrapperArgv: [], p2sdkRemoteHome: undefined, p2sdkRemoteNever: [], p2sdkRemoteRuntimeDir: undefined,
    ...config,
  })
  vi.spyOn(SshSandboxProvider.prototype, 'confine').mockImplementation(async () => plan as never)
  return inst
}

describe('T10 ④e confine 三态', () => {
  it('argv[0] 非 bwrap → SandboxUnavailableError；enforcement partial → 同', async () => {
    const bad0 = instance({ p2sdkWrapperArgv: WRAPPER }, { ...PLAN, argv: ['/usr/bin/whatever', ...PLAN.argv.slice(1)] })
    await expect(bad0.confine(['cmd']), '非 bwrap 拒').rejects.toThrow(SandboxUnavailableError)
    const partial = instance({ p2sdkWrapperArgv: WRAPPER }, { ...PLAN, enforcement: 'partial' })
    await expect(partial.confine(['cmd']), 'partial 拒').rejects.toThrow(SandboxUnavailableError)
  })

  it('bwrap+full → 前缀=wrapper、含宿主与远端两套 --home、原 -- 后段逐元素相同', async () => {
    const inst = instance({ p2sdkWrapperArgv: WRAPPER, p2sdkRemoteHome: '/r/home', p2sdkRemoteNever: ['/r/home/.ssh'] })
    const out = await inst.confine(['bash', '-c', 'x'])
    const sep = out.argv.indexOf('--')
    expect(sep).toBeGreaterThan(0)
    expect(out.argv.slice(0, 5), '前缀=python3 -I wrap').toEqual(WRAPPER.slice(0, 5))
    // 宿主 --home /h 与远端 --home /r/home 两套都在
    const homes = out.argv.filter((_, i) => out.argv[i - 1] === '--home')
    expect(homes).toEqual(['/h', '/r/home'])
    expect(out.argv).toContain('--never')
    // 原 plan 的 -- 后段（真命令）逐元素保留在尾部
    expect(out.argv.slice(sep + 1)).toEqual(['bash', '-c', 'x'])
  })
})
