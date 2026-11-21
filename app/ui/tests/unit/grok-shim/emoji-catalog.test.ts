// T90 收窄：npm emojibase-data loader——加载目录后 smile 可查、unicode 非空（vitest 可直接
// import json chunk——与 vite 打包产物同数据源）。
import { describe, expect, it } from 'vitest'
import { loadShippedEmojiCatalog, searchEmoji } from '../../../renderer-grok/overrides/modules/emoji-catalog'

describe('T90 emoji 目录（emojibase-data）', () => {
  it('加载目录：含 smile 且 unicode 非空、分类非空', { timeout: 30_000 }, async () => {
    const catalog = await loadShippedEmojiCatalog()
    expect(catalog.categories.length, '分类非空').toBeGreaterThan(0)
    const hits = searchEmoji(catalog, 'smile', 8)
    expect(hits.length, 'smile 可查').toBeGreaterThan(0)
    expect(hits[0]!.native, 'unicode 非空').toMatch(/\p{Emoji_Presentation}/u)
    const all = catalog.categories.flatMap((c) => c.emojis)
    expect(all.length, '目录量大（≈千级）').toBeGreaterThan(1000)
  })
})
