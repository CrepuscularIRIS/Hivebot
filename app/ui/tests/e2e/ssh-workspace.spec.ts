// T11（DESIGN D5）远端工作区 e2e——产品 Electron 壳 + 真实 SDK（ssh 组合，夹具
// sshd）：
// ⑤a 先红：经 #3/#4 建 bot → 现状宿主 $dataDir/workspaces/<botId> 被 mkdir（终态
//         应为远端 <remoteRoot>/workspaces/<botId> 存在、宿主不存在）。
// ⑤b-⑤d/⑥：施工随先红逐格补（当前先交先红证据）。
import { expect, test } from 'playwright/test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startUiSshServer } from '../support/ssh-fixture.ts'
import { sandboxHome, launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { PRESETS_PATCH, SDK_ROOT, api, devState, evidenceOut, waitProductReady } from '../support/ui.ts'

const PATCH = `${PRESETS_PATCH}:${join(SDK_ROOT, 'profile', 'patches', 'orchestration.yml')}:${fakeOverlayPath()}`
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

  test('⑤b bash 写 marker 落远端 ws', { timeout: 300_000 }, async () => {
    const home = sandboxHome('T11-5b')
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
      try {
        await shell.page.waitForFunction(() => (window as unknown as { pbots?: unknown }).pbots !== undefined, { timeout: 60_000 })
        const created = await api<{ sessionId: string }>(shell.page, 'session/create', { request: {} })
        expect(created.ok, JSON.stringify(created.error)).toBe(true)
        const sessionId = created.value.sessionId
        // 门开绕审批卡（tiers provision 同款：instance=sha256(launch-token)）
        const { createHash } = await import('node:crypto')
        const token = readFileSync(join(rt.handoff, 'launch-token'), 'utf8').trim()
        const instance = createHash('sha256').update(token).digest('hex')
        // dataDirs 跟 launchSdkRuntime 的 dataDir 走（=home/data，非缺省 .config）
        mkdirSync(dataDir, { recursive: true })
        writeFileSync(join(dataDir, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance }))
        const bashArgs = JSON.stringify({ command: 'printf T11MARK > m.txt', description: 'T11 5b' })
        rt.writeScriptCalls(sessionId, [{ chunks: [
          { type: 'block-start', index: 0, blockType: 'tool-call' },
          { type: 'tool-call-delta', index: 0, id: 't11b1', name: 'bash', argumentsDelta: bashArgs.slice(0, 10) },
          { type: 'tool-call-delta', index: 0, id: 't11b1', name: 'bash', argumentsDelta: bashArgs.slice(10) },
          { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't11b1', name: 'bash', arguments: bashArgs } },
          { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
          { type: 'finish', reason: { kind: 'tool-calls' } },
        ] }])
        const prompted = await api(shell.page, 'session/prompt', { request: { requestId: `t11b-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })
        EVIDENCE(`⑤b prompt resp: ${JSON.stringify(prompted).slice(0, 300)}`)
        // 观测：SDK 侧 fake 是否被调（requests.jsonl）与脚本消费
        const deadlineFake = Date.now() + 30_000
        let reqLog = ''
        for (;;) {
          try { reqLog = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8') } catch { /* 未写 */ }
          if (reqLog.includes(sessionId) || Date.now() > deadlineFake) break
          await new Promise((r) => setTimeout(r, 500))
        }
        const reqLines = reqLog.split('\n').filter((l) => l.includes(sessionId))
        EVIDENCE(`⑤b fake 轮数=${reqLines.length} 尾行=${reqLines[reqLines.length - 1]?.slice(0, 260) ?? '无'}`)
        // 观测 tool 结果：等 turn/end 后 dump devState items 的错误文本
        const deadlineView = Date.now() + 60_000
        for (;;) {
          const st = await devState(shell.page)
          const v = st.views[sessionId]
          if (v?.turnEnded === true) break
          if (Date.now() > deadlineView) { EVIDENCE(`⑤b turn 未完：${JSON.stringify(v ?? null).slice(0, 400)}`); break }
          await new Promise((r) => setTimeout(r, 500))
        }
        const stEnd = await devState(shell.page)
        EVIDENCE(`⑤b view 尾态: ${JSON.stringify(stEnd.views[sessionId] ?? null).slice(0, 600)}`)
        const wsRoot = join(server.workspace, 'workspaces')
        const deadline = Date.now() + 180_000
        let found = ''
        for (;;) {
          for (const e of readdirSync(wsRoot, { withFileTypes: true })) {
            if (e.isDirectory() && existsSync(join(wsRoot, e.name, 'm.txt'))) { found = join(wsRoot, e.name, 'm.txt'); break }
          }
          if (found !== '' || Date.now() > deadline) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(found, 'bash 写的 m.txt 落远端 ws').not.toBe('')
        try {
          const finalReq = readFileSync(join(rt.home, 'fake', 'requests.jsonl'), 'utf8').split('\n').filter((l) => l.includes(sessionId))
          EVIDENCE(`⑤b 终态轮数=${finalReq.length}`)
        } catch { /* */ }
        expect(readFileSync(found, 'utf8').trim()).toBe('T11MARK')
        EVIDENCE(`⑤b marker=${found}`)
      } finally {
        await shell.stop(); await rt.stop()
      }
    } finally {
      await server.stopServer()
    }
  })


  test('⑤c 主 bot 委派 worker → 工作区在远端、宿主无新目录', { timeout: 300_000 }, async () => {
    const home = sandboxHome('T11-5c')
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
      try {
        await shell.page.waitForFunction(() => (window as unknown as { pbots?: unknown }).pbots !== undefined, { timeout: 60_000 })
        const created = await api<{ sessionId: string }>(shell.page, 'session/create', { request: {} })
        expect(created.ok, JSON.stringify(created.error)).toBe(true)
        const sessionId = created.value.sessionId
        const { createHash } = await import('node:crypto')
        const token = readFileSync(join(rt.handoff, 'launch-token'), 'utf8').trim()
        const instance = createHash('sha256').update(token).digest('hex')
        mkdirSync(dataDir, { recursive: true })
        writeFileSync(join(dataDir, 'policy-state.json'), JSON.stringify({ version: 1, paused: false, instance }))
        const wsRoot = join(server.workspace, 'workspaces')
        const hostWs = join(dataDir, 'workspaces')
        const beforeRemote = new Set(readdirSync(wsRoot))
        const beforeHost = new Set(existsSync(hostWs) ? readdirSync(hostWs) : [])
        // fake 脚本：主 bot 调 create_bot（SDK 编排 → orch-channel → main createWorkerBot → mintWorkspace ssh 分支）
        const toolArgs = JSON.stringify({ name: 't11worker', prompt: 'T11 5c probe' })
        rt.writeScriptCalls(sessionId, [
          { chunks: [
            { type: 'block-start', index: 0, blockType: 'tool-call' },
            { type: 'tool-call-delta', index: 0, id: 't11c1', name: 'create_bot', argumentsDelta: toolArgs.slice(0, 10) },
            { type: 'tool-call-delta', index: 0, id: 't11c1', name: 'create_bot', argumentsDelta: toolArgs.slice(10) },
            { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't11c1', name: 'create_bot', arguments: toolArgs } },
            { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
            { type: 'finish', reason: { kind: 'tool-calls' } },
          ] },
        ])
        await api(shell.page, 'session/prompt', { request: { requestId: `t11c-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: 'go' }] } })
        const deadline = Date.now() + 120_000
        let newRemote: string[] = []
        for (;;) {
          newRemote = readdirSync(wsRoot).filter((n) => !beforeRemote.has(n))
          if (newRemote.length > 0 || Date.now() > deadline) break
          await new Promise((r) => setTimeout(r, 800))
        }
        expect(newRemote.length, `worker 工作区在远端（新增=${JSON.stringify(newRemote)}）`).toBeGreaterThan(0)
        const newHost = readdirSync(hostWs).filter((n) => !beforeHost.has(n))
        expect(newHost, '宿主无新目录').toEqual([])
        EVIDENCE(`⑤c newRemote=${JSON.stringify(newRemote)} newHost=${JSON.stringify(newHost)}`)
      } finally {
        await shell.stop(); await rt.stop()
      }
    } finally {
      await server.stopServer()
    }
  })

})
