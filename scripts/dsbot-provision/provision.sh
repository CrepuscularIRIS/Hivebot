#!/usr/bin/env bash
# provision.sh —— DS-Bot 预配置安装器（goal-15d2a544）
# 把 R1-R18 验证过的 SuperAgent 接入配方（litellm provider + agent-default-model +
# 插件条目 + pnpm 安装）应用到目标 home。接入后 Chief 仍是 DS-Bot 原生主 bot，多 bot 编排走
# DS-Bot 原生 TEAM_TOOLS；SuperAgent 提供 watch 记账、评估与 ticket 异步兜底（2026-11-23 实测形态）。
#
# 用法：
#   provision.sh <home> [--appimage FILE | --app-dir DIR] [--state-dir DIR] [--base-url URL] [--model ID] [--superagent-src DIR]
#     <home>            目标 home 目录（.ds-bot 在其下；就是启动 DS-Bot 时用的那个 HOME）
#     --appimage FILE   DS-Bot 的 AppImage：构建与安装都用它自带的 node + pnpm（推荐，不必另装 node/pnpm）
#     --app-dir DIR     AppImage 解包目录（squashfs-root）或安装目录下的 resources/——作用同上
#     --state-dir       SuperAgent 状态目录（默认 <home>/.ds-bot/superagent-state）
#     --base-url        LLM 网关（默认 http://127.0.0.1:4001/v1）
#     --model           默认模型 id（默认 glm-5.3-flash）
#     --superagent-src  superagent 包源（默认 <repo>/app/superagent）
#                       安装时按包的 files 清单复制到 <home>/.ds-bot/superagent-src，profile 引用这份副本（挪走仓库不影响）
#
# 前置：DS-Bot 用这个 home 启动过一次并已完全退出（profile 骨架：package.json /
#       pnpm-workspace.yaml / cordis.patch.yml）——步骤 2 的 pnpm add 与步骤 3 的 bundle 注册都写在骨架上。
# 前置：能访问 npm registry（依赖按 pnpm-lock.yaml 下载；构建与安装两步默认都走 npmmirror 镜像，
#       换源设环境变量 NPM_CONFIG_REGISTRY）。
# 前置：网关 key 环境变量 DSH_LITELLM_API_KEY 要对 DS-Bot 进程本身可见——本脚本不读它的值，只把
#       变量名写进模型路由；桌面启动的 DS-Bot 看不到终端里临时 export 的值，做法见同目录 README.md 第 2 步。
# 运行时：优先用 DS-Bot 自带的 node + pnpm——给 --appimage / --app-dir；都没给时从正在运行的引擎的
#       命令行里找；都没有才退到 PATH 上的 node / pnpm（此时 pnpm 主版本必须与 profile 的 store 一致）。详见 runtime.sh。
# 幂等：重跑安全。源码变了会原地重装插件：lib/ 缺失、或 src/ 与构建输入比 lib/index.js 新（git pull 之后）
#       时先重建再装。cordis.patch.yml 只并入/更新安装器写的那三项（patch-merge.mjs）——DS-Bot 设置界面和
#       插件启停开关写进同一文件的条目原样保留；接入前的原文件备份为 cordis.patch.yml.pre-hivebot。
#       撤销接入用同目录的 uninstall.sh。
# 验收：scripts/fresh-boot.sh（A1/A1.5/A2/A2.5/A2.7/A3/A4，全过 exit 0）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="$REPO_ROOT/scripts/dsbot-provision/cordis.patch.template.yml"
MERGE="$REPO_ROOT/scripts/dsbot-provision/patch-merge.mjs"
source "$REPO_ROOT/scripts/dsbot-provision/runtime.sh"

HOME_DIR=""
STATE_DIR=""
BASE_URL="http://127.0.0.1:4001/v1"
MODEL_ID="glm-5.3-flash"
SUPERAGENT_SRC="$REPO_ROOT/app/superagent"

