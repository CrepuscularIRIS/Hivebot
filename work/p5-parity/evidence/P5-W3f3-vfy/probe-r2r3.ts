// 验收员 R2/R3 探针：真实覆盖层 model.ts（非测试文件副本）
import { projectTranscriptEntry, projectTranscriptFeedEntries, projectTranscriptPageResult } from '/tmp/bot-wt/P5-W3f3/app/ui/renderer-grok/overrides/modules/model'

let fail = 0
const check = (label: string, ok: boolean) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} · ${label}`); if (!ok) fail++ }
const cardOf = (e: unknown): Record<string, any> => {
  const c = (e as any)?.toolResult
  if (c === undefined) throw new Error('no card')
  return c
}

console.log('R2: 各形状 args 投影不抛')
for (const args of ['null', '"str"', '[1,2]', '123', 'not json {', '']) {
  let entry: any = null
  let threw = false
  try {
    entry = projectTranscriptEntry(
      { kind: 'tool-call', id: 't', timestampMs: 1, name: 'bash', status: 'failed', summary: 'x', args, result: 'Error: bad args' },
      0, 'Bot', 'a1',
    )
  } catch { threw = true }
  check(`args=${JSON.stringify(args)} 不抛（base 'null' 抛 TypeError）`, !threw && entry !== null)
  if (!threw && entry) check(`args=${JSON.stringify(args)} 附卡且 output 可见`, cardOf(entry).output === 'Error: bad args')
}

console.log('R2: 持久化毒条目（args=null）→ page（reload 首页）能加载且好条目齐全')
{
  const good = (id: string) => ({ kind: 'tool-call', id, timestampMs: 1, name: 'bash', status: 'done', summary: 'ls', args: '{"command":"ls"}', result: 'OK' })
  let page: any = null
  let threw = false
  try {
    page = projectTranscriptPageResult(
      { entries: [{ kind: 'tool-call', id: 'poison', timestampMs: 2, name: 'bash', status: 'failed', summary: 'x', args: 'null', result: 'Error: args must be an object' }, good('g1'), good('g2')], nextBeforeSeq: 7 },
      'Bot', 'a1',
    )
  } catch { threw = true }
  check('page 投影不抛', !threw)
  check('毒条目与好条目都在（行可见）', !threw && page.entries.map((e: any) => e.id).join(',') === 'poison,g1,g2')
  check('毒条目附卡仍显示错误输出', cardOf(page.entries[0]).output === 'Error: args must be an object')
  check('游标保留', page.nextBeforeSeq === 7)

  let feed: any = null
  try { feed = projectTranscriptFeedEntries([good('f1'), { kind: 'tool-call', id: 'p2', timestampMs: 3, name: 'bash', status: 'failed', summary: 'x', args: 'null', result: 'E' }], 'Bot', 'a1') } catch { threw = true }
  check('feed 聚合不抛且两行都在', !threw && feed.length === 2)
}

console.log('R3: decision 与输出呈现')
{
  const ap = projectTranscriptEntry(
    { kind: 'tool-call', id: 't1', timestampMs: 1, name: 'bash', status: 'done', summary: 'curl', args: '{"command":"curl example.com"}', result: 'FULL STDOUT OUTPUT', decision: 'allowed-once' },
    0, 'Bot', 'a1',
  )
  const c1 = cardOf(ap)
  check("allowed-once + 非空 result → summary 空", c1.summary === '')
  check("view detail（summary||diff||output）看到全文", String(c1.summary || c1.diff || c1.output) === 'FULL STDOUT OUTPUT')

  const rj = projectTranscriptEntry(
    { kind: 'tool-call', id: 't2', timestampMs: 1, name: 'bash', status: 'failed', summary: 'rm x', args: '{"command":"rm x"}', result: null, decision: 'rejected' },
    0, 'Bot', 'a1',
  )
  check("rejected + 空 result → summary='rejected'（拒绝原因可见）", cardOf(rj).summary === 'rejected')

  const rj2 = projectTranscriptEntry(
    { kind: 'tool-call', id: 't3', timestampMs: 1, name: 'bash', status: 'failed', summary: 'rm x', args: '{"command":"rm x"}', result: '', decision: 'rejected' },
    0, 'Bot', 'a1',
  )
  check("rejected + result='' → summary='rejected'", cardOf(rj2).summary === 'rejected')
}
console.log(fail === 0 ? '== 全部 PASS ==' : `== ${fail} FAIL ==`)
process.exit(fail === 0 ? 0 : 1)
