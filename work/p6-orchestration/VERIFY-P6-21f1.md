# VERIFY P6-21.f1

> Transcribed, unmodified. The Sol acceptance agent was constrained by its execution environment from writing report files; the following is the original text of its final report. Evidence directory: `evidence/P6-21f1-vfy/`.

- **SHA**: `22897c4431c8798fbb5f8bfa246b24384d9355db` (no drift before or after acceptance)
- **Overall conclusion: PASS**. Acceptance items 1–5 all PASS, no `[FIX]`

| Item | Conclusion | Evidence |
|---|---|---|
| 1 diff scope | PASS | Exactly 4 files, index.mjs untouched, working tree clean |
| 2 Targeted test rerun | PASS | 58/58, `evidence/P6-21f1-vfy/vitest.log` |
| 3 Independent concurrent probes | PASS | Concurrent exactly-once; in-flight failure takeover without falsely skipping; when target is busy with the same id in inbox, no error thrown; inflight=0 after dispose |
| 4 Invalid ask / reordering | PASS | Crash logs only produce stopped end; live asks are delivered as usual, after completion only completed end; remove/reinsert reordering passes (original unit tests lines 140, 484) |
| 5 Bad path | PASS | 32-way concurrency hitting persistence.open failure: all rejected and no reservation leaks; two bot-reap self-checks with no residue |
