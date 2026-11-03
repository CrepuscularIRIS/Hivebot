// U-28 R1：双开。store.ts 的进程内单写者锁靠 app 级单实例锁兜底——第二个实例必须
// 拿不到 requestSingleInstanceLock 并自行退出（否则两进程互相覆盖 bots.json，丢配方）。
// 第二实例用 spawn 直测（playwright _electron.launch 等初始窗口，对「立即退出」的
// 进程会 reject，断言不了退出码）。
import { expect, test } from 'playwright/test'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'
import { launchShell, UI_ROOT } from '../../support/launch.ts'

test('双开：同 userData 的第二个实例拿不到锁、提示并自行退出（code 0），第一个实例不受影响', async () => {
  const home = tmkdir('bot-U-28-si-')
  const first = await launchShell({ home })
  try {
    await expect(first.page.locator('[data-boot-cover]')).toBeVisible({ timeout: 15_000 })

    // 第二实例：同 HOME/XDG/PBOTS_DATA_DIR（= 同 userData → 同一把单实例锁）
    const electronPath = createRequire(join(UI_ROOT, 'package.json'))('electron') as string
    const second = spawn(
      electronPath,
      [join(UI_ROOT, 'out', 'main', 'index.js'), '--disable-gpu'],
      {
        cwd: UI_ROOT,
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: join(home, '.config'),
          XDG_CACHE_HOME: join(home, '.cache'),
          PBOTS_DATA_DIR: join(home, 'data'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stderr = ''
    second.stderr.on('data', (chunk) => { stderr += String(chunk) })
    const exitCode = new Promise<number | null>((resolve) => { second.once('exit', (code) => resolve(code)) })
    const outcome = await Promise.race([
      exitCode,
      new Promise<'still-alive'>((resolve) => { setTimeout(() => resolve('still-alive'), 10_000) }),
    ])
    if (outcome === 'still-alive') {
      second.kill() // 测试自管的子进程（CLAUDE.md §5 允许）
      throw new Error('second instance did not exit within 10s')
    }
    expect(outcome).toBe(0)
    expect(stderr).toContain('已在运行') // console 提示（guardSingleInstance 的 alert）
    // 第一个实例仍在服役
    await expect(first.page.locator('[data-boot-cover]')).toBeVisible()
  } finally {
    await first.stop()
  }
})
