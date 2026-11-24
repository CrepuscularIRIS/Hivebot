# runtime.sh —— provision.sh / uninstall.sh 共用：运行时探测与「引擎在跑」检查。被 source，不单独执行。
#
# DS-Bot 自己往 profile 里装插件，用的是它自带的 node + 自带的 pnpm：
#   resources/app/src/main.mjs:568    pnpmEntry = <app>/node_modules/pnpm/bin/pnpm.mjs
#   resources/app/src/host.mjs:40-41  packageManager = { command: <自带 node>, args: ['--expose-internals', pnpm] }
# DS-Bot 0.3.8 自带 node v24.21.0、pnpm 11.7.0；pnpm 的 store 建在 <home>/.local/share/pnpm/store/v<主版本>。
#
# 接入时用同一套工具写 profile：store 位置与 pnpm 大版本和引擎完全一致，用户不必另装 node/pnpm，
# 引擎之后自己装插件也不会报 ERR_PNPM_UNEXPECTED_STORE。2026-11-24 实测：store 是由第一个往 profile
# 里装东西的 pnpm 建的（GUI 首启不建 store）——用另一个大版本的 pnpm 接入，就给引擎埋下了这个雷。
#
# 找不到自带运行时才退到 PATH 上的 node / pnpm，并要求 pnpm 主版本与 profile 已有的 store 一致
# （还没有 store 时按 11，即 DS-Bot 0.3.8 自带的大版本）。

RUNTIME_TMP=""
APP_DIR=""            # <…>/resources/app（含 node_modules/pnpm/bin/pnpm.mjs）
APPIMAGE=""
NODE_BIN=""           # node 可执行文件（用自带运行时的时候是绝对路径）
RUNTIME_PATH="$PATH"  # 跑 pnpm 时用的 PATH（用自带 node 时把它所在目录放到最前，pnpm run 才找得到 node）
PNPM=()               # pnpm 命令（数组）
RUNTIME_KIND=""

