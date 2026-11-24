#!/usr/bin/env bash
# uninstall.sh —— 撤销 provision.sh 的接入。只动 provision.sh 写过的东西：
#   bundle 注册（profile package.json 的 dsh.profile.bundles）、插件包（node_modules/dsh-superagent
#   及 package.json 里的依赖键）、插件源副本（.ds-bot/superagent-src）、patch（还原首次接入前的备份
#   cordis.patch.yml.pre-hivebot）、以及可选的 SuperAgent 状态目录。不碰 DS-Bot 本体、会话、凭证。
#
# 用法：uninstall.sh <home> [--appimage FILE | --app-dir DIR] [--purge-state]
#   <home>          当初传给 provision.sh 的那个 home
#   --appimage / --app-dir   node + pnpm 的来源，含义同 provision.sh；都不给时从运行中的引擎 / PATH 上找
#   --purge-state   连 SuperAgent 状态目录一起删（默认保留；里面是 watch 记账 / ticket / 评估库）
#
# 撤销前先完全退出 DS-Bot（引擎在跑时改 profile 会被它自己的插件管理器覆盖回去）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/dsbot-provision/runtime.sh"

HOME_DIR=""
PURGE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --purge-state) PURGE=1; shift ;;
    --appimage)    runtime_set_appimage "$2"; shift 2 ;;
    --app-dir)     runtime_set_app_dir "$2"; shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  if [ -z "$HOME_DIR" ]; then HOME_DIR="$1"; shift; else echo "extra arg: $1" >&2; exit 2; fi ;;
  esac
