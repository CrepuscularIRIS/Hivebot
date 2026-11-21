// P6-25.f1 verifier 真 Loader 探针：C1 端到端 + 真会话里后端接线与第二层 + 读侧残余窗口观测。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { launch, OUT_DIR, R, results, TEST_HOME, toolCall, turn, WS, type H } from './h.ts'

const hs: H[] = []
afterAll(async () => { for (const h of hs) { h.closeFeed(); await h.stop() } })
const EVD = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-25f1-vfy'

it('C1 端到端：坏档位表下区外写 → 硬拒 0 卡、宿主无文件；区内写仍出 fallback 卡、批准后落区内', async () => {
  const h = await launch(`\
- id: p2sdk-shell-ask
  config:
    tiers:
      default: allow
      write: bogus-tier
`)
  hs.push(h)
  const p = join(OUT_DIR, `corrupt-${R}.txt`)
  rmSync(p, { force: true })
  const t = await turn(h, { calls: [toolCall('write', { file_path: p, content: 'vfy-corrupt' })], answer: 'allowed-once' })
  const inside = join(WS, `corrupt-in-${R}.txt`)
  const t2 = await turn(h, { calls: [toolCall('write', { file_path: inside, content: 'vfy-in' })], answer: 'allowed-once' })
  const out = {
    outside: { cards: t.cards.map((c) => c.request), res: results(t.frames), onHost: existsSync(p) },
    inside: { cards: t2.cards.map((c) => c.request), res: results(t2.frames), landed: existsSync(inside) },
    stderrTier: h.readStderr().split('\n').filter((l) => l.includes('tier table')).slice(0, 1),
  }
  writeFileSync(join(EVD, 'c1-e2e.json'), JSON.stringify(out, null, 2))
  expect(out.outside.cards).toHaveLength(0)
  expect(out.outside.res[0]?.isError).toBe(true)
  expect(out.outside.res[0]?.text).toContain('write-outside-workspace denied')
  expect(out.outside.onHost).toBe(false)
  expect(out.inside.cards.length).toBeGreaterThan(0)
  expect(out.inside.cards[0]?.reason).toContain('tier table unavailable')
  expect(out.inside.landed).toBe(true)
  expect(out.stderrTier.length).toBe(1)
})

it('真 Loader：ctx.fs 是 ZoneCheckedFileSystem；inner 接缝下写被后端拒（区外/假凭证），读侧残余窗口观测', async () => {
  const cred = join(TEST_HOME, '.ssh')
  mkdirSync(cred, { recursive: true })
  writeFileSync(join(cred, 'vfy_marker'), 'VFY-FAKE-CRED')
  writeFileSync(join(OUT_DIR, 'vfy_marker'), 'VFY-OUTSIDE')
  const evidence = join(TEST_HOME, 'vfy-seam.jsonl')
  const mk = (i: number, name: string, leaf: string, destination: string) => {
    const directory = join(WS, `vfy-swap-${R}-${i}`)
    mkdirSync(directory)
    writeFileSync(join(directory, 'vfy_marker'), 'DECOY')
    return { i, name, leaf, destination, directory, filePath: join(directory, leaf) }
  }
  const cases = [
    mk(0, 'write', `w-${R}.txt`, OUT_DIR),
    mk(1, 'write', `w-${R}.key`, cred),
    mk(2, 'read', 'vfy_marker', OUT_DIR),
    mk(3, 'read', 'vfy_marker', cred),
  ]
  const h = await launch(`\
- insert:
    - id: vfy-seam
      name: '${pathToFileURL('/tmp/bot-p625f1-vfy/e2e/vfy-seam.mjs').href}'
      config:
        evidence: ${JSON.stringify(evidence)}
        swaps: ${JSON.stringify(cases)}
`)
  hs.push(h)
  const rows = []
  for (const c of cases) {
    const args = { file_path: c.filePath, ...(c.name === 'write' ? { content: 'VFY-MUST-NOT-LAND' } : {}) }
    const t = await turn(h, { calls: [toolCall(c.name, args)], answer: 'rejected' })
    const r = results(t.frames)[0]
    rows.push({ case: c.i, tool: c.name, dest: c.destination === cred ? 'fake-cred' : 'outside', cards: t.cards.length, isError: r?.isError, text: r?.text.slice(0, 300),
      landed: c.name === 'write' ? existsSync(join(c.destination, c.leaf)) : undefined })
  }
  const seam = readFileSync(evidence, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  writeFileSync(join(EVD, 'loader-e2e.json'), JSON.stringify({ seam, rows }, null, 2))
  expect(seam[0]).toMatchObject({ boot: true, zone: true, ctor: 'ZoneCheckedFileSystem' })
  expect(seam.filter((s) => s.swapped).every((s) => s.zone === true && s.verdict?.allInside === true)).toBe(true)
  for (const row of rows.filter((x) => x.tool === 'write')) {
    expect(row.cards).toBe(0)
    expect(row.isError, JSON.stringify(row)).toBe(true)
    expect(row.landed, JSON.stringify(row)).toBe(false)
  }
})
