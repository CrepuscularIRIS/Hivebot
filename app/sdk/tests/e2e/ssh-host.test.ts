// T2（L8-a）+ T2b（测试有效性返修）：私有 sshd 测试夹具 + dsh ssh 族连接级验收。
// T2b 目标：每一格在「被测性质不成立」时必须红——端口断言只认 ECONNREFUSED；
// ③b 用「断开 ssh 传输后 fs 必须报传输错」证明 fs 依赖 ssh 通道（同机同文件系统下
// 读写一致证明不了路由）；⑥ 先正对照（扫描必须看得见 helper/master）再归零。
// 结构参照上游手搭组合（来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d512:packages/ssh/ssh/tests/live.e2e.ts）。
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import * as net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startSshHost } from '../support/ssh-host.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const execFileAsync = promisify(execFile)

type Host = Awaited<ReturnType<typeof startSshHost>>

/** 真实 ~/.ssh 的递归元数据快照（相对路径|mode|size|mtimeMs|ctimeMs|ino），只 lstat/readdir，不读内容。 */
function snapshotTree(root: string, rel = ''): string[] {
  const entries: string[] = []
  const walk = (current: string): void => {
    for (const name of readdirSync(join(root, current)).sort()) {
      const rel = current ? `${current}/${name}` : name
      const st = lstatSync(join(root, rel))
      entries.push(`${rel}|${st.mode}|${st.size}|${st.mtimeMs}|${st.ctimeMs}|${st.ino}`)
      if (st.isDirectory()) walk(rel)
    }
  }
  walk(rel)
  return entries
}

function snapshotRealSsh(): string[] | null {
  const dir = join(userInfo().homedir, '.ssh')
  if (!existsSync(dir)) return null
  return snapshotTree(dir)
}

/** 只接受 ECONNREFUSED：连上、超时、其他错误一律算失败（T2b：防「任何 reject 都算过」的恒绿断言）。 */
function portRefused(port: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1')
    const fail = (message: string): void => { sock.destroy(); reject(new Error(message)) }
    sock.setTimeout(timeoutMs, () => fail(`port ${port}: connect timeout（既没拒连也没连上，按失败算）`))
    sock.on('connect', () => fail(`port ${port}: still listening`))
    sock.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') { sock.destroy(); resolve() }
      else fail(`port ${port}: ${err.code ?? err.message}`)
    })
  })
}

