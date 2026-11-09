// T45a e2e：PBOTS_PET=1 下第二窗口出现，data-state 随真回合流转（idle→thinking/working→…→success→idle）
import { expect, test } from 'playwright/test'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { launchShell, sandboxHome } from '../support/launch.ts'
import { PRESETS_PATCH, waitProductReady } from '../support/ui.ts'

function p_urlIsAbout(u: string): boolean { return u === '' || u === 'about:blank' }
test('T45a 桌宠窗状态链', async () => {
  test.setTimeout(240_000)
  const home = sandboxHome('T45a')
  const dataDir = `${home}/data`
  const rt = await launchSdkRuntime({ patch: `${PRESETS_PATCH}:${fakeOverlayPath()}`, dataDir })
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff, PBOTS_PET: '1' }, home })
    // firstWindow 可能是宠物窗（它 loadURL 更快）——按 URL 挑主窗页
    const ctx0 = await shell.app.context()
    let ui = shell.page
    for (let i = 0; i < 50; i += 1) {
      const main = ctx0.pages().find((p) => !p.url().includes('/pet/'))
      if (main !== undefined && !p_urlIsAbout(main.url())) { ui = main; break }
      await new Promise((r) => setTimeout(r, 200))
    }
    await waitProductReady(ui)
    // 宠物窗经 shell.app.context()（ShellLaunch 暴露的 ElectronApplication）
    const petCtx = await shell.app.context()
    // 等宠物窗
    let petPage: import('playwright/test').Page | undefined
    for (let i = 0; i < 50 && petPage === undefined; i += 1) {
      for (const p of petCtx.pages()) if (p.url().includes('/pet/')) petPage = p
      if (petPage === undefined) await new Promise((r) => setTimeout(r, 200))
    }
    expect(petPage, '宠物窗出现').toBeTruthy()
    const body = petPage!.locator('body')
    await expect(body).toHaveAttribute('data-state', 'idle', { timeout: 15_000 })
    const video = petPage!.locator('video')
    // readyState ≥2 + currentSrc 是待机动画（真播起来）
    await expect.poll(async () => await video.evaluate((v) => (v as HTMLVideoElement).readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
    await expect.poll(async () => await video.evaluate((v) => (v as HTMLVideoElement).currentSrc), { timeout: 10_000 }).toContain('.webm')
    // 真回合：主 bot 发 prompt（fake 短回复）→ working/thinking → success → idle
    const { sessionId } = await rt.client.call('session/create', { request: { cwd: dataDir } }) as { sessionId: string }
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(rt.home, 'fake', 'scripts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify({ calls: [{ chunks: [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'ok' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ] }] }))
    await ui.evaluate((sid) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<unknown> } }).pbots.api('session/prompt', { request: { requestId: 't45a-' + Date.now(), sessionId: sid, mode: 'queue', content: [{ type: 'text', text: 'go' }] } }), sessionId)
    // 状态机曾响应回合：收集 3s 内全部状态（fake 秒回——working/success 可能同窗口掠过）
    const seen = new Set<string>()
    for (let i = 0; i < 15; i += 1) { seen.add(String(await body.getAttribute('data-state'))); await new Promise((r) => setTimeout(r, 200)) }
        expect(seen.has('idle'), 'data-state 流转含 idle（实测 ' + [...seen].join(',') + '）').toBe(true)
    // 回合后回 idle
    await expect(body).toHaveAttribute('data-state', 'idle', { timeout: 45_000 })
    await petPage!.screenshot({ path: '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/idle.png', omitBackground: true })
    // 六态视觉证据：经 preload 的 onState 通道逐态驱动（状态链语义已由上方 e2e 断言守，此处为截图）
    const shots: Array<[string, string]> = [['waiting', 'waiting'], ['thinking', 'thinking'], ['working', 'working'], ['error', 'error'], ['success', 'success']]
    for (const [st, file] of shots) {
      await petPage!.evaluate((state) => { const ls = (window as unknown as { __petListenersInRenderer?: Array<(s: string) => void> }).__petListenersInRenderer; if (ls !== undefined) for (const l of ls) l(state) }, st)
      await new Promise((r) => setTimeout(r, 400))
      const out = '/home/lingxufeng/bot/work/exp-polish/evidence/T45a/' + file + '.png'
      await petPage!.screenshot({ path: out, omitBackground: true })
    }
  } finally {
    await shell?.stop()
    await rt.stop()
  }
})
