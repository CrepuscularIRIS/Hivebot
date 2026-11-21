// T45c e2e：真状态链（审批挂起逐档轮询）+ 六态截图经 main 驱动（M3/M4）。
// 恒 idle 的实现必须在本 spec 红（V7 变异刀证明）。
import { expect, test } from 'playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { PRESETS_PATCH, toolCall, textCall, waitProductReady } from '../support/ui.ts'

function p_urlIsAbout(u: string): boolean { return u === '' || u === 'about:blank' }

/** peer 插件 overlay：给 bot 投任务起回合（p6-notify/p6-workers 同法）。 */
function peerOverlayPath(): string {
  const { tmkdir } = require('../support/tmp-sweep.ts') as typeof import('../support/tmp-sweep.ts')
  const { pathToFileURL } = require('node:url') as typeof import('node:url')
  const dir = tmkdir('bot-t45c-patch-')
  const file = join(dir, 't45c-peer.yml')
  writeFileSync(file, `- insert:\n    - id: t45c-peer\n      name: '${pathToFileURL(join(__dirname, '..', 'support', 'p6-peer-plugin.mjs')).href}'\n`)
  return file
}

/** 经 main 进程给宠物窗发状态（M4：preload 测试钩子已删，唯一通道是 main 侧 webContents.send）。 */
async function drivePet(app: import('playwright/test').ElectronApplication, state: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, s) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents.getURL().includes('/pet/')) { w.webContents.send('pet:state', { state: s }); return }
    }
    throw new Error('pet window not found')
  }, state)
}

