// P5-H7 日志判读：红量（Tests/Files 行）+ 红族签名计数 + 失败用例清单。
// 用法: node classify.mjs <log-path>...
import { readFileSync } from 'node:fs'

const SIGS = [
  ['timeout-600s', /exceeded timeout of 600000|600005ms|600\d{3}\s*ms/g],
  ['boot-crash', /boot exited early|boot crashed/g],
  ['socket-hang-up', /socket hang up/g],
  ['websocket-closed', /WebSocket closed|WebSocket was closed|websocket closed/g],
  ['und-err-socket', /UND_ERR_SOCKET/g],
  ['fetch-failed', /fetch failed/g],
  ['econnrefused', /ECONNREFUSED/g],
  ['econnreset', /ECONNRESET/g],
  ['pbots-busy', /pbots\/busy/g],
  ['slirp-ep ermns', /slirp4netns.*EPERM|setns.*EPERM/g],
  ['h3-互踩签名', /erased-by-peer|to be 'run-[ab]'|Received: "run-[ab]"/g],
]

for (const f of process.argv.slice(2)) {
  const log = readFileSync(f, 'utf8')
  const tests = log.match(/Tests\s+(\d+ failed \| )?([\d| ]+?) \((\d+)\)/)?.[0]
    ?? log.match(/^ {6}Tests.*$/m)?.[0] ?? '(no Tests line)'
  const files = log.match(/^ Test Files.*$/m)?.[0] ?? '(no Test Files line)'
  const dur = log.match(/^ {2}Duration.*$/m)?.[0]?.trim() ?? ''
  console.log(`\n=== ${f} ===`)
  console.log(`${files}\n${tests}\n${dur}`)
  for (const [name, re] of SIGS) {
    const n = (log.match(re) ?? []).length
    if (n) console.log(`  ${name}: ${n}`)
  }
  const fails = [...log.matchAll(/^FAIL\s+(.+)$/gm)].map(m => m[1])
  if (fails.length) {
    console.log(`  FAIL 用例 ${fails.length} 条:`)
    for (const x of fails) console.log(`    ${x}`)
  }
}
