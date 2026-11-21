#!/bin/sh
# 独立验收复现命令；只跑指定 UI 包计数与本任务 e2e，不跑全仓回归。
set -eu
E=/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy
export HOME=/tmp/bot-p615f1-home
export PBOTS_E2E_NO_XVFB=0
mkdir -p "$HOME"
cd /tmp/bot-wt/P6-15f1/app/ui
pnpm build > "$E/build.log" 2>&1
pnpm test > "$E/unit.log" 2>&1
pnpm -C renderer-grok check > "$E/check.log" 2>&1
pnpm exec vitest run tests/unit/grok-shim/workers.test.ts --reporter=verbose > "$E/workers-unit.log" 2>&1
pnpm exec sh scripts/run-e2e.sh tests/e2e/p6-workers.spec.ts > "$E/e2e.log" 2>&1
python3 -I "$E/make-probe.py"
pnpm exec sh scripts/run-e2e.sh -c "$E/probe.config.ts" --grep 'P6-16' > "$E/probe.log" 2>&1
# frames/ 是首次原 spec 实跑件的保留副本，probe-frames/ 是独立探针输出。
python3 -I "$E/recompute.py" > "$E/recompute.log" 2>&1
/home/lingxufeng/bot/scripts/bot-reap --dry-run --match p615f1 > "$E/reap-dry-run.log" 2>&1
