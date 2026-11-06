// T2（L8-a）：私有 sshd 测试夹具 + dsh ssh 族连接级验收。
// 证明两件事：文件/进程确实经 ssh 在「远端」（本机私有 sshd）执行；全程不碰真实 ~/.ssh。
// 结构参照上游手搭组合（来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d512:packages/ssh/ssh/tests/live.e2e.ts）。
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import * as net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startSshHost } from './ssh-host-local.ts'

const execFileAsync = promisify(execFile)

type Host = Awaited<ReturnType<typeof startSshHost>>

/** 真实 ~/.ssh 的目录项快照：名字+size+mtimeMs，只 stat 不读内容（内容可能含私钥）。 */
function snapshotRealSsh(): string[] | null {
  const dir = join(userInfo().homedir, '.ssh')
  if (!existsSync(dir)) return null
  return readdirSync(dir).map((name) => {
    const s = statSync(join(dir, name))
    return `${name}|${s.size}|${s.mtimeMs}`
  }).sort()
}

let host: Host | undefined
let realSshBefore: string[] | null

beforeAll(async () => {
  realSshBefore = snapshotRealSsh()
  host = await startSshHost()
}, 120_000)

afterAll(async () => { await host?.stop() })

describe('T2 L8-a 私有 sshd 夹具 + dsh ssh 族', () => {
  it('① PATH 包装 ssh 可 BatchMode 登录测试 sshd', async () => {
    const { stdout } = await execFileAsync('ssh', [
      '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', 'pbots-ssh-test', 'true',
    ])
    expect(stdout).toBe('')
  }, 60_000)

  it('② 真实 ~/.ssh 未被改动（stat 快照）', () => {
    expect(snapshotRealSsh()).toEqual(realSshBefore)
  })

  it('③ 连接级 fs 写读一致；子进程带着 sshd 会话专属 PBOTS_SSH_MARK（证明在远端执行）', async () => {
    const { ctx, hello, mark } = host!
    const p = await ctx.fs.resolve(`${hello.workspace}/hello.txt`)
    await ctx.fs.writeText(p, 'hello-ssh')
    expect(await ctx.fs.readText(p)).toBe('hello-ssh')

    const handle = ctx.subprocess.spawn({
      argv: ['/bin/sh', '-c', 'printf %s "$PBOTS_SSH_MARK"'],
      cwd: hello.workspace,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
      graceMs: 5000,
    })
    await handle.done
    await handle.waitForExit()
    const stdout = handle.collected.stdout?.readFrom(0).text
    expect(stdout).toBe(mark)
  }, 60_000)

  it('④ sandbox workspace-write：写 workspace 内成功、写远端 HOME 被拒且文件未创建', async () => {
    const { ctx, hello, remoteHome } = host!
    const ws = hello.workspace
    const inside = await ctx.sandbox.confine(
      ['/bin/sh', '-c', `printf ok > ${JSON.stringify(`${ws}/in.txt`)}`],
      { mode: 'workspace-write', workspaceRoot: ws },
    )
    const inHandle = ctx.subprocess.spawn({
      argv: inside.argv, cwd: ws,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 4096 } },
      graceMs: 5000,
    })
    const inDone = await inHandle.done
    await inHandle.waitForExit()
    expect(inDone.exitCode).toBe(0)
    const inPath = await ctx.fs.resolve(`${ws}/in.txt`)
    expect(await ctx.fs.readText(inPath)).toBe('ok')

    const outside = await ctx.sandbox.confine(
      ['/bin/sh', '-c', `printf nope > ${JSON.stringify(`${remoteHome}/outside.txt`)}`],
      { mode: 'workspace-write', workspaceRoot: ws },
    )
    const outHandle = ctx.subprocess.spawn({
      argv: outside.argv, cwd: ws,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 4096 } },
      graceMs: 5000,
    })
    const outDone = await outHandle.done
    await outHandle.waitForExit()
    expect(outDone.exitCode).not.toBe(0)
    const outPath = await ctx.fs.resolve(`${remoteHome}/outside.txt`)
    await expect(ctx.fs.readText(outPath)).rejects.toThrow()
  }, 120_000)

  it('⑤ helperHash 错一位：连接 ready 拒绝且报 digest differs', async () => {
    const [{ Context }, { SshConnection }] = await Promise.all([
      import('@deepseek-ai/cordis'),
      import('@deepseek-ai/dsh-ssh'),
    ])
    const good = host!.connectionConfig()
    const flipped = (good.helperHash.endsWith('0')
      ? `${good.helperHash.slice(0, -1)}1` : `${good.helperHash.slice(0, -1)}0`)
    const bad = new Context()
    const conn = bad.plugin(SshConnection, { ...good, helperHash: flipped })
    // 等 fiber 启动（ready 校验在 start 阶段抛错）；digest 不匹配必须在连接建立前被拒
    await expect(Promise.all([conn])).rejects.toThrow(/SSH helper digest differs/)
    await conn.dispose().catch(() => {})
  }, 60_000)

  it('⑥ stop 后无夹具路径进程、端口关闭、真实 ~/.ssh 仍未动', async () => {
    await host!.stop()
    // /proc 里不应再有命令行含夹具目录的进程（读不到的进程当不存在）
    const leaked: string[] = []
    for (const pid of readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue
      try {
        const cmd = readFileSync(join('/proc', pid, 'cmdline'), 'utf8')
        if (cmd.includes(host!.dir)) leaked.push(`${pid}:${cmd.replace(/\0/g, ' ').slice(0, 80)}`)
      } catch { /* 进程消失或不可读 */ }
    }
    expect(leaked).toEqual([])
    await expect(new Promise<never>((_, reject) => {
      const sock = net.connect(host!.port, '127.0.0.1')
      sock.on('connect', () => { sock.destroy(); reject(new Error('port still open')) })
      sock.on('error', (err) => reject(err as never))
      sock.setTimeout(3000, () => { sock.destroy(); reject(new Error('timeout')) })
    })).rejects.toThrow()
    expect(snapshotRealSsh()).toEqual(realSshBefore)
  }, 60_000)
})
