from pathlib import Path

sdk = Path('/home/lingxufeng/bot/app/sdk')
out = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/diag-subagent')
s = (sdk / 'tests/e2e/subagent-policy.test.ts').read_text()
s = s.replace("'../../examples/lib/client.mjs'", repr(str(sdk / 'examples/lib/client.mjs')))
s = s.replace("'../support/fake/harness.ts'", repr(str(sdk / 'tests/support/fake/harness.ts')))
s = s.replace("'../support/runtime.ts'", repr(str(sdk / 'tests/support/runtime.ts')))
s = s.replace("const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')", f"const PKG_ROOT = {str(sdk)!r}")
s = s.replace("  const child = await childSessionId(rt, root)", """  const workflowCard = await waitForApproval(feed, root, 1)
  console.info('DIAG pending', JSON.stringify({ card: workflowCard, requests: rt.readRequests() }))
  expect(workflowCard.request?.toolName).toBe('workflow')
  const decision = process.env.DIAG_DECISION ?? 'allowed-once'
  await feed.answer(workflowCard, decision)
  if (decision === 'rejected') {
    await new Promise((r) => setTimeout(r, 1500))
    expect(rt.readRequests().every((r) => r.sessionId === root)).toBe(true)
    expect(existsSync(m)).toBe(false)
    console.info('DIAG rejected workflow: zero child requests, zero side effects')
    return
  }
  const child = await childSessionId(rt, root)""")
s = s.replace("  await waitChildSettled(rt, child)", "  await waitChildSettled(rt, child)\n  console.info('DIAG settled child', JSON.stringify(rt.readRequests().filter((r) => r.sessionId === child)))")
s = s.replace("    await feed.answer(asked, 'rejected')", "    console.info('DIAG root bash card', JSON.stringify(asked))\n    await feed.answer(asked, 'rejected')")
(out / 'probe.test.ts').write_text(s)
(out / 'probe.config.mjs').write_text("export default { test: { include: ['" + str(out / 'probe.test.ts') + "'], testTimeout: 120000, hookTimeout: 120000, setupFiles: ['" + str(sdk / 'tests/support/tmp-sweep.setup.ts') + "'] } }\n")
