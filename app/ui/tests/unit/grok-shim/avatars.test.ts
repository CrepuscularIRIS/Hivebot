// T24：形象持久化（localStorage store）——读写、校验（不合格丢弃）、腐化兜底。
import { afterEach, describe, expect, it } from 'vitest'
import { avatarOf, saveAvatar } from '../../../renderer-grok/shim/src/avatars'

const store = (): Record<string, string> => {
  const m: Record<string, string> = {}
  return new Proxy(m, {
    get(t, k) { return typeof k === 'string' ? t[k] : undefined },
    set(t, k, v) { if (typeof k === 'string' && typeof v === 'string') t[k] = v; return true },
  })
}
const fakeWindow = (raw: string | null): { w: typeof window; s: Record<string, string> } => {
  const s: Record<string, string> = {}
  if (raw !== null) s['pbots.shim.avatars'] = raw
  return { w: { localStorage: { getItem: (k: string) => s[k] ?? null, setItem: (k: string, v: string) => { s[k] = v } } } as unknown as typeof window, s }
}

afterEach(() => { vi_restore() })
let restore: (() => void) | null = null
const vi_restore = (): void => { if (restore !== null) { restore(); restore = null } }
const stubWindow = (w: typeof window): void => {
  const orig = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = w
  restore = () => { (globalThis as { window?: unknown }).window = orig }
}

describe('T24 avatars store', () => {
  it('save → load 往返；未存 bot → null', () => {
    const { w, s } = fakeWindow(null)
    stubWindow(w)
    saveAvatar('s1', { shape: 'star', color: 'violet' })
    expect(avatarOf('s1')).toEqual({ shape: 'star', color: 'violet' })
    expect(avatarOf('s2')).toBeNull()
    expect(JSON.parse(s['pbots.shim.avatars']!)).toEqual({ s1: { shape: 'star', color: 'violet' } })
  })
  it('非法形状/颜色丢弃；null/undefined 不写', () => {
    const { w } = fakeWindow(null)
    stubWindow(w)
    saveAvatar('s1', { shape: 'no-such', color: 'red' })
    saveAvatar('s2', { shape: 'star', color: 'pink' })
    saveAvatar('s3', null)
    saveAvatar('s4', undefined)
    expect(avatarOf('s1')).toBeNull()
    expect(avatarOf('s2')).toBeNull()
  })
  it('腐化 JSON / 部分不合格条目 → 合格的保留、其余丢弃、不抛', () => {
    stubWindow(fakeWindow('{"s1":{"shape":"star","color":"red"},"bad":{"shape":"x"},"s2":"junk"}').w)
    expect(avatarOf('s1')).toEqual({ shape: 'star', color: 'red' })
    expect(avatarOf('bad')).toBeNull()
    expect(avatarOf('s2')).toBeNull()
    stubWindow(fakeWindow('not json').w)
    expect(avatarOf('s1')).toBeNull()
  })
})
