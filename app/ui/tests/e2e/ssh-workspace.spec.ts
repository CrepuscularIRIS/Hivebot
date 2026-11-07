// T11（DESIGN D5）远端工作区 e2e——产品 Electron 壳 + 真实 SDK（ssh 组合，夹具
// sshd）：
// ⑤a 先红：经 #3/#4 建 bot → 现状宿主 $dataDir/workspaces/<botId> 被 mkdir（终态
//         应为远端 <remoteRoot>/workspaces/<botId> 存在、宿主不存在）。
// ⑤b-⑤d/⑥：施工随先红逐格补（当前先交先红证据）。
import { expect, test } from 'playwright/test'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
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
        const direct = await api<{ sessionId: string }>(shell.page, 'session/create', { request: {} })
        EVIDENCE(`DIRECT #3: ${JSON.stringify(direct).slice(0, 500)}`)
        // M1 #3 直调建 bot（createBots 的单 bot 形态；返回 sessionId）
        const created = await api<{ sessionId: string }>(shell.page, 'session/create', { request: {} })
        expect(created.ok, JSON.stringify(created.error)).toBe(true)
        const sessionId = created.value!.sessionId
        // 会话头/工作区：devState 的 views[sessionId].cwd = 宿主 workspaces/<botId>（现状）
        // T11 终态：会话 cwd 落远端 <remoteRoot>/workspaces/<botId>；宿主无
        await expect.poll(async () => (await devState(shell.page)).views[sessionId]?.cwd, { timeout: 30_000 }).toContain(server.workspace)
        const state = await devState(shell.page)
        const cwd = state.views[sessionId]?.cwd ?? ''
        const botId = cwd.split('/').pop() ?? ''
        expect(existsSync(join(server.workspace, 'workspaces', botId)), `远端 workspaces/${botId} 存在；cwd=${cwd}`).toBe(true)
        expect(existsSync(join(dataDir, 'workspaces', botId)), `宿主 workspaces/${botId} 不存在（远端电脑语义）`).toBe(false)
        EVIDENCE(`⑤a sessionId=${sessionId} botId=${botId} cwd=${cwd}`)
      } finally {
        EVIDENCE(`MAIN LOG:\n${mainLog.join('').slice(-2500)}`)
        await shell.stop(); await rt.stop()
      }
    } finally {
      await server.stopServer()
    }
  })
})
