// Aggregate frozen score outputs only; never open held-out raw or prompts.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'))
const before = read('archive-r2b/heldout-scores.json')
const held = read('heldout/scores.json')
const dev = read('dev/scores.json')
assert.equal(held.length, 36)
assert.equal(before.filter((r) => r.complete).length, 17)
for (const r of before.filter((r) => r.complete)) assert.equal(held.find((n) => n.id === r.id).sha256, r.sha256, `preserved group changed: ${r.id}`)
const supplemented = held.filter((r) => !r.missing && r.sha256 !== before.find((b) => b.id === r.id)?.sha256)
const delegated = held.filter((r) => !['direct', 'chat'].includes(r.kind))
const sentinels = held.filter((r) => ['direct', 'chat'].includes(r.kind))
const reports = held.flatMap((r) => r.reports ?? [])
const correct = delegated.filter((r) => r.routeOk).length
const misdispatch = sentinels.filter((r) => r.misdispatch).length
const hard = reports.every((r) => r.toolSuccess === 0 && r.tailTexts === 1)
const complete = held.every((r) => r.complete && !r.missing)
const recommendation = held.some((r) => r.missing) ? '仍有未采组，先列清剩余项，不裁决完整轮次' : correct >= 22 && sentinels.every((r) => r.complete) && misdispatch === 0 && hard ? '按本轮门槛建议进入定案阶段；本轮不跑48组，等待P6-24/P6-25.f1等合并后再跑。超时组保留invalid，不能声称冻结评分器converged=true或正式PASS' : !complete ? '尚有超时/错误；不能以未完成回合冒充模型没调工具' : correct < 12 ? '建议转§12.3，不跑r3' : correct <= 21 ? '只据dev raw总结失败模式供r3' : '分数过线但哨兵/硬指标未过，不建议定案'
const lines = [
  'P6-22 r2c — 合并原17完整组与本轮补采（只读评分输出，无held-out原文）',
  `generated=${new Date().toISOString()} executor=6.1 Sol target=glm-5.3/litellm`,
  '文案冻结0ed1ed4；采集器5092c75 + f7ba26f（held-out）/e75bbbf（dev，千秒长封边界）；ROUTING_PROMPT SHA256=8bc4ea57810cbfcc2ac21c6cb4a510449df88c174dd22efc0d753bea81f04fc8',
  `preserved=17 (all sha256 unchanged); supplemented=${supplemented.length}/19; collected=${held.filter((r) => !r.missing).length}/36; complete=${held.filter((r) => r.complete).length}/36`,
  `subset=${correct}/30; sentinel-misdispatch=${misdispatch}/6; sentinel-complete=${sentinels.filter((r) => r.complete).length}/6`,
  `hard: polluted-tool-success=${reports.reduce((n, r) => n + r.toolSuccess, 0)}; reports=${reports.length}; report-tailTexts-not-one=${reports.filter((r) => r.tailTexts !== 1).length}`,
  `dev=${dev.filter((r) => r.routeOk).length}/10; dev-complete=${dev.filter((r) => r.complete).length}/10`,
  `r1=3/30 (single0 parallel3 attach0 stop0); r2=${correct}/30; delta-lower-bound=${correct - 3}; invalid=${held.filter((r) => !r.complete).length} (timeouts remain invalid, not proven routing failures)`,
  `recommendation=${recommendation}`,
  '判据：完整子集≥22/30且哨兵误派0/6、硬指标全过→建议定案（48组不在本轮跑）；<12/30→§12.3；12–21→只据dev raw总结r3失败模式。',
  '', readFileSync(join(here, 'heldout/SCORE.txt'), 'utf8').trim(),
  '', '补采来源（补采包含par1-two-tasks-2的重采；原超时raw由.prevN保存）：',
]
for (const r of held) lines.push(`${r.id}\t${r.missing ? '未采' : supplemented.includes(r) ? 'r2c补采' : 'r2a保留'}\t${r.routeOk ? 'OK' : r.complete ? 'ROUTE-FAIL' : 'INCOMPLETE'}`)
lines.push('', readFileSync(join(here, 'dev/SCORE.txt'), 'utf8').trim())
writeFileSync(join(here, 'SCORE.txt'), lines.join('\n') + '\n')
console.log(lines.slice(0, 10).join('\n'))
