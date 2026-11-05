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
# P6-18：Xvfb 分支同时剥掉真实会话总线——被测 Electron 的 OS 通知（libnotify 经 DBus）
# 必走降级路径，测试不会往用户真实桌面弹通知（与无 DBus 的 CI 容器同语义；spec 自己
# 需要死总线时无需再覆盖）。真实通知呈现只在 NO_XVFB 调试或手动验收时可达。
export DBUS_SESSION_BUS_ADDRESS="unix:path=$PWD/.build/e2e-dead-bus"
exec xvfb-run -a --server-args="-screen 0 1600x1000x24" playwright test "$@"
