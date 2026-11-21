// A9 单测：skill 引用标记行——entries 剥出重建 richText（B17 附件标记同构）。
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { toRawEntries } from '../../../renderer-grok/shim/src/entries'
import { foldTurns } from '../../../renderer/fold/turn-fold'
import type { FoldOutput } from '../../../renderer/fold/turn-fold'

const folded = (text: string): FoldOutput => foldTurns([{ kind: 'user', id: 'u1', at: 1, text } as never], { hasMore: false, running: false })

describe('A9 skill 引用标记链', () => {
  it('skill 标记剥出 → richText 含 workflowReference 节点 + 余文本', () => {
    const raw = toRawEntries(folded(`\u2063[skill:${encodeURIComponent('deploy-service')}@${encodeURIComponent('Deploy the service')}]\u2063\nplease run it`), 'Bot', null, undefined)
    const user = raw.find((e) => e.role === 'user') as { content: string; richText?: string }
    expect(user.content).toBe('please run it')
    const parsed = JSON.parse(user.richText ?? '{}') as { type: string; content: Array<{ type: string; content?: Array<{ type: string; attrs?: { id?: string; label?: string }; text?: string }> }> }
    expect(parsed.type).toBe('doc')
    const ref = parsed.content[0].content?.[0]
    expect(ref?.type).toBe('workflowReference')
    expect(ref?.attrs?.id).toBe('deploy-service')
    expect(ref?.attrs?.label).toBe('Deploy the service')
    expect(parsed.content[0].content?.[1]?.text).toBe('please run it')
  })

  it('多 skill 多行剥全；无标记不注 richText', () => {
    const raw = toRawEntries(folded(`\u2063[skill:a@A]\u2063\n\u2063[skill:b@B]\u2063\nrun both`), 'Bot', null, undefined)
    const m2 = raw.find((e) => e.kind === 'message' && e.role === 'user') as { richText?: string }
    const refs = (JSON.parse(m2.richText ?? '{}').content[0].content as Array<{ type: string }>).filter((n) => n.type === 'workflowReference')
    expect(refs).toHaveLength(2)
    const raw2 = toRawEntries(folded('plain text'), 'Bot', null, undefined)
    const m3 = raw2.find((e) => e.kind === 'message' && e.role === 'user') as { richText?: string }
    expect(m3.richText).toBeUndefined()
  })
})
