#!/usr/bin/env bash
# P5-H5 残留计数探针：在私有 TMPDIR 里跑给定 spec 子集，数跑完后的非工具缓存残留。
# 用法: residue-probe.sh <label> <vitest-args...>
# 口径：TMPDIR 隔离 + 死 DBus（HOME 不覆盖——与 VERIFY-P5-H1 的验收跑法一致，
#       HOME 侧隔离由 P5-H3 uniqueTestHome 在测试内完成）；排除 node-compile-cache
#       等工具缓存（验收口径同款豁免）。
set -u
LABEL="$1"; shift
SDK=/tmp/bot-wt/P5-H5/app/sdk
TMP=/tmp/bot-h5-tmp/$LABEL
rm -rf "$TMP"; mkdir -p "$TMP"
cd "$SDK" || exit 9
TMPDIR="$TMP" DBUS_SESSION_BUS_ADDRESS="unix:path=$TMP/dead-bus" \
  ./node_modules/.bin/vitest run "$@" \
  >"/tmp/bot-h5-tmp/$LABEL.vitest.log" 2>&1
VEXIT=$?
echo "vitest exit=$VEXIT (log: /tmp/bot-h5-tmp/$LABEL.vitest.log)"
grep -E "Test Files|Tests " "/tmp/bot-h5-tmp/$LABEL.vitest.log" | tail -2
echo "--- residue histogram (excl tool caches) ---"
cd "$TMP" || exit 9
for d in *; do
  case "$d" in node-compile-cache|*vitest*|*.tsbuildinfo) continue ;; esac
  echo "$d" | sed -E 's/-?[A-Za-z0-9]{6}$//'
done | sort | uniq -c | sort -rn | tee "/tmp/bot-h5-tmp/$LABEL.residue.txt"
TOTAL=$(ls | grep -cvE '^(node-compile-cache|.*vitest.*|.*\.tsbuildinfo)$')
echo "TOTAL non-cache residue entries: $TOTAL"
exit 0