while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir)      STATE_DIR="$2"; shift 2 ;;
    --base-url)       BASE_URL="$2"; shift 2 ;;
    --model)          MODEL_ID="$2"; shift 2 ;;
    --superagent-src) SUPERAGENT_SRC="$2"; shift 2 ;;
    --appimage)       runtime_set_appimage "$2"; shift 2 ;;
    --app-dir)        runtime_set_app_dir "$2"; shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  if [ -z "$HOME_DIR" ]; then HOME_DIR="$1"; shift; else echo "extra arg: $1" >&2; exit 2; fi ;;
  esac
done
[ -n "$HOME_DIR" ] || { echo "usage: provision.sh <home> [flags]" >&2; exit 2; }
# 相对路径补成绝对路径（引擎进程的 DSH_HOME 是绝对路径，下面按它判「引擎在跑」）。
case "$HOME_DIR" in /*) ;; *) HOME_DIR="$(pwd)/$HOME_DIR" ;; esac
HOME_DIR="${HOME_DIR%/}"
[ -d "$HOME_DIR" ] || { echo "FAIL: home 目录不存在: $HOME_DIR" >&2; exit 2; }
[ -f "$TEMPLATE" ] || { echo "template missing: $TEMPLATE" >&2; exit 2; }
[ -d "$SUPERAGENT_SRC" ] || { echo "superagent src missing: $SUPERAGENT_SRC" >&2; exit 2; }

DSH_HOME_DIR="$HOME_DIR/.ds-bot"
PROFILE_DIR="$DSH_HOME_DIR/profiles/ds-bot"
STATE_DIR="${STATE_DIR:-$DSH_HOME_DIR/superagent-state}"
# --state-dir 是相对路径就补成绝对路径（要原样写进 patch 给引擎用）；不能是 .ds-bot 本身或它的上级——
# uninstall.sh --purge-state 删的就是这个目录。
case "$STATE_DIR" in /*) ;; *) STATE_DIR="$(pwd)/$STATE_DIR" ;; esac
STATE_DIR="${STATE_DIR%/}"
[ -n "$STATE_DIR" ] || { echo "FAIL: --state-dir 不能是 /" >&2; exit 2; }
case "$DSH_HOME_DIR" in "$STATE_DIR"|"$STATE_DIR"/*)
  echo "FAIL: --state-dir 不能是 .ds-bot 本身或它的上级目录: $STATE_DIR" >&2; exit 2 ;;
esac
# 这里不检查 DSH_LITELLM_API_KEY：模型路由里只写环境变量名（apiKeyEnv），key 由 DS-Bot 进程启动时自己读。
# 真正要保证的是这个变量对 DS-Bot 进程可见（桌面启动看不到终端里临时 export 的值），见 README.md 第 2 步。
if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "FAIL: DS-Bot profile skeleton missing: $PROFILE_DIR/package.json" >&2
  echo "  -> 先用这个 home 启动一次 DS-Bot（桌面双击 AppImage），窗口出来后完全退出，再重跑本脚本。" >&2
  exit 2
fi

# 前置：node + pnpm。优先用 DS-Bot 自带的——和引擎自己装插件是同一套工具，store 位置与 pnpm 大版本
# 天然一致（见 runtime.sh）。不走 npm：装 superagent 的依赖会 ERESOLVE（见步骤 0）。
# 解包出来的运行时（约 134 MB）在退出时删——trap 要在 runtime_resolve 之前装好：解包之后才失败、或中途 Ctrl-C，
# 否则会把临时目录留在 /tmp（2026-11-24 只读审查 #4）。INT/TERM 先走 exit，才会触发 EXIT trap。
# 退出时一并清掉 patch 的两个临时文件和 pnpm 的两个输出日志（中途失败 / Ctrl-C / 被信号打断时都不留下；变量还没赋值时展开为空）
trap 'runtime_cleanup; rm -f "${PATCH_TMP:-}" "${PATCH_MERGED:-}" "${BUILD_LOG:-}" "${INSTALL_LOG:-}"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
runtime_resolve || {
  echo "FAIL: 找不到可用的 node + pnpm——加 --appimage <DS-Bot 的 AppImage 路径> 用它自带的运行时，或 npm i -g pnpm@11" >&2
  exit 2; }
runtime_describe

# npm registry：构建（devDependencies）与安装（插件依赖）两步统一用它。npm 直连不通，默认 npmmirror 镜像。
# 2026-11-24 实测：此前只有 pnpm add 带了镜像，首次构建的 pnpm install 直连 registry.npmjs.org（国内 2–47 KiB/s）。
NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"
export NPM_CONFIG_REGISTRY
# 引擎还在这个 home 上跑就拒绝：它的插件管理器会改写 profile，和这里对写会互相覆盖。
ENGINE_PIDS="$(runtime_engine_pids_on "$HOME_DIR")"
if [ -n "$ENGINE_PIDS" ]; then
  echo "FAIL: DS-Bot 正在这个 home 上运行（引擎 pid: $(echo "$ENGINE_PIDS" | tr '\n' ' ')）——先完全退出再重跑。" >&2
  exit 2
fi

# 0) superagent 构建产物校验/构建（纠错轮 Codex 审查 #3：干净 checkout 无 lib/——安装器不能依赖本机已构建产物）
# 纠错轮二（Codex 复测 #4）：干净导出树 devDependencies 也不在（tsdown: not found）——build 前先装齐 devDeps，
# --ignore-scripts 防生命周期脚本。
# 2026-11-24 干净 clone 实测：用 npm 装会 ERESOLVE（@deepseek-ai/cordis 4.0.5-alpha.1 与
# cordis-plugin-include 声明的 peer ~4.0.5 冲突），旧写法还把 npm 的输出 >/dev/null 吞了，只剩一句
# tsdown: not found。改走包自己的锁文件（pnpm-lock.yaml + --frozen-lockfile），失败时打出日志尾部。
# 2026-11-24 补：光看 lib/ 在不在还不够——git pull 之后产物还在，但已经是旧的，「更新 = 重跑本脚本」装进去的
# 就是旧构建。所以源码（src/ 与构建输入）比 lib/index.js 新也重建；只认 mtime，没动过的 checkout 不会多构建。
BUILD_INPUTS="src tsdown.config.ts tsconfig.json package.json pnpm-lock.yaml"
BUILD_REASON=""
if [ ! -f "$SUPERAGENT_SRC/lib/index.js" ]; then
  BUILD_REASON="lib/ missing"
elif [ -n "$(cd "$SUPERAGENT_SRC" && find $BUILD_INPUTS -newer lib/index.js -print -quit 2>/dev/null)" ]; then
  BUILD_REASON="source newer than lib/index.js"
fi
ENTRY="$SUPERAGENT_SRC/lib/index.js"
if [ -n "$BUILD_REASON" ]; then
  echo "building superagent ($BUILD_REASON)"
  BUILD_LOG="$(mktemp)"
  build_fail() {
    echo "FAIL: superagent build ($1) —— 构建日志尾部：" >&2
    tail -n 25 "$BUILD_LOG" >&2
    rm -f "$BUILD_LOG"
    exit 1
  }
  # devDependencies：node_modules 里那份锁文件副本与 pnpm-lock.yaml 一致就不重装（git pull 只改了源码的常见
  # 情形）——少一次联网，也不拿安装器的 pnpm 去动开发者自己的 node_modules。
  if cmp -s "$SUPERAGENT_SRC/node_modules/.pnpm/lock.yaml" "$SUPERAGENT_SRC/pnpm-lock.yaml"; then
    echo "  deps:   up to date"
  else
    echo "  deps:   pnpm install --frozen-lockfile"
    ( cd "$SUPERAGENT_SRC" && PATH="$RUNTIME_PATH" "${PNPM[@]}" install --frozen-lockfile --ignore-scripts --registry="$NPM_CONFIG_REGISTRY" >"$BUILD_LOG" 2>&1 ) || build_fail "pnpm install --frozen-lockfile"
  fi
  ( cd "$SUPERAGENT_SRC" && PATH="$RUNTIME_PATH" "${PNPM[@]}" run build >>"$BUILD_LOG" 2>&1 ) || build_fail "pnpm run build"
  rm -f "$BUILD_LOG"
fi
[ -f "$ENTRY" ] || { echo "FAIL: superagent entry missing after build: $ENTRY" >&2; exit 1; }

mkdir -p "$PROFILE_DIR" "$STATE_DIR"

# 1) 渲染 patch yml 到临时文件（纠错轮：失败不得覆盖原配置——安装成功才原子替换）
esc() { printf '%s' "$1" | sed -e 's/[&/]/\\&/g'; }
PATCH_TMP="$PROFILE_DIR/cordis.patch.yml.provision-tmp"
sed -e "s/__STATE_DIR__/$(esc "$STATE_DIR")/g" \
    -e "s/__DATA_DIR__/$(esc "$DSH_HOME_DIR")/g" \
    -e "s/__BASE_URL__/$(esc "$BASE_URL")/g" \
    -e "s/__MODEL_ID__/$(esc "$MODEL_ID")/g" \
    "$TEMPLATE" > "$PATCH_TMP"
# 1b) 并入现有 patch（scripts/dsbot-provision/patch-merge.mjs）。DS-Bot 的设置界面和插件启停开关也往这个文件里写
#     条目——整份替换会把它们丢掉（2026-11-24 只读审查 #1）。现有文件是首启的空骨架时整份采用渲染结果；否则只
#     并入/更新安装器写的那三项。同样先落临时文件，安装成功才替换。yaml 库用 DS-Bot 自带的（APP_DIR，见 runtime.sh）。
PATCH="$PROFILE_DIR/cordis.patch.yml"
PATCH_MERGED="$PROFILE_DIR/cordis.patch.yml.provision-merged"
PATCH_ACTION="written"; PATCH_STATE="new"
if [ -f "$PATCH" ]; then
  if MERGE_OUT="$("$NODE_BIN" "$MERGE" apply "$PATCH" "$PATCH_TMP" "$PATCH_MERGED" "${APP_DIR:--}" 2>&1)"; then
    PATCH_STATE="$(printf '%s\n' "$MERGE_OUT" | tr ' ' '\n' | sed -n 's/^state=//p' | head -n 1)"
    if cmp -s "$PATCH_MERGED" "$PATCH"; then PATCH_ACTION="unchanged"; else PATCH_ACTION="replaced"; fi
  else
    MERGE_RC=$?
    rm -f "$PATCH_TMP" "$PATCH_MERGED"
    echo "FAIL: 合并 cordis.patch.yml 失败——原文件没动。" >&2
    printf '%s\n' "$MERGE_OUT" >&2
    if [ "$MERGE_RC" = 3 ]; then
      echo "  -> 现有文件里有 DS-Bot 或你写入的条目，需要 DS-Bot 自带的 yaml 库做条目级合并：加 --appimage <AppImage 路径> 重跑。" >&2
    fi
    exit 2
  fi
else
  cp "$PATCH_TMP" "$PATCH_MERGED"; PATCH_STATE="skeleton"
fi

# 2) 安装/升级 superagent 插件包进 profile（registry 同上：默认 npmmirror）
#    触发安装：入口缺失，或源码摘要与上次安装时记下的不同（git pull / 重新构建之后）。
#    pnpm 的 file: 目录依赖是逐文件硬链接的副本，源码重建后已安装副本不会自己变——所以重跑 provision
#    必须能升级。pnpm add 原地重装，不先删旧包（失败时旧包仍在，patch 也不动）。
#    包源先按 package.json 的 files 清单复制到 home 里（STAGE），profile 的 file: 引用指向这份副本——
#    2026-11-24 实测：引用仓库路径时，仓库被挪走/删掉后引擎再对这个 profile 跑 pnpm install 会 ENOENT。
# package.json 的 files 清单（逐项；通配条目留给 bash 展开）——stage_source 复制什么，src_digest 就对什么算摘要
FILES="$("${NODE_BIN}" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).files.join(" "))' "$SUPERAGENT_SRC/package.json")"
src_digest() {
  # 摘要覆盖会被装进去的全部文件。只算 lib/ 时，只改了 prompts / locale / 包内 cordis.patch.yml 的更新会被判成
  # up to date，装进去的还是旧的（2026-11-24 只读审查 #2）。清单里仓库没有的条目（如 README.md）跳过。
  (
    cd "$SUPERAGENT_SRC" || exit 1
    shopt -s nullglob
    set -- package.json $FILES
    # 整条管道都在源目录里跑：find 给出的是相对路径，sha256sum 若在外面跑会找不到文件（2026-11-24 集成测试踩到）
    { for item in "$@"; do
        if [ -e "$item" ]; then find "$item" -type f; fi
      done
      true; } | LC_ALL=C sort | xargs -d '\n' sha256sum | sha256sum | cut -d" " -f1
  )
}
INSTALLED="$PROFILE_DIR/node_modules/dsh-superagent"
STAGE="${DSH_HOME_DIR}/superagent-src"
stage_source() {
  rm -rf "${STAGE}.new"
  mkdir -p "${STAGE}.new"
  ( cd "${SUPERAGENT_SRC}" && shopt -s nullglob && set -- package.json ${FILES} \
    && for item in "$@"; do
         if [ -e "$item" ]; then mkdir -p "${STAGE}.new/$(dirname "$item")" && cp -a "$item" "${STAGE}.new/$(dirname "$item")/"; fi
       done )
  # files 清单里可能列了仓库里没有的文件（如 README.md），跳过；通配条目（locale/*.json）保持原目录结构。
  # 但入口与包内 bundle 层必须有——后者缺了插件会静默不激活（见步骤 3 的说明）。
  [ -f "${STAGE}.new/lib/index.js" ] && [ -f "${STAGE}.new/cordis.patch.yml" ] || {
    echo "FAIL: staged plugin source incomplete: ${STAGE}（需要 lib/index.js 与 cordis.patch.yml）" >&2; exit 1; }

  rm -rf "${STAGE}"
  mv "${STAGE}.new" "${STAGE}"
}
DIGEST="$(src_digest)"
NEED_INSTALL=0
[ -f "$INSTALLED/lib/index.js" ] && [ "$(cat "$INSTALLED/.source-sha256" 2>/dev/null)" = "$DIGEST" ] || NEED_INSTALL=1
# 旧版安装器把 file: 引用指向仓库路径：源码没变也要改指到 home 里的副本
grep -qF '"dsh-superagent": "file:'"${STAGE}"'"' "${PROFILE_DIR}/package.json" 2>/dev/null || NEED_INSTALL=1
# 副本目录被删了也要重装：profile 的 file: 引用指着它，缺了以后引擎对这个 profile 跑 pnpm install 会 ENOENT
# （2026-11-24 只读审查 #5）
[ -f "$STAGE/package.json" ] || NEED_INSTALL=1
if [ "${NEED_INSTALL}" = 1 ]; then
  [ -d "${INSTALLED}" ] && [ ! -f "${INSTALLED}/lib/index.js" ] && rm -rf "${INSTALLED}"
  stage_source
  INSTALL_LOG="$(mktemp)"
  ( cd "${PROFILE_DIR}" && HOME="${HOME_DIR}" PATH="${RUNTIME_PATH}" "${PNPM[@]}" add "file:${STAGE}" --registry="${NPM_CONFIG_REGISTRY}" >"${INSTALL_LOG}" 2>&1 ) || {
    echo "FAIL: superagent install (原 patch 未动) —— pnpm add 输出尾部：" >&2
    tail -n 15 "$INSTALL_LOG" >&2
    # 中断时 pnpm 往往什么都没打：子进程自己接住 SIGINT 后以 1 退出，bash 就不再执行 INT trap，所以会走到这里
    [ -s "$INSTALL_LOG" ] || echo "  （pnpm 没留下输出。如果是你按了 Ctrl-C：什么都没改，直接重跑就行）" >&2
    rm -f "$PATCH_TMP" "$PATCH_MERGED" "$INSTALL_LOG"
    exit 1; }
  rm -f "$INSTALL_LOG"
  # skills 随包同步（package.json 的 files 含 skills；这里覆盖一次，保证与源码一致）
  if [ -d "${STAGE}/skills" ]; then
    rm -rf "${INSTALLED}/skills"
    cp -r "${STAGE}/skills" "${INSTALLED}/skills"
  fi
  echo "$DIGEST" > "${INSTALLED}/.source-sha256"
  echo "  plugin:  installed dsh-superagent from ${SUPERAGENT_SRC} (source $DIGEST)"
  echo "  plugin:  source staged to ${STAGE}"
else
  echo "  plugin:  up to date (source $DIGEST)"
fi
[ -f "$PROFILE_DIR/node_modules/dsh-superagent/lib/index.js" ] || {
  rm -f "$PATCH_TMP" "$PATCH_MERGED"; echo "FAIL: installed package entry missing" >&2; exit 1; }

# 3) skills/ 目录必须随包（packaged() 运行时校验 skills/dsh-superagent-feishu/SKILL.md）
if [ -d "$SUPERAGENT_SRC/skills" ] && [ ! -d "$PROFILE_DIR/node_modules/dsh-superagent/skills" ]; then
  cp -r "$SUPERAGENT_SRC/skills" "$PROFILE_DIR/node_modules/dsh-superagent/skills"
fi

# 4) 注册 bundle 层：引擎只对 dsh.profile.bundles 列出的包应用包内 cordis.patch.yml
#    （profile-boot: bundle layers → cordis.patch.yml → --patch）。pnpm 直装不走插件管理器的
#    reconcile，不注册的话瘦身模板的 id-targeted override 无锚点，插件静默不激活（2026-11-22 实证）。
"$NODE_BIN" -e '
const fs = require("fs"); const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.dsh ??= {}; m.dsh.profile ??= {}; m.dsh.profile.bundles ??= [];
if (!m.dsh.profile.bundles.includes("dsh-superagent")) {
  m.dsh.profile.bundles.push("dsh-superagent");
  fs.writeFileSync(p, JSON.stringify(m, undefined, 2) + "\n", { mode: 0o600 });
  console.log("  bundle:  registered dsh-superagent into dsh.profile.bundles");
}' "$PROFILE_DIR/package.json"

# 5) 最后才替换 patch——走到这里插件、skills、bundle 注册都已成功，此后不会再有会失败的步骤
#    （上面每条失败路径都已退出，原配置保持完整）。
#    现有文件没有 hivebot-provision 标记 = 未接入状态下的最新原件（可能已经被你在 DS-Bot 里改过）：备份一份给
#    uninstall.sh 按条目还原用。旧备份一并覆盖——它可能是更早那次接入留下的，已经不是你的最新设置。
if [ "$PATCH_ACTION" = unchanged ]; then
  echo "  patch:   up to date（安装器写的那三项没变，其余条目没动）"
else
  if [ -f "$PATCH" ] && ! grep -q 'hivebot-provision' "$PATCH"; then
    cp -p "$PATCH" "$PROFILE_DIR/cordis.patch.yml.pre-hivebot"
    echo "  patch:   backed up the original to cordis.patch.yml.pre-hivebot"
  fi
  mv -f "$PATCH_MERGED" "$PATCH"
  case "$PATCH_STATE" in
    skeleton) echo "  patch:   written $PATCH（原来是首启的空骨架）" ;;
    *)        echo "  patch:   merged the 3 hivebot entries into $PATCH（其余条目原样保留）" ;;
  esac
fi
rm -f "$PATCH_TMP"

# 6) 崩溃自愈前置：清 stale 锁（kill -9 残留——runtime.ts 已有重试，这里双保险）
rm -f "$DSH_HOME_DIR/bot/state.lock" 2>/dev/null || true

echo "provisioned: $HOME_DIR"
echo "  patch:   $PROFILE_DIR/cordis.patch.yml ($(grep -c 'id:' "$PROFILE_DIR/cordis.patch.yml") id refs)"
echo "  plugin:  $PROFILE_DIR/node_modules/dsh-superagent"
echo "  state:   $STATE_DIR"
echo "next: 启动 DS-Bot（home: $HOME_DIR），在界面里给 Chief 选模型「$MODEL_ID · LiteLLM (local)」；"
echo "      开发验收跑 scripts/fresh-boot.sh；撤销接入跑 scripts/dsbot-provision/uninstall.sh。"