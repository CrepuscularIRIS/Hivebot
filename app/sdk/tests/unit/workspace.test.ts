// T11 RPC 单测：p2sdk/workspace_ensure 三态——真 cordis Context（TypertRemoteService
// 需要 ctx.runtime.provide），subprocess 服务桩按 argv 供输出。
import { describe, expect, it } from 'vitest'
import * as mod from '../../src/p2sdk/workspace.mjs'

async function makeRoot(canonicalOf: (path: string) => string, calls: string[][] = []) {
  const { Context } = await import('@deepseek-ai/cordis')
  const root = new Context()
  root.provide('subprocess', null as never)
  root.set('subprocess', {
    spawn(opts: { argv: string[] }) {
      const argv = opts.argv
      calls.push(argv)
      const text = argv[0] === 'readlink' ? canonicalOf(argv[argv.length - 1]!) : ''
      return {
        done: Promise.resolve(),
        waitForExit: async () => ({ kind: 'exited', exitCode: 0 }),
        collected: { stdout: { readFrom: () => ({ text }) }, stderr: { readFrom: () => ({ text: '' }) } },
      }
    },
  } as never)
  return root
}

describe('T11 p2sdk/workspace_ensure', () => {
  it('词法校验：非 botId 形状拒', async () => {
    const root = await makeRoot((p) => p)
    const fiber = root.plugin(mod.default as never, { remoteRoot: '/remote/root' } as never)
    await fiber
    const svc = root.get('p2sdkWorkspace') as never as { workspace_ensure(req: { botId: string }): Promise<{ path: string; canonical: string }> }
    expect(svc, '服务注册').toBeDefined()
    for (const bad of ['../escape', 'a/b', '', 'has space', '.hidden', 'x'.repeat(200)]) {
      await expect(svc.workspace_ensure({ botId: bad }), `botId=${JSON.stringify(bad)} 拒`).rejects.toThrow()
    }
    void fiber
  })

  it('正常：mkdir 固定 argv + readlink canonical', async () => {
    const calls: string[][] = []
    const root = await makeRoot((p) => p, calls)
    await root.plugin(mod.default as never, { remoteRoot: '/remote/root' } as never)
    const svc = root.get('p2sdkWorkspace') as never as { workspace_ensure(req: { botId: string }): Promise<{ path: string; canonical: string }> }
    const out = await svc.workspace_ensure({ botId: 'bot-123' })
    expect(out).toEqual({ path: '/remote/root/workspaces/bot-123', canonical: '/remote/root/workspaces/bot-123' })
    expect(calls[0]).toEqual(['mkdir', '-p', '--', '/remote/root/workspaces/bot-123'])
    expect(calls[1]).toEqual(['readlink', '-f', '--', '/remote/root/workspaces/bot-123'])
  })

  it('P2 收口：canonical 越界拒；界内链接形态回传 canonical', async () => {
    const escaped = await makeRoot(() => '/elsewhere/evil')
    await escaped.plugin(mod.default as never, { remoteRoot: '/remote/root' } as never)
    const svcE = escaped.get('p2sdkWorkspace') as never as { workspace_ensure(req: { botId: string }): Promise<unknown> }
    await expect(svcE.workspace_ensure({ botId: 'b1' }), 'canonical 出区拒').rejects.toThrow(/escaped/)
    const linked = await makeRoot(() => '/remote/root/workspaces/real-dir')
    await linked.plugin(mod.default as never, { remoteRoot: '/remote/root' } as never)
    const svcL = linked.get('p2sdkWorkspace') as never as { workspace_ensure(req: { botId: string }): Promise<{ canonical: string }> }
    expect((await svcL.workspace_ensure({ botId: 'b2' })).canonical, '界内 canonical 回传').toBe('/remote/root/workspaces/real-dir')
  })
})
