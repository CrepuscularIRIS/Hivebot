// T2（L8-a）+ T2b/T2c：完全隔离的本机 ssh 测试夹具。
// 关键事实（work/p9-dsh-integration/PLAN.md §3）：OpenSSH 不看 $HOME → 必须用 PATH 里的
// ssh 包装脚本注入 -F；服务端用私有 sshd（随机高端口 + 一次性密钥），绝不碰真实 ~/.ssh
// 与系统 :22。T2c 补四件：SetEnv 单行带 HOME（会话 shell 不读真实启动文件）、
// ForceCommand cd 进 remote-home（cwd 不落真实家目录）、setpriv --pdeathsig 兜底
// （测试进程任何死法下内核收走 sshd 与 ssh 客户端）、setup 失败全量回滚。
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

/** 起夹具：一次性密钥 → 私有 sshd → PATH 包装 → dsh ssh 族组合 → ready。 */
export async function startSshHost(): Promise<SshHost> {
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

  const startOnce = async (): Promise<{ child: ChildProcess; port: number; sshdConfig: string }> => {
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
    return { child, port, sshdConfig }
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

  // T2c：sshd 已起——此后任何一步失败都必须回滚（还原 PATH、收 sshd）再抛
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
    if (sshdChild.exitCode === null && sshdChild.signalCode === null) {
      sshdChild.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { sshdChild.kill('SIGKILL'); resolve() }, 5000)
        timer.unref()
        sshdChild.once('exit', () => { clearTimeout(timer); resolve() })
      })
    }
  }

  const dshDirsBefore = readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-'))

  try {
    writeFileSync(join(binDir, 'ssh'), [
      '#!/bin/sh',
      // T2b 观测点：登记经此包装的 ssh 客户端 PID（含 dsh-ssh 的 master 与 -O 控制调用）
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

    // dsh-ssh 用 execFile('ssh') 走 PATH（不传 -F）→ PATH 最前放包装目录，结束还原
    process.env.PATH = `${binDir}:${oldPath ?? ''}`

    const require = createRequire(import.meta.url)
    const helper = realpathSync(require.resolve('@deepseek-ai/dsh-ssh/helper'))
    const helperHash = createHash('sha256').update(readFileSync(helper)).digest('hex')
    const connectionConfig = (): Record<string, unknown> => ({
      host: SSH_ALIAS,
      launch: { kind: 'node-script', node: process.execPath },
      helper,
      helperHash,
      workspace,
    })

    // 手搭组合照上游 live.e2e.ts setup()：projection → policy → connection → fs/subprocess/sandbox
    // 来源: https://github.com/deepseek-ai/deepseek-harness@ce7073d512:packages/ssh/ssh/tests/live.e2e.ts
    const ctx = new Context()
    fibers.push(
      ctx.plugin(SessionProjectionRegistry),
      ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: workspace }),
      ctx.plugin(SshConnection, connectionConfig()),
      ctx.plugin(SshFileSystem),
      ctx.plugin(SshSubprocessRuntime),
      ctx.plugin(SshSandboxProvider),
    )
    await Promise.all(fibers)
    const hello = await ctx.ssh.ready
    // T2c：dsh-ssh 写死 /tmp/dsh-ssh-*（清理只挂在 dispose 上）——ready 后把本轮新建的
    // 收进 H1 登记簿，正常退出/exit 钩子可清；SIGKILL 类硬杀仍会留一个空 socket 目录（已记回执存疑）
    for (const name of readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-') && !dshDirsBefore.includes(n))) {
      trackTmpDir(join('/tmp', name))
    }
    return {
      dir, port, mark, remoteHome, workspace, ctx, sshdPid: sshdChild.pid!,
      hello: { workspace: hello.workspace, executable: hello.executable, root: hello.root },
      connectionConfig, stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
