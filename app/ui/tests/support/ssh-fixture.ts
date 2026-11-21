// T11：ui e2e 的 ssh 夹具（sdk tests/support/ssh-host.ts 的 startSshServer 精简
// 内联——跨包 .ts 在 playwright/node 管线被按 CJS 加载（import.meta 炸），sdk
// 侧共用文件不动；此处只取 ui e2e 需要的服务器层：密钥→私有 sshd→bin/ssh 包装
// →helper 解析。来源: app/sdk/tests/support/ssh-host.ts@startSshServer，行为锚点
// 见 T2/T2b/T2c 回执）。
import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import * as net from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFileCb)


export interface UiSshServer {
  dir: string
  mark: string
  remoteHome: string
  workspace: string
  binDir: string
  helper: string
  helperHash: string
  sshdPid: number
  stopServer(): Promise<void>
}

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const s = net.createServer()
  s.once('error', reject)
  s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)) })
})
const canConnect = (port: number): Promise<boolean> => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1')
  s.once('connect', () => { s.destroy(); resolve(true) })
  s.once('error', () => resolve(false))
})

export async function startUiSshServer(root: string): Promise<UiSshServer> {
  const dir = join(root, 't11-ssh')
  const keysDir = join(dir, 'keys')
  const workspace = join(dir, 'ws')
  const remoteHome = join(dir, 'remote-home')
  const remoteTmp = join(dir, 'remote-tmp')
  const binDir = join(dir, 'bin')
  for (const d of [keysDir, workspace, remoteHome, remoteTmp, binDir]) mkdirSync(d, { recursive: true })
  const mark = randomUUID()
  const hostKey = join(keysDir, 'ssh_host_ed25519_key')
  const clientKey = join(keysDir, 'client_ed25519')
  await execFileAsync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 't11-host', '-f', hostKey])
  await execFileAsync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 't11-client', '-f', clientKey])
  const writeProtected = (path: string, content: string): void => { writeFileSync(path, content, { mode: 0o600 }) }
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
      `cd '${remoteHome}' || exit 97`,
      'exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"',
      '',
    ].join('\n'), { mode: 0o755 })
    const sshdConfig = join(dir, 'sshd_config')
    writeProtected(sshdConfig, [
      'ListenAddress 127.0.0.1', `Port ${port}`, `HostKey ${hostKey}`, `PidFile ${join(dir, 'sshd.pid')}`,
      `AuthorizedKeysFile ${join(dir, 'authorized_keys')}`,
      'UsePAM no', 'StrictModes no', 'PermitUserRC no', 'PasswordAuthentication no',
      'KbdInteractiveAuthentication no', 'PubkeyAuthentication yes',
      'AllowStreamLocalForwarding yes', 'AllowTcpForwarding local', 'X11Forwarding no',
      `SetEnv PBOTS_SSH_MARK=${mark} HOME=${remoteHome} PBOTS_REMOTE_HOME=${remoteHome}`,
      `ForceCommand ${join(dir, 'force-command.sh')}`,
      '',
    ].join('\n'))
    const child = spawn('setpriv', ['--pdeathsig', 'TERM', '/usr/sbin/sshd', '-D', '-e', '-f', sshdConfig], { stdio: ['ignore', 'ignore', 'pipe'] })
    child.stderr?.pipe(createWriteStream(join(dir, 'sshd.log')))
    return { child, port }
  }

  let attempt = await startOnce()
  for (let waited = 0; waited < 200 && !(await canConnect(attempt.port)); waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    if (waited === 100) { attempt.child.kill('SIGTERM'); attempt = await startOnce() }
  }
  if (!(await canConnect(attempt.port))) { attempt.child.kill('SIGTERM'); throw new Error(`t11 sshd did not come up under ${dir}`) }

  writeFileSync(join(binDir, 'ssh'), [
    '#!/bin/sh',
    `exec setpriv --pdeathsig TERM /usr/bin/ssh -F '${join(dir, 'ssh_config')}' "$@"`,
    '',
  ].join('\n'), { mode: 0o755 })
  writeProtected(join(dir, 'ssh_config'), [
    'Host pbots-ssh-test',
    '  HostName 127.0.0.1',
    `  Port ${attempt.port}`,
    `  User ${process.env.USER ?? 'nobody'}`,
    `  IdentityFile ${clientKey}`,
    '  IdentitiesOnly yes',
    `  UserKnownHostsFile ${join(dir, 'known_hosts')}`,
    '  GlobalKnownHostsFile /dev/null',
    '',
  ].join('\n'))

  // helper 解析：spec 链 CJS 化不能用 createRequire(import.meta)（sdk-runtime.ts
  // 头注释同坑）——直接从 .pnpm 目录实解（readlink 跟 workspace 链接）
  const { realpathSync } = await import('node:fs')
  const pnpmDir = realpathSync(join(__dirname, '..', '..', '..', 'sdk', 'node_modules', '.pnpm'))
  const dshSshDir = readdirSync(pnpmDir).find((n) => n.startsWith('@deepseek-ai+dsh-ssh@'))
  if (dshSshDir === undefined) throw new Error('dsh-ssh not found under sdk/.pnpm')
  const helper = join(pnpmDir, dshSshDir, 'node_modules', '@deepseek-ai', 'dsh-ssh', 'lib', 'helper.js')
  const helperHash = createHash('sha256').update(readFileSync(helper)).digest('hex')

  const stopServer = async (): Promise<void> => {
    if (attempt.child.exitCode === null && attempt.child.signalCode === null) {
      attempt.child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { attempt.child.kill('SIGKILL'); resolve() }, 5000)
        timer.unref()
        attempt.child.once('exit', () => { clearTimeout(timer); resolve() })
      })
    }
  }
  void readdirSync // 与 sdk 版行为对齐的占位（无消费者）
  return { dir, mark, remoteHome, workspace, binDir, helper, helperHash, sshdPid: attempt.child.pid!, stopServer }
}
