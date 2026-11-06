from pathlib import Path

e = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-24')
s = (e / 'f1-independent-directory-loader.test.ts').read_text()
old = '  const after = inventory(MAIN_WS)'
assert s.count(old) == 1
s = s.replace(old, '''  const listed = await runtimes[0]!.client.call('session/list', { _request: {} }) as { items: Array<{ sessionId: string }> }
  const ids = listed.items.map((item) => item.sessionId)
  expect(ids).toContain(WORKER)
  expect(ids).toContain(WORKER_SUB)
  console.log('AFTER_REMOVE_BOT_SESSIONS', JSON.stringify({ workerStillPresent: ids.includes(WORKER), subWorkerStillPresent: ids.includes(WORKER_SUB) }))
  const after = inventory(MAIN_WS)''')
(e / 'f1-independent-session-check.test.ts').write_text(s)
(e / 'f1-independent-session-check.config.mjs').write_text("export default {test:{include:[" + repr(str(e / 'f1-independent-session-check.test.ts')) + "],setupFiles:['/tmp/bot-wt/P6-24/app/sdk/tests/support/tmp-sweep.setup.ts'],testTimeout:120000,hookTimeout:120000,maxWorkers:1}}\n")