test('T45c 桌宠真状态链 + 六态截图', async () => {
  test.setTimeout(300_000)
  const home = sandboxHome('T45c')
  const dataDir = `${home}/data`
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}:${peerOverlayPath()}`, dataDir })
  // 先 seed 后起壳（p6-notify 同序）：W 必须是 worker（createdBy）——worker 完成才标未读进 rank3（普通 bot 完成已读不进）
  const M = randomUUID()
  const W = randomUUID()   // 审批挂起档（waiting）
  const W3 = randomUUID()  // gate 挂住档（thinking 稳定断言 → 放行后完成未读供 success）
  await rt.client.call('session/create', { request: { sessionId: M } })
  await rt.client.call('session/rename', { request: { sessionId: M, title: 'Main Bot' } })
  await rt.client.call('session/create', { request: { sessionId: W } })
  await rt.client.call('session/rename', { request: { sessionId: W, title: 'T45c approver' } })
  await rt.client.call('session/create', { request: { sessionId: W3 } })
  await rt.client.call('session/rename', { request: { sessionId: W3, title: 'T45c runner' } })
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'bots.json'), JSON.stringify({ version: 1, mainBotId: M, recipes: {}, bots: { [W]: { createdBy: M }, [W3]: { createdBy: M } } }))
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_PET: '1' }, home })
    // 按 URL 挑主窗/宠物窗（firstWindow 可能是宠物窗）
    const ctx0 = await shell.app.context()
    let ui = shell.page
    for (let i = 0; i < 50; i += 1) {
      const main = ctx0.pages().find((p) => !p.url().includes('/pet/'))
      if (main !== undefined && !p_urlIsAbout(main.url())) { ui = main; break }
      await new Promise((r) => setTimeout(r, 200))
    }
    await waitProductReady(ui)
    let petPage: import('playwright/test').Page | undefined
    for (let i = 0; i < 50 && petPage === undefined; i += 1) {
      for (const p of (await shell.app.context()).pages()) if (p.url().includes('/pet/')) petPage = p
      if (petPage === undefined) await new Promise((r) => setTimeout(r, 200))
    }
    expect(petPage, '宠物窗出现').toBeTruthy()
    const body = petPage!.locator('body')
    const video = petPage!.locator('video')

    // 档位断言：data-state + currentSrc 文件名 + readyState≥2（规格表：ANIM 映射）
    const ANIM: Record<string, string> = {
      idle: '待机呼吸休闲.webm', waiting: '工作状态-原地踱步张望.webm', thinking: '工作状态-思考冒泡.webm',
      working: '工作状态-忙碌点按.webm', error: '工作状态-垂头叹气冒汗.webm', success: '工作状态-雀跃庆祝.webm',
    }
    const expectState = async (state: string, timeout = 30_000): Promise<void> => {
      await expect(body).toHaveAttribute('data-state', state, { timeout })
      const anim = ANIM[state] ?? ANIM.idle
      await expect.poll(async () => await video.evaluate((v, n) => { try { return decodeURIComponent((v as HTMLVideoElement).currentSrc).endsWith(n) ? n : '' } catch { return '' } }, anim), { timeout: 15_000 }).toBe(anim)
      await expect.poll(async () => await video.evaluate((v) => (v as HTMLVideoElement).readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
    }

    // 起点 idle
    await expectState('idle')
    await petPage!.screenshot({ path: '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/idle.png', omitBackground: true })

    // 真回合：给 worker 投挂审批的任务（p6-notify 同法）——worker 挂审批 → rank0 waiting；
    // 批准后完成 → worker 未读新结果 → rank3 success（主 bot 前台回合结束已读，不进 rank3，故走 worker）
    rt.writeScriptCalls(W, [
      toolCall('bash', { command: 'echo t45c', description: 'probe' }, 't45c-c1'),
      textCall(['done']),
    ])
    rt.writeScriptCalls(W3, [textCall(['Working on the probe…'], { gateId: 't45c-think-gate' })])
    // thinking 稳定档：W3 gate 挂住（text 流停在 gate 文件前）→ rank1 running 无工具 → 稳定 thinking
    await rt.client.call('p615/control', { request: { op: 'deliver', sessionId: W3, id: 'pbots-assign:t45c3', text: 'Run the probe.', source: { kind: 'pbots-main', assignmentId: 't45c3', mainBotId: null } } })
    await expectState('thinking', 45_000) // gate 挂着不会走——真推导+转发链上的稳定档（区别于末尾 main 驱动）
    await petPage!.screenshot({ path: '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/thinking.png', omitBackground: true })
    await rt.client.call('p615/control', { request: { op: 'deliver', sessionId: W, id: 'pbots-assign:t45c', text: 'Answer the approval.', source: { kind: 'pbots-main', assignmentId: 't45c', mainBotId: null } } })
    // rt 侧 $events 流（T40 旁证同法）：抓 W 的审批 eventId + 流 clientId（$events/result 须同连接）
    const evStream = await rt.client.socket.open('$events', {})
    const evWait = (async (): Promise<{ eventId: string; clientId: string }> => {
      let clientId = ''
      for (;;) {
        const r = await evStream[Symbol.asyncIterator]().next()
        if (r.done) throw new Error('$events stream ended before approval')
        const f = r.value as Record<string, unknown>
        const item = (f.item ?? f) as Record<string, unknown>
        if (item.type === 'ready' && typeof item.clientId === 'string') clientId = item.clientId
        if (item.type === 'waterfall' && item.event === 'approval/request' && typeof item.eventId === 'string' && item.agentId === W) return { eventId: item.eventId, clientId }
      }
    })()

    // 依次：审批挂起 → waiting（稳定态，轮询等它；之前的 thinking/working 顺带记录，捕到即验动画）
    await expectState('waiting', 5_000) // 审批挂起档（工作状态-原地踱步张望）
    await petPage!.screenshot({ path: '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/waiting.png', omitBackground: true })

    // 后台批准（$events/result，同流连接）——不开 W 会话，保住完成时的未读新结果
    const { eventId, clientId } = await evWait
    await rt.client.call('$events/result', { clientId, eventId, outcome: { kind: 'result', value: 'allowed-once' } })
    // 放行 W3 gate（touch $home/gates/<id>）→ W3 完成未读 rank3 → success（真链，非 main 驱动）
    mkdirSync(join(rt.home, 'gates'), { recursive: true })
    writeFileSync(join(rt.home, 'gates', 't45c-think-gate'), '1')
    await rt.client.call('$events/result', { clientId, eventId, outcome: { kind: 'result', value: 'allowed-once' } })
    // 原子单帧捕获：data-state 与 currentSrc 同一次 evaluate 读（雀跃动画仅 ~1-2s，分两次读会漏）
    let ok = false
    const seq: string[] = []
    const succFrames: string[] = []
    const t1 = Date.now()
    while (Date.now() - t1 < 60_000) {
      const snap = await petPage!.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement
        let src = ''
        try { src = decodeURIComponent(v.currentSrc).split('/').pop() ?? '' } catch { /* 裸 % 时忽略 */ }
        return { state: document.body.dataset.state ?? '', src, ready: v.readyState }
      })
      if (seq[seq.length - 1] !== snap.state) seq.push(snap.state)
      if (snap.state === 'success') succFrames.push(snap.src + '#' + snap.ready)
      if (snap.state === 'success' && snap.src === ANIM.success) {
        if (snap.ready >= 2) { await petPage!.screenshot({ path: '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/success.png', omitBackground: true }); ok = true }
      } else if (ok && snap.state === 'idle') break
      await new Promise((r) => setTimeout(r, 40))
    }
    console.log('[T45c] 批准后序列:', seq.join('→'), 'ok=', String(ok))

    // 点宠物窗 → 主窗获焦（pet:click → main show/focus；Xvfb 下 isFocused 可测）——放在 success 链后，避免挥手 overriding 挡雀跃采样
    await petPage!.locator('body').click({ position: { x: 100, y: 100 } })
    await expect.poll(async () => await shell!.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.webContents.getURL().includes('/pet/')) return w.isFocused()
      return false
    }), { timeout: 10_000 }).toBe(true)
    expect(ok, '原子捕获 success 档（雀跃动画+解码就绪）').toBe(true)
    expect(seq.join(','), '批准后序列含 success').toContain('success')
    expect(seq.join(','), 'M1：success 一次动画后回 idle（非驻留末帧）').toMatch(/success.*idle/)

    // 主窗点掉残留焦点面（审批卡收起），回稳
    await ui.mouse.move(700, 400).catch(() => {})

    // 其余三态（thinking/working/error）：main 驱动（状态链语义已由上方真回合断言守，此处为视觉证据）
    for (const st of ['working', 'error']) { // thinking 已由真链稳定断言+截图；此处两态为视觉证据
      await drivePet(shell.app, st)
      await expectState(st, 10_000)
      const out = '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/' + st + '.png'
      await new Promise((r) => setTimeout(r, 300))
      await petPage!.screenshot({ path: out, omitBackground: true })
    }
    // 记录真回合中实际出现过的中间态（回执写明；fake 时序可能跳过 thinking/working）
  } finally {
    await shell?.stop()
    await rt.stop()
  }
})
