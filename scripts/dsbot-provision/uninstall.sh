#!/usr/bin/env bash
# uninstall.sh —— 撤销 provision.sh 的接入。只动 provision.sh 写过的东西：
#   bundle 注册（profile package.json 的 dsh.profile.bundles）、插件包（node_modules/dsh-superagent
#   及 package.json 里的依赖键）、插件源副本（.ds-bot/superagent-src）、patch（只摘掉安装器写的那些键，接入前
#   就有的值按备份放回——你在 DS-Bot 设置界面里做的改动、插件启停开关写的条目照留；见 patch-merge.mjs）、以及可选的
#   SuperAgent 状态目录。不碰 DS-Bot 本体、会话、凭证。
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
MERGE="$REPO_ROOT/scripts/dsbot-provision/patch-merge.mjs"

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

# 解包出来的运行时在退出时删——trap 要在 runtime_resolve 之前装好（理由见 provision.sh）。INT/TERM 先走 exit 才会触发它。
# patch 的临时文件和 pnpm remove 的输出日志也一并清（中途失败 / Ctrl-C 不留）。
trap 'runtime_cleanup; rm -f "${PATCH_TMP:-}" "${REMOVE_LOG:-}"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# node + pnpm：来源同 provision.sh。改 package.json 至少要有 node；没有 pnpm 时只删插件目录与依赖键（见步骤 2、3）。
if ! runtime_resolve; then
  if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"
  else
    echo "FAIL: 找不到 node——改写 profile 的 package.json 需要 node；加 --appimage <DS-Bot 的 AppImage> 用它自带的。" >&2
    exit 2
  fi
fi

# 1) patch：先算出「摘掉安装器写的那三项之后」的结果，落在临时文件；后面各步都成功才替换（任何一步失败，原文件不动，
#    前面也什么都还没改）。
#    - 文件里没有 hivebot-provision 标记 → 不是安装器渲染/并入过的，不碰。
#    - 安装器写的键摘掉；接入前就有的值按备份放回，接入后你改的其它键照留（scripts/dsbot-provision/patch-merge.mjs）。
#    - stateDir 用 patch-merge 按 id 从 dsh-superagent 条目里读出的那个（provision.sh --state-dir 可能改过它；别处的
#      stateDir 不相干，也不采信——2026-11-24 只读审查 #6）。--purge-state 删的就是它，必须在替换 patch 之前读。
PATCH_TMP="$PROFILE_DIR/cordis.patch.yml.uninstall-tmp"
PATCH_STATE="foreign"; PATCH_ENTRIES=""; PATCH_UNRESTORED=""
STATE_DIR=""
if grep -q 'hivebot-provision' "$PATCH" 2>/dev/null; then
  # 退出码要这样取：写成 if ! cmd; then … $? …，拿到的是取反后的条件状态（恒 0），rc=3 的提示永远不出现
  # （2026-11-24 只读复审 #3）。
  MERGE_RC=0
  MERGE_OUT="$("$NODE_BIN" "$MERGE" remove "$PATCH" "$BACKUP" "$PATCH_TMP" "${APP_DIR:--}" 2>&1)" || MERGE_RC=$?
  if [ "$MERGE_RC" != 0 ]; then
    rm -f "$PATCH_TMP"
    echo "FAIL: 没法只摘安装器写的条目——什么都没动，cordis.patch.yml 原样。" >&2
    printf '%s\n' "$MERGE_OUT" >&2
    if [ "$MERGE_RC" = 3 ]; then
      echo "  -> 需要 DS-Bot 自带的 yaml 库：加 --appimage <DS-Bot 的 AppImage 路径> 重跑。" >&2
    fi
    exit 2
  fi
  # patch-merge 的输出：一行「state=… removed=… restored=… entries=…」，可能再跟 statedir=… / unrestored=… 两行。
  # 第一行按空白拆开再取字段（只去掉 state= 前缀会把整行都当成状态值——2026-11-24 集成测试踩到：撤销走到
  # 「不是安装器写的」分支）；后两行按整行取（路径、id 列表里可能有空格）。
  PATCH_STATE="$(printf '%s\n' "$MERGE_OUT" | tr ' ' '\n' | sed -n 's/^state=//p' | head -n 1)"
  PATCH_ENTRIES="$(printf '%s\n' "$MERGE_OUT" | tr ' ' '\n' | sed -n 's/^entries=//p' | head -n 1)"
  STATE_DIR="$(printf '%s\n' "$MERGE_OUT" | sed -n 's/^statedir=//p' | head -n 1)"
  PATCH_UNRESTORED="$(printf '%s\n' "$MERGE_OUT" | sed -n 's/^unrestored=//p' | head -n 1)"
fi
STATE_DIR="${STATE_DIR:-$HOME_DIR/.ds-bot/superagent-state}"

# 2) 插件包：有 pnpm 就先走 pnpm remove——它自己改 package.json 的 dependencies，并连带清掉只有它依赖的包。
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

