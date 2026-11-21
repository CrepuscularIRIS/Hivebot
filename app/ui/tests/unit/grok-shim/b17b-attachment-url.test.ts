// B17b 单测：stage→标记→entries 剥出带 data URL 的 attachments（图片），非图片无 url。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toRawEntries } from '../../../renderer-grok/shim/src/entries'
import { createDesktopBridge, stagedAttachmentDataUrl } from '../../../renderer-grok/shim/src/desktop'
import { foldTurns } from '../../../renderer/fold/turn-fold'
import type { FoldOutput } from '../../../renderer/fold/turn-fold'

const win = () => ({
  localStorage: { getItem: () => null, setItem: () => {} },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
}) as unknown as Parameters<typeof createDesktopBridge>[0]

const PNG = Uint8Array.from(
  Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)),
)

describe('B17b：附件 data URL 链', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('图片附件：stage → 标记 → entries 剥出带 url', async () => {
    const bridge = createDesktopBridge(win(), { authId: 't' })
    const staged = await bridge.stageAttachmentBytes('dot.png', PNG)
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    expect(stagedAttachmentDataUrl(staged.path)).toMatch(/^data:image\/png;base64,/)
    const mark = `\u2063[attach:dot.png@${staged.path}]\u2063\nhello`
    const folded: FoldOutput = foldTurns([{ kind: 'user', id: 'u1', at: 1, text: mark } as never], false)
    const raw = toRawEntries(folded, 'Bot', null, undefined)
    const ue = raw.find((e) => e.kind === 'message' && e.role === 'user') as { attachments?: Array<{ name: string; url?: string }> } | undefined
    expect(ue?.attachments).toEqual([{ path: staged.path, name: 'dot.png', url: expect.stringMatching(/^data:image\/png;base64,/) }])
  })

  it('非图片附件：无 url 字段（📎 行仍由投影层渲染）', async () => {
    const bridge = createDesktopBridge(win(), { authId: 't' })
    const staged = await bridge.stageAttachmentBytes('notes.txt', new TextEncoder().encode('hi'))
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    expect(stagedAttachmentDataUrl(staged.path)).toBeNull()
  })
})
