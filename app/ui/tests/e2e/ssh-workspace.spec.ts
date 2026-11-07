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
  test('⑤a 先红：经 #3 建 bot → 现状宿主 workspaces/<botId> 被 mkdir', { timeout: 300_000 }, async () => {
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
      // 诊断①：SDK RPC 面直探（绕过 UI 链）——workspace_ensure 通不通
      try {
        const probe = await rt.client.call('p2sdk/workspace_ensure', { botId: 'diag-probe' })
        EVIDENCE(`RPC probe ok: ${JSON.stringify(probe).slice(0, 200)}`)
      } catch (e) {
        EVIDENCE(`RPC probe FAIL: ${String(e).slice(0, 400)}`)
      }
      const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
      // 排查：收 main 进程 stdout/stderr（mintWorkspace/#3 链的失败详情）
      const mainLog: string[] = []
      const proc = (shell.app as unknown as { process: { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream } }).process
      proc.stdout?.on('data', (c: Buffer) => mainLog.push(c.toString()))
      proc.stderr?.on('data', (c: Buffer) => mainLog.push(c.toString()))
      try {
        await waitProductReady(shell.page, 150_000)
        // M1 #3 直调建 bot（createBots 的单 bot 形态；返回 sessionId）
        const created = await api<{ sessionId: string }>(shell.page, 'session/create', { request: {} })
        expect(created.ok, JSON.stringify(created.error)).toBe(true)
        const sessionId = created.value!.sessionId
        // 会话头/工作区：devState 的 views[sessionId].cwd = 宿主 workspaces/<botId>（现状）
        const state = await devState(shell.page)
        const view = state.views[sessionId]
        expect(view, 'dev view 在册').toBeDefined()
        const botId = (view?.cwd ?? '').split('/').pop() ?? ''
        // 先红断言：现状（mintWorkspace 未分支）宿主被 mkdir——终态翻转为
        // 宿主不存在 + 远端 <remoteRoot>/workspaces/<botId> 存在
        expect(existsSync(join(dataDir, 'workspaces', botId)), `先红：宿主 workspaces/${botId} 存在（T11 后翻转）；cwd=${view?.cwd}`).toBe(true)
        EVIDENCE(`sessionId=${sessionId} botId=${botId} cwd=${view?.cwd}`)
      } catch (err) {
        throw new Error(`MAIN LOG:\n${mainLog.join('').slice(-3000)}\nSPEC ERR: ${String(err)}`)
      } finally {
        await shell.stop(); await rt.stop()
      }
    } finally {
      await server.stopServer()
    }
  })
})