/** /proc 扫描：environ 含本轮 PBOTS_SSH_MARK=（helper 与远端 shell 继承它）或 cmdline 含夹具目录（sshd/master）。 */
function scanLeaks(host: Host): { markHits: string[]; cmdlineHits: string[] } {
  const markHits: string[] = []
  const cmdlineHits: string[] = []
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue
    try {
      if (readFileSync(join('/proc', pid, 'environ'), 'utf8').includes(`PBOTS_SSH_MARK=${host.mark}`)) markHits.push(pid)
    } catch { /* 读不到当不存在 */ }
    try {
      if (readFileSync(join('/proc', pid, 'cmdline'), 'utf8').includes(host.dir)) cmdlineHits.push(pid)
    } catch { /* 同上 */ }
  }
  return { markHits, cmdlineHits }
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

  it('①b 远端会话 HOME 与 cwd 都收在夹具 remote-home（不落真实家目录）', async () => {
    const { stdout } = await execFileAsync('ssh', ['pbots-ssh-test', 'printf "%s;%s" "$HOME" "$PWD"'])
    expect(stdout).toBe(`${host!.remoteHome};${host!.remoteHome}`)
  }, 60_000)

  it('② 真实 ~/.ssh 递归元数据（含 mode）未被改动（stat 快照，不读内容）', () => {
    expect(snapshotRealSsh()).toEqual(realSshBefore)
  })

  it('②自检 快照能察觉 chmod 与子目录改动（对 tmkdir 假目录；旧实现下必须红）', () => {
    const fake = tmkdir('bot-T2b-snap-self-')
    mkdirSync(join(fake, 'sub'), { recursive: true })
    writeFileSync(join(fake, 'sub', 'a'), 'x', { mode: 0o600 })
    const before = snapshotTree(fake)
    chmodSync(join(fake, 'sub', 'a'), 0o644)
    const afterChmod = snapshotTree(fake)
    expect(afterChmod).not.toEqual(before)
    writeFileSync(join(fake, 'sub', 'b'), 'y', { mode: 0o600 })
    expect(snapshotTree(fake)).not.toEqual(afterChmod)
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

  it('③b 断开 ssh 传输后 fs 必须报传输错（证明 fs 依赖 ssh 通道，而非本机路径）', async () => {
    const host2 = await startSshHost()
    try {
      const p = await host2.ctx.fs.resolve(`${host2.hello.workspace}/cut.txt`)
      await host2.ctx.fs.writeText(p, 'cut')
      expect(await host2.ctx.fs.readText(p)).toBe('cut')
      // 只杀 bin/ssh 包装登记到的客户端 PID（master 在内；全是本测试自己的进程）
      const pids = [...new Set(readFileSync(join(host2.dir, 'ssh-client.pids'), 'utf8')
        .split('\n').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0))]
      expect(pids.length).toBeGreaterThan(0)
      for (const pid of pids) { try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ } }
      // 传输断开后同一路径读取必须以传输类错误拒绝——不得成功、不得 TypeError。
      // 杀完立刻读可能落在断连完成前（拿到调度期 EPIPE，复核轮 CONFIRMED/中），轮询至明确断连错
      const transportError = /SSH helper disconnected|SSH .*(closed|disconnect)|EPIPE|ECONNRESET/i
      let sawSuccess = false
      let error: unknown = null
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const outcome = await host2.ctx.fs.readText(p).then(() => 'ok' as const, (e: unknown) => e)
        if (outcome === 'ok') { sawSuccess = true; break }
        error = outcome
        if (transportError.test(String((outcome as Error)?.message ?? outcome))) break
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(sawSuccess).toBe(false) // 本地 fs（M1 变异）在这里永远读成功
      expect(error).toBeTruthy()
      expect(error).not.toBeInstanceOf(TypeError)
      expect(String((error as Error)?.message ?? error)).toMatch(transportError)
    } finally {
      await host2.stop()
    }
  }, 120_000)

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

  it('⑤ helperHash 错一位：ssh 已认证、helper 已回 hello 后，digest 校验失败拒绝放行 ready', async () => {
    const [{ Context }, { SshConnection }] = await Promise.all([
      import('@deepseek-ai/cordis'),
      import('@deepseek-ai/dsh-ssh'),
    ])
    const good = host!.connectionConfig()
    const flipped = (good.helperHash.endsWith('0')
      ? `${good.helperHash.slice(0, -1)}1` : `${good.helperHash.slice(0, -1)}0`)
    const bad = new Context()
    const conn = bad.plugin(SshConnection, { ...good, helperHash: flipped })
    await expect(Promise.all([conn])).rejects.toThrow(/SSH helper digest differs/)
    await conn.dispose().catch(() => {})
  }, 60_000)

  it('⑥自检 portRefused 对活端口必须报错（防恒绿）', async () => {
    const server = net.createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const { port } = server.address() as net.AddressInfo
    await expect(portRefused(port)).rejects.toThrow(/still listening/)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('⑥ stop：正对照（先看见 helper 与 sshd/master）→ stop 后进程归零、端口只以 ECONNREFUSED 拒、真实 ~/.ssh 元数据未变', async () => {
    const before = scanLeaks(host!)
    expect(before.markHits.length).toBeGreaterThanOrEqual(1)   // helper（workspace 走 RPC hello，argv 看不见，靠 environ mark）
    expect(before.cmdlineHits.length).toBeGreaterThanOrEqual(1) // sshd 监听进程（-f 夹具目录）
    await host!.stop()
    const after = scanLeaks(host!)
    expect([...after.markHits, ...after.cmdlineHits]).toEqual([])
    await portRefused(host!.port)
    expect(snapshotRealSsh()).toEqual(realSshBefore)
  }, 60_000)
})
