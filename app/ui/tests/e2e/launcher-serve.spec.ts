// T46c e2e：hivebot serve——只起 SDK 常驻、状态行机器可读、TERM 优雅清理、--status 只读查询。
import { expect, test } from 'playwright/test'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'

const LAUNCHER = resolve(__dirname, '../../../launcher/hivebot')
const REPO = resolve(__dirname, '../../..')

/** 起 serve 子进程（隔离 XDG/HOME），等到 stdout 状态行。 */
async function startServe(home: string): Promise<{ child: ReturnType<typeof spawn>; line: Record<string, string> }> {
  const child = spawn('bash', [LAUNCHER, 'serve'], {
    cwd: REPO,
    env: {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: join(home, 'state'),
      XDG_CONFIG_HOME: join(home, 'config'),
      P2SDK_PROVIDER: 'mock', // 免 key
      TMPDIR: join(home, 'tmp'),
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${home}/dead-bus`,
      PBOTS_PET: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (c: string) => { out += c })
  child.stderr!.on('data', (c: string) => { out += c })
  const deadline = Date.now() + 90_000
  for (;;) {
    const m = out.match(/HIVEBOT-SERVE (\{[^\n]*\})/)
    if (m !== null) return { child, line: JSON.parse(m[1]!) as Record<string, string> }
    if (child.exitCode !== null) throw new Error(`serve 早退 code=${child.exitCode}：${out.slice(-500)}`)
    if (Date.now() > deadline) throw new Error(`serve 90s 未出状态行：${out.slice(-500)}`)
    await new Promise((r) => setTimeout(r, 300))
  }
}

const statusLine = async (home: string): Promise<{ code: number; out: string }> => {
  const r = await new Promise<{ code: number; out: string }>((resolve) => {
    const c = spawn('bash', [LAUNCHER, 'serve', '--status'], {
      cwd: REPO,
      env: { ...process.env, HOME: home, XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let o = ''
    c.stdout!.setEncoding('utf8'); c.stderr!.setEncoding('utf8')
    c.stdout!.on('data', (x: string) => { o += x }); c.stderr!.on('data', (x: string) => { o += x })
    c.on('exit', (code) => resolve({ code: code ?? -1, out: o }))
  })
  return r
}

test('T46c hivebot serve：常驻/状态行/--status/TERM 清理', async () => {
  test.setTimeout(240_000)
  const home = tmkdir('bot-t46c-')
  mkdirSync(join(home, 'tmp'), { recursive: true })
  const serveJson = join(home, 'state', 'hivebot', 'serve.json')
  const { child, line } = await startServe(home)

  // ① 无 Electron 进程（ps 全树无 electron）
  const electronCount = await new Promise<number>((resolve) => {
    // ps 锚定二进制路径开头（pgrep -f 会自匹配 bash 包装的命令行）
    const ps = spawn('bash', ['-c', `ps -eo cmd= | grep -c "^${REPO}/app/ui/node_modules/.pnpm/electron@[^ ]*electron.*out/main/index.js" || true`], { stdio: ['ignore', 'pipe', 'inherit'] })
    let n = ''
    ps.stdout!.setEncoding('utf8')
    ps.stdout!.on('data', (c: string) => { n += c })
    ps.on('exit', () => resolve(Number.parseInt(n.trim() || '0', 10)))
  })
  expect(electronCount, 'serve 不起 Electron').toBe(0)

  // ② 状态行含 base_url/handoff，token 不在其中
  expect(line.base_url ?? '').toMatch(/^http:\/\/127\.0\.0\.1:\d+/)
  expect(line.handoff ?? '').toContain('p2sdk-handoff-')
  expect(JSON.stringify(line)).not.toContain('token')
  const tokenVal = readFileSync(join(String(line.handoff), 'launch-token'), 'utf8').trim() // T46cb ②加强：真值不外泄
  for (const surface of [JSON.stringify(line)]) expect(surface).not.toContain(tokenVal)
  expect(existsSync(serveJson), 'serve.json 已写').toBe(true)

  // ④ --status 同格式行（token 不出）
  const st = await statusLine(home)
  expect(st.code).toBe(0)
  expect(st.out).toContain('HIVEBOT-SERVE {')
  expect(st.out).toContain(line.base_url!)
  expect(st.out).not.toContain('token')

  // ⑤ serve 在跑时再起 serve → 幂等：exit 0 打同一行；零 Electron；原实例 serve.json 还在
  {
    const dup = await new Promise<{ code: number; out: string }>((resolve) => {
      const c = spawn('bash', [LAUNCHER, 'serve'], { cwd: REPO, env: { ...process.env, HOME: home, XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config'), P2SDK_PROVIDER: 'mock', TMPDIR: join(home, 'tmp'), DBUS_SESSION_BUS_ADDRESS: `unix:path=${home}/dead-bus`, PBOTS_PET: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
      let o = ''
      c.stdout!.setEncoding('utf8'); c.stderr!.setEncoding('utf8')
      c.stdout!.on('data', (x: string) => { o += x }); c.stderr!.on('data', (x: string) => { o += x })
      c.on('exit', (code) => resolve({ code: code ?? -1, out: o }))
    })
    expect(dup.code, '重复 serve exit 0').toBe(0)
    expect(dup.out).toContain(line.base_url!)
    expect(existsSync(serveJson), '原实例 serve.json 还在').toBe(true)
  }
  // ⑥ serve 在跑时起普通 hivebot → exit≠0、stderr 含 serve、零 Electron
  {
    const desk = await new Promise<{ code: number; out: string }>((resolve) => {
      const c = spawn('bash', [LAUNCHER], { cwd: REPO, env: { ...process.env, HOME: home, XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config'), P2SDK_PROVIDER: 'mock', TMPDIR: join(home, 'tmp'), DBUS_SESSION_BUS_ADDRESS: `unix:path=${home}/dead-bus` }, stdio: ['ignore', 'pipe', 'pipe'] })
      let o = ''
      c.stdout!.setEncoding('utf8'); c.stderr!.setEncoding('utf8')
      c.stdout!.on('data', (x: string) => { o += x }); c.stderr!.on('data', (x: string) => { o += x })
      c.on('exit', (code) => resolve({ code: code ?? -1, out: o }))
    })
    expect(desk.code, '桌面被 serve 挡：exit≠0').not.toBe(0)
    expect(desk.out).toContain('serve')
    await new Promise((r) => setTimeout(r, 800))
    const n = await new Promise<number>((resolve) => {
      const ps2 = spawn('bash', ['-c', `ps -eo cmd= | grep -c "^${REPO}/app/ui/node_modules/.pnpm/electron@[^ ]*electron.*out/main/index.js" || true`], { stdio: ['ignore', 'pipe', 'inherit'] })
      let n2 = ''
      ps2.stdout!.setEncoding('utf8')
      ps2.stdout!.on('data', (c2: string) => { n2 += c2 })
      ps2.on('exit', () => resolve(Number.parseInt(n2.trim() || '0', 10)))
    })
    expect(n, '⑥ 零 Electron').toBe(0)
  }
  // ③ TERM → serve.json 删、SDK 收走、退出
  process.kill(child.pid!, 'SIGTERM')
  const deadline = Date.now() + 30_000
  while (child.exitCode === null && Date.now() < deadline) await new Promise((r) => setTimeout(r, 300))
  expect(child.exitCode, 'TERM 后退出').not.toBeNull()
  expect(existsSync(serveJson), 'serve.json 已删').toBe(false)
  const pid = Number.parseInt(String(line.pid ?? '0'), 10)
  if (pid > 0) {
    await new Promise((r) => setTimeout(r, 1500))
    const alive = existsSync(`/proc/${pid}`)
    expect(alive, 'dsh 进程已收走').toBe(false)
  }

  // --status 在不跑时 exit 1；⑦ stderr 是合法 JSON（截掉前缀可 parse）
  const st2 = await statusLine(home)
  expect(st2.code).toBe(1)
  const m7 = st2.out.match(/HIVEBOT-SERVE (\{[^\n]*\})/)
  expect(m7, '⑦ 状态前缀行存在').not.toBeNull()
  expect(() => JSON.parse(m7![1]!), '⑦ 合法 JSON').not.toThrow()
  expect(JSON.parse(m7![1]!).running).toBe(false)
  rmSync(home, { recursive: true, force: true })
})
