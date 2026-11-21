// P5-25（Q-015 C2-②，R4 §4）工作目录强制 E2E——走真实 launcher（launchSdkRuntime 的
// start.mjs 全链，P5-01 wrapper 生效）+ 生产 build Electron 壳：
// ① 新建 bot 后 follow header.cwd === $PBOTS_DATA_DIR/workspaces/<botId>，目录存在（#3 主 bot + 侧栏 New）；
// ② renderer 传 cwd（#3/#4）→ pbots/invalid-args；
// ③ 两个 bot 工作区互不可见：X 的 bash（批准后、wrapper 内）test -e Y 的哨兵为假，
//    自工作区哨兵为真（正对照，防「全瞎」假绿）；反向对称。
// P5-54 起跑在 renderer-grok 上：新建走 0.18 侧栏「New」（shim createAgent → #3），审批走 Local tool permissions dock。
import { expect, test } from 'playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sandboxHome, launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '../support/sdk-runtime.ts'
import { PRESETS_PATCH, bashCall, createBots, devState, evidenceOut, openBot, permissionDock, send, textCall, waitProductReady } from '../support/ui.ts'

const PATCH = `${PRESETS_PATCH}:${fakeOverlayPath()}`
const EVIDENCE = evidenceOut('P5-25')

/** 同一数据根两侧对齐：SDK 子进程 PBOTS_DATA_DIR === Electron 壳 shellChildEnv 的值。 */
async function launchAligned() {
  const home = sandboxHome('P5-25')
  const dataDir = join(home, 'data')
  const rt = await launchSdkRuntime({ patch: PATCH, dataDir })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff }, home })
  await waitProductReady(shell.page)
  return { rt, shell, page: shell.page, dataDir, async stop() { await shell.stop(); await rt.stop() } }
}

test('① header.cwd 强制 + ② renderer 传 cwd 即拒', async () => {
  test.setTimeout(240_000)
  const env = await launchAligned()
  try {
    const { page, dataDir } = env

    // ① #3：boot 自动建的主 bot —— follow header.cwd === $PBOTS_DATA_DIR/workspaces/<botId>，目录存在
    const main = (await devState(page)).meta.mainBotId!
    await expect.poll(async () => (await devState(page)).views[main]?.cwd, { timeout: 30_000 })
      .toBe(join(dataDir, 'workspaces', main))
    expect(existsSync(join(dataDir, 'workspaces', main)), '工作区目录建好').toBe(true)

    // ① 侧栏「New」→ 新建对话框 → Create（shim createAgent → chooser → #3；#4 的注入已在单测/wire 层覆盖，此格补 UI 全链的 #3 变体）
    const before = (await devState(page)).order
    await page.click('.sand-agents-sidebar__header button[aria-label="New"]')
    // P5-57：New 先开新建对话框（缺省 preset、无连接器 → #3）
    await page.getByRole('textbox', { name: 'Bot name' }).fill('WS') // T30：Create 需名字
    await page.locator('dialog[data-dialog="new-bot"] [data-action="create-bot"]').click()
    await expect.poll(async () => (await devState(page)).order.find((id) => !before.includes(id)), { timeout: 30_000 }).toBeTruthy()
    const x = (await devState(page)).order.find((id) => !before.includes(id))!
    await expect.poll(async () => (await devState(page)).views[x]?.cwd, { timeout: 30_000 })
      .toBe(join(dataDir, 'workspaces', x))
    expect(existsSync(join(dataDir, 'workspaces', x))).toBe(true)

    // ② renderer 传 cwd（#3 与 #4）→ pbots/invalid-args（拒绝发生在 main 编排，不达 dsh）
    for (const call of [
      { m: 'session/create', a: { request: { cwd: '/tmp/elsewhere' } } },
      { m: 'p2temp/session.createWithConnectors', a: { request: { connectors: ['demo-x'], agentPreset: 'standard', cwd: '/tmp/elsewhere' } } },
    ]) {
      const res = await page.evaluate(
        ({ m, a }) => (window as unknown as { pbots: { api(m: string, a?: unknown): Promise<{ ok: boolean; error?: { code: string; message: string } }> } }).pbots.api(m, a),
        call,
      )
      expect(res.ok, `${call.m} 传 cwd 必须被拒（got ${JSON.stringify(res).slice(0, 160)}）`).toBe(false)
      expect(res.error?.code).toBe('pbots/invalid-args')
      expect(res.error?.message).toContain('cwd')
    }

    expect(await page.screenshot({ path: join(EVIDENCE, 'p25-1-header-cwd.png') })).toBeTruthy()
  } finally {
    await env.stop()
  }
})

