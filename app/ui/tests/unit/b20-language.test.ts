// B20: i18n 最小接线（work/b20-i18n-eval/BRIEF.md 规格锚）
// 0.78.1 规格锚：Co(e) 切语言后 xo(e, ni(e)) → document.documentElement.lang=e, dir=ni(e)
// system 语义 = Follow System → navigator.language
import { describe, expect, it } from 'vitest'
import { resolveDisplayLanguage, resolveTextDirection } from '../../renderer-grok/shim/src/language'

describe('B20 resolveDisplayLanguage（0.78.1 Follow System 语义）', () => {
  it('system → navigator.language', () => {
    expect(resolveDisplayLanguage('system', 'en-US')).toBe('en-US')
  })
  it('zh → zh-CN（0.78.1 locale 键规范）', () => {
    expect(resolveDisplayLanguage('zh', 'en-US')).toBe('zh-CN')
  })
  it('ja → ja（locale 键原值）', () => {
    expect(resolveDisplayLanguage('ja', 'en-US')).toBe('ja')
  })
  it('未知值 → en 回退', () => {
    expect(resolveDisplayLanguage('xx', 'en-US')).toBe('en')
  })
})

describe('B20 resolveTextDirection（0.78.1 ni(e) RTL 派生）', () => {
  it('拉丁/中日韩 → ltr', () => {
    expect(resolveTextDirection('en')).toBe('ltr')
    expect(resolveTextDirection('zh-CN')).toBe('ltr')
    expect(resolveTextDirection('ja')).toBe('ltr')
  })
  it('ar/he → rtl（文档化：不支持集也正确派生）', () => {
    expect(resolveTextDirection('ar')).toBe('rtl')
    expect(resolveTextDirection('he')).toBe('rtl')
  })
})
