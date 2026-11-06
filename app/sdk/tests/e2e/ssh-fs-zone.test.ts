// T9b（L8-e / DESIGN D1 r3）：fs-zone-ssh 五写入口 provider 层收口。
// 先红法（D1 验证节）：先挂**原版 fs-ssh** 跑同一 writeText 到远端 /tmp——远端
// helper 的 fs-sandbox 围栏 writableRoots 含 /tmp（dsh-sandbox lib 239-246），
// 应**写成功**（这正是 P6-25 决策 37 在本机由 zoneGuard 收掉的洞）；再挂
// fs-zone-ssh 应拒。绕开 pre-execute 直测 provider（tools 管线下 shell-ask 先拒，
// 测不出这一层）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SshConnection } from '@deepseek-ai/dsh-ssh'
import { SshFileSystem } from '@deepseek-ai/dsh-fs-ssh'
import { ZoneCheckedSshFileSystem } from '../../src/policy/fs-zone-ssh.mjs'
import { startSshServer, type SshServer } from '../support/ssh-host.ts'
import { trackTmpDir } from '../support/tmp-sweep.ts'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const NEVER_MARK = 'never-root denied'
const OUT_MARK = 'write-outside-workspace denied'

describe('T9b fs-zone-ssh（五写入口 provider 层）', () => {
  let server: SshServer
  let oldPath: string | undefined
  // 每格自组 Context（插件可换：原版 fs-ssh 或 fs-zone-ssh）
  const compose = async (fsPlugin: unknown, extraConfig: object = {}, policyConfig: object = { mode: 'workspace-write', workspaceRoot: server.workspace }) => {
    const ctx = new Context()
    const fibers = [
      ctx.plugin(SessionProjectionRegistry),
      ctx.plugin(SandboxPolicyService, policyConfig),
      ctx.plugin(SshConnection, {
        host: 'pbots-ssh-test',
        launch: { kind: 'node-script', node: process.execPath },
        helper: server.helper, helperHash: server.helperHash, workspace: server.workspace,
      }),
      ctx.plugin(fsPlugin, { cwd: server.workspace, ...extraConfig }),
    ]
    await Promise.all(fibers as never)
    await ctx.ssh.ready
    return { ctx, dispose: async () => { for (const f of [...(fibers as never)].reverse()) await (f as never as { dispose(): Promise<void> }).dispose() } }
  }

  beforeAll(async () => {
    server = await startSshServer()
    oldPath = process.env.PATH
    process.env.PATH = `${server.binDir}:${oldPath ?? ''}`
  }, 120_000)
  afterAll(async () => {
    if (oldPath === undefined) delete process.env.PATH
    else process.env.PATH = oldPath
    await server?.stopServer()
  })

  it('①b 先红段：原版 fs-ssh 写远端 /tmp 成功（远端围栏放行——这是要收的洞）', { timeout: 120_000 }, async () => {
    const { ctx, dispose } = await compose(SshFileSystem)
    try {
      const target = await ctx.fs.resolve(`/tmp/t9b-plain-${Math.random().toString(16).slice(2, 8)}/x`)
      await ctx.fs.writeText(target, 'leak')
      // 远端真写了：读回证明（不是静默失败）
      expect(await ctx.fs.readText(target)).toBe('leak')
    } finally { await dispose() }
  })

  // fs-zone-ssh 组合（NEVER 根 = 远端 HOME/.ssh）
  const composeZoned = () => compose(ZoneCheckedSshFileSystem, { neverRoots: [join(server.remoteHome, '.ssh')] })
  const resolves = (fs: { resolve(p: string): Promise<{ targetKey: string }> }, p: string) => fs.resolve(p)

  it('①a 区内写成功且内容正确；①b 远端 /tmp 拒 WRITE_OUT 且文件不存在', { timeout: 120_000 }, async () => {
    const { ctx, dispose } = await composeZoned()
    try {
      const inside = await resolves(ctx.fs, join(server.workspace, 't9b-a.txt'))
      await ctx.fs.writeText(inside, 'inside-ok')
      expect(await ctx.fs.readText(inside)).toBe('inside-ok')
      const outPath = `/tmp/t9b-zone-${Math.random().toString(16).slice(2, 8)}/x`
      const outside = await resolves(ctx.fs, outPath)
      await expect(ctx.fs.writeText(outside, 'leak'), '①b fs-zone-ssh 拒远端 /tmp').rejects.toThrow(OUT_MARK)
      const probe = await resolves(ctx.fs, outPath)
      await expect(ctx.fs.readText(probe), '①b 文件不存在（拒发生在写入前）').rejects.toThrow()
    } finally { await dispose() }
  })

  it("①b′ remoteHome 根拒（远端围栏本就拒——回归格）；①c ws 内指向 remoteHome 的链接拒", { timeout: 120_000 }, async () => {
    const { ctx, dispose } = await composeZoned()
    try {
      const homeFile = await resolves(ctx.fs, join(server.remoteHome, 't9b-home-x'))
      await expect(ctx.fs.writeText(homeFile, 'x'), '①b′ remoteHome 拒').rejects.toThrow(OUT_MARK)
      // ①c：ws 内符号链接 → remoteHome 下文件（resolve 后按真实身份判）
      const { symlinkSync, rmSync } = await import('node:fs')
      const link = join(server.workspace, 't9b-link')
      try { rmSync(link, { force: true }) } catch { /* 无 */ }
      symlinkSync(server.remoteHome, link)
      const viaLink = await resolves(ctx.fs, join(link, 't9b-via-link'))
      await expect(ctx.fs.writeText(viaLink, 'x'), '①c 链接绕法拒').rejects.toThrow(OUT_MARK)
    } finally { await dispose() }
  })

  it('①d NEVER：remoteHome/.ssh 下目标在 danger-full-access 仍拒', { timeout: 120_000 }, async () => {
    // per-call policy 传参需跳过 expected（远端 schema 校验拒 undefined）——用组合级
    // defaultMode=danger-full-access 表达「升权态」，调用保持两参。
    const { ctx, dispose } = await compose(ZoneCheckedSshFileSystem, { neverRoots: [join(server.remoteHome, '.ssh')] }, { mode: 'danger-full-access', workspaceRoot: server.workspace })
    try {
      const cred = await resolves(ctx.fs, join(server.remoteHome, '.ssh', 't9b-cred'))
      await expect(ctx.fs.writeText(cred, 'x'), '①d NEVER 不随升权放行').rejects.toThrow(NEVER_MARK)
    } finally { await dispose() }
  })

  it('② patchText/deleteFile/moveFile（源与目标）拒区外', { timeout: 120_000 }, async () => {
    const { ctx, dispose } = await composeZoned()
    try {
      const inside = join(server.workspace, 't9b-p.txt')
      await ctx.fs.writeText(await resolves(ctx.fs, inside), 'INSIDE')
      const outside = await resolves(ctx.fs, `/tmp/t9b-mv-${Math.random().toString(16).slice(2, 8)}`)
      await expect(ctx.fs.patchText(outside, [], undefined), 'patchText 区外').rejects.toThrow(OUT_MARK)
      await expect(ctx.fs.editText(outside, { oldString: 'A', newString: 'B' }, undefined), 'editText 区外').rejects.toThrow(OUT_MARK)
      await expect(ctx.fs.deleteFile(outside), 'deleteFile 区外').rejects.toThrow(OUT_MARK)
      await expect(ctx.fs.moveFile(await resolves(ctx.fs, inside), outside, {}), 'moveFile 目标区外').rejects.toThrow(OUT_MARK)
      const cred = await resolves(ctx.fs, join(server.remoteHome, '.ssh', 't9b-key'))
      await expect(ctx.fs.moveFile(await resolves(ctx.fs, inside), cred, {}), 'moveFile 目标 NEVER').rejects.toThrow(NEVER_MARK)
      expect(await ctx.fs.readText(await resolves(ctx.fs, inside)), '源文件原样（拒在写入前）').toBe('INSIDE')
    } finally { await dispose() }
  })

  it('③ 白名单防漂移：ZoneCheckedSshFileSystem 覆盖的写入口恰为五（上游新增即红）', () => {
    const WRITES = ['writeText', 'editText', 'patchText', 'deleteFile', 'moveFile']
    const proto = ZoneCheckedSshFileSystem.prototype as Record<string, unknown>
    for (const m of WRITES) expect(proto[m], `${m} 被覆盖`).toBeDefined()
    // SshFileSystem 原型上出现任何本类没覆盖的 *Text/*File/写形态方法 → 上游扩面
    const upstream = Object.getOwnPropertyNames(SshFileSystem.prototype)
    const uncovered = upstream.filter((m) => WRITES.includes(m) && !Object.getOwnPropertyNames(proto).includes(m))
    expect(uncovered, `上游写入口未被覆盖：${uncovered}`).toEqual([])
  })
})
