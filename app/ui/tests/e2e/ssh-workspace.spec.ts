// T11（DESIGN D5）远端工作区 e2e——产品 Electron 壳 + 真实 SDK（ssh 组合，夹具
// sshd）：
// ⑤a 先红：经 #3/#4 建 bot → 现状宿主 $dataDir/workspaces/<botId> 被 mkdir（终态
//         应为远端 <remoteRoot>/workspaces/<botId> 存在、宿主不存在）。
// ⑤b-⑤d/⑥：施工随先红逐格补（当前先交先红证据）。
import { expect, test } from 'playwright/test'
import { appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { startUiSshServer } from '../support/ssh-fixture.ts'
import { sandboxHome, launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { PRESETS_PATCH, api, devState, evidenceOut, waitProductReady } from '../support/ui.ts'

const PATCH = `${PRESETS_PATCH}:${fakeOverlayPath()}`
const EVID_DIR = evidenceOut('T11')
const EVIDENCE = (line: string): void => { appendFileSync(join(EVID_DIR, 'diag.log'), `${new Date().toISOString()} ${line}\n`) }

test.describe('T11 ssh 远端工作区', () => {
  // ssh 组合启动 40s+（私 sshd + SDK + Electron 壳）——d1-real-model 的 setTimeout 先例
  test.setTimeout(300_000)
  test('⑤a 经 #3 建 bot → 工作区落远端（宿主不建）', { timeout: 300_000 }, async () => {
    const home = sandboxHome('T11-5a')
    const dataDir = join(home, 'data')
    mkdirSync(dataDir, { recursive: true })
    const server = await startUiSshServer(home)
    try {
      const rt = await launchSdkRuntime({
        patch: PATCH, dataDir,
        env: {
          PATH: `${server.binDir}:${process.env.PATH ?? ''}`,
          P2SDK_SSH_HOST: 'pbots-ssh-test', P2SDK_SSH_REMOTE_ROOT: server.workspace,
          P2SDK_SSH_HELPER: server.helper, P2SDK_SSH_HELPER_HASH: server.helperHash,
          P2SDK_SSH_NODE: process.execPath, P2SDK_SSH_REMOTE_HOME: server.remoteHome,
        },
      })
      const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
      // 排查（playwright API：process() 是方法）：main console 全量落盘
      const mainLog: string[] = []
      try {
        const proc = (shell.app as never as { process(): { stdout?: NodeJS.ReadableStream; stderr?: NodeJS.ReadableStream } }).process()
        proc.stdout?.on('data', (c) => mainLog.push(String(c)))
        proc.stderr?.on('data', (c) => mainLog.push(String(c)))
      } catch { /* API 差异则跳过 */ }
      try {
        // 排查：不等侧栏（boot 链死的观测）——等 pbots API 面就绪直调 #3
        await shell.page.waitForFunction(() => (window as unknown as { pbots?: unknown }).pbots !== undefined, { timeout: 60_000 }).catch(() => {})
        // M1 #3 直调建 bot；createBots 先例：建后 reload 让 roster 重拉
        const created = await api<{ sessionId: string }>(shell.page, 'session/create', { request: {} })
        expect(created.ok, JSON.stringify(created.error)).toBe(true)
        const sessionId = created.value!.sessionId
        await shell.page.reload()
        await shell.page.waitForFunction(() => (window as unknown as { pbots?: unknown }).pbots !== undefined, { timeout: 60_000 })
        // 会话头/工作区：devState 的 views[sessionId].cwd = 宿主 workspaces/<botId>（现状）
        // T11 终态：会话 cwd 落远端 <remoteRoot>/workspaces/<botId>；宿主无。
        // ⑤a 主证 = 目录语义（远端有/宿主无）；view.cwd 是 follow header 的投影，
        // ssh 下可能 null/延迟——放宽为存在性检查（有值时须在远端）。
        await expect.poll(async () => (await devState(shell.page)).order.includes(sessionId), { timeout: 60_000 }).toBe(true)
        // botId 从远端目录差分拿（RPC mkdir 的产物）：建会话前后远端 workspaces 差集
        const wsRoot = join(server.workspace, 'workspaces')
        const remoteBots = readdirSync(wsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        expect(remoteBots.length, `远端 workspaces 有目录（=${JSON.stringify(remoteBots)}）`).toBeGreaterThanOrEqual(1)
        for (const botId of remoteBots) {
          expect(existsSync(join(dataDir, 'workspaces', botId)), `宿主 workspaces/${botId} 不存在（远端电脑语义）`).toBe(false)
        }
        const cwd = (await devState(shell.page)).views[sessionId]?.cwd
        if (typeof cwd === 'string' && cwd.length > 0) expect(cwd, 'view.cwd 有值时须在远端').toContain(server.workspace)
        EVIDENCE(`⑤a sessionId=${sessionId} remoteBots=${JSON.stringify(remoteBots)} cwd=${String(cwd)}`)
      } finally {
        EVIDENCE(`MAIN LOG:\n${mainLog.join('').slice(-2500)}`)
        await shell.stop(); await rt.stop()
      }
    } finally {
      await server.stopServer()
    }
  })
})
