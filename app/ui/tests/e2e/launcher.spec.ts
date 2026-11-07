// T17 产品启动器 e2e（工单六格 + M1-M4 变异面）。被测对象 = app/launcher/hivebot
// （bash 脚本）——spawn 子进程跑它，Electron 侧经 CDP 连（--remote-debugging-port），
// 不用 _electron.launch（那会绕过启动器本身）。
import { test, expect, chromium } from 'playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tmkdir } from '../support/tmp-sweep.ts'

const LAUNCHER = join(__dirname, '..', '..', '..', 'launcher', 'hivebot')
const REPO = join(__dirname, '..', '..', '..', '..')
const CREDS_5 = ['P2SDK_LLM_API_KEY', 'LITELLM_MASTER_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']

interface Launch {
  proc: ChildProcess
  home: string
  stateDir: string
  configDir: string
  tmp: string
  port: number
  stop(): Promise<void>
}

const freePort = async (): Promise<number> => {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)) })
  })
}

/** 起一个隔离环境启动器实例（env 剥凭证；home/state/config/tmp 全独立）。 */
async function launchHivebot(opts: { env?: Record<string, string> } = {}): Promise<Launch> {
  const home = tmkdir('bot-T17-home-')
  const stateDir = join(home, 'state')
  const configDir = join(home, 'config')
  const tmp = mkdtempSync(join(tmpdir(), 'bot-T17-tmp-'))
  for (const d of [stateDir, configDir, join(configDir, 'pbots-ui')]) mkdirSync(d, { recursive: true })
  const port = await freePort()
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmp,
    XDG_CONFIG_HOME: configDir,
    XDG_STATE_HOME: stateDir,
    XDG_CACHE_HOME: join(home, 'cache'),
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${tmp}/no-dbus`,
    DISPLAY: process.env.DISPLAY ?? ':99',
    XAUTHORITY: process.env.XAUTHORITY ?? '',
    ...Object.fromEntries(Object.entries(opts.env ?? {}).map(([k, v]) => [k, v])),
  }
  for (const k of CREDS_5) delete env[k]
  const proc = spawn(LAUNCHER, ['--disable-gpu', `--remote-debugging-port=${port}`], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  proc.stdout?.on('data', (c) => { out += String(c) })
  proc.stderr?.on('data', (c) => { err += String(c) })
  const waitExit = new Promise<number>((resolve) => { proc.once('exit', (c) => resolve(c ?? 0)) })
  return {
    proc, home, stateDir, configDir, tmp, port,
    get stdout() { return out },
    get stderr() { return err },
    async stop() { if (proc.exitCode === null) { proc.kill('SIGTERM'); await Promise.race([waitExit, new Promise((r) => setTimeout(r, 30_000))]) } },
  } as Launch
}

/** 收「启动器之后代」pid 集合（按 /proc 扫本实例特征路径）。 */
function descendantPids(l: Launch): number[] {
  const out = new Set<number>()
  const seen = new Set<number>()
  const walk = (pid: number): void => {
    if (seen.has(pid)) return
    seen.add(pid)
    out.add(pid)
    try {
      const kids = readdirSync(`/proc/${pid}/task`)
      for (const t of kids) {
        const list = readFileSync(`/proc/${pid}/task/${t}/children`, 'utf8')
        for (const k of list.split(/\s+/).filter(Boolean)) walk(Number(k))
      }
    } catch { /* 已退 */ }
  }
  if (l.proc.pid !== undefined) walk(l.proc.pid)
  try {
    const dsh = readFileSync(join(l.stateDir, 'hivebot', 'logs', 'sdk.log'), 'utf8').match(/p2sdk: dsh pid (\d+)/)
    if (dsh) out.add(Number(dsh[1]))
  } catch { /* log 未写 */ }
  return [...out]
}

const alive = (pid: number): boolean => {
  // kill(0) 对僵尸（死未被 reap）也成功——按 /proc state 判，Z 不算活
  try {
    const st = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const state = st.slice(st.lastIndexOf(')') + 2, st.lastIndexOf(')') + 3)
    return state !== 'Z'
  } catch { return false }
}

/** 连 CDP → 等 UI 就绪 → 返回 page。 */
async function connectUi(port: number) {
  // 启动链 ~8-15s（SDK ready → Electron → CDP 端口开）——重试连接 60s
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
  let lastErr: unknown
  for (let i = 0; i < 60 && browser === undefined; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1000)) }
  }
  if (browser === undefined) throw new Error(`CDP 连不上 :${port}（60s）${String(lastErr).slice(0, 120)}`)
  const ctx = browser.contexts()[0]!
  const page = ctx.pages()[0] ?? await ctx.newPage()
  await page.waitForSelector('.sand-agent-item', { timeout: 90_000 })
  return { browser, page }
}

test.describe('T17 产品启动器', () => {
  test('① mock 生命周期：拉起→就绪→关窗→全退无残留', { timeout: 300_000 }, async () => {
    const l = await launchHivebot({ env: { P2SDK_PROVIDER: 'mock' } })
    const exitP = new Promise<number>((r) => l.proc.once('exit', (c) => r(c ?? 0)))
    try {
      const { browser, page } = await connectUi(l.port)
      // pid 集合非空且含三类
      // 工单口径=三类关键进程（Electron 主、start.mjs、dsh）——Chromium --type=
      // 子进程（renderer/gpu/utility）由 Electron 主进程生命周期管理，不进责任面
      // （CDP 强退主进程后它们慢退 >20s，实测全死、非泄漏）。
      // T17b：集合=本实例 children 链+dsh（sdk.log）——三类存在性断言照旧
      const pids = descendantPids(l)
      const cmdOf = (p: number): string => { try { return readFileSync(`/proc/${p}/cmdline`, 'utf8') } catch { return '' } }
      const cmdAll = pids.map(cmdOf).join('\n')
      expect(cmdAll, '含 start.mjs').toContain('start.mjs')
      expect(cmdAll, '含 electron 主进程').toContain('out/main/index.js')
      expect(cmdAll, '含 dsh bin.js').toContain('bin.js')
      // 关窗（用户真实退出路径）：renderer window.close() → BrowserWindow.close →
      // window-all-closed → app.quit()（优雅停子进程）。CDP 的 browser.close() 是
      // Browser.close 强退——主进程死后 Chromium 子进程群慢退（实测 13 个 >20s 残留）。
      await page.evaluate(() => window.close())
      await browser.close().catch(() => { /* 主进程退出后 CDP 断开属预期 */ })
      const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 30_000))])
      expect(rc, `启动器 ≤30s 退出（rc=${rc}）`).toBe(0)

      // pid 全不在（dsh detached 退出有尾部——重试窗口 10s）
      // 循环 bug 修正：some(alive) 作条件时「初始全死」会让循环 0 次、stragglers
      // 保持全量死 pid（trace 铁证：启动器 rc=0 后 t=0 三类全 X）。固定窗内重滤。
      let stragglers = pids
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        stragglers = stragglers.filter(alive)
        if (stragglers.length === 0) break
        if (i === 19) {
          const { appendFileSync: ap } = await import('node:fs')
          for (const p of stragglers) { try { ap(join('test-output', 'T17', 'stray.log'), `pid=${p} cmd=${readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' ').slice(0, 150)}\n`) } catch { /* */ } }
        }
      }
      const strayDesc = stragglers.map((p) => {
        try {
          const cmd = readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' ').slice(0, 70)
          const st = readFileSync(`/proc/${p}/stat`, 'utf8')
          const state = st.slice(st.lastIndexOf(')') + 2, st.lastIndexOf(')') + 3)
          const ppid = st.slice(st.lastIndexOf(')') + 2).split(' ')[1]
          return `${p}[${state},ppid=${ppid}]:${cmd}`
        } catch { return `${p}:gone` }
      }).join(' | ')
      expect(stragglers, `残留 pid（重试 20s）${strayDesc}`).toEqual([])
      // handoff 删净
      const handoffs = readdirSync(l.tmp).filter((n) => n.startsWith('p2sdk-handoff-'))
      expect(handoffs, 'TMPDIR 无 p2sdk-handoff-*').toEqual([])
      // 日志与 state 路径
      expect(existsSync(join(l.stateDir, 'hivebot', 'logs', 'sdk.log')), 'sdk.log 在 XDG state').toBe(true)
      expect(existsSync(join(l.stateDir, 'hivebot', 'logs', 'ui.log')), 'ui.log 在').toBe(true)
      expect(existsSync(join(l.stateDir, 'hivebot', 'dsh')), 'dsh home 在 state（非仓内）').toBe(true)
    } finally {
      await l.stop()
    }
  })

  test('② 双开：第二实例聚焦已有窗口退出 0；无第二个 SDK', { timeout: 300_000 }, async () => {
    const l1 = await launchHivebot({ env: { P2SDK_PROVIDER: 'mock' } })
    const exit1 = new Promise<number>((r) => l1.proc.once('exit', (c) => r(c ?? 0)))
    try {
      const { browser } = await connectUi(l1.port)
      const isSdk = (p: number): boolean => {
        try { return readFileSync(`/proc/${p}/cmdline`, 'utf8').includes('start.mjs') } catch { return false }
      }
      const sdkBefore = descendantPids(l1).filter(isSdk).length
      // 双开=同一 STATE_DIR（同锁）；launchHivebot 每次随机 state——手动 spawn
      const tmp2 = mkdtempSync(join(tmpdir(), 'bot-T17-tmp2-'))
      const port2 = await freePort()
      const l2proc = spawn(LAUNCHER, ['--disable-gpu', `--remote-debugging-port=${port2}`], {
        env: {
          PATH: process.env.PATH ?? '', HOME: l1.home, TMPDIR: tmp2,
          XDG_CONFIG_HOME: l1.configDir, XDG_STATE_HOME: l1.stateDir, XDG_CACHE_HOME: join(l1.home, 'cache'),
          DBUS_SESSION_BUS_ADDRESS: `unix:path=${tmp2}/no-dbus`, DISPLAY: process.env.DISPLAY ?? ':99',
          XAUTHORITY: process.env.XAUTHORITY ?? '', P2SDK_PROVIDER: 'mock',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const l2 = { proc: l2proc } as never as Launch
      const exit2 = new Promise<number>((r) => l2.proc.once('exit', (c) => r(c ?? 0)))
      const rc2 = await Promise.race([exit2, new Promise<number>((r) => setTimeout(() => r(-1), 20_000))])
      expect(rc2, '第二实例 ≤20s 退出码 0').toBe(0)
      const listed = await page.evaluate(() => (window as unknown as { pbots: { api(m: string): Promise<{ ok: boolean }> } }).pbots.api('session/list'))
      expect(listed.ok, '第一实例 session/list 仍可用').toBe(true)
      const sdkAfter = descendantPids(l1).filter(isSdk).length
      expect(sdkAfter, `无第二个 SDK（${sdkBefore}→${sdkAfter}）`).toBe(sdkBefore)
      expect(l1.proc.exitCode, '第一实例仍活').toBeNull()
      await browser.close().catch(() => { /* */ })
    } finally {
      await l1.stop()
      void exit1
    }
  })

  test('③a 无 key real 模式 → 拒启（退出码≠0 + stderr 提示 + 无 electron）', { timeout: 60_000 }, async () => {
    const l = await launchHivebot() // 无 key、无 env 文件、非 mock
    const exitP = new Promise<number>((r) => l.proc.once('exit', (c) => r(c ?? 0)))
    const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 20_000))])
    expect(rc, '退出码≠0').not.toBe(0)
    expect(l.stderr, 'stderr 提示变量名').toContain('P2SDK_LLM_API_KEY')
    expect(existsSync(join(l.stateDir, 'hivebot', 'logs', 'ui.log')), 'ui.log 未生成（无 electron）').toBe(false)
  })

  test('③b env 文件权限过宽 → 拒启（chmod 600 提示）', { timeout: 60_000 }, async () => {
    const l = await launchHivebot()
    mkdirSync(join(l.configDir, 'hivebot'), { recursive: true })
    writeFileSync(join(l.configDir, 'hivebot', 'env'), 'P2SDK_LLM_API_KEY=sk-test-t17-not-a-real-key\n', { mode: 0o644 })
    // 已起——重启一个（文件在启动前就该在；这里停掉重起）
    await l.stop()
    const l2 = await launchHivebot()
    mkdirSync(join(l2.configDir, 'hivebot'), { recursive: true })
    writeFileSync(join(l2.configDir, 'hivebot', 'env'), 'P2SDK_LLM_API_KEY=sk-test-t17-not-a-real-key\n', { mode: 0o644 })
    const exitP = new Promise<number>((r) => l2.proc.once('exit', (c) => r(c ?? 0)))
    const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 20_000))])
    expect(rc, '退出码≠0').not.toBe(0)
    expect(l2.stderr, 'chmod 600 提示').toContain('chmod 600')
    await l2.stop()
  })

  test('④ SIGTERM 启动器 → 全链退出无残留', { timeout: 300_000 }, async () => {
    const l = await launchHivebot({ env: { P2SDK_PROVIDER: 'mock' } })
    const exitP = new Promise<number>((r) => l.proc.once('exit', (c) => r(c ?? 0)))
    try {
      const { browser } = await connectUi(l.port)
      await browser.close()
      const pids = descendantPids(l)
      l.proc.kill('SIGTERM')
      const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 30_000))])
      expect(rc, '≤30s 退出').toBeLessThan(255)
      await new Promise((r) => setTimeout(r, 2000))
      for (const p of pids) expect(alive(p), `pid ${p} 已退`).toBe(false)
      expect(readdirSync(l.tmp).filter((n) => n.startsWith('p2sdk-handoff-')), 'handoff 删净').toEqual([])
    } finally {
      await l.stop()
    }
  })

  test('⑤ 凭证不外泄：key 经 0600 文件进 SDK、Electron env 无五键、日志无 key 值', { timeout: 300_000 }, async () => {
    test.setTimeout(300_000)
    const KEY = 'sk-t17-leakprobe-000000000000'
    const home = tmkdir('bot-T17-5-home-')
    const stateDir = join(home, 'state')
    const configDir = join(home, 'config')
    const tmp = mkdtempSync(join(tmpdir(), 'bot-T17-5-tmp-'))
    for (const d of [stateDir, configDir, join(configDir, 'pbots-ui'), join(configDir, 'hivebot')]) mkdirSync(d, { recursive: true })
    writeFileSync(join(configDir, 'hivebot', 'env'), `P2SDK_LLM_API_KEY=${KEY}\nP2SDK_LLM_BASE_URL=http://127.0.0.1:59999\n`, { mode: 0o600 })
    const port = await freePort()
    const iport = await freePort()
    const proc = spawn(LAUNCHER, ['--disable-gpu', `--remote-debugging-port=${port}`, `--inspect=${iport}`], {
      env: {
        PATH: process.env.PATH ?? '', HOME: home, TMPDIR: tmp,
        XDG_CONFIG_HOME: configDir, XDG_STATE_HOME: stateDir, XDG_CACHE_HOME: join(home, 'cache'),
        DBUS_SESSION_BUS_ADDRESS: `unix:path=${tmp}/no-dbus`, DISPLAY: process.env.DISPLAY ?? ':99',
        XAUTHORITY: process.env.XAUTHORITY ?? '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let l5err = ''
    proc.stderr?.on('data', (c) => { l5err += String(c) })
    const exitP = new Promise<number>((r) => proc.once('exit', (c) => r(c ?? 0)))
    try {
      // 等链起来（不等 UI 完全 ready——连接成功即可断 env）
      const { browser } = await connectUi(port)
      await new Promise((r) => setTimeout(r, 3000))
      const marks = [join(stateDir, 'hivebot'), LAUNCHER, join(REPO, 'app', 'ui'), join(REPO, 'app', 'sdk', 'scripts')]
      const pidOf = (re: RegExp): number | undefined => {
        for (const pid of readdirSync('/proc')) {
          if (!/^\d+$/.test(pid)) continue
          try {
            const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
            if (cmd.includes('playwright') || cmd.includes('snapshot-bash') || cmd.includes('probe')) continue
            if (marks.some((m) => cmd.includes(m)) && re.test(cmd)) return Number(pid)
          } catch { /* */ }
        }
        return undefined
      }
      const sdkPid = pidOf(/start\.mjs/)
      expect(sdkPid, '找到 SDK 进程').toBeTruthy()
      // T17b：/proc environ 对 Chromium setproctitle 后恒空（终验收编）——
      // Electron 主进程真 env 经 node --inspect 协议读（正对照 PBOTS_DSH_HANDOFF）
      {
        const res = await fetch(`http://127.0.0.1:${iport}/json/list`)
        const targets = (await res.json()) as Array<{ title?: string; webSocketDebuggerUrl?: string }>
        const main = targets.find((t) => t.webSocketDebuggerUrl !== undefined)
        expect(main, 'inspect target 在').toBeTruthy()
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const w = new WebSocket(main!.webSocketDebuggerUrl!)
          w.onopen = () => resolve(w)
          w.onerror = (e) => reject(e)
        })
        const envKeys = await new Promise<string[]>((resolve, reject) => {
          ws.onmessage = (ev) => {
            const d = JSON.parse(String(ev.data)) as { result?: { result?: { value?: string[] } } }
            if (d.result?.result?.value) resolve(d.result.result.value)
          }
          ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'Object.keys(process.env)', returnByValue: true } }))
          setTimeout(() => reject(new Error('inspect evaluate 超时')), 10_000)
        })
        ws.close()
        expect(envKeys, `正对照：Electron env 有 PBOTS_DSH_HANDOFF（实际=${JSON.stringify(envKeys.slice(0, 20))}）`).toContain('PBOTS_DSH_HANDOFF')
        for (const k of CREDS_5) expect(envKeys.includes(k), `Electron env 无 ${k}`).toBe(false)
      }
      if (sdkPid === undefined) throw new Error('SDK pid 未找到——marks/regex 失配')
      {
        const envBuf = readFileSync(`/proc/${sdkPid}/environ`)
        expect(envBuf.includes(`P2SDK_LLM_API_KEY=${KEY}\0`), 'SDK env 有文件 key（值级正对照）').toBe(true)
      }
      proc.kill('SIGTERM')
      await Promise.race([exitP, new Promise((r) => setTimeout(r, 30_000))])
      await new Promise((r) => setTimeout(r, 1500))
      const sdkLog = readFileSync(join(stateDir, 'hivebot', 'logs', 'sdk.log'), 'utf8')
      const uiLog = readFileSync(join(stateDir, 'hivebot', 'logs', 'ui.log'), 'utf8')
      expect(sdkLog.includes(KEY), 'sdk.log 无 key 值').toBe(false)
      expect(uiLog.includes(KEY), 'ui.log 无 key 值').toBe(false)
      await browser.close().catch(() => { /* 主进程退出后 CDP 断开属预期 */ })
    } finally {
      if (proc.exitCode === null) {
        // 优雅收（LEARNINGS：直接 SIGKILL 启动器跳过 cleanup 留孤儿 dsh）
        proc.kill('SIGTERM')
        await new Promise((r) => setTimeout(r, 3000))
        if (proc.exitCode === null) proc.kill('SIGKILL')
      }
    }
  })

  test('⑥ 真模型一轮（默认链+默认 preset，不叠 presets.yml）', { timeout: 300_000 }, async () => {
    test.setTimeout(300_000)
    const key = process.env.LITELLM_MASTER_KEY
    test.skip(key === undefined, 'LITELLM_MASTER_KEY 未设（真模型格跳过）')
    const home = tmkdir('bot-T17-6-home-')
    const stateDir = join(home, 'state')
    const configDir = join(home, 'config')
    const tmp = mkdtempSync(join(tmpdir(), 'bot-T17-6-tmp-'))
    for (const d of [stateDir, configDir, join(configDir, 'pbots-ui')]) mkdirSync(d, { recursive: true })
    const port = await freePort()
    const proc = spawn(LAUNCHER, ['--disable-gpu', `--remote-debugging-port=${port}`], {
      env: {
        PATH: process.env.PATH ?? '', HOME: home, TMPDIR: tmp,
        XDG_CONFIG_HOME: configDir, XDG_STATE_HOME: stateDir, XDG_CACHE_HOME: join(home, 'cache'),
        DBUS_SESSION_BUS_ADDRESS: `unix:path=${tmp}/no-dbus`, DISPLAY: process.env.DISPLAY ?? ':99',
        XAUTHORITY: process.env.XAUTHORITY ?? '', LITELLM_MASTER_KEY: key!,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exitP = new Promise<number>((r) => proc.once('exit', (c) => r(c ?? 0)))
    try {
      const { browser, page } = await connectUi(port)
      // 真模型默认链：d1 的 createBots+send 模式（真会话——直接用 UI 新建）
      // boot 主 bot 是唯一真会话（⑤c/T11 同款教训：自建会话身份不完整）
      let sid: string | null = null
      for (let i = 0; i < 60 && sid === null; i++) {
        const meta = await page.evaluate(() => (window as unknown as { __pbotsDev: { state: { meta: { mainBotId: string | null } } } }).__pbotsDev.state.meta)
        sid = meta.mainBotId
        if (sid === null) await new Promise((r) => setTimeout(r, 1000))
      }
      expect(sid, 'boot 主 bot 在').toBeTruthy()
      await page.evaluate(([s2]) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<{ ok: boolean }> } }).pbots.api('session/prompt', { request: { requestId: `t6-${Date.now()}`, sessionId: s2, mode: 'queue', content: [{ type: 'text', text: '用一句中文回答：1+1 等于几？' }] } }), [sid] as const)
      // 等回合完成：devState view turnEnded
      let view: { turnEnded?: boolean; chunkCount?: number; endReason?: string | null } | undefined
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const st = await page.evaluate(() => (window as unknown as { __pbotsDev: { state: { views: Record<string, { turnEnded: boolean; chunkCount: number; endReason: string | null }> } } }).__pbotsDev.state)
        view = st.views[sid]
        if (view?.turnEnded === true) break
      }
      expect(view?.turnEnded, `回合完成；view=${JSON.stringify(view)}`).toBe(true)
      expect((view?.chunkCount ?? 0) >= 2, `流式 chunk≥2（=${view?.chunkCount}）`).toBe(true)
      const texts = (view?.items ?? []).filter((it) => it.kind === 'text' && (it.text ?? '').trim().length > 0)
      expect(texts.length, '定稿文本非空（终答在 items）').toBeGreaterThan(0)
      // 优雅关窗（① 教训：CDP browser.close 强退慢；window.close → quit）
      await page.evaluate(() => window.close()).catch(() => { /* */ })
      await browser.close().catch(() => { /* */ })
      const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 30_000))])
      expect(rc, '关窗后启动器退出').toBe(0)
    } finally {
      if (proc.exitCode === null) {
        // 优雅收（LEARNINGS：直接 SIGKILL 启动器跳过 cleanup 留孤儿 dsh）
        proc.kill('SIGTERM')
        await new Promise((r) => setTimeout(r, 3000))
        if (proc.exitCode === null) proc.kill('SIGKILL')
      }
    }
  })


  test('⑦ SDK 先退 → 启动器 ≤30s exit 1、全链无残留（退出码修复）', { timeout: 300_000 }, async () => {
    const l = await launchHivebot({ env: { P2SDK_PROVIDER: 'mock' } })
    try {
      const { browser } = await connectUi(l.port)
      const pids = descendantPids(l)
      const cmdOf = (p: number): string => { try { return readFileSync(`/proc/${p}/cmdline`, 'utf8') } catch { return '' } }
      const sdkPid = pids.find((p) => cmdOf(p).includes('start.mjs'))
      expect(sdkPid, 'SDK pid 在').toBeTruthy()
      process.kill(sdkPid!, 'SIGKILL')
      const exitP = new Promise<number>((r) => l.proc.once('exit', (c) => r(c ?? 0)))
      const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 30_000))])
      expect(rc, 'SDK 先退 → exit 1').toBe(1)
      await new Promise((r) => setTimeout(r, 3000))
      const stragglers = pids.filter(alive)
      expect(stragglers, `残留=${JSON.stringify(stragglers.map((p) => cmdOf(p).slice(0, 50)))}`).toEqual([])
      expect(readdirSync(l.tmp).filter((n) => n.startsWith('p2sdk-handoff-')), 'handoff 删净').toEqual([])
      await browser.close().catch(() => { /* */ })
    } finally {
      await l.stop()
    }
  })


  test('⑧ env 文件末行无换行 + 引号值 → 仍读到 key、拒启面不误伤', { timeout: 120_000 }, async () => {
    const home = tmkdir('bot-T17-8-home-')
    const stateDir = join(home, 'state')
    const configDir = join(home, 'config')
    const tmp = mkdtempSync(join(tmpdir(), 'bot-T17-8-tmp-'))
    for (const d of [stateDir, configDir, join(configDir, 'pbots-ui'), join(configDir, 'hivebot')]) mkdirSync(d, { recursive: true })
    // 末行无换行 + 双引号值（两个历史坑）
    writeFileSync(join(configDir, 'hivebot', 'env'), 'P2SDK_LLM_API_KEY="sk-t18-nl-000"', { mode: 0o600 })
    const port = await freePort()
    const proc = spawn(LAUNCHER, ['--disable-gpu', `--remote-debugging-port=${port}`], {
      env: {
        PATH: process.env.PATH ?? '', HOME: home, TMPDIR: tmp,
        XDG_CONFIG_HOME: configDir, XDG_STATE_HOME: stateDir, XDG_CACHE_HOME: join(home, 'cache'),
        DBUS_SESSION_BUS_ADDRESS: `unix:path=${tmp}/no-dbus`, DISPLAY: process.env.DISPLAY ?? ':99',
        XAUTHORITY: process.env.XAUTHORITY ?? '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    proc.stderr?.on('data', (c) => { err += String(c) })
    const exitP = new Promise<number>((r) => proc.once('exit', (c) => r(c ?? 0)))
    try {
      const { browser, page } = await connectUi(port) // key 读到（文件末行无引号也能起 UI）
      await page.evaluate(() => window.close()).catch(() => { /* */ })
      await browser.close().catch(() => { /* */ })
      const rc = await Promise.race([exitP, new Promise<number>((r) => setTimeout(() => r(-1), 50_000))])
      let sdkTail = ''
      try { sdkTail = readFileSync(join(stateDir, 'hivebot', 'logs', 'sdk.log'), 'utf8').slice(-300) } catch { sdkTail = '无' }
      expect(rc, `正常起；proc.exitCode=${proc.exitCode} stderr=${err.slice(-150)} sdk尾=${sdkTail}`).toBe(0)
      expect(err.includes('P2SDK_LLM_API_KEY'), '无缺 key 报错').toBe(false)
      // M7 面：引号已剥——SDK environ 是 sk-t18-nl-000（无引号）
      {
        const sp = descendantPids({ proc, home, stateDir, configDir, tmp, port } as never).find((q) => { try { return readFileSync(`/proc/${q}/cmdline`, 'utf8').includes('start.mjs') } catch { return false } })
        expect(sp, 'SDK pid 在（引号断言）').toBeTruthy()
        if (sp !== undefined) expect(readFileSync(`/proc/${sp}/environ`, 'utf8').includes('P2SDK_LLM_API_KEY=sk-t18-nl-000\0'), '引号已剥（SDK env 无引号 key）').toBe(true)
      }
    } finally {
      if (proc.exitCode === null) {
        // 优雅收（LEARNINGS：直接 SIGKILL 启动器跳过 cleanup 留孤儿 dsh）
        proc.kill('SIGTERM')
        await new Promise((r) => setTimeout(r, 3000))
        if (proc.exitCode === null) proc.kill('SIGKILL')
      }
    }
  })

})

