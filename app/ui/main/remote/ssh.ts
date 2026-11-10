// T46b：Windows/Linux 客户端经 ssh 连 Ubuntu 的 hivebot serve——remote.json 解析、
// connect 行解析、两组写死 argv、openRemote（取连接信息→本地端口→隧道→自动重起）。
// token 只在内存：不进 env/argv/文件/日志。
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer, connect as netConnect } from 'node:net'
import { join } from 'node:path'

export interface RemoteConfig { host: string }
export interface RemoteHandle {
  baseUrl: string
  token: string
  remoteRoot: string
  close(): void
}

const HOST_RE = /^[A-Za-z0-9._][A-Za-z0-9._@-]{0,252}$/
const CONNECT_RE = /^HIVEBOT-CONNECT (\{.*\})$/m
const ERR = 'remote: invalid remote.json or serve output (fixed message; no stdout echoed)'

/** 读 <dataDir>/remote.json：只允许 {"host":"<别名>"} 一个键；host 首字符不许 -（防 ssh 选项注入）。任何不符 → undefined（走原路径）。 */
export function readRemoteConfig(dataDir: string): RemoteConfig | undefined {
  const file = join(dataDir, 'remote.json')
  if (!existsSync(file)) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(readFileSync(file, 'utf8')) } catch { return undefined }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'host') return undefined
  const host = (parsed as { host?: unknown }).host
  if (typeof host !== 'string' || !HOST_RE.test(host)) return undefined
  return { host }
}

/** ssh 二进制：win32 用 SystemRoot 绝对路径（不走 PATH）；其他平台 PATH 里的 ssh（e2e 换成夹具包装）。 */
export function sshBin(platform: NodeJS.Platform, env: { SystemRoot?: string }): string {
  return platform === 'win32' ? `${env.SystemRoot ?? 'C:\\Windows'}\\System32\\OpenSSH\\ssh.exe` : 'ssh'
}

/** 取连接信息的 argv（写死数组；host 只出现在 -- 之后）。 */
export function connectArgv(host: string): string[] {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '--', host, '~/.local/bin/hivebot serve --connect']
}

/** 隧道 argv（-N 不执行远端命令；host 最后在 -- 之后）。 */
export function tunnelArgv(host: string, localPort: number, remotePort: number): string[] {
  return ['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`, '--', host]
}

/** 解析 serve --connect 的 stdout：base_url 必须回环+合法端口、token 限字符集与长度、remote_root 绝对无 ..。
 * 错误消息固定文案——stdout 里可能有 token，绝不回显。 */
export function parseConnectLine(stdout: string): { baseUrl: string; token: string; remoteRoot: string } {
  const m = stdout.match(CONNECT_RE)
  if (m === null) throw new Error(ERR)
  let j: { base_url?: unknown; token?: unknown; remote_root?: unknown }
  try { j = JSON.parse(m[1]!) } catch { throw new Error(ERR) }
  if (typeof j.base_url !== 'string') throw new Error(ERR)
  const pm = j.base_url.match(/^http:\/\/127\.0\.0\.1:(\d{1,5})$/)
  if (pm === null || Number(pm[1]) < 1 || Number(pm[1]) > 65535) throw new Error(ERR)
  if (typeof j.token !== 'string' || !/^[A-Za-z0-9._~-]{16,512}$/.test(j.token)) throw new Error(ERR)
  if (typeof j.remote_root !== 'string' || !j.remote_root.startsWith('/') || j.remote_root.includes('..') || /[\u0000-\u001f\u007f]/.test(j.remote_root)) throw new Error(ERR)
  return { baseUrl: j.base_url, token: j.token, remoteRoot: j.remote_root }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => resolve(port)) })
    s.on('error', reject)
  })
}

/** 截止时间内每 ~200ms 试连一次（任务C：-L 绑定是异步的，单次 connect 会在未绑定时立即 ECONNREFUSED）。
 * alive 可选：隧道进程已退就提前放弃。导出供单测。 */
