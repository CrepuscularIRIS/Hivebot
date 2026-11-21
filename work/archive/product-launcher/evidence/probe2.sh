#!/usr/bin/env bash
# ⑤/M2 真 oracle：real 模式、key 只在 0600 env 文件、env 里无任何凭证键；
# Electron 主进程经 --inspect 读 process.env 键名；SDK 侧 /proc environ 正对照。
set -u
L="$1"; NODE=/tmp/bot-wt/T17/app/sdk/node_modules/.bin/node
B=$(mktemp -d /tmp/bot-T17-mgrprobe2-XXXX)
mkdir -p "$B"/{home,cfg/pbots-ui,cfg/hivebot,state,cache,tmp}
printf 'P2SDK_LLM_API_KEY=sk-mgr-filekey-probe\n' > "$B/cfg/hivebot/env"; chmod 600 "$B/cfg/hivebot/env"
IP=$((20000 + RANDOM % 20000))
env -i PATH="$PATH" HOME="$B/home" TMPDIR="$B/tmp" XDG_CONFIG_HOME="$B/cfg" XDG_STATE_HOME="$B/state" \
  XDG_CACHE_HOME="$B/cache" DBUS_SESSION_BUS_ADDRESS="unix:path=$B/no-dbus" DISPLAY="$DISPLAY" XAUTHORITY="${XAUTHORITY:-}" \
  "$L" --disable-gpu --inspect=$IP >"$B/launcher.out" 2>&1 &
LP=$!
for _ in $(seq 1 120); do curl -s "http://127.0.0.1:$IP/json/list" >/dev/null 2>&1 && break; kill -0 $LP 2>/dev/null || break; sleep 0.5; done
"$NODE" /home/lingxufeng/bot/work/product-launcher/evidence/inspect-env.mjs $IP || echo "inspector failed"
for c in $(cat /proc/$LP/task/$LP/children 2>/dev/null); do
  case "$(tr '\0' ' ' </proc/$c/cmdline)" in *start.mjs*)
    tr '\0' '\n' </proc/$c/environ | grep -q '^P2SDK_LLM_API_KEY=' && echo "sdk environ P2SDK_LLM_API_KEY=Y" || echo "sdk environ P2SDK_LLM_API_KEY=n";;
  esac
done
grep -c 'sk-mgr-filekey-probe' "$B/launcher.out" "$B/state/hivebot/logs/"*.log
kill -TERM $LP; wait $LP; echo "launcher rc=$?"; sleep 3
pgrep -af "$B" | grep -v -E 'pgrep|probe2' || echo "no residue"
tail -3 "$B/launcher.out" | cut -c1-160
rm -rf "$B"
