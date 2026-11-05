#!/usr/bin/env bash
# Diagnostic commands actually used; main HEAD: 0fa0c37ed1b6650fad0cc61749b1654624e931a6
# Initial main reproduction (head.log, 2 passed / 1 failed, 33.301s failing case):
cd /home/lingxufeng/bot/app/sdk
HOME=/tmp/bot-diag-subagent-home pnpm vitest run tests/e2e/subagent-policy.test.ts --reporter=verbose
# Parent worktree was created using:
# git -C /home/lingxufeng/bot worktree add -b diag/subagent-parent /tmp/bot-wt/diag-subagent-parent 0fa0c37^
# ln -s /home/lingxufeng/bot/app/sdk/node_modules /tmp/bot-wt/diag-subagent-parent/app/sdk/node_modules
# pnpm in that worktree attempted reinstall and refused NO_TTY; no reinstall was performed.
# Run installed identical Vitest directly to avoid changing dependencies:
cd /tmp/bot-wt/diag-subagent-parent/app/sdk
HOME=/tmp/bot-diag-subagent-parent-home TMPDIR=/tmp/bot-diag-subagent-parent-tmp ./node_modules/.bin/vitest run tests/e2e/subagent-policy.test.ts -t 'workflow: agent' --reporter=verbose
# parent.log: at 62f94c33428b8944894d997208b3a4c2d1b1aeae, fails 32.786s, no child model call.
# Pre-tier baseline was selected using:
# git -C /tmp/bot-wt/diag-subagent-parent checkout -b diag/subagent-pre-tier 62f94c3^
# The same command yielded pre-tier.log: 75267c658aa209ac8c171124abf1ec65889165ee, PASS 3.170s.
# Main diagnostic copy only: answer workflow's new approval, keeping all original assertions.
cd /home/lingxufeng/bot/app/sdk
python -I /home/lingxufeng/bot/work/p6-orchestration/evidence/diag-subagent/make-probe.py
HOME=/tmp/bot-diag-subagent-home TMPDIR=/tmp/bot-diag-subagent-head-tmp ./node_modules/.bin/vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/diag-subagent/probe.config.mjs -t 'workflow: agent' --reporter=verbose
# approved-probe.log: PASS 3.292s, child denied, no child approval, root bash asks and rejected file absent.
HOME=/tmp/bot-diag-subagent-home TMPDIR=/tmp/bot-diag-subagent-head-tmp DIAG_DECISION=rejected ./node_modules/.bin/vitest run --config /home/lingxufeng/bot/work/p6-orchestration/evidence/diag-subagent/probe.config.mjs -t 'workflow: agent' --reporter=verbose
# rejected-probe.log: PASS 3.852s, no child requests / side effects; root bash still asks.
/home/lingxufeng/bot/scripts/bot-reap --dry-run --match diag-subagent