export async function waitPort(port: number, deadlineMs: number, alive?: () => boolean): Promise<boolean> {
  const deadline = Date.now() + deadlineMs
  for (;;) {
    if (await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => { s.destroy(); resolve(false) }, Math.min(500, Math.max(1, deadline - Date.now())))
      const s = netConnect(port, '127.0.0.1', () => { clearTimeout(t); s.destroy(); resolve(true) })
      s.on('error', () => { clearTimeout(t); resolve(false) })
    })) return true
    if (Date.now() >= deadline) return false
    if (alive !== undefined && !alive()) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

/** 跑一次 ssh 命令收 stdout（64KiB 上限；20s 超时）。失败抛固定文案（不含 stdout）。 */
function sshOnce(bin: string, argv: string[], onSpawn?: (pid: number | undefined) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { stdio: ['ignore', 'pipe', 'ignore'], env: process.env })
    onSpawn?.(child.pid)
    let out = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(ERR)) }, 20_000)
    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (c: string) => { if (out.length < 65536) out += c })
    child.on('error', () => { clearTimeout(timer); reject(new Error(ERR)) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(ERR))
    })
  })
}

/** 主入口：取连接信息 → 本地空闲端口 → 隧道 → 等可连。隧道意外退出自动重起（退避 1s 翻倍封顶 30s）。 */
export async function openRemote(cfg: RemoteConfig, opts: { bin?: string } = {}): Promise<RemoteHandle> {
  const bin = opts.bin ?? sshBin(process.platform, process.env as { SystemRoot?: string })
  const out = await sshOnce(bin, connectArgv(cfg.host))
  const { baseUrl, token, remoteRoot } = parseConnectLine(out)
  const remotePort = Number(baseUrl.match(/:(\d+)$/)![1])
  const localPort = await freePort()
  let closed = false
  let tunnel: ReturnType<typeof spawn> | undefined
  let backoffMs = 1000
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let firstUp = false
  const scheduleRestart = (): void => {
    if (closed || restartTimer !== undefined) return // 有界退避：同刻只挂一个重连定时器（error+exit 可能连发）
    const wait = backoffMs
    backoffMs = Math.min(backoffMs * 2, 30_000)
    restartTimer = setTimeout(() => { restartTimer = undefined; startTunnel() }, wait)
  }
  const onTunnelGone = (): void => {
    if (closed) return
    if (!firstUp) { closed = true; throw new Error(ERR) } // 审查1：首起失败（spawn error/秒退）→ 固定错误
    // ponytail: 指数退避重起；应用强杀时 Windows 上 ssh.exe 成孤儿（根治要 Job Object，先记上限）
    scheduleRestart()
  }
  const startTunnel = (): void => {
    if (closed) return
    tunnel = spawn(bin, tunnelArgv(cfg.host, localPort, remotePort), { stdio: 'ignore', env: process.env })
    tunnel.on('error', () => onTunnelGone()) // 审查1：ENOENT/资源不足等 spawn 失败同路处理
    tunnel.on('exit', () => onTunnelGone())
  }
  startTunnel()
  // ponytail: 「先 listen 再 close」的空闲端口有竞态（极小窗内别人占走）；-L 已带 ExitOnForwardFailure，隧道会退由重起兜
  const up = await waitPort(localPort, 15_000, () => tunnel?.exitCode === null && tunnel?.connected !== false).catch((e: unknown) => { if (!closed) { closed = true } throw e })
  firstUp = up
  if (!up && !closed) { closed = true; tunnel?.kill('SIGTERM'); if (restartTimer !== undefined) clearTimeout(restartTimer); throw new Error(ERR) }
  return {
    baseUrl: `http://127.0.0.1:${localPort}`,
    token,
    remoteRoot,
    close(): void { closed = true; if (restartTimer !== undefined) clearTimeout(restartTimer); tunnel?.kill('SIGTERM') },
  }
}
