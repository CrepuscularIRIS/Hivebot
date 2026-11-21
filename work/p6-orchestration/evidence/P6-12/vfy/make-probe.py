from pathlib import Path
root = Path('/tmp/bot-wt/P6-12/app/sdk')
out = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy')
s = (root/'tests/unit/orchestration-report-live.test.ts').read_text()
# Reuse runtime/bootstrap and deterministic fake provider, not product code.
s = s[:s.index("  it('① 合批")]
s = s.replace("from 'vitest'", f"from '{root}/node_modules/vitest/dist/index.js'")
s = s.replace("from '../support/", f"from '{root}/tests/support/")
s = s.replace("from '../../examples/", f"from '{root}/examples/")
s = s.replace("const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')", f"const PKG_ROOT = '{root}'")
s = s.replace("join(PKG_ROOT, 'tests', 'support', 'orchestration-create-inspect.mjs')", f"'{out}/instrument-inspect.mjs'")
s += '''
  it('verifier bad path: worker BLOCKED while main gated must not interrupt, report only after main end', { timeout: 180_000 }, async () => {
    const M = await newSession(), W = await newSession()
    writeBots(M, { [W]: { createdBy: M } })
    // Reject the worker assignment at pre-step, producing a real blocked terminal.
    // Match id is not known yet, so observe send result while W's text is gated,
    // then block a second step with a worker continuation isn't equivalent.
    // Instead use a test-only reject hook that matches all worker messages.
    await control({ op: 'arm-reject', key: 'bad-worker', sessionId: W, matchId: '*' })
    writeScript(W, [text('must not run')])
    writeScript(M, [sendCall('bad-send', W, 'blocked worker task'), gatedText('vfy-busy'), text('received blocked report')])
    await prompt(M, 'delegate blocked task')
    await untilTrue(async () => (await readLog(W)).some(e => e.type === 'turn/end' && e.reason === 'blocked'), 'worker blocked')
    await sleep(3200)
    const before = await readLog(M)
    expect(turnEnds(before)).toHaveLength(0)
    expect(reports(before)).toHaveLength(0)
    expect((await control({ op: 'resolve', sessionId: M })).status).toBe('running')
    openGate('vfy-busy')
    await untilTrue(async () => turnEnds(await readLog(M)).length >= 2, 'main then report turn finish')
    await sleep(2500)
    const after = await readLog(M)
    expect(reports(after)).toHaveLength(1)
    expect(reports(after)[0].items).toHaveLength(1)
    expect(reports(after)[0].items[0]).toMatchObject({ kind: 'end', outcome: 'stopped', workerId: W })
    expect(reports(after)[0].seq).toBeGreaterThan(turnEnds(after)[0].seq)
    console.log('BAD_PATH evidence', JSON.stringify({ beforeEnds: turnEnds(before).length, beforeReports: reports(before).length, mainEnd: turnEnds(after)[0].seq, report: reports(after)[0] }))
  })
'''
# Existing cancellation check copied verbatim; add observation assertion and event trace.
orig = (root/'tests/unit/orchestration-report-live.test.ts').read_text()
a = orig.index("  it('⑦ 用户停止")
b = orig.index("  it('⑦b", a)
cancel = orig[a:b]
cancel = cancel.replace("    const finalLog = await readLog(M)", "    const finalLog = await readLog(M)\n    expect(rt.readStderr()).toContain('[p612-vfy] withdraw failed:')\n    expect(rt.readStderr()).toContain('cannot reenter while another append is being published')\n    expect(rt.readStderr()).toContain('[p612-vfy] withdraw succeeded')\n    console.log('WITHDRAW evidence', rt.readStderr().split('\\n').filter(l => /p612-vfy|withdrew/.test(l)).join('\\n'))\n    console.log('CANCEL trace', JSON.stringify(finalLog.filter(e => ['turn/start','turn/end','user/message','agent/inbox/spliced'].includes(e.type))))")
s += cancel + '\n})\n'
(out/'probe.test.ts').write_text(s)
(out/'probe.config.mjs').write_text("export default { test: { include: ['" + str(out/'probe.test.ts') + "'], setupFiles: ['" + str(root/'tests/support/tmp-sweep.setup.ts') + "'], testTimeout: 120000, hookTimeout: 120000, fileParallelism: false } }\n")
