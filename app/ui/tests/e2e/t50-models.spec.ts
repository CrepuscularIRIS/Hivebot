// T50：Settings → Models 区——路由行+状态圆点+只写 key。核心是泄漏反证（③）：
// 填入的随机 key 在 DOM/localStorage/console 里都不得出现，reload 前后各查一次。
// console 监听在拿 page 后立即注册（Sol MAJOR：晚于 Apply 注册=提交期盲区），
// 且带 must-catch 探针证明监听器活着（空集恒绿反证）。
// 路由前置：mock runtime 起来后经 rt.client 直连 settings/mutate 写 litellm 路由
//（T49 守卫限 renderer，client 直连不经 m1；T49ac 探针已证 mock 下 settings 服务工作）。
import { expect, test } from 'playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { fakeOverlayPath } from '../support/sdk-runtime.ts'
import { launchShell } from '../support/launch.ts'
import { tmkdir } from '../support/tmp-sweep.ts'
import { waitProductReady } from '../support/ui.ts'

const OUT = '/home/lingxufeng/bot/work/settings-connectors/evidence/T50'
const SECRET = `t50-secret-${Math.random().toString(16).slice(2, 10)}`

const openModels = async (page: import('playwright/test').Page): Promise<void> => {
  await page.click('button[aria-label="Account"]')
  await page.locator('[role="menuitem"]', { hasText: 'Settings' }).click()
  await page.locator('.sand-settings-dialog').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('.sand-settings-dialog [role="tab"], .sand-settings-dialog button', { hasText: 'Models' }).first().click()
  await page.locator('[data-settings-panel="models"]').waitFor({ state: 'visible', timeout: 5_000 })
}

test('T50 Models 区：路由行/圆点/只写 key/泄漏反证/Clear/空态', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t50-ws-') })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page) // 首启 seen 路径（T7be：直接 launchShell 的 spec 必走）
    // T50-Sol MAJOR + T50c：console 监听在一切 key 输入之前注册（原在 Apply 后注册，
    // 提交期间的输出成监听盲区，③ 空集恒绿）；must-catch 探针用非 key 标记串就地验证
    // 监听器活着，且**不清空数组**——从注册起的每条 console 都留在 leak 检查范围内
    //（T50 经理验收：`length = 0` 会把 Apply 期间产品输出一并清掉，盲区只是挪位）。
    const consoleTexts: string[] = []
    page.on('console', (m) => consoleTexts.push(m.text()))
    await page.evaluate(() => { console.log('t50-listener-alive') })
    for (let i = 0; i < 25 && !consoleTexts.some((t) => t.includes('t50-listener-alive')); i++) await page.waitForTimeout(200)
    expect(consoleTexts.join('\n'), 'must-catch：监听器活着（注册于一切 key 输入之前）').toContain('t50-listener-alive')
    // ⑤ 前半：无路由 → 空态（mock 不种）
    await openModels(page)
    await expect(page.locator('[data-settings-panel="models"]')).toContainText('No model routes', { timeout: 5_000 })

    // 路由前置：直连写 litellm（renderer 之外）
    await rt.client.call('settings/mutate', { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'litellm'], value: { api: 'openai-completions', baseURL: 'http://127.0.0.1:4001/v1', apiKeyEnv: 'P2SDK_LLM_API_KEY', models: [{ id: 'glm-5.3-flash', contextWindow: 131072 }] } }] })

    // ① 重开：一行（LiteLLM 标签 + baseURL/model 描述）+ 红点（mock 子进程 env 无 key）
    await page.locator('.sand-settings-panel__close').click()
    await openModels(page)
    const row = page.locator('[data-model-route="litellm"]')
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toContainText('LiteLLM')
    await expect(row).toContainText('http://127.0.0.1:4001/v1')
    await expect(row).toContainText('glm-5.3-flash')
    await expect(row.locator('[data-key-dot]')).toHaveAttribute('data-key-dot', 'off', { timeout: 10_000 })

    // ② 填 key → Apply → 输入框清空 + 圆点绿
    const keyInput = row.locator('input[type="password"]')
    expect(await keyInput.getAttribute('type')).toBe('password')
    expect(await keyInput.getAttribute('autocomplete')).toBe('new-password') // DSH Models 页同款（client.js:173）
    await keyInput.fill(SECRET)
    await row.getByRole('button', { name: 'Apply' }).click()
    await expect(row.locator('input[type="password"]')).toHaveValue('', { timeout: 10_000 })
    await expect(row.locator('[data-key-dot]')).toHaveAttribute('data-key-dot', 'on', { timeout: 10_000 })
    // backend 侧确为 file 层（直连验证，不经 UI）
    const d = (await rt.client.call('credentials/describe', { refs: ['P2SDK_LLM_API_KEY'] })) as { P2SDK_LLM_API_KEY?: { configured?: boolean; source?: string } }
    expect(d.P2SDK_LLM_API_KEY).toMatchObject({ configured: true, source: 'file' })

    // ③ 泄漏反证：DOM/localStorage/console；reload 后同查 + 圆点仍绿。
    // consoleTexts 从注册起全程不清空——leak 覆盖 fill/Apply/刷圆点期间的全部输出。
    const leak = async (tag: string): Promise<void> => {
      const html = await page.evaluate(() => document.documentElement.outerHTML)
      expect(html, `${tag}: HTML 不含 key`).not.toContain(SECRET)
      const ls = await page.evaluate(() => JSON.stringify(window.localStorage))
      expect(ls, `${tag}: localStorage 不含 key`).not.toContain(SECRET)
      expect(consoleTexts.join('\n'), `${tag}: console 不含 key`).not.toContain(SECRET)
    }
    await leak('apply 后')
    await page.reload()
    await openModels(page)
    await expect(page.locator('[data-model-route="litellm"] [data-key-dot]')).toHaveAttribute('data-key-dot', 'on', { timeout: 10_000 })
    await leak('reload 后')

    // ⑥ 亮暗截图（行可见）
    await page.screenshot({ path: join(OUT, 'models.light.png') })
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, 'models.dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })

    // ④ Clear key（file 层可用）→ 圆点回红
    await page.locator('[data-model-route="litellm"]').getByRole('button', { name: 'Clear key' }).click()
    await expect(page.locator('[data-model-route="litellm"] [data-key-dot]')).toHaveAttribute('data-key-dot', 'off', { timeout: 10_000 })
    const d2 = (await rt.client.call('credentials/describe', { refs: ['P2SDK_LLM_API_KEY'] })) as { P2SDK_LLM_API_KEY?: { configured?: boolean } }
    expect(d2.P2SDK_LLM_API_KEY?.configured ?? false, 'clear 后 configured=false').toBe(false)
  } finally {
    await shell.stop(); await rt.stop()
  }
})