done
[ -n "$HOME_DIR" ] || { echo "usage: uninstall.sh <home> [--purge-state]" >&2; exit 2; }
# 相对路径补成绝对路径（引擎进程的 DSH_HOME 是绝对路径，下面按它判「引擎在跑」）；不解析符号链接。
case "$HOME_DIR" in /*) ;; *) HOME_DIR="$(pwd)/$HOME_DIR" ;; esac
HOME_DIR="${HOME_DIR%/}"
[ -d "$HOME_DIR" ] || { echo "FAIL: home 目录不存在: $HOME_DIR" >&2; exit 2; }

PROFILE_DIR="$HOME_DIR/.ds-bot/profiles/ds-bot"
INSTALLED="$PROFILE_DIR/node_modules/dsh-superagent"
PATCH="$PROFILE_DIR/cordis.patch.yml"
BACKUP="$PROFILE_DIR/cordis.patch.yml.pre-hivebot"
[ -d "$PROFILE_DIR" ] || { echo "nothing to undo: $PROFILE_DIR not found" >&2; exit 1; }

# 0) 引擎还在这个 home 上跑就拒绝（它启动时会把 profile 重新 reconcile 一遍，和这里对写会互相覆盖）
ENGINE_PIDS="$(runtime_engine_pids_on "$HOME_DIR")"
if [ -n "$ENGINE_PIDS" ]; then
  echo "FAIL: DS-Bot 正在这个 home 上运行（引擎 pid: $(echo "$ENGINE_PIDS" | tr '\n' ' ')）——先完全退出再撤销。" >&2
  exit 1
fi

# node + pnpm：来源同 provision.sh。改 package.json 至少要有 node；没有 pnpm 时只删插件目录与依赖键（见步骤 2、3）。
if ! runtime_resolve; then
  if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"
  else
    echo "FAIL: 找不到 node——改写 profile 的 package.json 需要 node；加 --appimage <DS-Bot 的 AppImage> 用它自带的。" >&2
    exit 2
  fi
fi
trap runtime_cleanup EXIT

# 1) 插件包：有 pnpm 就先走 pnpm remove——它自己改 package.json 的 dependencies，并连带清掉只有它依赖的包。
#    不能带 --registry（pnpm remove 不认这个选项；2026-11-24 实测 [ERROR] Unknown option: 'registry'）。
#    失败或没有 pnpm 时退到步骤 2、3 的手工删除。
if [ "${#PNPM[@]}" -gt 0 ] && [ -f "$PROFILE_DIR/pnpm-lock.yaml" ] \
     && grep -qs 'dsh-superagent' "$PROFILE_DIR/pnpm-lock.yaml" "$PROFILE_DIR/package.json"; then
  REMOVE_LOG="$(mktemp)"
  if ( cd "$PROFILE_DIR" && HOME="$HOME_DIR" PATH="$RUNTIME_PATH" "${PNPM[@]}" remove dsh-superagent >"$REMOVE_LOG" 2>&1 ); then
    echo "  plugin:  pnpm remove dsh-superagent"
  else
    echo "  warn: pnpm remove 没成功，改为手工删除——其余依赖包会留在 node_modules 里（无害）。输出尾部：" >&2
    tail -n 6 "$REMOVE_LOG" >&2
  fi
  rm -f "$REMOVE_LOG"
fi

# 2) bundle 注册：从 dsh.profile.bundles 去掉 dsh-superagent（pnpm remove 没做成的依赖键也在这里删）
"$NODE_BIN" -e '
const fs = require("fs"); const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
let changed = false;
if (Array.isArray(m.dsh?.profile?.bundles) && m.dsh.profile.bundles.includes("dsh-superagent")) {
  m.dsh.profile.bundles = m.dsh.profile.bundles.filter(b => b !== "dsh-superagent");
  changed = true;
}
if (m.dependencies && "dsh-superagent" in m.dependencies) { delete m.dependencies["dsh-superagent"]; changed = true; }
if (changed) fs.writeFileSync(p, JSON.stringify(m, undefined, 2) + "\n", { mode: 0o600 });
console.log(changed ? "  bundle:  unregistered dsh-superagent" : "  bundle:  was not registered");' "$PROFILE_DIR/package.json"

# 3) 插件目录兜底删除（pnpm remove 成功时它已经不在了）
rm -rf "$INSTALLED"
echo "  plugin:  removed $INSTALLED"

# 3) 插件源副本（provision.sh 把包源复制到这里，profile 的 file: 引用指向它）
STAGE="${HOME_DIR}/.ds-bot/superagent-src"
if [ -d "${STAGE}" ] || [ -d "${STAGE}.new" ]; then
  rm -rf "${STAGE}" "${STAGE}.new"
  echo "  plugin:  removed ${STAGE}"
fi

# 3.5) profile 里已经没有任何依赖时，把接入时 pnpm add 留下的 node_modules / pnpm-lock.yaml 也清掉——
#      回到引擎自己建的骨架（首启后的骨架里没有这两样；引擎之后装插件会按需重建）。
if "$NODE_BIN" -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(Object.keys(m.dependencies||{}).length?1:0)' "$PROFILE_DIR/package.json"; then
  rm -rf "$PROFILE_DIR/node_modules" "$PROFILE_DIR/pnpm-lock.yaml"
  echo "  profile: no dependencies left — removed node_modules/ and pnpm-lock.yaml"
fi
# 3) patch：还原首次接入前的备份；没有备份（旧版 provision 没做备份）就保留现状
if [ -f "$BACKUP" ]; then
  mv -f "$BACKUP" "$PATCH"
  echo "  patch:   restored $PATCH from cordis.patch.yml.pre-hivebot"
else
  echo "  patch:   no pre-hivebot backup — $PATCH 原样保留（bundle 已注销，里面的 dsh-superagent 条目不会被加载）"
fi

# 4) 状态目录（默认保留）
STATE_DIR="$(sed -n 's/^ *stateDir: *//p' "$PATCH" 2>/dev/null | head -n 1 || true)"
STATE_DIR="${STATE_DIR:-$HOME_DIR/.ds-bot/superagent-state}"
if [ "$PURGE" = 1 ]; then
  rm -rf "$STATE_DIR" "${STATE_DIR}.lock" "${STATE_DIR}.lock.owner"
  echo "  state:   purged $STATE_DIR"
elif [ -d "$STATE_DIR" ]; then
  echo "  state:   kept $STATE_DIR（加 --purge-state 一并删除）"
fi

echo "undone: $HOME_DIR"
echo "next: 重新启动 DS-Bot 即回到未接入状态。"
