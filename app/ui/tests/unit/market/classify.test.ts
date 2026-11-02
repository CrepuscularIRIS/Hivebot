// U-23 P-C 三分类 / 失败文案 / 连接器候选（renderer/plugins/market/store.ts、settings/NewBotDialog.tsx 纯函数）。
// 条目形状取自 T-19 快照经 pluginMarket/search 的 listing（versions[].install.spec；not-installable 在 metadata.keywords）。
import { describe, expect, it } from 'vitest'
import { classify, outcomeText, targetVersion, text, type Entry } from '../../../renderer/plugins/market/store'
import { installedBundles } from '../../../renderer/plugins/settings/NewBotDialog'

const entry = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name, versions: [{ version: '1.0.0', install: { spec: `${name}@1.0.0` } }], ...extra,
})
const none = new Set<string>()

describe('market classify（PDC-final P4/P5）', () => {
  it('已安装优先于一切；not-installable 精确标记即使有 install.spec 也只浏览', () => {
    const ni = entry('a', { metadata: { keywords: ['not-installable'] } })
    expect(classify(ni, none, undefined)).toBe('browse')
    expect(classify(ni, new Set(['a']), undefined)).toBe('installed')
    expect(classify(entry('b', { metadata: { keywords: ['not-installable-ish'] } }), none, undefined)).toBe('installable')
  })

  it('无 install.spec → 只浏览；有 spec → 可装；not-bundle 后本会话不再给按钮，其它失败仍可重试', () => {
    expect(classify({ name: 'c', versions: [{ version: '1' }] }, none, undefined)).toBe('browse')
    expect(classify(entry('d'), none, undefined)).toBe('installable')
    expect(classify(entry('d'), none, { kind: 'failed', code: 'not-bundle', message: '' })).toBe('unsupported')
    expect(classify(entry('d'), none, { kind: 'failed', code: 'operation-error', message: 'x' })).toBe('installable')
    expect(classify(entry('d'), none, { kind: 'unconfirmed', code: 'pbots/unavailable', message: '' })).toBe('installable')
  })

  it('targetVersion 取 defaultVersion，否则首条', () => {
    const e: Entry = { name: 'e', defaultVersion: '1.0.0', versions: [{ version: '2.0.0-rc.1' }, { version: '1.0.0', install: { spec: 'e@1.0.0' } }] }
    expect(targetVersion(e)?.version).toBe('1.0.0')
    expect(targetVersion({ name: 'f', versions: [{ version: '3.0.0' }] })?.version).toBe('3.0.0')
  })

  it('失败分类文案：not-bundle 专门说明；未确认不冒充失败；其它带 code', () => {
    expect(outcomeText({ kind: 'failed', code: 'not-bundle', message: 'no dsh.bundle' })).toBe('此包不是受支持的连接器包')
    expect(outcomeText({ kind: 'unconfirmed', code: 'pbots/unavailable', message: '' })).toContain('尚未确认')
    expect(outcomeText({ kind: 'failed', code: 'operation-error', message: '404' })).toBe('operation-error：404')
  })

  it('LocalizedText：字符串原样；对象取 zh-CN → en', () => {
    expect(text('x')).toBe('x')
    expect(text({ en: 'E', 'zh-CN': '中' })).toBe('中')
    expect(text({ en: 'E' })).toBe('E')
    expect(text(undefined)).toBe('')
  })
})

describe('连接器候选（#16，PDC-final D10）', () => {
  it('只要 installed 且文件可读的行（manifest 在、包被删 = availability missing → 剔除）', () => {
    expect(installedBundles([
      { name: 'a', installed: true, availability: 'profile' },
      { name: 'b', installed: true, availability: 'missing' },
      { name: '@deepseek-ai/dsh-base', installed: false, availability: 'installation' },
    ]).map((b) => b.name)).toEqual(['a'])
    expect(installedBundles({ not: 'array' })).toEqual([])
  })
})
