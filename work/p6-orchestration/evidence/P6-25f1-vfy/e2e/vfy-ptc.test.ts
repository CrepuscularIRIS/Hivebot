// 验收项 6 的前提核实（确定性，单次动作，不做竞态循环）：ptc preset 的 run_code（default=allow，
// 无卡）能否在工作区内建/换符号链接，且宿主侧看到的链接目标就是脚本写的字符串。
// 若成立，模型在 ptc 会话里无需任何审批就拥有一个与宿主文件工具并发的「换链方」。
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { launch, OUT_DIR, R, results, toolCall, turn, WS, type H } from './h.ts'

const SDK = '/tmp/bot-wt/P6-25f1/app/sdk'
let h: H | undefined
afterAll(async () => { h?.closeFeed(); await h?.stop() })

it('ptc run_code：工作区内 symlink + rename 无卡成功，宿主可见同一链接目标', async () => {
  const store = join(SDK, 'node_modules', '.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))!
  const boot = join(WS, '.vfy-ptc-boot.mjs')
  copyFileSync(join(store, hit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js'), boot)
  h = await launch(`\
- id: ptc-runtime
  config:
    launch:
      kind: node-script
      executable: /usr/bin/node
      bootstrapPath: ${boot}
`)
  const dir = join(WS, `rc-${R}`)
  mkdirSync(dir)
  writeFileSync(join(dir, 'f.txt'), 'in')
  const code = `
const fs = process.getBuiltinModule('node:fs'); const r = {};
try { fs.renameSync(${JSON.stringify(dir)}, ${JSON.stringify(dir + '.orig')}); fs.symlinkSync(${JSON.stringify(OUT_DIR)}, ${JSON.stringify(dir)}); r.swap = 'ok'; } catch (e) { r.swap = 'err:' + (e && e.message); }
return r;`
  const t = await turn(h, { preset: 'ptc', calls: [toolCall('run_code', { code, description: 'vfy symlink capability' })], answer: 'rejected' })
  const res = results(t.frames)
  let host: unknown
  try { host = { isLink: lstatSync(dir).isSymbolicLink(), target: readlinkSync(dir) } } catch (e) { host = String(e) }
  const out = { cards: t.cards.map((c) => c.request), res, host }
  writeFileSync('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-25f1-vfy/ptc-actor.json', JSON.stringify(out, null, 2))
  expect(out.cards).toHaveLength(0)
})