# 3) bundle 注册：从 dsh.profile.bundles 去掉 dsh-superagent（pnpm remove 没做成的依赖键也在这里删）
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

# 4) 插件目录兜底删除（pnpm remove 成功时它已经不在了）
rm -rf "$INSTALLED"
echo "  plugin:  removed $INSTALLED"

# 5) 插件源副本（provision.sh 把包源复制到这里，profile 的 file: 引用指向它）
STAGE="${HOME_DIR}/.ds-bot/superagent-src"
if [ -d "${STAGE}" ] || [ -d "${STAGE}.new" ]; then
  rm -rf "${STAGE}" "${STAGE}.new"
  echo "  plugin:  removed ${STAGE}"
fi

# 6) profile 里已经没有任何依赖时，把接入时 pnpm add 留下的 node_modules / pnpm-lock.yaml 也清掉——
#      回到引擎自己建的骨架（首启后的骨架里没有这两样；引擎之后装插件会按需重建）。
if "$NODE_BIN" -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(Object.keys(m.dependencies||{}).length?1:0)' "$PROFILE_DIR/package.json"; then
  rm -rf "$PROFILE_DIR/node_modules" "$PROFILE_DIR/pnpm-lock.yaml"
  echo "  profile: no dependencies left — removed node_modules/ and pnpm-lock.yaml"
fi
# 7) patch：换上第 1 步算好的结果（前面各步都已成功）。摘完什么都不剩（empty）且接入前有备份：整份还原备份，
#    逐字节回到接入前；其余情况写回摘除后的结果（absent = 条目早没了、只剩标记：去掉标记的结果也要落盘，
#    否则下次接入会以为「已接入过」而不再备份——2026-11-24 只读复审 #4）。
#    备份里有、结果里没有的条目或键（接入后被整份覆盖过——旧版安装器——或被删过）不自动放回：那种情况保留备份并提示
#    （2026-11-24 只读复审 #2）；其余情况清掉备份——现在的文件才是你的最新设置。
KEEP_BACKUP=0
case "$PATCH_STATE" in
  empty)
    if [ -f "$BACKUP" ]; then
      rm -f "$PATCH_TMP"
      mv -f "$BACKUP" "$PATCH"
      echo "  patch:   restored $PATCH from cordis.patch.yml.pre-hivebot"
    else
      mv -f "$PATCH_TMP" "$PATCH"
      echo "  patch:   removed the hivebot entries from $PATCH"
    fi ;;
  kept)
    mv -f "$PATCH_TMP" "$PATCH"
    echo "  patch:   removed the hivebot entries from $PATCH（其余 $PATCH_ENTRIES 条设置原样保留）"
    if [ -n "$PATCH_UNRESTORED" ]; then KEEP_BACKUP=1; fi ;;
  absent)
    mv -f "$PATCH_TMP" "$PATCH"
    echo "  patch:   没找到安装器写的条目，只去掉了标记——$PATCH"
    if [ -n "$PATCH_UNRESTORED" ]; then KEEP_BACKUP=1; fi ;;
  *)
    rm -f "$PATCH_TMP"
    if [ -f "$BACKUP" ]; then
      echo "  patch:   $PATCH 不是安装器写的，原样保留（接入前的备份也留着：$BACKUP）"
    else
      echo "  patch:   $PATCH 不是安装器写的，原样保留"
    fi ;;
esac
if [ -f "$BACKUP" ]; then
  if [ "$KEEP_BACKUP" = 1 ]; then
    echo "  patch:   注意——接入前的备份里还有东西不在当前文件里，没自动放回：$PATCH_UNRESTORED" >&2
    echo "            备份保留在 $BACKUP，要的话手工并回 $PATCH（下次接入时它会改名留档，不会被覆盖）。" >&2
  else
    rm -f "$BACKUP"
  fi
fi

# 8) 状态目录（默认保留）。--purge-state 只删状态目录本身：路径看着不像状态目录（空、/、home，或任何
#    把 profile 包在里面的上级目录）就拒绝——宁可让用户手动删，也不 rm -rf 到别的东西。
if [ "$PURGE" = 1 ]; then
  if [ -z "$STATE_DIR" ] || [ "$STATE_DIR" = "/" ] || [ "$STATE_DIR" = "$HOME_DIR" ] \
     || case "$PROFILE_DIR" in "$STATE_DIR"|"$STATE_DIR"/*) true ;; *) false ;; esac; then
    echo "  state:   REFUSED — 「$STATE_DIR」不像 SuperAgent 状态目录，没删；要删请手动处理" >&2
  else
    rm -rf "$STATE_DIR" "${STATE_DIR}.lock" "${STATE_DIR}.lock.owner"
    echo "  state:   purged $STATE_DIR"
  fi
elif [ -d "$STATE_DIR" ]; then
  echo "  state:   kept $STATE_DIR（加 --purge-state 一并删除）"
fi

echo "undone: $HOME_DIR"
echo "next: 重新启动 DS-Bot 即回到未接入状态。"
