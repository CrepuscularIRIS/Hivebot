// B12 e2e：听写——mock SpeechRecognition → 点钮开录 → interim 临时段 → final 定稿 → 停止复位。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '../support/sdk-runtime.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B12：听写 interim/final 两态+停止复位', async () => {
  test.setTimeout(300_000)
  const rt: SdkRuntime = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('b12-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    // mock：类形态对齐 dictation.ts 的 SpeechRecognitionLike 契约
    await page.evaluate(() => {
      const listeners: Array<() => void> = []
      ;(window as unknown as { __b12Fire: unknown }).__b12Fire = {
        interim: (t: string) => { const r = (window as unknown as { __rec?: { onresult: ((e: unknown) => void) | null } }).__rec; r?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: t }, isFinal: false }] }) },
        final: (t: string) => { const r = (window as unknown as { __rec?: { onresult: ((e: unknown) => void) | null } }).__rec; r?.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: t }, isFinal: true }] }) },
        end: () => { const r = (window as unknown as { __rec?: { onend: (() => void) | null } }).__rec; r?.onend?.() },
      }
      class FakeSR {
        lang = ''; continuous = false; interimResults = false
        onresult: ((e: unknown) => void) | null = null
        onerror: (() => void) | null = null
        onend: (() => void) | null = null
        start(): void { (window as unknown as { __rec?: unknown }).__rec = this }
        stop(): void { this.onend?.() }
      }
      ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeSR
    })
    const mic = page.locator('button[aria-label="Dictate"]')
    await expect(mic).toBeVisible({ timeout: 15_000 })
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    // interim 临时段
    const fire = (k: 'interim' | 'final' | 'end', t?: string) => page.evaluate(([kk, tt]) => { (window as unknown as { __b12Fire: Record<string, (v?: string) => void> }).__b12Fire[kk](tt) }, [k, t] as const)
    await fire('interim', '你好世界')
    await expect(page.locator('[data-dictation-interim]')).toHaveText('你好世界', { timeout: 5_000 })
    // final 定稿（Review Focus 3：final 后 interim 清）
    await fire('final', '你好世界')
    await expect(page.locator('[data-dictation-final]')).toContainText('你好世界', { timeout: 5_000 })
    // 停止复位
    await mic.click()
    await expect(mic, '复位后 aria-pressed 非 true（SandIconButton 对 false 省属性）').not.toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-dictation-interim]')).toHaveCount(0)
  } finally { await shell.stop(); await rt.stop() }
})
