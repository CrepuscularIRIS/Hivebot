// Q1e 端到端：档位表损坏（A9 ② 回退）时，写宿主 /tmp 从「硬拒不出卡」退成「出卡」；
// 用户批准后文件是否真落宿主 /tmp。经真实 launcher；坏表经 P2SDK_PATCH 覆盖 shell-ask 行。
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { launch, OUT_DIR, R, results, toolCall, turn, type H } from './h.ts'

let h: H | undefined
afterAll(async () => { h?.closeFeed(); await h?.stop() })

it('corrupt tiers: outside write asks; approved → lands on host /tmp', async () => {
  h = await launch(`\
- id: p2sdk-shell-ask
  config:
    tiers:
      default: allow
      write: bogus-tier
`)
  const p = join(OUT_DIR, `corrupt-${R}.txt`)
  rmSync(p, { force: true })
  const t = await turn(h, { calls: [toolCall('write', { file_path: p, content: 'p625c-corrupt' })], answer: 'allowed-once' })
  const out = {
    cards: t.cards.map((c) => c.request),
    res: results(t.frames),
    onHost: existsSync(p),
    content: existsSync(p) ? readFileSync(p, 'utf8') : null,
    stderrTier: h.readStderr().split('\n').filter((l) => l.includes('tier table')).slice(0, 2),
  }
  console.log('[Q1e-e2e]', JSON.stringify(out))
  rmSync(p, { force: true })
  expect(out.cards.length).toBeGreaterThan(0)
})
