// U-00.fN ②：首屏初始导航尚未 commit（loadURL promise 还在 pending）时 renderer 发起
// 新导航，Electron 使前一个 loadURL 以 ERR_ABORTED(-3) reject —— 修复前 main().catch →
// app.exit(1)，进程退出、测试报「Target page closed」（PAB-final §4：U-21 首屏加载本地
// 字体后 load 变慢，origin-gate (c) 在 (b) 之后稳定复现）。修复后：容忍（不退出、不重载）。
//
// 复现手段（确定性，机制已 diag 实证 Electron 44：前一个 loadURL pending 未 commit 时
// 被 WebContents 上的新导航取代，会 reject code='ERR_ABORTED' errno=-3）：PBOTS_APP_URL
// 指向本用例起的慢 http 服务（5s 才回响应头），初始导航 pending 期间由测试注入第二次
// loadURL 到主窗口（与页面导航走同一条「取代初始导航」路径；renderer evaluate 的注入
// 会被 playwright 排队到慢文档加载完成后，测不到 pending 窗口）。
import { expect, test } from 'playwright/test'
import { createServer } from 'node:http'
import { launchShell } from '../../support/launch.ts'

test('首个文档加载完成前 renderer 导航：ERR_ABORTED 容忍，进程不退出不重载', async () => {
  const server = createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><html><head></head><body>slow</body></html>')
    }, 5_000)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const shell = await launchShell({ env: { PBOTS_APP_URL: `http://127.0.0.1:${port}/` } })
  try {
    // 初始导航还在等慢响应（pending）：立即注入新导航取代它 → main 的 loadURL reject ERR_ABORTED。
    await shell.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!
      void w.loadURL('pbots-app://app/index.html').catch(() => undefined)
    })
    await shell.page.waitForTimeout(1_500)
    // 修复前进程已 exit(1)：下一次 evaluate 就会抛「page closed」。
    const windows = await shell.app.windows()
    expect(windows).toHaveLength(1)
    // 取代导航被放行并完成：单窗、停在内部导航目标；产品不重载（重载会回到慢初始 URL，
    // 结果可观察为 http://…，同样 FAIL）。
    expect(windows[0]!.url()).toBe('pbots-app://app/index.html')
  } finally {
    await shell.stop().catch(() => undefined)
    server.close()
  }
})
