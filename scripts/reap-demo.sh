#!/usr/bin/env bash
# 清理 demo 调试系进程（goal-aed79f4f，用户 m09799 要求定期清除）
# 特征精确匹配，不误杀 e2e（playwright rig 用随机 tmp 目录）与其他用户进程：
#   1) /proc/PID/environ 含 /tmp/hsim（demo 独有 handoff/home 根）的任何进程
#   2) 命令行为 demo-launch*.mjs 的 node 进程
# 用法：bash ~/bot/scripts/reap-demo.sh [--dry]
set -u
DRY=0; [ "${1:-}" = "--dry" ] && DRY=1
count=0
for pid in $(pgrep -f 'start\.mjs|demo-launch|out/main/index\.js' 2>/dev/null); do
  env=$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null)
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
  hit=0
  case "$cmd" in *demo-launch*) hit=1;; esac
  echo "$env" | grep -q '/tmp/hsim' && hit=1
  # demo 专用 CDP 端口 9224 出现在命令行 = demo 孤儿壳（environ 可能已不可读）
  case "$cmd" in *remote-debugging-port=9224*) hit=1;; esac
  [ "$hit" = 1 ] || continue
  if [ "$DRY" = 1 ]; then echo "would kill $pid: ${cmd:0:90}"; else kill -9 "$pid" 2>/dev/null && echo "killed $pid"; fi
  count=$((count+1))
done
# CDP 端口残留（9224=demo 专用）由进程死自动释放，无需处理
echo "reap-demo: $count process(es)${DRY:+ (dry-run)}"
