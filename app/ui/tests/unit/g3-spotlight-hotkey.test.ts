// G3 单测：全局热键解析——Alt+Space（1.1.0 spotlight 入口）与 mod+k 双开。
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createRootShellShortcutActions, resolveGlobalShortcutAction } from '../../renderer-grok/frontend/src/recovered/features/window-chrome/global-keyboard-shortcuts'

function keyEvent(init: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }) {
  return { key: init.key, metaKey: init.metaKey ?? false, ctrlKey: init.ctrlKey ?? false, altKey: init.altKey ?? false, shiftKey: init.shiftKey ?? false, defaultPrevented: false, target: document.body }
}

describe('G3 spotlight 热键（1.1.0 Alt+Space 锚）', () => {
  const handlers = { newAgent: () => {}, toggleCommandPalette: () => {}, openSettings: () => {}, openTools: () => {}, focusPrompt: () => {}, openSearch: () => {}, previousAgent: () => {}, nextAgent: () => {}, navigateBack: () => {}, navigateForward: () => {}, toggleSidebar: () => {}, focusAgent: (_i: number) => {} }
  const actions = createRootShellShortcutActions(handlers as never)

  it('Alt+Space 命中 commandPalette', () => {
    const hit = resolveGlobalShortcutAction(keyEvent({ key: ' ', altKey: true }), actions)
    expect(hit?.id).toBe('sand.commandPalette')
  })

  it('mod+k 仍命中（并存）', () => {
    const hit = resolveGlobalShortcutAction(keyEvent({ key: 'k', metaKey: true }), actions)
    expect(hit?.id).toBe('sand.commandPalette')
  })

  it('裸 Space 不命中（无 modifier 不触发）', () => {
    const hit = resolveGlobalShortcutAction(keyEvent({ key: ' ' }), actions)
    expect(hit?.id).not.toBe('sand.commandPalette')
  })

  it('Alt+Shift+Space 不命中（多 shift 拒）', () => {
    const hit = resolveGlobalShortcutAction(keyEvent({ key: ' ', altKey: true, shiftKey: true }), actions)
    expect(hit?.id).not.toBe('sand.commandPalette')
  })
})
