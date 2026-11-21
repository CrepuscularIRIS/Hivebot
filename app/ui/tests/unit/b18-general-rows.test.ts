// @vitest-environment happy-dom
// B18: General 区行序对齐 0.78.1（work/b18-general-rows/BRIEF.md 规格锚）
// 区序规格：account → appearance(Theme/Accent?/Language/Spell check) → bot(Timezone/Auto-review)
//           → Security Key 行组 → Notification Sound
// 渲染法照抄 t73c 先例（createRoot + act，无 testing-library 依赖）。
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { describe, expect, it } from 'vitest'
import { createElement as h, act } from '../../renderer-grok/node_modules/react'
import { createRoot, type Root } from '../../renderer-grok/node_modules/react-dom/client'
import { GeneralSettingsPanel } from '../../renderer-grok/frontend/src/recovered/features/settings/overlay/panels'

const baseProps = {
  account: { kind: 'logged-in', name: 'Test', email: 't@example.com' } as never,
  onAccountAction: () => undefined,
  theme: 'system' as const,
  onThemeChange: () => undefined,
  timeZone: {
    state: { detectedTimeZone: 'America/New_York', overrideTimeZone: null },
    onChange: () => undefined,
  },
  language: { value: 'system', onChange: () => undefined },
  spellCheck: { enabled: true, onChange: () => undefined },
  notificationSound: { enabled: true, onChange: () => undefined },
  hardwareAcceleration: { enabled: true, onChange: () => undefined },
  platform: 'linux' as never,
}

let root: Root | null = null
function renderPanel(extra: Record<string, unknown> = {}): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(h(GeneralSettingsPanel, { ...baseProps, ...extra })) })
  return host
}
function cleanup() {
  if (root) act(() => root!.unmount())
  root = null
  document.body.innerHTML = ''
}

function rowLabels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('label > span:first-child')).map((el) => el.textContent ?? '')
}

describe('B18 General 区行序（0.78.1 规格锚）', () => {
  it('区序：Account → Appearance → Bot（含 Timezone）→ Security Key', () => {
    const host = renderPanel({ securityKey: { enabled: false, platform: 'linux', onChange: () => undefined } })
    const sections = Array.from(host.querySelectorAll('.sand-settings-general > *')).map((el) => el.textContent ?? '')
    const idx = (re: RegExp) => sections.findIndex((t) => re.test(t))
    const account = idx(/Account/)
    const appearance = idx(/Appearance/)
    const bot = idx(/Bot/)
    const security = idx(/Security Key/)
    cleanup()
    expect(account).toBeGreaterThanOrEqual(0)
    expect(appearance).toBeGreaterThan(account)
    expect(bot).toBeGreaterThan(appearance)
    expect(security).toBeGreaterThan(bot)
  })

  it('Appearance 区行序：Theme → Language → Spell check', () => {
    const host = renderPanel()
    const texts = Array.from(host.querySelectorAll('.sand-settings-general > *')).map((el) => el.textContent ?? '')
    const appearance = texts.find((t) => /Theme/.test(t) && /Language/.test(t)) ?? ''
    cleanup()
    const theme = appearance.indexOf('Theme')
    const language = appearance.indexOf('Language')
    const spell = appearance.indexOf('Spell check')
    expect(theme).toBeGreaterThanOrEqual(0)
    expect(language).toBeGreaterThan(theme)
    expect(spell).toBeGreaterThan(language)
  })

  it('Bot 区含 Timezone 行', () => {
    const host = renderPanel()
    const labels = rowLabels(host)
    cleanup()
    expect(labels).toContain('Timezone')
  })

  it('Notification Sound 行存在（Play Sound for Notifications 文案）', () => {
    const host = renderPanel()
    const text = host.textContent ?? ''
    cleanup()
    expect(text).toContain('Play Sound for Notifications')
  })
})
