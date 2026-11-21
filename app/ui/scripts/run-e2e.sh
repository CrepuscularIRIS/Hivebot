#!/bin/sh
# e2e 默认在 Xvfb 虚拟显示里跑（真实桌面零弹窗，U-33）；
# 逃生门：PBOTS_E2E_NO_XVFB=1 时直接用当前显示（调试需要看真实窗口时用）。
set -e
# P5-28.f1 S1：testAnswerEvent 等测试钩子生产不安装（main/m2-mux 门控）；e2e 全程显式
# opt-in——m2-port / m2-deadline / questions-answer 的作答注入都依赖它。
export PBOTS_TEST_HOOKS=1
if [ "$PBOTS_E2E_NO_XVFB" = "1" ]; then
  exec playwright test "$@"
fi
# 2026-11-17（T100b 附带，稳定基线③）：产物新鲜度守卫——源比产物新即拒跑。
# 防旧 dist 假绿（HANDOFF §55：✓ built 计数≠成功，看退出码；LEARNINGS「改
# renderer/main 源后必须先 pnpm build」此前全靠自觉）。逃生门 PBOTS_E2E_SKIP_STALE_CHECK=1。
if [ "$PBOTS_E2E_SKIP_STALE_CHECK" != "1" ] && [ -f out/main/index.js ]; then
  newest_src=$(find main preload renderer-grok/overrides renderer-grok/shim renderer-grok/assets \
    -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.html' -o -name '*.mjs' -o -name '*.js' -o -name '*.json' \) \
    -newer out/main/index.js -print -quit 2>/dev/null)
  if [ -n "$newest_src" ]; then
    echo "run-e2e: 源比产物新（$newest_src > out/main/index.js）——先 pnpm build 再跑；" >&2
    echo "  确要跳过（如只改 spec）：PBOTS_E2E_SKIP_STALE_CHECK=1 pnpm test:e2e ..." >&2
    exit 78
  fi
fi
# P6-18：Xvfb 分支同时剥掉真实会话总线——被测 Electron 的 OS 通知（libnotify 经 DBus）
# 必走降级路径，测试不会往用户真实桌面弹通知（与无 DBus 的 CI 容器同语义；spec 自己
# 需要死总线时无需再覆盖）。真实通知呈现只在 NO_XVFB 调试或手动验收时可达。
export DBUS_SESSION_BUS_ADDRESS="unix:path=$PWD/.build/e2e-dead-bus"
exec xvfb-run -a --server-args="-screen 0 1600x1000x24" playwright test "$@"
