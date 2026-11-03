#!/bin/sh
# e2e 默认在 Xvfb 虚拟显示里跑（真实桌面零弹窗，U-33）；
# 逃生门：PBOTS_E2E_NO_XVFB=1 时直接用当前显示（调试需要看真实窗口时用）。
set -e
if [ "$PBOTS_E2E_NO_XVFB" = "1" ]; then
  exec playwright test "$@"
fi
exec xvfb-run -a --server-args="-screen 0 1600x1000x24" playwright test "$@"
