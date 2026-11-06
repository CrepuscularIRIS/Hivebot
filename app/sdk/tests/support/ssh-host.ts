// T2（L8-a）+ T2b/T2c + T4：完全隔离的本机 ssh 测试夹具。
// 关键事实（work/p9-dsh-integration/PLAN.md §3）：OpenSSH 不看 $HOME → 必须用 PATH 里的
// ssh 包装脚本注入 -F；服务端用私有 sshd（随机高端口 + 一次性密钥），绝不碰真实 ~/.ssh
// 与系统 :22。T2c 补四件：SetEnv 单行带 HOME（会话 shell 不读真实启动文件）、
// ForceCommand cd 进 remote-home（cwd 不落真实家目录）、setpriv --pdeathsig 兜底
// （测试进程任何死法下内核收走 sshd 与 ssh 客户端）、setup 失败全量回滚。
// T4 拆两层：startSshServer()＝sshd+密钥+ssh_config+bin/ssh+helper 解析（不建 Context、
// 不动 PATH——headless 子进程自己组 ssh 插件）；startSshHost()＝server+进程内组合（T2 十格不变）。
// 目录布局全在 tmkdir('bot-T2-ssh-') 下（bot-reap 白名单前缀），sshd 命令行带配置路径。
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as net from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SshConnection } from '@deepseek-ai/dsh-ssh'
import { SshFileSystem } from '@deepseek-ai/dsh-fs-ssh'
import { SshSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-ssh'
import { SshSandboxProvider } from '@deepseek-ai/dsh-sandbox-ssh'
import { tmkdir, trackTmpDir } from './tmp-sweep.ts'

const execFileAsync = promisify(execFile)
export const SSH_ALIAS = 'pbots-ssh-test'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

function canConnect(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1')
    const done = (ok: boolean): void => { sock.destroy(); resolve(ok) }
    sock.setTimeout(timeoutMs, () => done(false))
    sock.on('connect', () => done(true))
    sock.on('error', () => done(false))
  })
}

/** 私有 sshd 服务器层（T4 拆出）：不建 in-process Context、不动 process.env.PATH。 */
export interface SshServer {
  dir: string
  port: number
  mark: string
  remoteHome: string
  workspace: string
  binDir: string
  helper: string
  helperHash: string
  sshdPid: number
  /** 经 bin/ssh 包装登记的全部 ssh 客户端 PID（含 dsh-ssh master 与 -O 控制调用）。 */
  clientPids(): number[]
  stopServer(): Promise<void>
}

export interface SshHost {
  dir: string
  port: number
  mark: string
  remoteHome: string
  workspace: string
  ctx: Context
  sshdPid: number
  hello: { workspace: string; executable: string; root: string }
  /** SshConnection 的 Config 字面（⑤ 用来复制并改 helperHash）。 */
  connectionConfig(): Record<string, unknown>
  stop(): Promise<void>
}