test('③ 两个 bot 工作区互不可见（bash 在 wrapper 内，X 看不见 Y 哨兵、自工作区可见）', async () => {
  test.setTimeout(300_000)
  const env = await launchAligned()
  try {
    const { page, rt, dataDir } = env
    // 两个探针 bot 都用 standard preset（带 bash + shell-ask，SPIKE §7）；
    // boot 主 bot 的上游 default preset 不保证带 bash，不参与探针。
    const [x, y] = await createBots(page, [{ title: 'P25-X', preset: 'standard' }, { title: 'P25-Y', preset: 'standard' }]) as [string, string]
    const xws = join(dataDir, 'workspaces', x)
    const yws = join(dataDir, 'workspaces', y)

    // 宿主侧哨兵：Y 的探针文件（X 不可见）、各自正对照 marker（必须可见）
    writeFileSync(join(yws, 'sentinel-y'), 'y')
    writeFileSync(join(xws, 'self-marker-x'), 'x')
    writeFileSync(join(yws, 'self-marker-y'), 'y')

    // X 的 bash：Y 哨兵 test -e 为假 + 自 marker 为真，结果写回 X 工作区（宿主可读）
    rt.writeScriptCalls(x, [
      bashCall(
        `if test -e ${join(yws, 'sentinel-y')}; then echo y-seen; else echo y-unseen; fi > ${join(xws, 'probe-x')}; ` +
        `if test -e ${join(xws, 'self-marker-x')}; then echo self-seen; else echo self-unseen; fi >> ${join(xws, 'probe-x')}`,
        'p25-x',
      ),
      textCall(['完成。']),
    ])
    await openBot(page, 'P25-X')
    await send(page, '探测工作区')
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click({ timeout: 20_000 })
    await expect.poll(() => existsSync(join(xws, 'probe-x')), { timeout: 30_000 }).toBe(true)
    const probeX = readFileSync(join(xws, 'probe-x'), 'utf8')
    expect(probeX, `X 的 bash 里 Y 哨兵必须不可见（got ${probeX}）`).toContain('y-unseen')
    expect(probeX, '正对照：X 自己的工作区必须可见').toContain('self-seen')

    // 反向对称：Y 的 bash 看 X 的工作区
    rt.writeScriptCalls(y, [
      bashCall(
        `if test -e ${join(xws, 'self-marker-x')}; then echo x-seen; else echo x-unseen; fi > ${join(yws, 'probe-y')}; ` +
        `if test -e ${join(yws, 'self-marker-y')}; then echo self-seen; else echo self-unseen; fi >> ${join(yws, 'probe-y')}`,
        'p25-y',
      ),
      textCall(['完成。']),
    ])
    await openBot(page, 'P25-Y')
    await send(page, '探测工作区')
    await permissionDock(page).locator('button', { hasText: 'Allow once' }).click({ timeout: 20_000 })
    await expect.poll(() => existsSync(join(yws, 'probe-y')), { timeout: 30_000 }).toBe(true)
    const probeY = readFileSync(join(yws, 'probe-y'), 'utf8')
    expect(probeY, `Y 的 bash 里 X 工作区必须不可见（got ${probeY}）`).toContain('x-unseen')
    expect(probeY, '正对照：Y 自己的工作区必须可见').toContain('self-seen')

    expect(await page.screenshot({ path: join(EVIDENCE, 'p25-3-cross-invisible.png') })).toBeTruthy()
  } finally {
    await env.stop()
  }
})
