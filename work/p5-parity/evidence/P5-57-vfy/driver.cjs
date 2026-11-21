// P5-57 验收驱动（verifier）：起市场目录源（serveMarket）+ SDK mock runtime（预装 pretrip-mcp）
// + 生产 build Electron（--remote-debugging-port=9333，Xvfb 显示），然后进入命令文件循环，
// 由验收员在 shell 侧写 /tmp/bot-P5-57/run/cmd/*.json 下达：
//   {op:'ping'} | {op:'script', sessionId, path?} | {op:'stop'}
// 全部子进程都是本驱动 spawn 的，退出路径统一 SIGTERM→SIGKILL（测试卫生，见 CLAUDE.md §5）。
const { spawn } = require('node:child_process')
const { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, appendFileSync } = require('node:fs')
const { join } = require('node:path')

const S = require('/tmp/bot-P5-57/s/w1/w2/vfy-support.cjs')
const UI = '/tmp/bot-wt/P5-57/app/ui'
const RUN = '/tmp/bot-P5-57/run'
const LOG = join(RUN, 'driver.log')
const CDP_PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (line) => { appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`); console.log(line) }

async function main() {
  mkdirSync(RUN, { recursive: true })
  const cmdDir = join(RUN, 'cmd')
  mkdirSync(cmdDir, { recursive: true })

  const server = await S.serveMarket()
  log(`[driver] market real=${server.realUrl} local=${server.localUrl}`)

  const rt = await S.launchSdkRuntime({
    patch: `${S.MARKET_SOURCE_PATCH}:${S.PRESETS_PATCH}:${S.fakeOverlayPath()}`,
    cwd: S.tmkdir('bot-p5-57-ws-'),
    env: { P2SDK_MARKET_SOURCE_INDEXES: `${server.realUrl} ${server.localUrl}` },
  })
  log('[driver] sdk runtime ready')

  const pre = await rt.client.call('pluginManager/installBundle', { spec: S.tempBundle('pretrip-mcp'), options: { enabled: false } })
  if (!pre || pre.application === 'failed') throw new Error('pre-install failed: ' + JSON.stringify(pre).slice(0, 300))
  log('[driver] pretrip-mcp pre-installed')

  const ws = join(rt.home, 'workspace')
  mkdirSync(ws, { recursive: true })
  const hello = join(ws, 'hello.txt')
  writeFileSync(hello, 'p5-57-vfy-hello')

  const eHome = S.tmkdir('bot-p5-57-electron-')
  const electron = spawn(join(UI, 'node_modules', 'electron', 'dist', 'electron'), [
    join(UI, 'out', 'main', 'index.js'), '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`,
  ], {
    cwd: UI,
    env: S.shellChildEnv(eHome, { PBOTS_DSH_HANDOFF: rt.handoff }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  electron.stdout.on('data', (c) => appendFileSync(LOG, `[electron:out] ${c}`))
  electron.stderr.on('data', (c) => appendFileSync(LOG, `[electron:err] ${c}`))
  log(`[driver] electron pid=${electron.pid} home=${eHome}`)

  let cdpUp = false
  for (let i = 0; i < 120; i++) {
    if (electron.exitCode !== null) throw new Error(`electron exited early code=${electron.exitCode} (see ${LOG})`)
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (r.ok) { cdpUp = true; break }
    } catch {}
    await sleep(500)
  }
  if (!cdpUp) throw new Error(`CDP ${CDP_PORT} not up in 60s (see ${LOG})`)
  writeFileSync(join(RUN, 'info.json'), JSON.stringify({
    cdp: `http://127.0.0.1:${CDP_PORT}`, realUrl: server.realUrl, localUrl: server.localUrl,
    hello, electronHome: eHome, rtHome: rt.home,
  }, null, 1))
  log('[driver] READY — attach playwright-cli to ' + `http://127.0.0.1:${CDP_PORT}`)

  const deadline = Date.now() + 25 * 60_000
  let stopping = false
  while (!stopping && Date.now() < deadline) {
    for (const f of readdirSync(cmdDir)) {
      if (!f.endsWith('.json')) continue
      const p = join(cmdDir, f)
      let cmd
      try { cmd = JSON.parse(readFileSync(p, 'utf8')) } catch (e) { writeFileSync(`${p}.err`, String(e)); continue }
      rmSync(p)
      try {
        if (cmd.op === 'ping') writeFileSync(`${p}.ok`, 'pong')
        else if (cmd.op === 'script') {
          rt.writeScriptCalls(cmd.sessionId, [S.mcpCall({ path: cmd.path ?? hello }), S.textCall([cmd.reply ?? 'D5 读取完成'])])
          writeFileSync(`${p}.ok`, `scripted ${cmd.sessionId}`)
          log(`[driver] scripted ${cmd.sessionId}`)
        } else if (cmd.op === 'stop') { writeFileSync(`${p}.ok`, 'bye'); stopping = true }
        else writeFileSync(`${p}.err`, `unknown op ${cmd.op}`)
      } catch (e) { writeFileSync(`${p}.err`, String((e && e.stack) || e)) }
    }
    if (!stopping) await sleep(400)
  }

  await new Promise((resolve) => {
    const t = setTimeout(() => { try { electron.kill('SIGKILL') } catch {}; resolve() }, 8000)
    electron.on('exit', () => { clearTimeout(t); resolve() })
    try { electron.kill('SIGTERM') } catch { clearTimeout(t); resolve() }
    if (electron.exitCode !== null) { clearTimeout(t); resolve() }
  })
  await rt.stop()
  await server.close()
  log('[driver] CLEAN')
}

main().then(() => process.exit(0), (e) => { log(`[driver] FATAL ${(e && e.stack) || e}`); process.exit(1) })