/** 起服务器层：一次性密钥 → 私有 sshd → ssh_config + bin/ssh 包装 → helper 解析。 */
export async function startSshServer(): Promise<SshServer> {
  const dir = tmkdir('bot-T2-ssh-')
  const keysDir = join(dir, 'keys')
  const workspace = join(dir, 'ws')
  const remoteHome = join(dir, 'remote-home')
  const remoteTmp = join(dir, 'remote-tmp')
  const binDir = join(dir, 'bin')
  for (const d of [keysDir, workspace, remoteHome, remoteTmp, binDir]) mkdirSync(d, { recursive: true })
  const mark = randomUUID()

  const hostKey = join(keysDir, 'ssh_host_ed25519_key')
  const clientKey = join(keysDir, 'client_ed25519')
  await execFileAsync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 't2-host', '-f', hostKey])
  await execFileAsync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 't2-client', '-f', clientKey])

  const writeProtected = (path: string, content: string): void => {
    writeFileSync(path, content, { mode: 0o600 })
  }
  writeProtected(join(dir, 'authorized_keys'), `${readFileSync(`${clientKey}.pub`, 'utf8')}\n`)

  const startOnce = async (): Promise<{ child: ChildProcess; port: number }> => {
    const port = await freePort()
    writeProtected(join(dir, 'known_hosts'), `[127.0.0.1]:${port} ${readFileSync(`${hostKey}.pub`, 'utf8')}`)
    writeFileSync(join(dir, 'force-command.sh'), [
      '#!/bin/sh',
      `HOME='${remoteHome}'`,
      `TMPDIR='${remoteTmp}'`,
      `DBUS_SESSION_BUS_ADDRESS='unix:path=${join(dir, 'no-dbus')}'`,
      'export HOME TMPDIR DBUS_SESSION_BUS_ADDRESS',
      // T2c：远端 cwd 收进 remote-home（sshd 默认落在真实家目录）
      `cd '${remoteHome}' || exit 97`,
      'exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"',
      '',
    ].join('\n'), { mode: 0o755 })
    const sshdConfig = join(dir, 'sshd_config')
    writeProtected(sshdConfig, [
      `ListenAddress 127.0.0.1`,
      `Port ${port}`,
      `HostKey ${hostKey}`,
      `PidFile ${join(dir, 'sshd.pid')}`,
      `AuthorizedKeysFile ${join(dir, 'authorized_keys')}`,
      'UsePAM no',
      'StrictModes no',
      'PermitUserRC no',
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'PubkeyAuthentication yes',
      'AllowStreamLocalForwarding yes',
      // OpenSSH 9.6 实测：channel_connect_to_path（direct-streamlocal 的连接许可）只在
      // allow_tcp_forwarding 含 FORWARD_LOCAL 时放行（do_authenticated 的许可集装配），
      // AllowTcpForwarding no 会连带拒绝 dsh-ssh 的流转发（T2 存疑已实证）。
      // local 是最小档：允许 direct 连接（含 streamlocal），拒绝远端监听方向。
      'AllowTcpForwarding local',
      'X11Forwarding no',
      // T2c：SetEnv 只认第一行（sshd -T 实测）——mark/HOME 一行带走，会话 shell 一开始就拿到隔离 HOME
      `SetEnv PBOTS_SSH_MARK=${mark} HOME=${remoteHome} PBOTS_REMOTE_HOME=${remoteHome}`,
      `ForceCommand ${join(dir, 'force-command.sh')}`,
      '',
    ].join('\n'))
    // T2c：pdeathsig 兜底——测试进程以任何方式死掉（含 SIGKILL），内核对 sshd 发 TERM
    const child = spawn('setpriv', ['--pdeathsig', 'TERM', '/usr/sbin/sshd', '-D', '-e', '-f', sshdConfig], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    child.stderr?.pipe(createWriteStream(join(dir, 'sshd.log')))
    return { child, port }
  }

  let attempt = await startOnce()
  // 端口竞争允许重试一次（工单风险第 3 条）
  for (let waited = 0; waited < 200 && !(await canConnect(attempt.port)); waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    if (waited === 100) {
      attempt.child.kill('SIGTERM')
      attempt = await startOnce()
    }
  }
  if (!(await canConnect(attempt.port))) {
    attempt.child.kill('SIGTERM')
    throw new Error(`private sshd did not come up under ${dir}`)
  }
  const { child: sshdChild, port } = attempt

  let serverStopped = false
  const stopServer = async (): Promise<void> => {
    if (serverStopped) return
    serverStopped = true
    if (sshdChild.exitCode === null && sshdChild.signalCode === null) {
      sshdChild.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { sshdChild.kill('SIGKILL'); resolve() }, 5000)
        timer.unref()
        sshdChild.once('exit', () => { clearTimeout(timer); resolve() })
      })
    }
  }

  // PATH 包装与 ssh_config 属于服务器层：headless 子进程的 PATH 也靠 binDir 注入 -F
  writeFileSync(join(binDir, 'ssh'), [
    '#!/bin/sh',
    // T2b 观测点：登记经此包装的 ssh 客户端 PID（含 dsh-ssh master 与 -O 控制调用）
    `echo $$ >> '${join(dir, 'ssh-client.pids')}'`,
    // T2c：ssh 客户端（含 dsh-ssh master）同样挂 pdeathsig
    `exec setpriv --pdeathsig TERM /usr/bin/ssh -F '${join(dir, 'ssh_config')}' "$@"`,
    '',
  ].join('\n'), { mode: 0o755 })
  writeProtected(join(dir, 'ssh_config'), [
    `Host ${SSH_ALIAS}`,
    '  HostName 127.0.0.1',
    `  Port ${port}`,
    `  User ${process.env.USER ?? 'nobody'}`,
    `  IdentityFile ${clientKey}`,
    '  IdentitiesOnly yes',
    `  UserKnownHostsFile ${join(dir, 'known_hosts')}`,
    '  GlobalKnownHostsFile /dev/null',
    '',
  ].join('\n'))

  const require = createRequire(import.meta.url)
  const helper = realpathSync(require.resolve('@deepseek-ai/dsh-ssh/helper'))
  const helperHash = createHash('sha256').update(readFileSync(helper)).digest('hex')

  const clientPids = (): number[] => {
    try {
      return readFileSync(join(dir, 'ssh-client.pids'), 'utf8')
        .split('\n').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0)
    } catch { return [] /* 首个 ssh 客户端运行前文件还不存在 */ }
  }

  return { dir, port, mark, remoteHome, workspace, binDir, helper, helperHash, sshdPid: sshdChild.pid!, clientPids, stopServer }
}

