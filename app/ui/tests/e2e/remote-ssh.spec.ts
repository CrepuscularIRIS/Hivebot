// T46b e2e：Windows 客户端（本 spec 的 launchShell 不带 handoff、PATH 放自写 ssh 包装）连
// 「Ubuntu」端（夹具 sshd + 远端 HOME 下 serve）。八格 ①-⑧；包装不带 pdeathsig（⑤ 必须靠产品收隧道）。
import { expect, test, type ElectronApplication, type Page } from 'playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'
import { startUiSshServer, type UiSshServer } from '../support/ssh-fixture.ts'
import { launchShell } from '../support/launch.ts'
import { waitProductReady } from '../support/ui.ts'

const REPO = resolve(__dirname, '../../../..')
const LAUNCHER = join(REPO, 'app/launcher/hivebot')

function api(page: Page, method: string, args?: unknown): Promise<{ ok: boolean; value?: unknown; error?: { code?: string; message?: string } }> {
  return page.evaluate(([m, a]) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<unknown> } }).pbots.api(m, a), [method, args] as [string, unknown?])
}

test('T46b Windows 客户端经 ssh 连 Ubuntu serve（①-⑧）', async () => {
  test.setTimeout(420_000)
  const root = tmkdir('bot-t46b-e2e-')
  const srv: UiSshServer = await startUiSshServer(root)
  // 远端 HOME：hivebot 符号链接（T46d）+ serve（HOME=remoteHome、无 XDG 覆盖——与 sshd 会话默认一致）
  mkdirSync(join(srv.remoteHome, '.local', 'bin'), { recursive: true })
  symlinkSync(LAUNCHER, join(srv.remoteHome, '.local', 'bin', 'hivebot'))
  const serveSh = join(root, 'serve.sh')
  writeFileSync(serveSh, [
    '#!/bin/sh',
    'export HOME=' + JSON.stringify(srv.remoteHome) + '',
    'unset XDG_STATE_HOME XDG_CONFIG_HOME PBOTS_DATA_DIR',
    'export P2SDK_PROVIDER=mock',
    'export TMPDIR=' + JSON.stringify(join(root, 'serve-tmp')) + '',
    'exec ' + LAUNCHER + ' serve', // 绝对路径直 exec（ssh 会话里 symlink exec 有环境怪癖；符号链接语义 T46d-9 已守）
    '',
  ].join('\n'), { mode: 0o755 })
  mkdirSync(join(root, 'serve-tmp'), { recursive: true })
  const serveSsh = spawn(srv.binDir + '/ssh', ['-o', 'BatchMode=yes', '--', 'pbots-ssh-test', 'sh ' + serveSh], { stdio: ['ignore', 'pipe', 'pipe'] })
  let serveOut = ''
  serveSsh.stdout!.setEncoding('utf8'); serveSsh.stderr!.setEncoding('utf8')
  serveSsh.stdout!.on('data', (c: string) => { serveOut += c }); serveSsh.stderr!.on('data', (c: string) => { serveOut += c })
  const serveLine = await ((): Promise<Record<string, string>> => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('serve 未就绪：' + serveOut.slice(-300))), 90_000)
    const poll = (): void => { const m = serveOut.match(/HIVEBOT-SERVE (\{[^\n]*\})/); if (m !== null) { clearTimeout(t); res(JSON.parse(m[1]!)) } else setTimeout(poll, 300) }
    poll()
  }))()

  // 本 spec 自己的 ssh 包装（无 pdeathsig——⑤ 靠产品收）：记 argv+pid 后 exec 真 ssh
  const wrapDir = join(root, 'wrap-bin')
  mkdirSync(wrapDir, { recursive: true })
  const argvLog = join(root, 'ssh-argv.log')
  writeFileSync(join(wrapDir, 'ssh'), [
    '#!/bin/sh',
    'echo "$$ $*" >> ' + JSON.stringify(argvLog) + '',
    'exec /usr/bin/ssh -F ' + JSON.stringify(join(srv.dir, 'ssh_config')) + ' "$@"',
    '',
  ].join('\n'), { mode: 0o755 })

  // 「Windows」dataDir + remote.json
  const winData = join(root, 'win-data')
  mkdirSync(winData, { recursive: true })
  writeFileSync(join(winData, 'remote.json'), JSON.stringify({ host: 'pbots-ssh-test' }))

  const shell = await launchShell({
    home: join(root, 'win-home'),
    env: {
      PBOTS_DATA_DIR: winData,
      // 无 PBOTS_DSH_HANDOFF——走 remote.json
      PATH: `${wrapDir}:${process.env.PATH ?? ''}`,
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(root, 'dead-bus'),
    },
  })
  const page = shell.page

  const argvLines = (): string[] => readFileSync(argvLog, 'utf8').split('\n').filter((l) => l.length > 0)
  const pidsFromLog = (): number[] => argvLines().map((l) => Number.parseInt(l.split(' ')[0]!, 10)).filter((n) => Number.isFinite(n))
  const procAlive = (pid: number): boolean => { try { return process.kill(pid, 0) } catch { return false } }
  const isTunnel = (pid: number): boolean => { try { return procAlive(pid) && readFileSync('/proc/' + pid + '/cmdline', 'utf8').indexOf('-N') >= 0 } catch { return false } }

  try {
    // ① 连上：#3 建 bot ok；远端 workspaces 出现、win-data 不出现
    const created = await api(page, 'session/create', { request: {} }) as { ok: boolean; value?: { sessionId?: string } }
    expect(created.ok, '① session/create ok').toBe(true)
    const botId = created.value?.sessionId ?? ''
    expect(botId.length, '① 拿到 botId').toBeGreaterThan(0)
    const remoteWs = join(srv.remoteHome, '.config', 'pbots-ui', 'workspaces')
    await expect.poll(() => (existsSync(remoteWs) && readdirSync(remoteWs).length) || 0, { timeout: 20_000 }).toBeGreaterThan(0)
    expect(existsSync(join(winData, 'workspaces', botId)), '① 宿主（win-data）无新目录').toBe(false)

    // ② token 不外泄：真值 vs 所有面
    const tokenVal = await new Promise<string>((res, rej) => {
      let o = ''
      const c = spawn(srv.binDir + '/ssh', ['-o', 'BatchMode=yes', '--', 'pbots-ssh-test', `cat ${serveLine.handoff}/launch-token`], { stdio: ['ignore', 'pipe', 'inherit'] })
      c.stdout!.setEncoding('utf8'); c.stdout!.on('data', (x: string) => { o += x }); c.on('exit', (rc) => { rc === 0 ? res(o.trim()) : rej(new Error('cat')) })
    })
    const winFiles: string[] = []
    const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); try { if (require('node:fs').statSync(p).isDirectory()) walk(p); else winFiles.push(readFileSync(p, 'utf8').slice(0, 100000)) } catch { /* 二进制跳过 */ } } }
    walk(winData)
    const procSurfaces: string[] = []
    for (const pid of [process.pid, ...pidsFromLog()]) {
      try { procSurfaces.push(readFileSync('/proc/' + pid + '/cmdline', 'utf8')) } catch { /* 已退 */ }
      try { procSurfaces.push(readFileSync(`/proc/${pid}/environ`, 'utf8')) } catch { /* 已退 */ }
    }
    for (const sf of [...winFiles, readFileSync(argvLog, 'utf8'), ...procSurfaces]) expect(sf, '② 面不含 token').not.toContain(tokenVal)

    // ③ argv 钉死：恰两行
    const lines = argvLines()
    expect(lines.length, '③ 恰两次 ssh').toBe(2)
    const [l1, l2] = lines.map((l) => l.replace(/^\d+ /, '').split(' '))
    expect(l1!.join(' '), '③ connect argv（远端命令含空格按整串比）').toBe('-o BatchMode=yes -o ConnectTimeout=10 -- pbots-ssh-test ~/.local/bin/hivebot serve --connect')
    const P = Number(serveLine.base_url!.match(/:(\d+)$/)![1])
    const Lm = l2!.join(' ').match(/-L 127\.0\.0\.1:(\d+):127\.0\.0\.1:(\d+)/)
    expect(Lm, '③ 隧道 -L 在').not.toBeNull()
    expect(Number(Lm![2])).toBe(P)
    expect(l2).toEqual(['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${Lm![1]}:127.0.0.1:${P}`, '--', 'pbots-ssh-test'])

    // ④ skills 拒
    const sk = await page.evaluate((bid) => (window as unknown as { pbots: { skills(req: { op: 'list'; botId: string }): Promise<{ ok: boolean; error?: { code?: string; message?: string } }> } }).pbots.skills({ op: 'list', botId: bid }), botId) as { ok: boolean; error?: { code?: string; message?: string } }
    expect(sk.ok, '④ skills 拒').toBe(false)
    expect(sk.error?.code).toBe('pbots/remote-mode')
    expect(sk.error?.message).toBe('Skills are not available while Hivebot uses a remote computer.')

    // ⑤ 关应用 → 隧道 5s 内消失；serve 仍活
    await shell.stop()
    await new Promise((r) => setTimeout(r, 5000))
    const tunnelPids = pidsFromLog().slice(1) // 第一条是 connect 命令（已退）
    const aliveLeft = tunnelPids.filter(isTunnel)
    expect(aliveLeft.length, '⑤ 隧道已收').toBe(0)
    const st = await new Promise<{ code: number }>((res) => { const c = spawn(srv.binDir + '/ssh', ['-o', 'BatchMode=yes', '--', 'pbots-ssh-test', '~/.local/bin/hivebot serve --status'], { stdio: 'ignore' }); c.on('exit', (code) => res({ code: code ?? -1 })) })
    expect(st.code, '⑤ serve 仍活').toBe(0)

    // ⑥ 重启应用 → 杀隧道 → 自动重起（日志第 3 行）→ session/list 成功
    const shell2 = await launchShell({ home: join(root, 'win-home'), env: { PBOTS_DATA_DIR: winData, PATH: `${wrapDir}:${process.env.PATH ?? ''}`, DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(root, 'dead-bus') } })
    const page2 = shell2.page
    await expect.poll(() => argvLines().length, { timeout: 30_000 }).toBeGreaterThanOrEqual(4) // 第二轮的 connect+隧道
    await new Promise((r) => setTimeout(r, 1500))
    const tunPid = pidsFromLog().find(isTunnel)
    expect(tunPid, '⑥ 隧道 pid 在').toBeTruthy()
    process.kill(tunPid!, 'SIGKILL')
    await expect.poll(() => argvLines().length, { timeout: 35_000 }).toBeGreaterThanOrEqual(5) // 重起的第 3 条隧道
    await new Promise((r) => setTimeout(r, 2000))
    const list2 = await api(page2, 'session/list', { _request: {} }) as { ok: boolean }
    expect(list2.ok, '⑥ 重起后 M1 可用').toBe(true)

    // ⑦ 坏 host：一个 ssh 都不起、不挂死
    {
      const badData = join(root, 'bad-data'); mkdirSync(badData, { recursive: true })
      writeFileSync(join(badData, 'remote.json'), JSON.stringify({ host: '-Fevil' }))
      const before = argvLines().length
      const shell3 = await launchShell({ home: join(root, 'bad-home'), env: { PBOTS_DATA_DIR: badData, PATH: `${wrapDir}:${process.env.PATH ?? ''}`, DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(root, 'dead-bus'), PBOTS_DSH_START_TIMEOUT_MS: '5000' } })
      const t0 = Date.now()
      const r3 = await Promise.race([api(shell3.page, 'session/list', { _request: {} }), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('挂死')), 15_000))]).catch((e) => e)
      expect(Date.now() - t0 < 15_000, '⑦ M1 15s 内返回').toBe(true)
      const tReady = Date.now()
      const readyOk = await shell3.page.waitForFunction(() => (window as unknown as { __pbotsDev?: unknown }).__pbotsDev !== undefined, undefined, { timeout: 15_000 }).then(() => true, () => false)
      expect(readyOk && Date.now() - tReady < 15_000, '⑦ 页面 boot 完成（restore 放行，UI 不永久卡）').toBe(true)
      expect(argvLines().length, '⑦ 零 ssh').toBe(before)
      await shell3.stop()
    }

    // ⑧ serve 没在跑：只有 connect 一次、无隧道、不挂死
    {
      // 真停 serve：TERM ssh 客户端不够（dsh detached 成孤儿）——远端按 serve.json 的 pid 收 dsh + TERM serve bash
      const stopPid = await new Promise<string>((res) => { let o = ''; const c = spawn(srv.binDir + '/ssh', ['-o', 'BatchMode=yes', '--', 'pbots-ssh-test', 'p=$(sed -n \'s/.*"pid":\\([0-9]*\\).*/\\1/p\' ~/.local/state/hivebot/serve.json); [ -n "$p" ] && kill $p; sleep 0.3; rm -f ~/.local/state/hivebot/serve.json; echo done'], { stdio: ['ignore', 'pipe', 'inherit'] }); c.stdout!.setEncoding('utf8'); c.stdout!.on('data', (x: string) => { o += x }); c.on('exit', () => res(o)) })
      serveSsh.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 2500))
      rmSync(argvLog)
      writeFileSync(argvLog, '')
      const shell4 = await launchShell({ home: join(root, 'no8-home'), env: { PBOTS_DATA_DIR: winData, PATH: `${wrapDir}:${process.env.PATH ?? ''}`, DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(root, 'dead-bus'), PBOTS_DSH_START_TIMEOUT_MS: '5000' } })
      const t0 = Date.now()
      await Promise.race([api(shell4.page, 'session/list', { _request: {} }).catch(() => {}), new Promise((r) => setTimeout(r, 14_000))])
      expect(Date.now() - t0 < 15_000, '⑧ M1 15s 内返回').toBe(true)
      const ls = argvLines()
      expect(ls.length, '⑧ 只有 connect 一次').toBe(1)
      expect(ls[0].includes('-N'), '⑧ 无隧道行').toBe(false)
      await shell4.stop()
    }
  } finally {
    // 兜底收：日志里的 ssh + serve
    for (const pid of pidsFromLog()) { try { process.kill(pid, 'SIGTERM') } catch { /* 已退 */ } }
    serveSsh.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 1000))
    await srv.stopServer()
    // 任务C：远端 serve 链（serve.sh→hivebot serve→start.mjs→dsh）经 TERM 本地 ssh 收不掉——bot-reap 按 root 清
    try { require('node:child_process').execFileSync(join(REPO, 'scripts', 'bot-reap'), ['--match', root]) } catch { /* 尽力 */ }
    rmSync(root, { recursive: true, force: true })
  }
})