# --appimage <文件>：AppImage 自带的解包器只依赖它自己（不需要 FUSE / libfuse2），
# 只抽出 node、pnpm 和 yaml 库三棵子树（约 135 MB）到临时目录，脚本退出时删除（调用方在 runtime_resolve 之前装 EXIT trap）。
# yaml 是 DS-Bot 自己读写 cordis.patch.yml 用的库：patch-merge.mjs 借它做条目级合并（2026-11-24 只读审查 #1）。
runtime_set_appimage() {
  # 相对路径在这里就补成绝对路径：解包前会先 cd 进临时目录，到那时相对路径就找不到了（2026-11-24 只读审查 #4）
  case "$1" in /*) APPIMAGE="$1" ;; *) APPIMAGE="$(pwd)/$1" ;; esac
  [ -f "$APPIMAGE" ] || { echo "FAIL: --appimage 文件不存在: $1" >&2; exit 2; }
  [ -x "$APPIMAGE" ] || { echo "FAIL: --appimage 文件没有执行权限——先 chmod +x：$APPIMAGE" >&2; exit 2; }
}

# --app-dir <目录>：AppImage 解包目录（squashfs-root）、resources 目录或 resources/app 本身。
runtime_set_app_dir() {
  APP_DIR="$1"
}

runtime_cleanup() {
  # RUNTIME_TMP 只可能是本脚本 mktemp 出来的目录；变量为空时什么都不做。
  if [ -n "$RUNTIME_TMP" ] && [ -d "$RUNTIME_TMP" ]; then rm -rf "$RUNTIME_TMP"; fi
  RUNTIME_TMP=""
}

# 在 <dir> 及其 resources/app 下找自带 pnpm；找到则 APP_DIR 指向 resources/app 并返回 0。
_runtime_probe() {
  local d
  for d in "$1" "$1/resources/app"; do
    if [ -f "$d/node_modules/pnpm/bin/pnpm.mjs" ]; then APP_DIR="$(cd "$d" && pwd)"; return 0; fi
  done
  return 1
}

# 正在 <home> 上运行的引擎 pid（每行一个）。只算 host.mjs 进程里 DSH_HOME 指向 <home>/.ds-bot 的那些——
# 同一台机器上另一个 home 的 DS-Bot 不相干。两边都先过 readlink -f：同一目录的不同写法（符号链接、
# 末尾斜杠）也算命中，免得判成「没在跑」而放行对写。只认 Linux 的 /proc，其它平台恒为空。
runtime_engine_pids_on() {
  local p eh want
  [ -d /proc/self ] || return 0
  want="$(readlink -f -- "$1/.ds-bot" 2>/dev/null || printf '%s/.ds-bot' "$1")"
  for p in $(pgrep -f 'resources/app/src/host.mjs' 2>/dev/null || true); do
    [ -r "/proc/$p/environ" ] || continue
    eh="$(tr '\0' '\n' < "/proc/$p/environ" | sed -n 's/^DSH_HOME=//p' | head -n 1)"
    [ -n "$eh" ] || continue
    if [ "$(readlink -f -- "$eh" 2>/dev/null || printf '%s' "$eh")" = "$want" ]; then echo "$p"; fi
  done
  return 0
}

# 设好 NODE_BIN / RUNTIME_PATH / PNPM / RUNTIME_KIND。HOME_DIR 须由调用方先设好（退到 PATH 时用它核对 store）。
#   显式给了 --appimage / --app-dir 却解析不了 → 直接 FAIL（exit 2）。
#   什么都没给、也找不到 → 返回 1，由调用方决定怎么办。
runtime_resolve() {
  local p d store store_major want have
  if [ -n "$APPIMAGE" ]; then
    RUNTIME_TMP="$(mktemp -d)"
    # --appimage-extract 一次只收一个模式；三棵子树各抽一次，落在同一个 squashfs-root 下。
    # yaml 排在 pnpm 后面：pnpm 抽不出来就别再花时间了。
    ( cd "$RUNTIME_TMP" && "$APPIMAGE" --appimage-extract 'resources/app/node_modules/pnpm/*' >/dev/null 2>&1 \
        && "$APPIMAGE" --appimage-extract 'resources/primary-runtime/dependencies/node/*' >/dev/null 2>&1 \
        && "$APPIMAGE" --appimage-extract 'resources/app/node_modules/yaml/*' >/dev/null 2>&1 ) \
      || { echo "FAIL: 无法从 AppImage 里取出自带运行时: $APPIMAGE" >&2
           echo "  -> 确认它是 DS-Bot 0.3.8 的 AppImage 且有执行权限（chmod +x）；或改用 --app-dir 指向解包目录" >&2
           echo "     （先跑「<AppImage> --appimage-extract」，再指到 squashfs-root）。" >&2; exit 2; }
    if ! _runtime_probe "$RUNTIME_TMP/squashfs-root"; then
      echo "FAIL: $APPIMAGE 里没有自带的 pnpm（resources/app/node_modules/pnpm/bin/pnpm.mjs）——不是 DS-Bot 0.3.8 的 AppImage？" >&2
      exit 2
    fi
  elif [ -n "$APP_DIR" ]; then
    if ! _runtime_probe "$APP_DIR"; then
      echo "FAIL: --app-dir 下找不到自带 pnpm: $APP_DIR（要指向 AppImage 解包目录 squashfs-root，或安装目录下的 resources）" >&2
      exit 2
    fi
  else
    # 没指定：从正在运行的引擎的命令行里取。AppImage 直接运行时它挂在 /tmp/.mount_*，只在运行期间存在。
    for p in $(pgrep -f 'resources/app/src/host.mjs' 2>/dev/null || true); do
      [ -r "/proc/$p/cmdline" ] || continue
      d="$(tr '\0' '\n' < "/proc/$p/cmdline" | sed -n 's#^\(.*\)/resources/app/src/host\.mjs$#\1#p' | head -n 1)"
      [ -n "$d" ] || continue
      if _runtime_probe "$d"; then break; fi
    done
  fi
  if [ -n "$APP_DIR" ]; then
    d="$APP_DIR/../primary-runtime/dependencies/node/bin/node"
    if [ -x "$d" ]; then
      NODE_BIN="$(cd "$(dirname "$d")" && pwd)/node"
      RUNTIME_PATH="$(dirname "$NODE_BIN"):$PATH"
    elif command -v node >/dev/null 2>&1; then
      NODE_BIN="$(command -v node)"
    else
      echo "FAIL: 找不到 node——$APP_DIR 旁没有 primary-runtime，PATH 上也没有 node" >&2
      exit 2
    fi
    PNPM=("$NODE_BIN" --expose-internals "$APP_DIR/node_modules/pnpm/bin/pnpm.mjs")
    RUNTIME_KIND="DS-Bot 自带"
    return 0
  fi
  command -v node >/dev/null 2>&1 || return 1
  NODE_BIN="$(command -v node)"
  if command -v pnpm >/dev/null 2>&1; then PNPM=(pnpm)
  elif command -v corepack >/dev/null 2>&1; then PNPM=(corepack pnpm)
  else return 1; fi
  store="$(ls -d "$HOME_DIR"/.local/share/pnpm/store/v[0-9]* 2>/dev/null | head -n 1 || true)"
  if [ -n "$store" ]; then store_major="${store##*/v}"; else store_major=""; fi
  want="${store_major:-11}"
  have="$(HOME="$HOME_DIR" "${PNPM[@]}" --version 2>/dev/null | cut -d. -f1 || true)"
  case "$have" in
    "$want"|"") ;;
    *)
      echo "FAIL: pnpm 主版本对不上：这个 profile 的 store 由 pnpm $want 建立（${store:-尚无 store}），PATH 上的是 pnpm $have。" >&2
      echo "  -> 最省事：加 --appimage <DS-Bot 的 AppImage 路径>，改用 DS-Bot 自带的 pnpm；或者 npm i -g pnpm@$want" >&2
      exit 2 ;;
  esac
  RUNTIME_KIND="PATH 上的"
  return 0
}

runtime_describe() {
  echo "  runtime: $RUNTIME_KIND node $("$NODE_BIN" --version 2>/dev/null) / pnpm $("${PNPM[@]}" --version 2>/dev/null)"
}