/** 起完整夹具：服务器层 + 本进程 PATH 注入 + dsh ssh 族手搭组合（T2 十格的接口不变）。 */
export async function startSshHost(): Promise<SshHost> {
  const server = await startSshServer()

  // T2c：任何一步失败都必须回滚（还原 PATH、收 sshd）再抛
  const oldPath = process.env.PATH
  const fibers: Array<Promise<unknown> & { dispose(): Promise<void> }> = []
  const disposeFibers = async (): Promise<void> => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  }
  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    try { await disposeFibers() } catch { /* 连接失败的 dispose 异常不阻断后续清理 */ }
    if (oldPath === undefined) delete process.env.PATH
    else process.env.PATH = oldPath
    await server.stopServer()
    // T4：dispose 的 cancelForward 是 fire-and-forget（-O cancel 控制连接异步退出），
    // 立即扫描会撞上最后一毫秒的自然退出——等登记的客户端 PID 退净（限界 3s，
    // 超时的按字面 PID 补刀，全是本夹具登记的自己人）
    const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch { return false } }
    const stragglers = server.clientPids().filter(alive)
    for (let i = 0; i < 30 && stragglers.some(alive); i++) await new Promise((r) => setTimeout(r, 100))
    for (const pid of stragglers) if (alive(pid)) { try { process.kill(pid, 'SIGKILL') } catch { /* 已退 */ } }
    // cancel 连接可能在退净快照之后才 spawn（dispose 的 fire-and-forget）——再按
    // 「命令行含夹具目录」限界等零（≤3s，自然退出；不杀未知 PID）
    const dirInCmdline = (): number => {
      let hits = 0
      for (const pid of readdirSync('/proc')) {
        if (!/^\d+$/.test(pid)) continue
        try { if (readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(server.dir)) hits++ } catch { /* 不可读 */ }
      }
      return hits
    }
    for (let i = 0; i < 30 && dirInCmdline() > 0; i++) await new Promise((r) => setTimeout(r, 100))
  }

  try {
    // dsh-ssh 用 execFile('ssh') 走 PATH（不传 -F）→ PATH 最前放包装目录，结束还原
    process.env.PATH = `${server.binDir}:${oldPath ?? ''}`

    const connectionConfig = (): Record<string, unknown> => ({
      host: SSH_ALIAS,
      launch: { kind: 'node-script', node: process.execPath },
      helper: server.helper,
      helperHash: server.helperHash,
      workspace: server.workspace,
    })

    // 手搭组合照上游 live.e2e.ts setup()：projection → policy → connection → fs/subprocess/sandbox
    // 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d512:packages/ssh/ssh/tests/live.e2e.ts
    const ctx = new Context()
    fibers.push(
      ctx.plugin(SessionProjectionRegistry),
      ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: server.workspace }),
      ctx.plugin(SshConnection, connectionConfig()),
      ctx.plugin(SshFileSystem),
      ctx.plugin(SshSubprocessRuntime),
      ctx.plugin(SshSandboxProvider),
    )
    await Promise.all(fibers)
    const hello = await ctx.ssh.ready
    // T2c：dsh-ssh 写死 /tmp/dsh-ssh-*（清理只挂在 dispose 上）——把能归属到本实例的
    // 目录收进 H1 登记簿（exit 钩子可清）。归属判据＝本夹具 bin/ssh 登记的客户端 PID
    // 命令行里的 -S 控制套接字路径；不能用全局 /tmp 差集（会把并发实例的目录误删，复核轮 CONFIRMED/高）
    for (const pid of [...new Set(server.clientPids())]) {
      try {
        const m = readFileSync(`/proc/${pid}/cmdline`, 'utf8').match(/-S\u0000(\/tmp\/dsh-ssh-[^\u0000/]+)\//)
        if (m) trackTmpDir(m[1])
      } catch { /* 进程已退出 */ }
    }
    return {
      dir: server.dir, port: server.port, mark: server.mark, remoteHome: server.remoteHome,
      workspace: server.workspace, ctx, sshdPid: server.sshdPid,
      hello: { workspace: hello.workspace, executable: hello.executable, root: hello.root },
      connectionConfig, stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
