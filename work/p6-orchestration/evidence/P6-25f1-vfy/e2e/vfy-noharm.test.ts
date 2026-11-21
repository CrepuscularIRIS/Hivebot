// 不误伤补格：真 Loader 里区内 glob / grep / present / edit 照常（新增的 tools/execute 复判对读档全体生效）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { launch, R, results, toolCall, turn, WS, type H } from './h.ts'

let h: H | undefined
afterAll(async () => { h?.closeFeed(); await h?.stop() })

it('区内 glob / grep / read→edit 照常，0 卡', async () => {
  h = await launch()
  const dir = join(WS, `nh-${R}`)
  mkdirSync(join(dir, 'deep'), { recursive: true })
  writeFileSync(join(dir, 'deep', 'a.txt'), 'needle-vfy\n')
  const calls = [
    toolCall('glob', { pattern: `nh-${R}/**/*.txt` }),
    toolCall('grep', { pattern: 'needle-vfy', path: dir }),
    toolCall('read', { file_path: join(dir, 'deep', 'a.txt') }),
    toolCall('edit', { file_path: join(dir, 'deep', 'a.txt'), old_string: 'needle-vfy', new_string: 'edited-vfy' }),
  ]
  const t = await turn(h, { calls, answer: 'rejected' })
  const res = results(t.frames)
  writeFileSync('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-25f1-vfy/noharm.json', JSON.stringify({ cards: t.cards.map((c) => c.request), res }, null, 2))
  expect(t.cards).toHaveLength(0)
  expect(res).toHaveLength(4)
  expect(res.every((r) => !r.isError), JSON.stringify(res)).toBe(true)
  expect(res[0]!.text).toContain('a.txt')
  expect(res[1]!.text).toContain('needle-vfy')
  expect(readFileSync(join(dir, 'deep', 'a.txt'), 'utf8')).toBe('edited-vfy\n')
})
